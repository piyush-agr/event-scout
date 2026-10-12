import nodemailer from "nodemailer";
import { WINDOW_DAYS } from "./config";
import { formatDate } from "./dates";
import { contactLinks, organizerPeopleSearch } from "./links";
import type { Digest, ScoutEvent, Subscriber } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function deadlineLabel(e: ScoutEvent): { text: string; urgent: boolean } {
  const days = e.days_left ?? 0;
  const inDays = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  switch (e.deadline_status) {
    case "urgent":
      return { text: `Registration closes ${inDays} (${formatDate(e.deadline!)})`, urgent: true };
    case "event_soon":
      return { text: `Happens ${inDays}. No deadline listed, so register now`, urgent: true };
    case "ok":
      return { text: `Registration closes ${formatDate(e.deadline!)}`, urgent: false };
    default:
      return { text: "Registration deadline not listed", urgent: false };
  }
}

/** "INR 5900.00" reads better as "₹5,900". Anything else is shown as the site wrote it. */
export function priceLabel(price: string): string {
  const m = price.match(/^INR\s+([\d.]+)$/);
  return m ? `₹${Math.round(Number(m[1])).toLocaleString("en-IN")}` : price;
}

/** "Venue, City" without repeating the city when the venue text already names it. */
export function placeLine(e: ScoutEvent): string {
  if (!e.venue) return e.city;
  const cityWord = e.city.split(" ")[0].toLowerCase();
  return e.venue.toLowerCase().includes(cityWord) ? e.venue : `${e.venue}, ${e.city}`;
}

export function dateRange(e: ScoutEvent): string {
  return e.end_date ? `${formatDate(e.start_date)} – ${formatDate(e.end_date)}` : formatDate(e.start_date);
}

