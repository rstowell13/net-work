/**
 * Auth helpers + single-user enforcement.
 *
 * Only APP_OWNER_EMAIL can sign in. Any other email signing in via the magic
 * link flow is rejected here at request time, even if Supabase issued them a
 * session.
 */
import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function getOwnerEmail(): Promise<string> {
  const email = process.env.APP_OWNER_EMAIL;
  if (!email) throw new Error("APP_OWNER_EMAIL is not set");
  return email.toLowerCase();
}

/**
 * Returns the authed user row (from our `users` table), or null.
 * Side effect: on first sign-in for the owner, lazily creates the row.
 */
export async function getCurrentUser() {
  const supabase = await getSupabaseServer();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser?.email) return null;

  const ownerEmail = await getOwnerEmail();
  if (authUser.email.toLowerCase() !== ownerEmail) {
    // Wrong account — drop the session and reject.
    await supabase.auth.signOut();
    return null;
  }

  // Find or lazily create the User row in our domain table.
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, authUser.email.toLowerCase()))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(schema.users)
    .values({
      email: authUser.email.toLowerCase(),
      name: authUser.user_metadata?.name ?? null,
      timezone: "America/Los_Angeles",
    })
    .returning();
  return created;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
