import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_MODEL } from "./config";

let ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

/** Retry on rate limits (429) and overload (5xx) with increasing waits. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const waits = [3000, 9000, 20000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = /429|500|502|503|504|RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|fetch failed/i.test(message);
      if (!retryable || attempt >= waits.length) throw err;
      console.warn(`[gemini] ${label} failed (${message.slice(0, 120)}), retry in ${waits[attempt]}ms`);
      await new Promise((r) => setTimeout(r, waits[attempt]));
    }
  }
}

export type Source = { id: number; url: string; domain: string };
export type SearchResult = { text: string; sources: Source[] };

function domainOf(url: string, fallback = ""): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return fallback;
  }
}

/** Grounding returns Google redirect links; follow one hop to get the real page address. */
async function resolveRedirect(uri: string): Promise<string> {
  try {
    const res = await fetch(uri, { redirect: "manual", signal: AbortSignal.timeout(6000) });
    return res.headers.get("location") || uri;
  } catch {
    return uri;
  }
}

/**
 * AI CALL 1 — live web search.
 * Gemini Flash with the Google Search tool. Returns the model's findings with
 * [S#] markers inserted where Google attributed a sentence to a search result,
 * plus the list of pages Google actually returned. Only those pages may be
 * used as an event's source URL later.
 */
export async function searchEvents(opts: {
  cities: string[];
  categories: string[];
  from: string;
  to: string;
  sourceIdOffset: number;
}): Promise<SearchResult> {
  const prompt = `Today is ${opts.from} (India Standard Time).

Use Google Search to find REAL, upcoming, in-person professional events taking place between ${opts.from} and ${opts.to} in: ${opts.cities.join(", ")} (India).

The reader is an independent management consultant looking for rooms where he can meet potential clients. Relevant topics: ${opts.categories.join("; ")}.

Event types: conferences, CXO / CIO summits, leadership roundtables, industry forums, startup ecosystem meetups, founder and investor events.

Search widely, because no single site lists everything: Eventbrite, iSpirit, NASSCOM, CII, TiE, FICCI, conference websites, Meetup, Luma, 10times, Townscript, AllEvents, Economic Times / ETCIO events, industry newsletters, and public LinkedIn event posts.

For each event you find, write a short paragraph with: event name, exact date(s) with year, city, venue, organiser, who it is for, what it covers, ticket price if stated, and the registration deadline if one is stated (say "deadline not stated" otherwise).

Rules:
- Only include events you actually found in search results. Never invent or guess an event.
- Skip events outside the date range, outside the listed cities, or online-only.
- List up to 12 events.`;

  const res = await withRetry("search", () =>
    client().models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], temperature: 0.2 },
    }),
  );

  const text = res.text ?? "";
  const meta = res.candidates?.[0]?.groundingMetadata;
  const chunks = meta?.groundingChunks ?? [];

  const resolved = await Promise.all(
    chunks.map(async (chunk, i) => {
      const uri = chunk.web?.uri;
      if (!uri) return null;
      const url = await resolveRedirect(uri);
      const domain = url === uri ? chunk.web?.title || domainOf(uri) : domainOf(url, chunk.web?.title || "");
      return { id: opts.sourceIdOffset + i + 1, url, domain } satisfies Source;
    }),
  );

  // Insert [S#] markers at the end of each text segment Google attributed to a source.
  // Segment offsets are UTF-8 byte offsets, so work on a Buffer.
  let buf = Buffer.from(text, "utf8");
  const supports = [...(meta?.groundingSupports ?? [])]
    .filter((s) => s.segment?.endIndex != null && s.groundingChunkIndices?.length)
    .sort((a, b) => (b.segment!.endIndex ?? 0) - (a.segment!.endIndex ?? 0));
  for (const s of supports) {
    const marker = s
      .groundingChunkIndices!.filter((i) => resolved[i])
      .map((i) => `[S${opts.sourceIdOffset + i + 1}]`)
      .join("");
    if (!marker) continue;
    const end = Math.min(s.segment!.endIndex!, buf.length);
    buf = Buffer.concat([buf.subarray(0, end), Buffer.from(" " + marker), buf.subarray(end)]);
  }

  return { text: buf.toString("utf8"), sources: resolved.filter((s): s is Source => s !== null) };
}

