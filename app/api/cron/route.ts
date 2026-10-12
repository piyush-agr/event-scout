import { NextResponse } from "next/server";
import { listSubscribers } from "@/lib/db";
import { baseUrlFrom } from "@/lib/http";
import { runDigest } from "@/lib/pipeline";

export const maxDuration = 300;

// Called by Vercel Cron every Monday 01:30 UTC = 07:00 IST (see vercel.json).
// Vercel sends CRON_SECRET as a Bearer token; anything else is rejected.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const subscribers = await listSubscribers();
  const results: { email: string; status: string; events: number; email_status: string | null }[] = [];

  // One subscriber at a time keeps us under Gemini's per-minute limit.
  for (const sub of subscribers) {
    if (Date.now() - started > 230_000) {
      results.push({ email: sub.email, status: "skipped: time budget reached", events: 0, email_status: null });
      continue;
    }
    try {
      const d = await runDigest(sub, "cron", baseUrlFrom(req));
      results.push({ email: sub.email, status: d.status, events: d.events.length, email_status: d.email_status });
    } catch (err) {
      results.push({
        email: sub.email,
        status: "failed: " + (err instanceof Error ? err.message : String(err)),
        events: 0,
        email_status: null,
      });
    }
  }
  return NextResponse.json({ ran: results.length, results });
}
