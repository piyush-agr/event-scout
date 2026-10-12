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

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
