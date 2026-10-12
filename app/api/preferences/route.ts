import { NextResponse } from "next/server";
import { db, getSubscriberByToken } from "@/lib/db";
import { PreferencesSchema } from "@/lib/http";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const sub = typeof body?.token === "string" ? await getSubscriberByToken(body.token) : null;
  if (!sub) return NextResponse.json({ error: "Settings link not recognised." }, { status: 401 });

  const parsed = PreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick at least one category and one city." }, { status: 400 });
  }

  const { error } = await db()
    .from("subscribers")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", sub.id);
  if (error) return NextResponse.json({ error: "Could not save. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
