import type { ScoutEvent } from "./types";

/** A LinkedIn search for the people running this event. Needs no API; opens in the reader's own LinkedIn. */
export function organizerPeopleSearch(e: Pick<ScoutEvent, "organizer" | "title">): string {
  const keywords = e.organizer ? `${e.organizer} events` : e.title;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}
