# Decisions log

Each entry: what was decided, what else was considered, and why.

| # | Decision | Options considered | Chosen | Why |
|---|---|---|---|---|
| D1 | Data sources | (a) Gemini + Google Search grounding; (b) fetch public listing pages ourselves plus web-search RSS; (c) Eventbrite / LinkedIn APIs | (b) | (a) was built first, but the free-tier Gemini key returns "quota exceeded" for search grounding on every Flash model. (c) does not exist: Eventbrite removed public search in 2020 and LinkedIn has no public API. Eventbrite, AllEvents, Meetup and Luma all publish schema.org event data on their city pages, which is free, live and structured. |
| D2 | Preventing invented events | (a) trust the model; (b) let the model write names, dates and URLs; (c) model returns only an id, facts come from the fetched page | (c) | Name, date, venue and URL are copied from the source page in code. Gemini cannot add or alter an event; a record whose id matches nothing fetched is dropped. |
| D3 | Duplicates | (a) AI merge; (b) normalised title + start date key | (b) | Deterministic, free, easy to explain. Sources of merged events are kept. |
| D4 | Storage | Supabase, Upstash Redis, Google Sheet | Supabase Postgres | Free, relational (subscribers ↔ digests), and could be created without manual setup. |
| D5 | Settings without code | (a) single admin page with password; (b) per-user private link; (c) full accounts | (b) | The owner asked for multiple users who can each adjust their own preferences. Private links avoid password handling. |
| D6 | Multi-select | Fixed list only vs list + "All" + free text | List + "All" + "add your own" | Practice focus shifts through the year; new topics should not need a code change. |
| D7 | Ranking | (a) keyword overlap; (b) Gemini score 0–100 with reason; (c) embeddings | (b) | Judges topical fit and likely audience seniority, and gives a one-line "why it fits" for the reader. Code does the sorting. |
| D8 | Number of AI calls | Separate classify / score / summarise calls vs one combined call | One call per run | Free-tier quota is small and Flash models were often overloaded during testing. One schema-enforced call does all the judgement. |
| D9 | Deadline flag | AI decides vs code decides | Code, in IST | "Fewer than 7 days" is arithmetic. Unknown deadline is labelled as such; if the event itself is under 7 days away it is flagged too. Events whose deadline has passed are removed. |
| D10 | Online events | Keep, down-rank, or drop | Drop online-only | The brief is about in-person rooms. Hybrid events are kept. |
| D11 | Email provider | Resend vs Gmail SMTP | Gmail SMTP (app password) | Resend's free tier only sends to the account owner without a verified domain, which breaks multi-user sign-up. |
| D12 | Schedule | Vercel Cron vs external scheduler | Vercel Cron `30 1 * * 1` | 01:30 UTC is 7:00 AM IST on Monday. Protected by `CRON_SECRET`. |
| D13 | Proving it works on any day | — | "Send my digest now" button, public run history, web copy of each digest, run log per digest | Graders are unlikely to visit on a Monday morning and cannot see the inbox. |
| D14 | Failure behaviour | — | Per-search error capture, retries with backoff, failed runs stored but never emailed, last good digest stays visible | One failing search or a rate limit must not blank the page. |
| D15 | LinkedIn scraping | Scrape with a logged-in session vs reach public posts through web search | Web search only | Scraping breaks LinkedIn's terms and risks the account. Stated as a limitation. |
| D16 | Which events reach Gemini | All fetched vs filtered and capped | Date-filter and de-duplicate in code first, then send at most 40 listed events and 20 search snippets, taken evenly across sites and cities | Keeps the run inside the Vercel time limit and the Gemini quota, and stops one site from crowding out the others. |
| D17 | Digest length | Everything that passes vs a cut-off | Score of 40 or more, top 15 | The brief asks for something scannable in under five minutes. |
| D18 | Model availability | Single model vs fallback list | `GEMINI_MODEL` first, then other Gemini Flash models | `gemini-2.5-flash` was closed to new keys and newer Flash models returned 503 under load. All fallbacks are still Gemini Flash, as the exam requires. |
| D19 | Reaching the organiser | (a) scrape LinkedIn; (b) Lusha person lookup for the event manager; (c) Lusha company lookup plus a LinkedIn people-search link | (c) | Lets the reader connect with the event team when tickets run out or details conflict. (a) breaks LinkedIn's terms. (b) would store named individuals' details on pages that are public by link, and costs more credits. (c) needs only the organiser's company page; the people search runs in the reader's own LinkedIn. |
| D20 | Visual style | Colourful ticket layout vs restrained briefing layout | Briefing layout: serif headings, navy on white, red and ochre used only for deadlines and match strength | The reader is a senior consultant; the first design read as consumer-facing. |
| D21 | Contact for each event | (a) Lusha person lookup; (b) read what the organiser publishes on the event page and their organiser profile; (c) LinkedIn search link only | (b), with Lusha company page and a LinkedIn search link as fallbacks | Free, live, and limited to details the organiser chose to publish for enquiries. Gives the reader someone to reach when tickets run out or details conflict. Events with nothing published say "not available". |
| D22 | Cost | Paid tiers vs free tiers only | Free only: Gemini free key, Supabase free, Vercel Hobby, Gmail SMTP, Lusha free credits, public listing pages | Owner's requirement. Every paid-capable service degrades gracefully when its free allowance runs out. |

