import { DEADLINE_FLAG_DAYS, GEMINI_MODEL, MAX_AI_LISTED, MAX_AI_SEARCH, MAX_EVENTS, MIN_SCORE, WINDOW_DAYS } from "./config";
import { addDays, daysBetween, isIsoDate, todayIST } from "./dates";
import { db } from "./db";
import { sendDigestEmail } from "./email";
import { assessEvents, ListedAssessmentSchema, SearchEventSchema } from "./gemini";
import { addEventContacts } from "./contact";
import { addOrganizerLinkedIn } from "./lusha";
import { fetchCandidates, type Candidate } from "./sources";
import type { Digest, RunStats, ScoutEvent, Subscriber } from "./types";

/** Same event listed on two sites usually differs only in punctuation, year and filler words. */
function dedupeKey(title: string, startDate: string): string {
  const words = title
    .toLowerCase()
    .replace(/\b20\d{2}\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["the", "a", "an", "of", "and", "for", "in", "edition", "india", "annual", "tickets"].includes(w));
  return `${words.slice(0, 5).join(" ")}|${startDate}`;
}

/** Take items from each group in turn, so no single site or city crowds out the others. */
function roundRobin<T>(groups: T[][], limit: number): T[] {
  const out: T[] = [];
  for (let i = 0; out.length < limit && groups.some((g) => i < g.length); i++) {
    for (const g of groups) if (i < g.length && out.length < limit) out.push(g[i]);
  }
  return out;
}

function emptyStats(): RunStats {
  const from = todayIST();
  return {
    model: GEMINI_MODEL,
    window: { from, to: addDays(from, WINDOW_DAYS) },
    sources: [],
    candidates_fetched: 0,
    listed_in_window: 0,
    search_results: 0,
    sent_to_ai: 0,
    dropped_invalid: 0,
    dropped_no_source: 0,
    dropped_out_of_window: 0,
    dropped_wrong_city: 0,
    dropped_online: 0,
    dropped_closed: 0,
    dropped_low_relevance: 0,
    duplicates_merged: 0,
    final: 0,
    flagged: 0,
    by_domain: {},
    duration_ms: 0,
  };
}

type Group = { primary: Candidate; others: Candidate[] };

