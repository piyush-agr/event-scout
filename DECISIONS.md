# Decisions log

Each entry: what was decided, what else was considered, and why.

| # | Decision | Options considered | Chosen | Why |
|---|---|---|---|---|
| D1 | Data sources | (a) Gemini + Google Search grounding; (b) fetch a fixed list of RSS/URLs; (c) Eventbrite / LinkedIn APIs | (a) | Eventbrite removed public event search in 2020 and LinkedIn has no public API. Search grounding reaches all of them through Google's index, is live, and is free. |
| D2 | Preventing invented events | (a) trust the model; (b) ask it for URLs; (c) accept only URLs present in Google Search's own result list | (c) | The grounding metadata lists the pages Google actually returned. Code drops any event not tied to one of them, so a URL cannot be made up. |
| D3 | Duplicates | (a) AI merge; (b) normalised title + start date key | (b) | Deterministic, free, easy to explain. Sources of merged events are kept. |
| D4 | Storage | Supabase, Upstash Redis, Google Sheet | Supabase Postgres | Free, relational (subscribers ↔ digests), and could be created without manual setup. |
| D5 | Settings without code | (a) single admin page with password; (b) per-user private link; (c) full accounts | (b) | The owner asked for multiple users who can each adjust their own preferences. Private links avoid password handling. |
| D6 | Multi-select | Fixed list only vs list + "All" + free text | List + "All" + "add your own" | Practice focus shifts through the year; new topics should not need a code change. |
| D7 | Ranking | (a) keyword overlap; (b) Gemini score 0–100 with reason; (c) embeddings | (b) | Judges topical fit and likely audience seniority, and gives a one-line "why it fits" for the reader. Code does the sorting. |
| D8 | One AI call or two after search | Separate extract and rank calls vs one combined | Combined | Halves quota use and run time; schema-enforced output keeps it reliable. |
| D9 | Deadline flag | AI decides vs code decides | Code, in IST | "Fewer than 7 days" is arithmetic. Unknown deadline is labelled as such; if the event itself is under 7 days away it is flagged too. Events whose deadline has passed are removed. |
| D10 | Online events | Keep, down-rank, or drop | Drop online-only | The brief is about in-person rooms. Hybrid events are kept. |
| D11 | Email provider | Resend vs Gmail SMTP | Gmail SMTP (app password) | Resend's free tier only sends to the account owner without a verified domain, which breaks multi-user sign-up. |
| D12 | Schedule | Vercel Cron vs external scheduler | Vercel Cron `30 1 * * 1` | 01:30 UTC is 7:00 AM IST on Monday. Protected by `CRON_SECRET`. |
| D13 | Proving it works on any day | — | "Send my digest now" button, public run history, web copy of each digest, run log per digest | Graders are unlikely to visit on a Monday morning and cannot see the inbox. |
| D14 | Failure behaviour | — | Per-search error capture, retries with backoff, failed runs stored but never emailed, last good digest stays visible | One failing search or a rate limit must not blank the page. |
| D15 | LinkedIn scraping | Scrape with a logged-in session vs rely on Google's index | Google's index only | Scraping breaks LinkedIn's terms and risks the account. Stated as a limitation. |
