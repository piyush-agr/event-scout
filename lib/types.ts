export type Subscriber = {
  id: string;
  token: string;
  name: string;
  email: string;
  categories: string[];
  cities: string[];
  created_at: string;
  updated_at: string;
};

export type DeadlineStatus = "urgent" | "event_soon" | "ok" | "unknown";

export type ScoutEvent = {
  title: string;
  start_date: string;
  end_date: string | null;
  city: string;
  venue: string | null;
  format: "in_person" | "hybrid" | "online" | "unknown";
  organizer: string | null;
  audience: string | null;
  summary: string;
  price: string | null;
  category: string;
  score: number;
  reason: string;
  deadline: string | null;
  deadline_status: DeadlineStatus;
  days_left: number | null; // days until registration deadline (or until the event if deadline unknown)
  url: string; // always a URL returned by Google Search grounding
  source_domain: string;
  other_sources: { url: string; domain: string }[];
};

export type RunStats = {
  model: string;
  window: { from: string; to: string };
  sources: { source: string; city: string; ok: boolean; found: number; error?: string }[];
  candidates_fetched: number; // everything the live sources returned
  listed_in_window: number; // listed events inside the 30-day window, after merging duplicates
  search_results: number; // web-search snippets collected
  sent_to_ai: number;
  dropped_invalid: number;
  dropped_no_source: number;
  dropped_out_of_window: number;
  dropped_wrong_city: number;
  dropped_online: number;
  dropped_closed: number;
  dropped_low_relevance: number;
  duplicates_merged: number;
  final: number;
  flagged: number;
  by_domain: Record<string, number>;
  duration_ms: number;
  error?: string;
};

export type Digest = {
  id: string;
  subscriber_id: string;
  trigger: "cron" | "manual" | "signup";
  status: "ok" | "empty" | "failed";
  events: ScoutEvent[];
  stats: RunStats;
  email_status: string | null;
  created_at: string;
};
