/**
 * Shared helpers for one-off operational scripts (not part of the app
 * bundle). Resolves the single app owner from APP_OWNER_EMAIL and gives a
 * timestamped console logger.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export function log(...a: unknown[]) {
  console.log(new Date().toISOString(), ...a);
}

export async function getOwner() {
  const email = process.env.APP_OWNER_EMAIL;
  if (!email) throw new Error("APP_OWNER_EMAIL not set");
  const [u] = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (!u) throw new Error(`owner ${email} not found`);
  return u;
}
