import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import { GEMINI_MODELS } from "./config";
import type { Candidate } from "./sources";

let ai: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run one Gemini request with resilience:
 * - overloaded (5xx): wait and retry the same model
 * - rate limited / unavailable model (429, 404): move on to the next Gemini Flash model in the list
 * Every model in the list is a Gemini Flash model; no other AI provider is ever used.
 */
async function generate(label: string, request: (model: string) => Promise<string>): Promise<{ text: string; model: string }> {
  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { text: await request(model), model };
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        const overloaded = /"code":\s*50[0234]|UNAVAILABLE|overloaded|fetch failed|INTERNAL/i.test(message);
        console.warn(`[gemini] ${label} on ${model} failed: ${message.slice(0, 140)}`);
        if (!overloaded) break; // quota or missing model: try the next model
        await sleep(1500 * (attempt + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const FORMAT = ["in_person", "hybrid", "online", "unknown"] as const;

// What Gemini must return for an event that came from a listing site.
// Name, date, venue and URL are NOT asked for: those stay exactly as the site published them.
export const ListedAssessmentSchema = z.object({
  id: z.number(),
  is_professional_event: z.boolean(),
  relevance_score: z.number().min(0).max(100),
  relevance_reason: z.string(),
  category: z.string(),
  audience: z.string().nullable().optional(),
  summary: z.string(),
  format: z.enum(FORMAT),
  registration_deadline: z.string().nullable().optional(),
});

// What Gemini must return for an event it recognised inside a web-search result.
export const SearchEventSchema = z.object({
  id: z.number(),
  title: z.string().min(3),
  start_date: z.string(),
  end_date: z.string().nullable().optional(),
  city: z.string(),
  venue: z.string().nullable().optional(),
  organizer: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  summary: z.string(),
  price: z.string().nullable().optional(),
  format: z.enum(FORMAT),
  registration_deadline: z.string().nullable().optional(),
  category: z.string(),
  relevance_score: z.number().min(0).max(100),
  relevance_reason: z.string(),
});

const nullableString = { type: Type.STRING, nullable: true };
const assessmentFields = {
  relevance_score: { type: Type.NUMBER },
  relevance_reason: { type: Type.STRING },
  category: { type: Type.STRING },
  audience: nullableString,
  summary: { type: Type.STRING },
  format: { type: Type.STRING, enum: [...FORMAT] },
  registration_deadline: nullableString,
};

/**
 * THE AI STEP — understand and score.
 * Gemini Flash reads the events collected from live listing pages and web search and:
 *  1. judges whether each one is a professional event worth a consultant's time,
 *  2. scores it 0-100 against the reader's focus areas, with a one-line reason,
 *  3. writes the summary and "who's there" line used in the digest,
 *  4. pulls real events (with dates) out of unstructured web-search snippets.
 * It cannot add events: every record must point at an id we supplied.
 */
export async function assessEvents(opts: {
  listed: Candidate[];
  searchResults: Candidate[];
  cities: string[];
  categories: string[];
  from: string;
  to: string;
}): Promise<{ listed: unknown[]; fromSearch: unknown[]; model: string }> {
  const listedText = opts.listed
    .map((c) =>
      [
        `[${c.id}] ${c.title}`,
        `date: ${c.start_date}${c.end_date && c.end_date !== c.start_date ? ` to ${c.end_date}` : ""}`,
        `city: ${c.city}`,
        c.venue && `venue: ${c.venue}`,
        c.organizer && `organiser: ${c.organizer}`,
        c.price && `price: ${c.price}`,
        `listed on: ${c.source}`,
        c.description && `about: ${c.description}`,
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");

  const searchText = opts.searchResults
    .map((c) => `[${c.id}] (${c.source}, searched for ${c.city}) ${c.title} — ${c.description}`)
    .join("\n");

  const prompt = `You are preparing a weekly event digest for an independent management consultant in India. He wins 40% of his business by meeting senior decision-makers face to face at conferences, CXO summits, roundtables and startup ecosystem meetups.

Today is ${opts.from} (IST). Window of interest: ${opts.from} to ${opts.to}.
His target cities: ${opts.cities.join(", ")}.
His focus areas: ${opts.categories.join("; ")}.

PART A — LISTED EVENTS
These were collected today from event listing websites. Return one record in "listed" for EVERY id below.
- is_professional_event: true only for business / industry / technology / startup / leadership events. False for concerts, parties, hobby classes, fitness, religious, kids, tourism, exam coaching and similar consumer events.
- relevance_score 0-100: how closely the event matches his focus areas AND how likely the room holds potential consulting clients (CXOs, founders, business heads). 85+ = exact focus area with senior decision-makers; 60-84 = strong topical fit; 40-59 = loosely related professional event; below 40 = poor fit or not professional.
- relevance_reason: one sentence, max 20 words, explaining the score.
- category: the single focus area above that fits best.
- audience: who attends (seniority, function), max 15 words. Null if you cannot tell.
- summary: what it is and why he might go, max 28 words, plain language. Use only what the listing says.
- format: in_person, hybrid, online or unknown.
- registration_deadline: YYYY-MM-DD only if the listing text explicitly states a registration / RSVP closing date. Otherwise null. Never guess.

${listedText || "(none)"}

PART B — WEB SEARCH RESULTS
These are raw search-result snippets (conference websites, industry bodies, public LinkedIn posts). Most are NOT usable. Add a record to "from_search" ONLY when a snippet clearly describes one specific upcoming event AND states its start date AND that date is inside the window AND it is in one of the target cities. Otherwise skip the snippet.
- id: the snippet's id. title: the event's name. start_date / end_date: YYYY-MM-DD.
- city: exactly one of the target cities (Gurugram or Noida = "Delhi NCR", Bangalore = "Bengaluru").
- Other fields as in Part A. Never invent a date, venue or price that is not in the snippet.

${searchText || "(none)"}`;

  const { text, model } = await generate("assess", async (m) => {
    const res = await client().models.generateContent({
      model: m,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            listed: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { id: { type: Type.INTEGER }, is_professional_event: { type: Type.BOOLEAN }, ...assessmentFields },
                required: ["id", "is_professional_event", "relevance_score", "relevance_reason", "category", "summary", "format"],
              },
            },
            from_search: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  start_date: { type: Type.STRING },
                  end_date: nullableString,
                  city: { type: Type.STRING },
                  venue: nullableString,
                  organizer: nullableString,
                  price: nullableString,
                  ...assessmentFields,
                },
                required: ["id", "title", "start_date", "city", "relevance_score", "relevance_reason", "category", "summary", "format"],
              },
            },
          },
          required: ["listed", "from_search"],
        },
      },
    });
    if (!res.text) throw new Error("Gemini returned an empty response");
    return res.text;
  });

  const parsed = JSON.parse(text);
  return {
    listed: Array.isArray(parsed.listed) ? parsed.listed : [],
    fromSearch: Array.isArray(parsed.from_search) ? parsed.from_search : [],
    model,
  };
}
