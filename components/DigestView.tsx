import { formatDate, formatDateTimeIST } from "@/lib/dates";
import { deadlineLabel, placeLine, priceLabel } from "@/lib/email";
import { contactLinks, organizerPeopleSearch } from "@/lib/links";
import type { Digest, ScoutEvent } from "@/lib/types";

const isFlagged = (e: ScoutEvent) => e.deadline_status === "urgent" || e.deadline_status === "event_soon";

/** Day, month and weekday for the ticket stub, from a YYYY-MM-DD string. */
function stubParts(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const part = (opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
  return { day: part({ day: "numeric" }), month: part({ month: "short" }), weekday: part({ weekday: "short" }) };
}

function Ticket({ event: e, rank, direct }: { event: ScoutEvent; rank: number; direct: boolean }) {
  const links = contactLinks(e, direct);
  const hidden = !direct && (e.contact?.email || e.contact?.phone);
  const d = deadlineLabel(e);
  const start = stubParts(e.start_date);
  const end = e.end_date ? stubParts(e.end_date) : null;
  const tier = e.score >= 80 ? "high" : e.score >= 60 ? "" : "low";
  const sources = [{ url: e.url, domain: e.source_domain }, ...e.other_sources.slice(0, 2)];

  return (
    <li className={d.urgent ? "ticket is-urgent" : "ticket"}>
      <div className="stub">
        <span className="stub-day">{start.day}</span>
        <span className="stub-month">{start.month}</span>
        <span className="stub-weekday">{start.weekday}</span>
        {end && (
          <span className="stub-until">
            to {end.day} {end.month}
          </span>
        )}
      </div>
      <div className="ticket-body">
        <div className="ticket-top">
          <span className="rank">#{rank}</span>
          <span className={`score ${tier}`}>
            <b>{e.score}</b> match
            <i style={{ "--v": `${e.score}%` } as React.CSSProperties} aria-hidden="true" />
          </span>
          <span className="tag">{e.category}</span>
        </div>
        <h3>
          <a href={e.url} target="_blank" rel="noopener noreferrer">
            {e.title}
          </a>
        </h3>
        <p className="place">
          {placeLine(e)}
          {e.price && <span className={e.price === "Free" ? "price free" : "price"}>{priceLabel(e.price)}</span>}
        </p>
        {d.urgent && <p className="deadline urgent">{d.text}</p>}
        <p className="summary">{e.summary}</p>
        <p className="fit">
          <b>Why it fits:</b> {e.reason}
        </p>
        {e.audience && (
          <p className="who">
            <b>In the room:</b> {e.audience}
          </p>
        )}
        <p className="organiser">
          <b>Contact:</b> {e.contact?.name ?? e.organizer ?? "organiser not named"}
          {links.length === 0 && !hidden && <span className="na">, details not available on the listing</span>}
          {links.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          ))}
          {hidden && <span className="na"> (email or phone is in the digest email)</span>}
          <a href={organizerPeopleSearch(e)} target="_blank" rel="noopener noreferrer">
            Search LinkedIn for the event team
          </a>
        </p>
        {!d.urgent &&
          (e.deadline ? (
            <p className="deadline known">
              Registration closes <b>{formatDate(e.deadline)}</b>
            </p>
          ) : (
            <p className="deadline none">No registration deadline listed</p>
          ))}
        <p className="found">
          Found on{" "}
          {sources.map((s, i) => (
            <span key={s.url}>
              {i > 0 && ", "}
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.domain}
              </a>
            </span>
          ))}
        </p>
      </div>
    </li>
  );
}

const STARTED_BY: Record<string, string> = { cron: "Monday schedule", signup: "sign-up", manual: "Send now button" };

