import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { db, getSubscriberByEmail } from "@/lib/db";
import { sendManageLinkEmail } from "@/lib/email";
import { baseUrlFrom, SubscribeSchema } from "@/lib/http";
import type { Subscriber } from "@/lib/types";

export async function POST(req: Request) {
  const parsed = SubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please enter your name, a valid email, and pick at least one category and one city." },
      { status: 400 },
    );
  }
  const { name, email, categories, cities } = parsed.data;

  // An existing subscriber's private link is only ever sent to their inbox,
  // so knowing someone's email is not enough to change their settings.
  const existing = await getSubscriberByEmail(email);
  if (existing) {
    try {
      await sendManageLinkEmail(existing, baseUrlFrom(req));
      return NextResponse.json({
        existing: true,
        message: "This email is already signed up. We've emailed you your private settings link.",
      });
    } catch {
      return NextResponse.json(
        { error: "This email is already signed up, but we could not email the settings link right now." },
        { status: 409 },
      );
    }
  }

  const token = randomBytes(18).toString("base64url");
  const { data, error } = await db()
    .from("subscribers")
    .insert({ token, name, email, categories, cities })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "Could not save your details. Please try again." }, { status: 500 });

  return NextResponse.json({ token: (data as Subscriber).token });
}
