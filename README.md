# Event Scout

An AI-powered weekly event digest for an independent management consultant (MESA Cohort C4, Problem Statement 15).

Every Monday at 7:00 AM IST it searches the live web for conferences, CXO summits, roundtables and startup meetups in the next 30 days, filters them to the subscriber's cities, ranks them against their focus areas, flags any registration closing within 7 days, and emails the result.

- **Components Map:** `/components-map.html` on the live site, detail in [COMPONENTS_MAP.md](COMPONENTS_MAP.md)
- **Decisions:** [DECISIONS.md](DECISIONS.md)

## Grader quick-start (under 2 minutes)

1. Open the live URL. The **Latest digest** section shows real events from the most recent run, each with a link to the page it came from.
2. Scroll to **Run history** to see past runs, their trigger (`cron`, `manual`, `signup`) and email status. Click a row to open that digest.
3. Open **How this digest was built** under any digest to see the run log: pages returned by search, events extracted, and how many were dropped at each step.
4. To try it yourself: enter a name and email, pick focus areas and cities (or **All**), and submit. A live run starts (30–90 seconds) and the digest is emailed to you.
5. On your private settings page, change the cities or focus areas and click **Send my digest now** to see the change take effect.

## Requirements traceability

| # | Requirement | Implemented in | Where to see it |
|---|---|---|---|
| R1 | Email digest | `lib/email.ts` | Your inbox after sign-up; "email: sent" in run history |
| R2 | Every Monday morning | `vercel.json`, `app/api/cron/route.ts` | `vercel.json` schedule; `cron` rows in run history |
| R3 | Next 30 days | `lib/pipeline.ts` step 5 | "window" line on each digest; run log |
| R4 | Aggregated from many sources | `lib/gemini.ts` `searchEvents` | "Source" line per event; "Events per source site" in run log |
| R5 | Filtered by domains | search prompt + scoring | Category shown per event |
| R6 | Filtered by cities | `lib/pipeline.ts` step 5 | City per event; "Dropped: not in chosen cities" in run log |
| R7 | Ranked by match | `extractAndScore` + sort | "#1 · Match 92/100" and "Why it fits" per event |
| R8 | Scannable in 5 minutes | `lib/email.ts`, `components/DigestView.tsx` | One compact card per event |
| R9 | Enough context to decide | same | Date, venue, price, summary, audience, reason, link |
| R10 | Configurable without code | `components/PrefsForm.tsx`, settings page | Private settings link |
| R11 | Deadline under 7 days flagged | `lib/pipeline.ts` step 6 | Red flag on the event and "Act this week" box |
| E1 | Gemini Flash only | `lib/gemini.ts` | Model name in run log; no other AI SDK in `package.json` |
| E2 | Live data, nothing hardcoded | whole pipeline | Timestamps and source links on each digest |
| E3 | Deployed on Vercel | — | Live URL |
| E6 | No invented events | `lib/pipeline.ts` step 4 | "Dropped: no real source URL" in run log |

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
| `GEMINI_MODEL` | Gemini Flash model name, e.g. `gemini-2.5-flash` |
| `SUPABASE_URL`, `SUPABASE_KEY` | Supabase project URL and API key (server-side only) |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Sending Gmail address and its app password |
| `CRON_SECRET` | Random string; Vercel Cron sends it as a Bearer token |

Database schema: two tables, `subscribers` and `digests` (see `supabase/schema.sql`).

## Deploy

Import the repo in Vercel, add the environment variables above, deploy. `vercel.json` registers the Monday cron automatically.

## Known limitations

See section 6 of [COMPONENTS_MAP.md](COMPONENTS_MAP.md). In short: LinkedIn posts are found only if Google has indexed them, most events publish no registration deadline, and free-tier quotas limit how often a run can be triggered.
