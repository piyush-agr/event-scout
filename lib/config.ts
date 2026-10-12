// Options offered in the preferences form. Users can also type their own.
// These are settings choices only — no event data is ever hardcoded.
export const CATEGORY_OPTIONS = [
  "CXO & CIO leadership",
  "Digital transformation",
  "AI & data strategy",
  "Startup ecosystem",
  "Management consulting & strategy",
  "Fintech & BFSI",
  "SaaS & enterprise tech",
  "Manufacturing & supply chain",
  "HR & future of work",
  "Sustainability & ESG",
];

export const CITY_OPTIONS = [
  "Bengaluru",
  "Mumbai",
  "Delhi NCR",
  "Hyderabad",
  "Pune",
  "Chennai",
  "Kolkata",
  "Ahmedabad",
];

export const WINDOW_DAYS = 30; // look-ahead window for events
export const DEADLINE_FLAG_DAYS = 7; // flag when registration closes in fewer days than this
export const MANUAL_RUN_COOLDOWN_SECONDS = 90; // protects the free Gemini quota

export const MIN_SCORE = 40; // events scoring below this are left out of the digest
export const MAX_EVENTS = 15; // keeps the digest readable in under five minutes
export const MAX_AI_LISTED = 40; // listed events sent to Gemini per run
export const MAX_AI_SEARCH = 20; // web-search snippets sent to Gemini per run

// Primary model comes from GEMINI_MODEL. The others are Gemini Flash fallbacks used
// only when the primary is rate-limited or overloaded.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
export const GEMINI_MODELS = [
  ...new Set([
    GEMINI_MODEL,
    ...(process.env.GEMINI_FALLBACK_MODELS || "gemini-3.8-flash,gemini-flash-latest").split(",").map((m) => m.trim()),
  ]),
].filter(Boolean);
