import Link from "next/link";
import DigestView from "@/components/DigestView";
import PrefsForm from "@/components/PrefsForm";
import { CATEGORY_OPTIONS, CITY_OPTIONS } from "@/lib/config";
import { formatDateTimeIST } from "@/lib/dates";
import { maskEmail, recentDigests, type DigestRow } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  let history: DigestRow[] = [];
  let loadError = "";
  try {
    history = await recentDigests(12);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load run history.";
  }
  const latest = history.find((d) => d.status === "ok");

  return (
    <>
      <h1>Never miss the right room again</h1>
      <p className="lede">
        Every Monday at 7:00 AM IST, Event Scout collects conferences, CXO summits, roundtables and
        startup meetups in the next 30 days from many live sources, keeps the ones in your cities, ranks them by how well they match your focus
        areas, and emails you a five-minute digest. Events whose registration closes within 7 days are flagged in red.
      </p>

      <PrefsForm mode="signup" categoryOptions={CATEGORY_OPTIONS} cityOptions={CITY_OPTIONS} />
      <p className="hint">
        After signing up you get a private settings link (also in every email) to change cities and focus areas at any
        time, with no code and no password.
      </p>

      <h2 id="latest">Latest digest (live data)</h2>
      {latest ? (
        <>
          <p className="hint">
            Most recent successful run, for {latest.subscribers ? maskEmail(latest.subscribers.email) : "a subscriber"}.{" "}
            <Link href={`/digest/${latest.id}`}>Open as its own page</Link>
          </p>
          <DigestView digest={latest} />
        </>
      ) : (
        <p className="msg">No digest has been generated yet. Sign up above to create the first one.</p>
      )}

      <h2 id="history">Run history</h2>
      {loadError && <p className="msg error">{loadError}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Trigger</th>
              <th>For</th>
              <th>Result</th>
              <th>Events</th>
              <th>Flagged</th>
              <th>Sites</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {history.map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/digest/${d.id}`}>{formatDateTimeIST(d.created_at)}</Link>
                </td>
                <td>{d.trigger}</td>
                <td>{d.subscribers ? maskEmail(d.subscribers.email) : "—"}</td>
                <td>
                  <span className={`pill ${d.status}`}>{d.status}</span>
                </td>
                <td>{d.stats.final}</td>
                <td>{d.stats.flagged}</td>
                <td>{Object.keys(d.stats.by_domain ?? {}).length}</td>
                <td>{d.email_status ?? "—"}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={8}>No runs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>How it works</h2>
      <ol className="steps">
        <li>Vercel Cron (Mondays 01:30 UTC = 7:00 AM IST) or the “Send my digest now” button starts a run.</li>
        <li>The app fetches live event listings for each chosen city from Eventbrite, AllEvents, Meetup and Luma, plus web search results that cover conference sites, industry bodies and public LinkedIn posts.</li>
        <li>Code keeps events inside the next 30 days and merges the same event found on several sites.</li>
        <li>Gemini Flash judges each event, scores it 0–100 against your focus areas with a reason, writes the summary, and pulls dated events out of search snippets.</li>
        <li>Code validates every AI record, drops anything not tied to a fetched page, removes online-only and low-relevance events, ranks, and flags deadlines under 7 days.</li>
        <li>The digest is stored, emailed, and shown on this page.</li>
      </ol>
    </>
  );
}
