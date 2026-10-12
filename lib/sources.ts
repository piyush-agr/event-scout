// Live data collection. Every candidate comes from a page fetched during this run,
// and carries the real URL it was found at. Nothing here is hardcoded event data.

export type Candidate = {
  id: number;
  kind: "listing" | "search";
  source: string; // site the candidate was found on, e.g. "eventbrite.com"
  city: string; // the subscriber's target city this fetch was for
  title: string;
  start_date: string | null; // YYYY-MM-DD in IST (listings only)
  end_date: string | null;
  url: string;
  venue: string | null;
  organizer: string | null;
  price: string | null;
  description: string;
  format: "in_person" | "hybrid" | "online" | "unknown";
  deadline: string | null; // ticket sales end date, when the listing publishes one
};

export type SourceReport = { source: string; city: string; ok: boolean; found: number; error?: string };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml", "accept-language": "en-IN,en;q=0.9" },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// How each listing site names our preset cities. Cities a user types themselves fall back to a simple slug.
const CITY_SLUGS: Record<string, { eventbrite: string; allevents: string; meetup: string; luma: string }> = {
  bengaluru: { eventbrite: "bengaluru", allevents: "bangalore", meetup: "Bangalore", luma: "bengaluru" },
  mumbai: { eventbrite: "mumbai", allevents: "mumbai", meetup: "Mumbai", luma: "mumbai" },
  "delhi ncr": { eventbrite: "new-delhi", allevents: "new-delhi", meetup: "Delhi", luma: "new-delhi" },
  hyderabad: { eventbrite: "hyderabad", allevents: "hyderabad", meetup: "Hyderabad", luma: "hyderabad" },
  pune: { eventbrite: "pune", allevents: "pune", meetup: "Pune", luma: "pune" },
  chennai: { eventbrite: "chennai", allevents: "chennai", meetup: "Chennai", luma: "chennai" },
  kolkata: { eventbrite: "kolkata", allevents: "kolkata", meetup: "Kolkata", luma: "kolkata" },
  ahmedabad: { eventbrite: "ahmedabad", allevents: "ahmedabad", meetup: "Ahmedabad", luma: "ahmedabad" },
};

function slugsFor(city: string) {
  const known = CITY_SLUGS[city.toLowerCase()];
  if (known) return known;
  const slug = city.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-");
  return { eventbrite: slug, allevents: slug, meetup: city.trim().replace(/\s+/g, "-"), luma: slug };
}

// ---------- schema.org JSON-LD parsing (the structured data event sites publish for search engines) ----------

type Json = Record<string, unknown>;

function collectEvents(node: unknown, out: Json[]): void {
  if (!node) return;
  if (Array.isArray(node)) return node.forEach((n) => collectEvents(n, out));
  if (typeof node !== "object") return;
  const obj = node as Json;
  const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
  if (types.some((t) => typeof t === "string" && /Event$/.test(t)) && obj.name && obj.startDate) out.push(obj);
  for (const key of ["@graph", "itemListElement", "item", "mainEntity", "events", "subEvent"]) collectEvents(obj[key], out);
}

function toISTDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const first = (v: unknown): Json | null => (Array.isArray(v) ? (v[0] as Json) : v && typeof v === "object" ? (v as Json) : null);
const entities = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
const clean = (s: string) => entities(entities(s)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function fromJsonLd(e: Json, source: string, city: string): Omit<Candidate, "id"> | null {
  const title = str(e.name);
  const url = str(e.url);
  const start = toISTDate(e.startDate);
  if (!title || !url || !/^https?:\/\//.test(url) || !start) return null;

  const loc = first(e.location);
  const addr = loc ? first(loc.address) : null;
  const venue =
    [str(loc?.name), addr ? str(addr.streetAddress) : str(loc?.address)]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .join(", ") || null;

  const mode = String(e.eventAttendanceMode ?? "");
  const locType = String(loc?.["@type"] ?? "");
  const format: Candidate["format"] = /Mixed/i.test(mode)
    ? "hybrid"
    : /Online/i.test(mode) || /VirtualLocation/i.test(locType)
      ? "online"
      : /Offline/i.test(mode) || loc
        ? "in_person"
        : "unknown";

  const offer = first(e.offers);
  const amount = offer ? (offer.lowPrice ?? offer.price) : null;
  const price =
    amount == null || amount === ""
      ? null
      : Number(amount) === 0
        ? "Free"
        : `${str(offer?.priceCurrency) ?? ""} ${amount}`.trim();

  // Some listings publish when ticket sales end. Use it only if it is before the event starts.
  const salesEnd = toISTDate(offer?.validThrough ?? offer?.availabilityEnds);
  const deadline = salesEnd && salesEnd < start ? salesEnd : null;

  return {
    kind: "listing",
    source,
    city,
    title: clean(title),
    start_date: start,
    end_date: toISTDate(e.endDate),
    url,
    venue: venue ? clean(venue).slice(0, 140) : null,
    organizer: str(first(e.organizer)?.name),
    price,
    description: clean(str(e.description) ?? "").slice(0, 200),
    format,
    deadline,
  };
}

function parseListing(html: string, source: string, city: string): Omit<Candidate, "id">[] {
  const found: Json[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectEvents(JSON.parse(m[1].trim()), found);
    } catch {
      // one broken JSON block must not lose the rest of the page
    }
  }
  return found.map((e) => fromJsonLd(e, source, city)).filter((c): c is Omit<Candidate, "id"> => c !== null);
}

// ---------- web search (catches conference sites, industry bodies and public LinkedIn posts) ----------

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

function parseSearchRss(xml: string, city: string): Omit<Candidate, "id">[] {
  const out: Omit<Candidate, "id">[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const pick = (tag: string) => clean(decode(m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? ""));
    const url = pick("link");
    const title = pick("title");
    if (!/^https?:\/\//.test(url) || !title) continue;
    let source = "web";
    try {
      source = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (source.endsWith("bing.com")) continue;
    out.push({
      kind: "search",
      source,
      city,
      title: title.slice(0, 160),
      start_date: null,
      end_date: null,
      url,
      venue: null,
      organizer: null,
      price: null,
      description: pick("description").slice(0, 320),
      format: "unknown",
      deadline: null,
    });
  }
  return out.slice(0, 8);
}

// ---------- orchestration ----------

type Job = { source: string; city: string; url: string; parse: (body: string) => Omit<Candidate, "id">[] };

function jobsFor(city: string, categories: string[], monthLabel: string): Job[] {
  const s = slugsFor(city);
  const listing = (source: string, url: string): Job => ({ source, city, url, parse: (b) => parseListing(b, source, city) });
  const search = (label: string, query: string): Job => ({
    source: label,
    city,
    url: `https://www.bing.com/search?format=rss&count=10&q=${encodeURIComponent(query)}`,
    parse: (b) => parseSearchRss(b, city),
  });
  const topic = categories.slice(0, 3).join(" OR ");
  return [
    listing("eventbrite.com", `https://www.eventbrite.com/d/india--${s.eventbrite}/business--events/`),
    listing("allevents.in", `https://allevents.in/${s.allevents}/business`),
    listing("allevents.in", `https://allevents.in/${s.allevents}/conferences`),
    listing("meetup.com", `https://www.meetup.com/find/?location=in--${encodeURIComponent(s.meetup)}&source=EVENTS&categoryId=405`),
    listing("lu.ma", `https://lu.ma/${s.luma}`),
    search("web search", `${city} (summit OR conclave OR roundtable OR conference) (CXO OR CIO OR founders OR leaders) ${monthLabel} ${topic}`),
    search("web search (linkedin)", `site:linkedin.com ${city} (roundtable OR summit OR meetup) ${monthLabel} register`),
  ];
}

/** Fetch every source for every city in parallel. A failing source is reported, never fatal. */
export async function fetchCandidates(
  cities: string[],
  categories: string[],
  monthLabel: string,
): Promise<{ candidates: Candidate[]; reports: SourceReport[] }> {
  const jobs = cities.flatMap((c) => jobsFor(c, categories, monthLabel));
  const settled = await Promise.allSettled(jobs.map(async (job) => job.parse(await fetchText(job.url))));

  const candidates: Candidate[] = [];
  const merged = new Map<string, SourceReport>();
  let nextId = 1;
  settled.forEach((result, i) => {
    const { source, city } = jobs[i];
    const key = `${source}|${city}`;
    const report = merged.get(key) ?? { source, city, ok: false, found: 0 };
    if (result.status === "fulfilled") {
      report.ok = true;
      report.found += result.value.length;
      for (const c of result.value) candidates.push({ ...c, id: nextId++ });
    } else if (!report.ok) {
      report.error = result.reason instanceof Error ? result.reason.message.slice(0, 120) : String(result.reason);
    }
    merged.set(key, report);
  });
  return { candidates, reports: [...merged.values()] };
}