export async function collectEvents(sub: Pick<Subscriber, "categories" | "cities">): Promise<{
  events: ScoutEvent[];
  stats: RunStats;
}> {
  const started = Date.now();
  const stats = emptyStats();
  const { from, to } = stats.window;
  const inWindow = (start: string, end: string | null) => daysBetween(from, end ?? start) >= 0 && daysBetween(start, to) >= 0;

  // 1. AGGREGATE — fetch live listing pages and web search for every chosen city.
  const monthLabel = new Date(`${from}T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const { candidates, reports } = await fetchCandidates(sub.cities, sub.categories, monthLabel);
  stats.sources = reports;
  stats.candidates_fetched = candidates.length;
  if (candidates.length === 0) {
    stats.error = "No live source returned any data: " + reports.map((r) => `${r.source} ${r.city}: ${r.error ?? "0 results"}`).slice(0, 4).join("; ");
    stats.duration_ms = Date.now() - started;
    return { events: [], stats };
  }

  // 2. FILTER BY DATE + MERGE DUPLICATES (code) — before spending any AI quota.
  const groups = new Map<string, Group>();
  for (const c of candidates) {
    if (c.kind !== "listing" || !c.start_date) continue;
    if (!inWindow(c.start_date, c.end_date)) {
      stats.dropped_out_of_window++;
      continue;
    }
    const key = dedupeKey(c.title, c.start_date);
    const group = groups.get(key);
    if (group) {
      stats.duplicates_merged++;
      if (c.url !== group.primary.url) group.others.push(c);
    } else {
      groups.set(key, { primary: c, others: [] });
    }
  }
  stats.listed_in_window = groups.size;

  const bySourceCity = new Map<string, Group[]>();
  for (const g of groups.values()) {
    const key = `${g.primary.source}|${g.primary.city}`;
    bySourceCity.set(key, [...(bySourceCity.get(key) ?? []), g]);
  }
  const listed = roundRobin([...bySourceCity.values()], MAX_AI_LISTED);

  const seenUrls = new Set<string>();
  const searchResults = candidates
    .filter((c) => c.kind === "search" && !seenUrls.has(c.url) && seenUrls.add(c.url))
    .slice(0, MAX_AI_SEARCH);
  stats.search_results = searchResults.length;
  stats.sent_to_ai = listed.length + searchResults.length;

  // 3. UNDERSTAND + SCORE (Gemini Flash).
  const ai = await assessEvents({
    listed: listed.map((g) => g.primary),
    searchResults,
    cities: sub.cities,
    categories: sub.categories,
    from,
    to,
  });
  stats.model = ai.model;

  const events = new Map<string, ScoutEvent>();
  const cityByLower = new Map(sub.cities.map((c) => [c.toLowerCase(), c]));

  /** Deadline flag, computed in code in IST. Returns null if registration has already closed. */
  const withDeadline = (start: string, deadline: string | null) => {
    if (deadline) {
      const days_left = daysBetween(from, deadline);
      if (days_left < 0) return null;
      return { deadline, days_left, deadline_status: (days_left < DEADLINE_FLAG_DAYS ? "urgent" : "ok") as ScoutEvent["deadline_status"] };
    }
    // No published deadline: the event date is the last possible moment to register.
    const days_left = Math.max(0, daysBetween(from, start));
    return { deadline: null, days_left, deadline_status: (days_left < DEADLINE_FLAG_DAYS ? "event_soon" : "unknown") as ScoutEvent["deadline_status"] };
  };

  // 4a. Listed events: facts come from the listing page, judgement comes from Gemini.
  const groupById = new Map(listed.map((g) => [g.primary.id, g]));
  for (const item of ai.listed) {
    const parsed = ListedAssessmentSchema.safeParse(item);
    const group = parsed.success ? groupById.get(parsed.data.id) : undefined;
    if (!parsed.success || !group) {
      stats.dropped_invalid++;
      continue;
    }
    const a = parsed.data;
    const c = group.primary;
    groupById.delete(c.id); // ignore a repeated id
    const format = c.format !== "unknown" ? c.format : a.format;
    if (format === "online") {
      stats.dropped_online++;
      continue;
    }
    if (!a.is_professional_event || a.relevance_score < MIN_SCORE) {
      stats.dropped_low_relevance++;
      continue;
    }
    const aiDeadline = isIsoDate(a.registration_deadline) && a.registration_deadline <= c.start_date! ? a.registration_deadline : null;
    const d = withDeadline(c.start_date!, c.deadline ?? aiDeadline);
    if (!d) {
      stats.dropped_closed++;
      continue;
    }
    events.set(dedupeKey(c.title, c.start_date!), {
      title: c.title,
      start_date: c.start_date!,
      end_date: c.end_date && c.end_date !== c.start_date ? c.end_date : null,
      city: c.city,
      venue: c.venue,
      format,
      organizer: c.organizer,
      audience: a.audience?.trim() || null,
      summary: a.summary.trim(),
      price: c.price,
      category: a.category,
      score: Math.round(a.relevance_score),
      reason: a.relevance_reason.trim(),
      ...d,
      url: c.url,
      source_domain: c.source,
      other_sources: group.others.map((o) => ({ url: o.url, domain: o.source })),
    });
  }

  // 4b. Events Gemini recognised inside web-search snippets: validated harder, because the text was unstructured.
  const searchById = new Map(searchResults.map((c) => [c.id, c]));
  for (const item of ai.fromSearch) {
    const parsed = SearchEventSchema.safeParse(item);
    if (!parsed.success || !isIsoDate(parsed.data.start_date)) {
      stats.dropped_invalid++;
      continue;
    }
    const e = parsed.data;
    const src = searchById.get(e.id);
    if (!src) {
      stats.dropped_no_source++; // not tied to a page we actually fetched
      continue;
    }
    const end = isIsoDate(e.end_date) ? e.end_date : null;
    if (!inWindow(e.start_date, end)) {
      stats.dropped_out_of_window++;
      continue;
    }
    const city = cityByLower.get(e.city.trim().toLowerCase());
    if (!city) {
      stats.dropped_wrong_city++;
      continue;
    }
    if (e.format === "online") {
      stats.dropped_online++;
      continue;
    }
    if (e.relevance_score < MIN_SCORE) {
      stats.dropped_low_relevance++;
      continue;
    }
    const d = withDeadline(e.start_date, isIsoDate(e.registration_deadline) && e.registration_deadline <= e.start_date ? e.registration_deadline : null);
    if (!d) {
      stats.dropped_closed++;
      continue;
    }
    const key = dedupeKey(e.title, e.start_date);
    const existing = events.get(key);
    if (existing) {
      stats.duplicates_merged++;
      existing.other_sources.push({ url: src.url, domain: src.source });
      continue;
    }
    events.set(key, {
      title: e.title.trim(),
      start_date: e.start_date,
      end_date: end && end !== e.start_date ? end : null,
      city,
      venue: e.venue?.trim() || null,
      format: e.format,
      organizer: e.organizer?.trim() || null,
      audience: e.audience?.trim() || null,
      summary: e.summary.trim(),
      price: e.price?.trim() || null,
      category: e.category,
      score: Math.round(e.relevance_score),
      reason: e.relevance_reason.trim(),
      ...d,
      url: src.url,
      source_domain: src.source,
      other_sources: [],
    });
  }

  // 5. RANK — best match first, ties to the earlier event; keep the top few so it reads in five minutes.
  const ranked = [...events.values()]
    .sort((a, b) => b.score - a.score || a.start_date.localeCompare(b.start_date))
    .slice(0, MAX_EVENTS);

  // 6. ORGANISER CONTACT — details published on the event and organiser pages (free),
  //    then a LinkedIn company page from Lusha's free credits where the pages had none.
  stats.contacts = await addEventContacts(ranked);
  stats.organizers = await addOrganizerLinkedIn(ranked);

  for (const ev of ranked) stats.by_domain[ev.source_domain] = (stats.by_domain[ev.source_domain] ?? 0) + 1;
  stats.final = ranked.length;
  stats.flagged = ranked.filter((e) => e.deadline_status === "urgent" || e.deadline_status === "event_soon").length;
  stats.duration_ms = Date.now() - started;
  return { events: ranked, stats };
}

/** Full run for one subscriber: collect → store → email. */
export async function runDigest(sub: Subscriber, trigger: Digest["trigger"], baseUrl: string): Promise<Digest> {
  let events: ScoutEvent[] = [];
  let stats: RunStats;
  try {
    ({ events, stats } = await collectEvents(sub));
  } catch (err) {
    stats = emptyStats();
    stats.error = err instanceof Error ? err.message.slice(0, 400) : String(err);
  }

  const status: Digest["status"] = stats.error ? "failed" : events.length ? "ok" : "empty";
  const { data, error } = await db()
    .from("digests")
    .insert({ subscriber_id: sub.id, trigger, status, events, stats })
    .select("*")
    .single();
  if (error) throw new Error(`Could not save digest: ${error.message}`);
  const digest = data as Digest;

  // Only email when there is something real to send.
  let email_status = "skipped: no events found";
  if (status === "ok") {
    try {
      await sendDigestEmail(sub, digest, baseUrl);
      email_status = "sent";
    } catch (err) {
      email_status = "failed: " + (err instanceof Error ? err.message.slice(0, 200) : String(err));
    }
  } else if (status === "failed") {
    email_status = "skipped: run failed";
  }
  await db().from("digests").update({ email_status }).eq("id", digest.id);
  return { ...digest, email_status };
}
