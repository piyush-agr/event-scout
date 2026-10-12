import type { ScoutEvent } from "./types";

/** A LinkedIn search for the people running this event. Needs no API; opens in the reader's own LinkedIn. */
export function organizerPeopleSearch(e: Pick<ScoutEvent, "organizer" | "title">): string {
  const keywords = e.organizer ? `${e.organizer} events` : e.title;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}

export type ContactLink = { label: string; href: string };

/** The contact links to show for an event, best first. Empty when the pages published nothing. */
export function contactLinks(e: ScoutEvent, includeDirect = true): ContactLink[] {
  const c = e.contact;
  const links: ContactLink[] = [];
  // Email and phone are left off the public home page; they appear in the email and on the digest's own page.
  if (includeDirect && c?.email) links.push({ label: c.email, href: `mailto:${c.email}` });
  if (includeDirect && c?.phone) links.push({ label: c.phone, href: `tel:${c.phone.replace(/[^+\d]/g, "")}` });
  const linkedin = c?.linkedin ?? e.organizer_linkedin;
  if (linkedin) links.push({ label: "LinkedIn", href: linkedin });
  if (c?.website) links.push({ label: "Website", href: c.website });
  if (c?.profile_url) links.push({ label: `Organiser page on ${e.source_domain}`, href: c.profile_url });
  return links;
}
