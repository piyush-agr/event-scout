# Event Scout

An AI-powered weekly event digest for an independent management consultant (MESA Cohort C4, Problem Statement 15).

Every Monday at 7:00 AM IST it collects conferences, CXO summits, roundtables and startup meetups for the next 30 days from Eventbrite, AllEvents, Meetup, Luma and web search, keeps the subscriber's cities, has Gemini Flash rank them against their focus areas, flags any registration closing within 7 days, and emails the result.

**Live site:** https://event-scout-puce.vercel.app

- **Components Map:** `/components-map.html` on the live site, detail in [COMPONENTS_MAP.md](COMPONENTS_MAP.md)
- **Decisions:** [DECISIONS.md](DECISIONS.md)

## Grader quick-start (under 2 minutes)

1. Open the live URL. The **Latest digest** section shows real events from the most recent run, each with a link to the page it came from.
2. Scroll to **Run history** to see past runs, their trigger (`cron`, `manual`, `signup`) and email status. Click a row to open that digest.
3. Open **How this digest was built** under any digest to see the run log: every source fetched and how many items it returned, how many went to Gemini, and how many were dropped at each step.
4. To try it yourself: enter a name and email, pick focus areas and cities (or **All**), and submit. A live run starts (one to two minutes) and the digest is emailed to you.
5. On your private settings page, change the cities or focus areas and click **Send my digest now** to see the change take effect.

## Requirements traceability

| # | Requirement | Implemented in | Where to see it |
|---|---|---|---|
| R1 | Email digest | `lib/email.ts` | Your inbox after sign-up; "email: sent" in run history |
| R2 | Every Monday morning | `vercel.json`, `app/api/cron/route.ts` | `vercel.json` schedule; `cron` rows in run history |
| R3 | Next 30 days | `lib/pipeline.ts` step 2 | "window" line on each digest; run log |
| R4 | Aggregated from many sources | `lib/sources.ts` | "Source" line per event; "Live sources fetched" in run log |
| R5 | Filtered by domains | `assessEvents` + score cut-off in `lib/pipeline.ts` | Category per event; "Dropped: not relevant enough" in run log |
| R6 | Filtered by cities | `lib/sources.ts` (fetches only chosen cities) | City per event; sources listed per city in run log |
| R7 | Ranked by match | `assessEvents` + sort | "Rank 1" and "92 match" tags and "Why it fits" per event |
| R8 | Scannable in 5 minutes | `lib/email.ts`, `components/DigestView.tsx` | One compact card per event |
| R9 | Enough context to decide | same, plus `lib/contact.ts` | Date, venue, price, summary, audience, reason, organiser contact, link |
| R10 | Configurable without code | `components/PrefsForm.tsx`, settings page | Private settings link |
| R11 | Deadline under 7 days flagged | `lib/pipeline.ts` `withDeadline` | Orange banner and date on the event; "to act on this week" panel |
| E1 | Gemini Flash only | `lib/gemini.ts` | Model name in run log; no other AI SDK in `package.json` |
| E2 | Live data, nothing hardcoded | whole pipeline | Timestamps and source links on each digest |
| E3 | Deployed on Vercel | — | Live URL |
| E6 | No invented events | `lib/pipeline.ts` step 4 | Every event links to the page it was fetched from; "Dropped: not tied to a fetched page" in run log |

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

## Environment variables

| Name | What it is |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | Gemini Flash model name, e.g. `gemini-3.5-flash` |
| `GEMINI_FALLBACK_MODELS` | Optional. Comma-separated Gemini Flash models to try if the first is busy |
| `SUPABASE_URL`, `SUPABASE_KEY` | Supabase project URL and API key (server-side only) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Sending Gmail address and its app password |
| `LUSHA_API_KEY` | Optional. Finds each organiser's LinkedIn company page |
| `CRON_SECRET` | Random string; Vercel Cron sends it as a Bearer token |

Database schema: three tables, `subscribers`, `digests` and `organizers` (see `supabase/schema.sql`).

## Deploy

Import the repo in Vercel, add the environment variables above, deploy. `vercel.json` registers the Monday cron automatically.

## Known limitations

See section 6 of [COMPONENTS_MAP.md](COMPONENTS_MAP.md). In short: LinkedIn-only posts can still be missed because they are reached only through web search, most events publish no registration deadline, and free-tier quotas limit how often a run can be triggered.
