import nodemailer from "nodemailer";
import { DEADLINE_FLAG_DAYS, WINDOW_DAYS } from "./config";
import { formatDate } from "./dates";
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
      return { text: `Event is ${inDays} — no deadline listed, register now`, urgent: true };
    case "ok":
      return { text: `Registration closes ${formatDate(e.deadline!)}`, urgent: false };
    default:
      return { text: "Registration deadline not listed", urgent: false };
  }
}

export function dateRange(e: ScoutEvent): string {
  return e.end_date ? `${formatDate(e.start_date)} – ${formatDate(e.end_date)}` : formatDate(e.start_date);
}

function eventBlock(e: ScoutEvent, rank: number): string {
  const d = deadlineLabel(e);
  const meta = [dateRange(e), [e.venue, e.city].filter(Boolean).join(", "), e.price].filter(Boolean).join(" · ");
  return `
  <tr><td style="padding:16px 0;border-bottom:1px solid #e5e7eb;">
    ${
      d.urgent
        ? `<div style="display:inline-block;background:#b91c1c;color:#ffffff;font-size:12px;font-weight:bold;padding:4px 8px;border-radius:4px;margin-bottom:8px;">&#9888; ${esc(d.text)}</div><br>`
        : ""
    }
    <span style="font-size:12px;color:#6b7280;">#${rank} · Match ${e.score}/100 · ${esc(e.category)}</span><br>
    <a href="${esc(e.url)}" style="font-size:17px;font-weight:bold;color:#1d4ed8;text-decoration:none;">${esc(e.title)}</a>
    <div style="font-size:13px;color:#111827;margin-top:4px;">${esc(meta)}</div>
    <div style="font-size:14px;color:#374151;margin-top:6px;line-height:1.45;">${esc(e.summary)}</div>
    ${e.audience ? `<div style="font-size:13px;color:#374151;margin-top:4px;"><b>Who's there:</b> ${esc(e.audience)}</div>` : ""}
    <div style="font-size:13px;color:#374151;margin-top:4px;"><b>Why it fits:</b> ${esc(e.reason)}</div>
    ${d.urgent ? "" : `<div style="font-size:13px;color:#6b7280;margin-top:4px;">${esc(d.text)}</div>`}
    <div style="font-size:12px;color:#6b7280;margin-top:6px;">Source: <a href="${esc(e.url)}" style="color:#6b7280;">${esc(e.source_domain)}</a>${e.other_sources
      .slice(0, 3)
      .map((s) => `, <a href="${esc(s.url)}" style="color:#6b7280;">${esc(s.domain)}</a>`)
      .join("")}</div>
  </td></tr>`;
}

export function renderDigestEmail(sub: Subscriber, digest: Digest, baseUrl: string): { subject: string; html: string } {
  const events = digest.events;
  const flagged = events.filter((e) => e.deadline_status === "urgent" || e.deadline_status === "event_soon");
  const subject =
    `Event Scout: ${events.length} event${events.length === 1 ? "" : "s"} in the next ${WINDOW_DAYS} days` +
    (flagged.length ? ` — ${flagged.length} closing within ${DEADLINE_FLAG_DAYS} days` : "");

  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:8px;padding:24px;">
  <tr><td>
    <div style="font-size:22px;font-weight:bold;color:#111827;">Your weekly event digest</div>
    <div style="font-size:14px;color:#374151;margin-top:6px;">Hi ${esc(sub.name)}, here are ${events.length} events between ${formatDate(digest.stats.window.from)} and ${formatDate(digest.stats.window.to)}, ranked by how closely they match your focus areas.</div>
    <div style="font-size:12px;color:#6b7280;margin-top:6px;">Cities: ${esc(sub.cities.join(", "))}<br>Focus: ${esc(sub.categories.join(", "))}</div>
  </td></tr>
  ${
    flagged.length
      ? `<tr><td style="padding-top:16px;"><div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;">
      <div style="font-size:14px;font-weight:bold;color:#b91c1c;">&#9888; Act this week (${flagged.length})</div>
      ${flagged.map((e) => `<div style="font-size:13px;color:#7f1d1d;margin-top:4px;">• <a href="${esc(e.url)}" style="color:#7f1d1d;">${esc(e.title)}</a> — ${esc(deadlineLabel(e).text)}</div>`).join("")}
    </div></td></tr>`
      : ""
  }
  ${events.map((e, i) => eventBlock(e, i + 1)).join("")}
  <tr><td style="padding-top:16px;font-size:12px;color:#6b7280;line-height:1.5;">
    Collected today from ${Object.keys(digest.stats.by_domain).length} websites and ranked by Gemini. Every link above is the page the event was found on. Always confirm dates on the event page before you register.<br><br>
    <a href="${baseUrl}/digest/${digest.id}" style="color:#1d4ed8;">View in browser</a> ·
    <a href="${baseUrl}/manage/${sub.token}" style="color:#1d4ed8;">Change your cities and focus areas</a>
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