function eventBlock(e: ScoutEvent, rank: number): string {
  const d = deadlineLabel(e);
  const date = new Date(`${e.start_date}T00:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-IN", { ...o, timeZone: "UTC" });
  const stub = d.urgent ? "#e8502a" : "#14140f";
  const scoreBg = e.score >= 80 ? "#c8f031" : "#e9e8e4";
  const until = e.end_date ? `<div style="font-size:11px;margin-top:6px;">to ${esc(formatDate(e.end_date).replace(/^\w+, /, "").replace(/,? \d{4}$/, ""))}</div>` : "";
  return `
  <tr><td style="padding:0 0 14px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:0;overflow:hidden;border:1px solid #bdbcb5;">
      <tr>
        <td width="84" valign="top" align="center" style="background:${stub};color:#ffffff;padding:16px 4px;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:32px;line-height:1;font-weight:bold;">${part({ day: "numeric" })}</div>
          <div style="font-size:15px;font-weight:bold;">${part({ month: "short" })}</div>
          <div style="font-size:12px;">${part({ weekday: "short" })}</div>${until}
        </td>
        <td valign="top" style="padding:14px 18px 16px 18px;font-family:Arial,Helvetica,sans-serif;">
          <div style="font-size:12px;color:#65645d;margin-bottom:6px;">
            <b style="font-size:14px;">#${rank}</b>&nbsp;
            <span style="background:${scoreBg};color:#14140f;border-radius:4px;padding:3px 9px;"><b>${e.score}</b> match</span>&nbsp;
            <span style="background:#e9e8e4;color:#14140f;border-radius:4px;padding:3px 9px;">${esc(e.category)}</span>
          </div>
          <a href="${esc(e.url)}" style="font-size:19px;line-height:1.25;font-weight:bold;color:#14140f;text-decoration:none;">${esc(e.title)}</a>
          <div style="font-size:14px;color:#65645d;margin-top:4px;">${esc(placeLine(e))}${e.price ? ` &nbsp;<span style="background:${e.price === "Free" ? "#ddf5f0" : "#f3f4fa"};color:${e.price === "Free" ? "#075e53" : "#14140f"};border-radius:6px;padding:1px 7px;font-size:13px;">${esc(priceLabel(e.price))}</span>` : ""}</div>
          ${d.urgent ? `<div style="margin-top:10px;"><span style="display:inline-block;background:#e8502a;color:#ffffff;font-size:14px;font-weight:bold;padding:6px 11px;border-radius:4px;">${esc(d.text)}</span></div>` : ""}
          <div style="font-size:15px;color:#14140f;margin-top:10px;line-height:1.5;">${esc(e.summary)}</div>
          <div style="font-size:15px;color:#14140f;margin-top:8px;line-height:1.5;"><b>Why it fits:</b> ${esc(e.reason)}</div>
          ${e.audience ? `<div style="font-size:14px;color:#65645d;margin-top:6px;line-height:1.45;"><b style="color:#14140f;">In the room:</b> ${esc(e.audience)}</div>` : ""}
          <div style="font-size:14px;color:#65645d;margin-top:6px;line-height:1.6;"><b style="color:#14140f;">Contact:</b> ${esc(e.contact?.name ?? e.organizer ?? "organiser not named")}${contactLinks(e).length ? "" : ", details not available on the listing"}${contactLinks(e)
            .map((l) => ` &nbsp;<a href="${esc(l.href)}" style="color:#14140f;white-space:nowrap;">${esc(l.label)}</a>`)
            .join("")} &nbsp;<a href="${esc(organizerPeopleSearch(e))}" style="color:#14140f;white-space:nowrap;">Search LinkedIn for the event team</a></div>
          ${d.urgent ? "" : `<div style="font-size:13px;color:#65645d;margin-top:8px;">${e.deadline ? `Registration closes <b style="color:#14140f;">${esc(formatDate(e.deadline))}</b>` : "No registration deadline listed"}</div>`}
          <div style="font-size:12px;color:#65645d;margin-top:8px;">Found on <a href="${esc(e.url)}" style="color:#65645d;">${esc(e.source_domain)}</a>${e.other_sources
            .slice(0, 2)
            .map((s) => `, <a href="${esc(s.url)}" style="color:#65645d;">${esc(s.domain)}</a>`)
            .join("")}</div>
        </td>
      </tr>
    </table>
  </td></tr>`;
}

export function renderDigestEmail(sub: Subscriber, digest: Digest, baseUrl: string): { subject: string; html: string } {
  const events = digest.events;
  const flagged = events.filter((e) => e.deadline_status === "urgent" || e.deadline_status === "event_soon");
  const subject =
    `Event Scout: ${events.length} event${events.length === 1 ? "" : "s"} in the next ${WINDOW_DAYS} days` +
    (flagged.length ? ` — ${flagged.length} to act on this week` : "");

  const html = `<!doctype html><html><body style="margin:0;background:#e9e8e4;font-family:Arial,Helvetica,sans-serif;color:#14140f;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#e9e8e4;"><tr><td align="center" style="padding:20px 10px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;">
  <tr><td style="background:#0c0c0a;border-radius:0;padding:28px;color:#ffffff;">
    <div style="font-size:14px;font-weight:bold;color:#c8f031;letter-spacing:1px;text-transform:uppercase;">Event Scout</div>
    <div style="font-size:30px;line-height:1.1;font-weight:bold;margin-top:8px;text-transform:uppercase;font-family:'Arial Narrow',Arial,sans-serif;">${events.length} events worth your time</div>
    <div style="font-size:15px;color:#b9b8b0;margin-top:8px;line-height:1.5;">Hi ${esc(sub.name)}. ${formatDate(digest.stats.window.from)} to ${formatDate(digest.stats.window.to)}, ranked by how closely they match your focus areas.</div>
    <div style="font-size:13px;color:#b9b8b0;margin-top:10px;line-height:1.5;"><b style="color:#ffffff;">Cities:</b> ${esc(sub.cities.join(", "))}<br><b style="color:#ffffff;">Focus:</b> ${esc(sub.categories.join(", "))}</div>
  </td></tr>
  <tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>
  ${
    flagged.length
      ? `<tr><td style="background:#ffffff;border:1px solid #bdbcb5;border-left:4px solid #e8502a;border-radius:0;padding:16px 18px;">
      <div style="font-size:16px;font-weight:bold;color:#e8502a;">Act this week (${flagged.length})</div>
      ${flagged.map((e) => `<div style="font-size:14px;color:#14140f;margin-top:6px;line-height:1.4;"><a href="${esc(e.url)}" style="color:#14140f;font-weight:bold;">${esc(e.title)}</a>: ${esc(deadlineLabel(e).text)}</div>`).join("")}
    </td></tr><tr><td style="height:14px;line-height:14px;font-size:0;">&nbsp;</td></tr>`
      : ""
  }
  ${events.map((e, i) => eventBlock(e, i + 1)).join("")}
  <tr><td style="padding:6px 4px 0 4px;font-size:12px;color:#65645d;line-height:1.6;">
    Collected today from ${Object.keys(digest.stats.by_domain).length} websites and ranked by Gemini. Every link is the page the event was found on. Confirm dates on the event page before you register.<br><br>
    <a href="${baseUrl}/digest/${digest.id}" style="color:#14140f;font-weight:bold;">View in browser</a> &nbsp;|&nbsp;
    <a href="${baseUrl}/manage/${sub.token}" style="color:#14140f;font-weight:bold;">Change your cities and focus areas</a>
  </td></tr>
</table></td></tr></table></body></html>`;
  return { subject, html };
}

function transport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Email is not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing)");
  return {
    user,
    mailer: nodemailer.createTransport({ service: "gmail", auth: { user, pass: pass.replace(/\s+/g, "") } }),
  };
}

export async function sendDigestEmail(sub: Subscriber, digest: Digest, baseUrl: string): Promise<void> {
  const { user, mailer } = transport();
  const { subject, html } = renderDigestEmail(sub, digest, baseUrl);
  await mailer.sendMail({ from: `"Event Scout" <${user}>`, to: sub.email, subject, html });
}

export async function sendManageLinkEmail(sub: Subscriber, baseUrl: string): Promise<void> {
  const { user, mailer } = transport();
  const link = `${baseUrl}/manage/${sub.token}`;
  await mailer.sendMail({
    from: `"Event Scout" <${user}>`,
    to: sub.email,
    subject: "Your Event Scout settings link",
    html: `<p>Hi ${esc(sub.name)},</p><p>Use this private link to change your cities and focus areas, or to send yourself a fresh digest:</p><p><a href="${link}">${link}</a></p>`,
  });
}
