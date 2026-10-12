import type { EventContact, ScoutEvent } from "./types";

// Finds the contact details an organiser has published for an event.
// Two page fetches per event, no paid service:
//   1. the event page itself  → organiser name and their profile page on the platform
//   2. that organiser profile → website, email, phone and LinkedIn, when published
// Only details printed on those pages are kept. Nothing is guessed.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Links and addresses that belong to the listing platform, not the organiser.
const PLATFORM = /eventbrite|meetup|allevents|amitech|luma|lumahq|lu\.ma|sentry|example\.|w3\.org|schema\.org|google|facebook|cloudflare/i;

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html", "accept-language": "en-IN,en;q=0.9" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

type Json = Record<string, unknown>;

/** First organiser named in the page's schema.org data. */
function organizerFromJsonLd(html: string): { name: string | null; url: string | null } {
  const found: Json[] = [];
  const walk = (node: unknown): void => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object") return;
    const obj = node as Json;
    if (obj.organizer) [obj.organizer].flat(3).forEach((o) => o && typeof o === "object" && found.push(o as Json));
    for (const key of ["@graph", "mainEntity"]) walk(obj[key]);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim()));
    } catch {
      // ignore a broken block
    }
  }
  const first = found.find((o) => typeof o.name === "string" && o.name.trim());
  const url = typeof first?.url === "string" && /^https?:\/\//.test(first.url) ? first.url : null;
  return { name: first ? String(first.name).replace(/\s+/g, " ").trim() : null, url };
}

/** Contact details printed in a page's HTML. */
function detailsFrom(html: string): Pick<EventContact, "email" | "phone" | "linkedin" | "website"> {
  const firstMatch = (re: RegExp, ok: (v: string) => boolean = () => true) => {
    for (const m of html.matchAll(re)) if (ok(m[1] ?? m[0])) return (m[1] ?? m[0]).trim();
    return null;
  };

  const email = firstMatch(
    /([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g,
    (v) => !PLATFORM.test(v) && !/\.(png|jpe?g|svg|webp|gif|css|js)$/i.test(v) && v.length < 60,
  );

  // Phones: only numbers written as phone numbers (tel: link or +91 prefix). Bare digit runs are usually IDs.
  const phone =
    firstMatch(/href=["']tel:([+\d][\d\s-]{8,16})["']/gi) ?? firstMatch(/(\+91[\s-]?[6-9]\d{4}[\s-]?\d{5})\b/g);

  let linkedin = firstMatch(
    /(https?:\/\/(?:[a-z]+\.)?linkedin\.com\/(?:company|in|school|showcase)\/[A-Za-z0-9\-_%.]+)/gi,
    (v) => !PLATFORM.test(v.split("linkedin.com")[1] ?? ""),
  );
  // Luma keeps the host's LinkedIn as a handle such as "/in/name" in its page data.
  const handle = html.match(/"linkedin_handle":"(\/(?:in|company)\/[^"]+)"/)?.[1];
  if (!linkedin && handle) linkedin = `https://www.linkedin.com${handle}`;

  const website = firstMatch(/"website":"(https?:\/\/[^"]+)"/g, (v) => !PLATFORM.test(v));

  return { email, phone: phone?.replace(/\s+/g, " ") ?? null, linkedin, website };
}

async function contactFor(e: ScoutEvent): Promise<EventContact> {
  const eventPage = await fetchPage(e.url);
  const org = organizerFromJsonLd(eventPage);
  const onEvent = detailsFrom(eventPage);

  // Second hop: the organiser's own profile on the platform usually carries their links.
  const profile = org.url ? detailsFrom(await fetchPage(org.url)) : { email: null, phone: null, linkedin: null, website: null };

  return {
    name: org.name ?? e.organizer,
    profile_url: org.url,
    email: onEvent.email ?? profile.email,
    phone: onEvent.phone ?? profile.phone,
    linkedin: profile.linkedin ?? onEvent.linkedin,
    website: profile.website ?? onEvent.website,
  };
}

/** Add published organiser contact details to each event, in place. Never throws. */
export async function addEventContacts(events: ScoutEvent[]): Promise<{ checked: number; with_contact: number }> {
  const results = await Promise.allSettled(events.map(contactFor));
  let withContact = 0;
  results.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    const c = r.value;
    events[i].contact = c;
    if (!events[i].organizer && c.name) events[i].organizer = c.name;
    if (c.profile_url || c.email || c.phone || c.linkedin || c.website) withContact++;
  });
  return { checked: events.length, with_contact: withContact };
}