/** The digest as a web page — same content and order as the email. */
export default function DigestView({
  digest,
  showAlert = true,
  publicView = false,
}: {
  digest: Digest;
  showAlert?: boolean;
  publicView?: boolean; // the home page: leave out organisers' email and phone
}) {
  const { events, stats } = digest;
  const flagged = events.filter(isFlagged);
  const emailed = digest.email_status === "sent";

  return (
    <div>
      <ul className="facts">
        <li className="fact">
          Generated <b>{formatDateTimeIST(digest.created_at)}</b>
        </li>
        <li className="fact">
          Covers <b>{formatDate(stats.window.from)}</b> to <b>{formatDate(stats.window.to)}</b>
        </li>
        <li className="fact">
          Started by <b>{STARTED_BY[digest.trigger] ?? digest.trigger}</b>
        </li>
        <li className={emailed ? "fact good" : digest.email_status?.startsWith("failed") ? "fact bad" : "fact"}>
          {emailed ? "Emailed to subscriber" : `Email ${digest.email_status ?? "pending"}`.slice(0, 60)}
        </li>
      </ul>

      {digest.status === "failed" && <p className="msg error">This run could not finish: {stats.error}</p>}
      {digest.status === "empty" && (
        <p className="msg">The sources were checked but no event matched. Add more cities or focus areas and run again.</p>
      )}

      {showAlert && flagged.length > 0 && (
        <div className="act">
          <h3>
            <span className="count">{flagged.length}</span> Act this week
          </h3>
          <ul>
            {flagged.map((e) => (
              <li key={e.url + e.title}>
                <b>{e.title}</b> <span>{deadlineLabel(e).text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="tickets">
        {events.map((e, i) => (
          <Ticket key={e.url + e.title} event={e} rank={i + 1} direct={!publicView} />
        ))}
      </ol>

      <details className="run-details">
        <summary>How this digest was built</summary>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><td>AI model</td><td>{stats.model}</td></tr>
              <tr><td>Live sources fetched</td><td>{(stats.sources ?? []).map((r) => `${r.source} / ${r.city}: ${r.ok ? r.found : `failed (${r.error})`}`).join(", ") || "none"}</td></tr>
              <tr><td>Items collected from all sources</td><td>{stats.candidates_fetched ?? 0}</td></tr>
              <tr><td>Listed events inside the 30-day window</td><td>{stats.listed_in_window ?? 0}</td></tr>
              <tr><td>Web-search results collected</td><td>{stats.search_results ?? 0}</td></tr>
              <tr><td>Sent to Gemini for scoring</td><td>{stats.sent_to_ai ?? 0}</td></tr>
              <tr><td>Dropped: outside 30-day window</td><td>{stats.dropped_out_of_window}</td></tr>
              <tr><td>Dropped: malformed AI record</td><td>{stats.dropped_invalid}</td></tr>
              <tr><td>Dropped: not tied to a fetched page</td><td>{stats.dropped_no_source}</td></tr>
              <tr><td>Dropped: not in chosen cities</td><td>{stats.dropped_wrong_city}</td></tr>
              <tr><td>Dropped: online only</td><td>{stats.dropped_online}</td></tr>
              <tr><td>Dropped: registration already closed</td><td>{stats.dropped_closed}</td></tr>
              <tr><td>Dropped: not relevant enough (score under 40)</td><td>{stats.dropped_low_relevance ?? 0}</td></tr>
              <tr><td>Duplicates merged</td><td>{stats.duplicates_merged}</td></tr>
              <tr><td>Events in digest</td><td>{stats.final} ({stats.flagged} flagged)</td></tr>
              <tr><td>Events per source site</td><td>{Object.entries(stats.by_domain ?? {}).map(([d, n]) => `${d} (${n})`).join(", ") || "none"}</td></tr>
              <tr><td>Organiser contact found on event pages</td><td>{stats.contacts ? `${stats.contacts.with_contact} of ${stats.contacts.checked} events` : "not run"}</td></tr>
              <tr><td>Organiser LinkedIn pages (Lusha free credits)</td><td>{stats.organizers ? `${stats.organizers.from_cache} from cache, ${stats.organizers.looked_up} new lookups${stats.organizers.error ? ` (${stats.organizers.error})` : ""}` : "not run"}</td></tr>
              <tr><td>Run time</td><td>{((stats.duration_ms ?? 0) / 1000).toFixed(1)}s</td></tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
