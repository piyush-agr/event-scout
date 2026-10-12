import { NextResponse } from "next/server";
import { MANUAL_RUN_COOLDOWN_SECONDS } from "@/lib/config";
import { getSubscriberByToken, latestDigestFor } from "@/lib/db";
import { baseUrlFrom } from "@/lib/http";
import { runDigest } from "@/lib/pipeline";

export const maxDuration = 300;

// "Send my digest now" — the same pipeline the Monday cron runs, for one subscriber.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const sub = typeof body?.token === "string" ? await getSubscriberByToken(body.token) : null;
  if (!sub) return NextResponse.json({ error: "Settings link not recognised." }, { status: 401 });

  const last = await latestDigestFor(sub.id);
  if (last) {
    const elapsed = (Date.now() - Date.parse(last.created_at)) / 1000;
    if (elapsed < MANUAL_RUN_COOLDOWN_SECONDS) {
      const wait = Math.ceil(MANUAL_RUN_COOLDOWN_SECONDS - elapsed);
      return NextResponse.json(
        { error: `A digest was just generated. Please wait ${wait} seconds before running again.` },
        { status: 429 },
      );
    }
  }

  try {
    const digest = await runDigest(sub, body.trigger === "signup" ? "signup" : "manual", baseUrlFrom(req));
    return NextResponse.json({
      id: digest.id,
      status: digest.status,
      events: digest.events.length,
      email_status: digest.email_status,
      error: digest.stats.error,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Run failed" }, { status: 500 });
  }
}
