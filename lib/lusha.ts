import { db } from "./db";
import type { ScoutEvent } from "./types";

// Lusha's free plan has very few credits, so:
//  - every organiser is looked up once and cached in Supabase (found or not),
//  - a run makes at most MAX_NEW_LOOKUPS new lookups (2 credits each), best-ranked events first.
const MAX_NEW_LOOKUPS = 3;

type Cached = { name_key: string; linkedin_url: string | null };

const keyOf = (name: string) => name.toLowerCase().replace(/\s+/g, " ").trim();

/** Ask Lusha for a company's LinkedIn page. Only the company page and domain are kept. */
async function lookupCompany(name: string): Promise<{ linkedin_url: string | null; domain: string | null }> {
  const res = await fetch(`https://api.lusha.com/v2/company?company=${encodeURIComponent(name)}`, {
    headers: { api_key: process.env.LUSHA_API_KEY! },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (res.status === 404) return { linkedin_url: null, domain: null };
  if (!res.ok) throw new Error(`Lusha HTTP ${res.status}`);
  const body = await res.json();
  // Guard against a loose match: only trust the result if Lusha's company name and ours overlap.
  const squash = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ours = squash(name);
  const theirs = [squash(body?.data?.name), squash(body?.data?.alternativeName)].filter(Boolean);
  if (!theirs.some((t) => t.includes(ours) || ours.includes(t))) return { linkedin_url: null, domain: null };
  const url = body?.data?.social?.linkedin?.url;
  return {
    linkedin_url: typeof url === "string" && /^https:\/\/([a-z]+\.)?linkedin\.com\//.test(url) ? url : null,
    domain: typeof body?.data?.domain === "string" ? body.data.domain : null,
  };
}

/**
 * Add each organiser's LinkedIn company page to the events, in place.
 * Never throws: the digest is still sent if Lusha is down or out of credits.
 */
export async function addOrganizerLinkedIn(events: ScoutEvent[]): Promise<{ from_cache: number; looked_up: number; error?: string }> {
  const report: { from_cache: number; looked_up: number; error?: string } = { from_cache: 0, looked_up: 0 };
  const names = [...new Set(events.map((e) => e.organizer).filter((n): n is string => !!n && n.length > 2))];
  if (names.length === 0) return report;

  const known = new Map<string, string | null>();
  try {
    const { data } = await db().from("organizers").select("name_key, linkedin_url").in("name_key", names.map(keyOf));
    for (const row of (data as Cached[]) ?? []) known.set(row.name_key, row.linkedin_url);
    report.from_cache = known.size;

    if (process.env.LUSHA_API_KEY) {
      const missing = names.filter((n) => !known.has(keyOf(n))).slice(0, MAX_NEW_LOOKUPS);
      for (const name of missing) {
        const found = await lookupCompany(name);
        known.set(keyOf(name), found.linkedin_url);
        report.looked_up++;
        await db().from("organizers").upsert({ name_key: keyOf(name), name, ...found, checked_at: new Date().toISOString() });
      }
    }
  } catch (err) {
    report.error = err instanceof Error ? err.message.slice(0, 120) : String(err);
  }

  for (const e of events) {
    if (e.organizer) e.organizer_linkedin = known.get(keyOf(e.organizer)) ?? null;
  }
  return report;
}
