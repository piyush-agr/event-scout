import Link from "next/link";
import DigestView from "@/components/DigestView";
import PrefsForm from "@/components/PrefsForm";
import { CATEGORY_OPTIONS, CITY_OPTIONS } from "@/lib/config";
import { formatDateTimeIST } from "@/lib/dates";
import { maskEmail, recentDigests, type DigestRow } from "@/lib/db";

export const dynamic = "force-dynamic";

const TRIGGER_LABEL: Record<string, string> = { cron: "Monday schedule", manual: "Send now button", signup: "Sign-up" };
const SOURCES = ["Eventbrite", "AllEvents", "Meetup", "Luma", "Conference sites", "Industry bodies", "LinkedIn posts"];

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
        <div className="wrap hero-grid">
          <div>
            <h1>
              Never miss the <span>right room</span>
            </h1>
            <p className="hero-copy">
              One email every Monday at 7 AM with the conferences, CXO summits and roundtables worth your time in the
              next 30 days. Ranked for your focus areas, in your cities.
            </p>
            <div className="hero-actions">
              <a className="button lime" href="#signup">
                Get my digest
              </a>
              <a className="button outline" href="#latest">
                See the latest digest
              </a>
            </div>
          </div>

          <div className="this-week">
            <h2>
              <span className="count">{String(flagged.length).padStart(2, "0")}</span> to act on this week
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
                {flagged.length > 4 && <p className="more">and {flagged.length - 4} more in the digest below</p>}
              </>
            ) : (
              <p className="calm">{latest ? "Nothing closes in the next 7 days." : "Sign up to generate the first digest."}</p>
            )}
          </div>
        </div>

        <div className="ticker" aria-label={`Sources checked: ${SOURCES.join(", ")}`}>
          <div className="ticker-track" aria-hidden="true">
            {[...SOURCES, ...SOURCES, ...SOURCES, ...SOURCES].map((s, i) => (
              <span key={i}>{s}</span>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap">
        <section className="section" id="signup">
          <div className="signup-grid">
            <div>
              <h2>Get the digest</h2>
              <p>Pick what you advise on and where you travel. Change both whenever your focus shifts.</p>
            </div>
            <div>
              <PrefsForm mode="signup" categoryOptions={CATEGORY_OPTIONS} cityOptions={CITY_OPTIONS} />
              <p className="after-form">
                Your first digest arrives in about two minutes. Every email carries a private link to change your
                cities and focus areas, with no password and no code.
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="latest">
          <div className="section-head">
            <h2>Latest digest</h2>
            {latest && (
              <p>
                Live data from the most recent run, for{" "}
                {latest.subscribers ? maskEmail(latest.subscribers.email) : "a subscriber"}.{" "}
                <Link href={`/digest/${latest.id}`}>Open on its own page</Link>
              </p>
            )}
          </div>
          {latest ? (
            <DigestView digest={latest} showAlert={false} publicView />
          ) : (
            <p className="msg">No digest yet. Sign up above and the first one appears here.</p>
          )}
        </section>

        <section className="section" id="history">
          <div className="section-head">
            <h2>Run history</h2>
            <p>Every run is recorded, including the ones that failed.</p>
          </div>
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
                  const tone = d.status === "ok" && sent ? "good" : d.status === "empty" ? "" : "bad";
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
      </div>

      <section className="dark-band">
        <div className="wrap">
          <div className="section-head">
            <h2>How it works</h2>
            <p>Six steps, one of them AI. The lime step is where Gemini Flash does the judging.</p>
          </div>
          <ol className="bento">
            <li>
              <b>A run starts</b>
              <span>Every Monday at 7:00 AM IST, or when you press “Send my digest now”.</span>
            </li>
            <li>
              <b>Live sources are fetched</b>
              <span>Eventbrite, AllEvents, Meetup and Luma for each city, plus web search for conference sites and LinkedIn posts.</span>
            </li>
            <li>
              <b>The list is cleaned</b>
              <span>Only the next 30 days are kept. The same event found on several sites is merged.</span>
            </li>
            <li className="ai">
              <b>Gemini reads every event</b>
              <span>It scores each one from 0 to 100 against your focus areas, says why, and writes the summary.</span>
            </li>
            <li>
              <b>Checks, flags, contacts</b>
              <span>Anything not tied to a real page is dropped. Deadlines under 7 days are flagged. Organiser contacts are pulled from the event page.</span>
            </li>
            <li>
              <b>You get the email</b>
              <span>The same digest is saved and shown on this page.</span>
            </li>
          </ol>
        </div>
      </section>
    </>
  );
}
