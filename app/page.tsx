import Link from "next/link";
import DigestView from "@/components/DigestView";
import PrefsForm from "@/components/PrefsForm";
import { CATEGORY_OPTIONS, CITY_OPTIONS } from "@/lib/config";
import { formatDateTimeIST } from "@/lib/dates";
import { maskEmail, recentDigests, type DigestRow } from "@/lib/db";

export const dynamic = "force-dynamic";

const TRIGGER_LABEL: Record<string, string> = { cron: "Monday schedule", manual: "Send now button", signup: "Sign-up" };

function daysChip(days: number | null): string {
  if (days === null) return "Soon";
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
}

export default async function Home() {
  let history: DigestRow[] = [];
  let loadError = "";
  try {
    history = await recentDigests(10);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Run history could not be loaded.";
  }
  const latest = history.find((d) => d.status === "ok");
  const flagged = (latest?.events ?? [])
    .filter((e) => e.deadline_status === "urgent" || e.deadline_status === "event_soon")
    .sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0));

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <h1>Never miss the right room again</h1>
            <p>
              Every Monday at 7 AM, one email with the conferences, CXO summits and roundtables worth your time in the
              next 30 days. Ranked for your focus areas, in your cities.
            </p>
            <div className="hero-actions">
              <a className="button gold" href="#signup">
                Get my digest
              </a>
              <a className="button ghost" href="#latest">
                See the latest digest
              </a>
            </div>
          </div>

          <div className="this-week">
            <h2>
              <span className="count">{flagged.length}</span> to act on this week
            </h2>
            {flagged.length > 0 ? (
              <>
                <ul>
                  {flagged.slice(0, 4).map((e) => (
                    <li key={e.url + e.title}>
                      <span className="days">{daysChip(e.days_left)}</span>
                      <a href={e.url} target="_blank" rel="noopener noreferrer">
                        {e.title}
                      </a>
                    </li>
                  ))}
                </ul>
                {flagged.length > 4 && <p className="more">and {flagged.length - 4} more in the latest digest below</p>}
              </>
            ) : (
              <p className="calm">
                {latest ? "Nothing closes in the next 7 days." : "Sign up to generate the first digest."}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="wrap">
        <div className="signup" id="signup">
          <PrefsForm mode="signup" categoryOptions={CATEGORY_OPTIONS} cityOptions={CITY_OPTIONS} />
          <p className="after-form">
            Your first digest arrives in about two minutes. Every email carries a private link to change your cities
            and focus areas, with no password and no code.
          </p>
        </div>

        <section className="section" id="latest">
          <h2>Latest digest</h2>
          {latest ? (
            <>
              <p className="section-note">
                Live data from the most recent run, for{" "}
                {latest.subscribers ? maskEmail(latest.subscribers.email) : "a subscriber"}. Red tickets need action
                within 7 days. <Link href={`/digest/${latest.id}`}>Open on its own page</Link>
              </p>
              <DigestView digest={latest} showAlert={false} />
            </>
          ) : (
            <p className="msg">No digest yet. Sign up above and the first one appears here.</p>
          )}
        </section>

        <section className="section" id="history">
          <h2>Run history</h2>
          <p className="section-note">Every run is recorded, including the ones that failed.</p>
          {loadError && <p className="msg error">{loadError}</p>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Started by</th>
                  <th>For</th>
                  <th>Events</th>
                  <th>Urgent</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {history.map((d) => {
                  const sent = d.email_status === "sent";
                  const result =
                    d.status === "failed" ? "Run failed" : d.status === "empty" ? "No events" : sent ? "Emailed" : "Email failed";
                  const tone = d.status === "ok" && sent ? "good" : d.status === "empty" ? "warn" : "bad";
                  return (
                    <tr key={d.id}>
                      <td>
                        <Link href={`/digest/${d.id}`}>{formatDateTimeIST(d.created_at)}</Link>
                      </td>
                      <td>{TRIGGER_LABEL[d.trigger] ?? d.trigger}</td>
                      <td>{d.subscribers ? maskEmail(d.subscribers.email) : ""}</td>
                      <td>{d.stats.final}</td>
                      <td className={d.stats.flagged ? "num-flag" : ""}>{d.stats.flagged}</td>
                      <td>
                        <span className={`pill ${tone}`}>{result}</span>
                      </td>
                    </tr>
                  );
                })}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={6}>No runs yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <h2>How it works</h2>
          <p className="section-note">The gold step is the only one that uses AI. Everything else is ordinary code.</p>
          <ol className="steps">
            <li>
              <span>
                <b>A run starts.</b> Automatically every Monday at 7:00 AM IST, or when you press “Send my digest now”.
              </span>
            </li>
            <li>
              <span>
                <b>Live sources are fetched.</b> Eventbrite, AllEvents, Meetup and Luma for each of your cities, plus
                web search for conference sites and public LinkedIn posts.
              </span>
            </li>
            <li>
              <span>
                <b>The list is cleaned.</b> Only the next 30 days are kept, and the same event found on several sites is
                merged.
              </span>
            </li>
            <li className="ai">
              <span>
                <b>Gemini Flash reads every event.</b> It scores each one from 0 to 100 against your focus areas, says
                why, and writes the summary.
              </span>
            </li>
            <li>
              <span>
                <b>Checks and flags.</b> Anything not tied to a real page is dropped. Events are ranked, and deadlines
                under 7 days are flagged in red.
              </span>
            </li>
            <li>
              <span>
                <b>You get the email.</b> The same digest is saved and shown on this page.
              </span>
            </li>
          </ol>
        </section>
      </div>
    </>
  );
}
