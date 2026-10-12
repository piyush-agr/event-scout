import { DEADLINE_FLAG_DAYS, GEMINI_MODEL, WINDOW_DAYS } from "./config";
import { addDays, daysBetween, isIsoDate, todayIST } from "./dates";
import { db } from "./db";
import { sendDigestEmail } from "./email";
import { ExtractedEventSchema, extractAndScore, searchEvents, type SearchResult, type Source } from "./gemini";
import type { Digest, RunStats, ScoutEvent, Subscriber } from "./types";

function chunk<T>(items: T[], groups: number): T[][] {
  const size = Math.ceil(items.length / groups);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Same event listed on two sites usually differs only in punctuation, year and filler words. */
function dedupeKey(title: string, startDate: string): string {
  const words = title
    .toLowerCase()
    .replace(/\b20\d{2}\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["the", "a", "an", "of", "and", "for", "in", "edition", "india", "annual"].includes(w));
  return `${words.slice(0, 5).join(" ")}|${startDate}`;
}

function emptyStats(): RunStats {
  const from = todayIST();
  return {
    model: GEMINI_MODEL,
    window: { from, to: addDays(from, WINDOW_DAYS) },
    searches: [],
    sources_returned: 0,
    extracted: 0,
    dropped_invalid: 0,
    dropped_no_source: 0,
    dropped_out_of_window: 0,
    dropped_wrong_city: 0,
    dropped_online: 0,
    dropped_closed: 0,
    duplicates_merged: 0,
    final: 0,
    flagged: 0,
    by_domain: {},
    duration_ms: 0,
  };
}

export async function collectEvents(sub: Pick<Subscriber, "categories" | "cities">): Promise<{
  events: ScoutEvent[];
  stats: RunStats;
}> {
  const started = Date.now();
  const stats = emptyStats();
  const { from, to } = stats.window;

  // 1. SEARCH — at most 3 grounded searches per run (keeps us inside the free Gemini quota).
  const cityGroups = chunk(sub.cities, Math.min(3, sub.cities.length));
  const results: SearchResult[] = [];
  const settled = await Promise.allSettled(
    cityGroups.map((cities, i) =>
      searchEvents({ cities, categories: sub.categories, from, to, sourceIdOffset: i * 1000 }),
    ),
  );
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      results.push(r.value);
      stats.searches.push({ cities: cityGroups[i], ok: true, sources: r.value.sources.length });
    } else {
      // One failed search must not break the run.
      const error = r.reason instanceof Error ? r.reason.message : String(r.reason);
      stats.searches.push({ cities: cityGroups[i], ok: false, sources: 0, error: error.slice(0, 300) });
    }
  });

  const sources: Source[] = results.flatMap((r) => r.sources);
  stats.sources_returned = sources.length;
  if (results.length === 0) {
    stats.error = "All searches failed: " + (stats.searches[0]?.error ?? "unknown error");
    stats.duration_ms = Date.now() - started;
    return { events: [], stats };
  }
  if (sources.length === 0) {
    stats.error = "Google Search returned no source pages, so no event could be verified.";
    stats.duration_ms = Date.now() - started;
    return { events: [], stats };
  }

  // 2. NORMALISE + SCORE (Gemini), then everything below is plain code.
  const raw = await extractAndScore({
    findings: results.map((r) => r.text).join("\n\n---\n\n"),
    sources,
    cities: sub.cities,
    categories: sub.categories,
    from,
    to,
  });
  stats.extracted = raw.length;

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const cityByLower = new Map(sub.cities.map((c) => [c.toLowerCase(), c]));
  const merged = new Map<string, ScoutEvent>();

  for (const item of raw) {
    // 3. VALIDATE — discard malformed records.
    const parsed = ExtractedEventSchema.safeParse(item);
    if (!parsed.success || !isIsoDate(parsed.data.start_date)) {
      stats.dropped_invalid++;
      continue;
    }
    const e = parsed.data;

    // 4. PROVENANCE — keep only events tied to a page Google Search actually returned.
    const eventSources = [...new Set(e.source_ids)].map((id) => sourceById.get(id)).filter((s): s is Source => !!s);
    if (eventSources.length === 0) {
      stats.dropped_no_source++;
      continue;
    }

    // 5. FILTER — 30-day window, target cities, in-person.
    const endDate = isIsoDate(e.end_date) ? e.end_date : null;
    if (daysBetween(from, endDate ?? e.start_date) < 0 || daysBetween(e.start_date, to) < 0) {
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

    // 6. DEADLINE FLAG — computed in code, in IST.
    const deadline = isIsoDate(e.registration_deadline) ? e.registration_deadline : null;
    let deadline_status: ScoutEvent["deadline_status"];
    let days_left: number | null;
    if (deadline) {
      days_left = daysBetween(from, deadline);
      if (days_left < 0) {
        stats.dropped_closed++;
        continue;
      }
      deadline_status = days_left < DEADLINE_FLAG_DAYS ? "urgent" : "ok";
    } else {
      // No published deadline: the event date is the last possible moment to register.
      days_left = Math.max(0, daysBetween(from, e.start_date));
      deadline_status = days_left < DEADLINE_FLAG_DAYS ? "event_soon" : "unknown";
    }

    const [primary, ...rest] = eventSources;
    const event: ScoutEvent = {
      title: e.title.trim(),
      start_date: e.start_date,
      end_date: endDate && endDate !== e.start_date ? endDate : null,
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
      deadline,
      deadline_status,
      days_left,
      url: primary.url,
      source_domain: primary.domain,
      other_sources: rest.map((s) => ({ url: s.url, domain: s.domain })),
    };

    // 7. DEDUPE — same event found via different sites becomes one entry with several sources.
    const key = dedupeKey(event.title, event.start_date);
    const existing = merged.get(key);
    if (existing) {
      stats.duplicates_merged++;
      const seen = new Set([existing.url, ...existing.other_sources.map((s) => s.url)]);
      for (const s of eventSources) {
        if (!seen.has(s.url)) existing.other_sources.push({ url: s.url, domain: s.domain });
      }
      existing.score = Math.max(existing.score, event.score);
      if (!existing.deadline && event.deadline) {
        existing.deadline = event.deadline;
        existing.deadline_status = event.deadline_status;
        existing.days_left = event.days_left;
      }
    } else {
      merged.set(key, event);
    }
  }

  // 8. RANK — highest match first; ties go to the earlier event.
  const events = [...merged.values()].sort((a, b) => b.score - a.score || a.start_date.localeCompare(b.start_date));

  for (const ev of events) stats.by_domain[ev.source_domain] = (stats.by_domain[ev.source_domain] ?? 0) + 1;
  stats.final = events.length;
  stats.flagged = events.filter((e) => e.deadline_status === "urgent" || e.deadline_status === "event_soon").length;
  stats.duration_ms = Date.now() - started;
  return { events, stats };
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
