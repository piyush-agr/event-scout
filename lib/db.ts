import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Digest, Subscriber } from "./types";

let client: SupabaseClient | null = null;

// Server-side only: this module is never imported from a client component.
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_KEY are not set");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export async function getSubscriberByToken(token: string): Promise<Subscriber | null> {
  const { data } = await db().from("subscribers").select("*").eq("token", token).maybeSingle();
  return (data as Subscriber) ?? null;
}

export async function getSubscriberByEmail(email: string): Promise<Subscriber | null> {
  const { data } = await db().from("subscribers").select("*").eq("email", email).maybeSingle();
  return (data as Subscriber) ?? null;
}

export async function listSubscribers(): Promise<Subscriber[]> {
  const { data, error } = await db().from("subscribers").select("*").order("created_at");
  if (error) throw new Error(error.message);
  return (data as Subscriber[]) ?? [];
}

export async function getDigest(id: string): Promise<Digest | null> {
  const { data } = await db().from("digests").select("*").eq("id", id).maybeSingle();
  return (data as Digest) ?? null;
}

export async function latestDigestFor(subscriberId: string): Promise<Digest | null> {
  const { data } = await db()
    .from("digests")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Digest) ?? null;
}

/** Latest digest that actually contains events — used so a failed run never blanks the page. */
export async function latestGoodDigestFor(subscriberId: string): Promise<Digest | null> {
  const { data } = await db()
    .from("digests")
    .select("*")
    .eq("subscriber_id", subscriberId)
    .eq("status", "ok")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Digest) ?? null;
}

export type DigestRow = Digest & { subscribers: { email: string } | null };

export async function recentDigests(limit = 10): Promise<DigestRow[]> {
  const { data } = await db()
    .from("digests")
    .select("*, subscribers(email)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as DigestRow[]) ?? [];
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}
