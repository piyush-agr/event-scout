import { z } from "zod";

/** Public address of this deployment, used for links inside emails. */
export function baseUrlFrom(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(req.url).origin;
}

const list = z
  .array(z.string().trim().min(2).max(60))
  .min(1)
  .max(12)
  .transform((items) => [...new Set(items)]);

export const PreferencesSchema = z.object({
  categories: list,
  cities: list,
});

export const SubscribeSchema = PreferencesSchema.extend({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
});