// Shape we require from the extraction call. Anything that fails this is discarded.
export const ExtractedEventSchema = z.object({
  title: z.string().min(3),
  start_date: z.string(),
  end_date: z.string().nullable().optional(),
  city: z.string(),
  venue: z.string().nullable().optional(),
  format: z.enum(["in_person", "hybrid", "online", "unknown"]),
  organizer: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  summary: z.string(),
  price: z.string().nullable().optional(),
  registration_deadline: z.string().nullable().optional(),
  category: z.string(),
  relevance_score: z.number().min(0).max(100),
  relevance_reason: z.string(),
  source_ids: z.array(z.number()),
});
export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>;

/**
 * AI CALL 2 — normalise and score.
 * Gemini Flash turns the messy search findings into structured records and
 * scores each one against the reader's focus areas. It has no search tool here,
 * so it can only work from the text and sources we pass in.
 */
export async function extractAndScore(opts: {
  findings: string;
  sources: Source[];
  cities: string[];
  categories: string[];
  from: string;
  to: string;
}): Promise<unknown[]> {
  const sourceList = opts.sources.map((s) => `[S${s.id}] ${s.domain} — ${s.url}`).join("\n");
  const prompt = `You are structuring event research for an independent management consultant in India who wins clients by meeting senior decision-makers in person.

Today is ${opts.from} (IST). The window of interest is ${opts.from} to ${opts.to}.
His target cities: ${opts.cities.join(", ")}.
His focus areas: ${opts.categories.join("; ")}.

Below are research notes produced from live Google Search. Markers like [S12] show which search result a statement came from. Convert every distinct event in the notes into one JSON record.

Field rules:
- title: the event's official name.
- start_date / end_date: YYYY-MM-DD. If the notes give no exact start date, skip the event.
- city: exactly one of the target cities above if the event is in or next to it (e.g. Gurugram or Noida = "Delhi NCR", Bangalore = "Bengaluru"); otherwise "Other".
- format: in_person, hybrid, online or unknown.
- audience: who attends (seniority, function), max 15 words.
- summary: what it is and why someone would go, max 30 words, plain language.
- registration_deadline: YYYY-MM-DD only if the notes explicitly state a registration or RSVP closing date. Otherwise null. Never guess.
- category: the single focus area above that fits best.
- relevance_score: 0-100. How closely the event matches his focus areas AND how likely the room holds potential consulting clients (CXOs, founders, business heads). 90+ = exact focus area with senior decision-makers; 60-89 = strong topical fit; 30-59 = loosely related; below 30 = poor fit.
- relevance_reason: one sentence, max 20 words, saying why it scored that way.
- source_ids: the numbers of the [S#] markers attached to the statements about this event. Use only numbers that appear in the notes. If no marker is attached to an event, return an empty list.

Do not add events that are not in the notes. Do not merge different events.

SEARCH RESULTS RETURNED BY GOOGLE:
${sourceList}

RESEARCH NOTES:
${opts.findings}`;

  const res = await withRetry("extract", () =>
    client().models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            events: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  start_date: { type: Type.STRING },
                  end_date: { type: Type.STRING, nullable: true },
                  city: { type: Type.STRING },
                  venue: { type: Type.STRING, nullable: true },
                  format: { type: Type.STRING, enum: ["in_person", "hybrid", "online", "unknown"] },
                  organizer: { type: Type.STRING, nullable: true },
                  audience: { type: Type.STRING, nullable: true },
                  summary: { type: Type.STRING },
                  price: { type: Type.STRING, nullable: true },
                  registration_deadline: { type: Type.STRING, nullable: true },
                  category: { type: Type.STRING },
                  relevance_score: { type: Type.NUMBER },
                  relevance_reason: { type: Type.STRING },
                  source_ids: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                },
                required: [
                  "title",
                  "start_date",
                  "city",
                  "format",
                  "summary",
                  "category",
                  "relevance_score",
                  "relevance_reason",
                  "source_ids",
                ],
              },
            },
          },
          required: ["events"],
        },
      },
    }),
  );

  const parsed = JSON.parse(res.text ?? "{}");
  return Array.isArray(parsed.events) ? parsed.events : [];
}
