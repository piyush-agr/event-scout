import { formatDate, formatDateTimeIST } from "@/lib/dates";
import { dateRange, deadlineLabel, placeLine } from "@/lib/email";
import type { Digest } from "@/lib/types";

/** The digest as a web page — same content and order as the email. */
export default function DigestView({ digest, showRunDetails = true }: { digest: Digest; showRunDetails?: boolean }) {
  const { events, stats } = digest;
  const flagged = events.filter((e) => e.deadline_status === "urgent" || e.deadline_status === "event_soon");

  return (
    <section>
      <p className="hint">
        Generated {formatDateTimeIST(digest.created_at)} · trigger: {digest.trigger} · window{" "}
        {formatDate(stats.window.from)} to {formatDate(stats.window.to)} · email: {digest.email_status ?? "pending"}
      </p>

      {digest.status === "failed" && <p className="msg error">This run failed: {stats.error}</p>}
      {digest.status === "empty" && <p className="msg">The search ran but no event passed the filters.</p>}

      {flagged.length > 0 && (
        <div className="alert">
          <strong>⚠ Act this week ({flagged.length})</strong>
          <ul>
            {flagged.map((e) => (
              <li key={e.url + e.title}>
                {e.title} — {deadlineLabel(e).text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="events">
        {events.map((e, i) => {
          const d = deadlineLabel(e);
          return (
            <li key={e.url + e.title} className={d.urgent ? "event urgent" : "event"}>
              {d.urgent && <div className="flag">⚠ {d.text}</div>}
              <div className="rank">
                #{i + 1} · Match {e.score}/100 · {e.category}
              </div>
              <a className="title" href={e.url} target="_blank" rel="noopener noreferrer">
                {e.title}
              </a>
              <div className="meta">
                {[dateRange(e), placeLine(e), e.price].filter(Boolean).join(" · ")}
              </div>
              <p>{e.summary}</p>
              {e.audience && (
                <p>
                  <b>Who&apos;s there:</b> {e.audience}
                </p>
              )}
              <p>
                <b>Why it fits:</b> {e.reason}
              </p>
              {!d.urgent && <p className="hint">{d.text}</p>}
              <p className="hint">
                Source:{" "}
                {[{ url: e.url, domain: e.source_domain }, ...e.other_sources.slice(0, 3)].map((s, j) => (
                  <span key={s.url}>
                    {j > 0 && ", "}
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.domain}
                    </a>
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ol>

      {showRunDetails && (
        <details className="run-details">
          <summary>How this digest was built (run log)</summary>
          <table>
            <tbody>
              <tr><td>AI model</td><td>{stats.model}</td></tr>
              <tr><td>Live sources fetched</td><td>{(stats.sources ?? []).map((r) => `${r.source} / ${r.city}: ${r.ok ? r.found : `failed (${r.error})`}`).join(" · ") || "—"}</td></tr>
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
              <tr><td>Events per source site</td><td>{Object.entries(stats.by_domain ?? {}).map(([d, n]) => `${d} (${n})`).join(", ") || "—"}</td></tr>
              <tr><td>Run time</td><td>{((stats.duration_ms ?? 0) / 1000).toFixed(1)}s</td></tr>
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
