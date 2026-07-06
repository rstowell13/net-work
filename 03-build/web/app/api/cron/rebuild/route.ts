/**
 * Nightly Sync & rebuild (Vercel Cron). Authenticated by CRON_SECRET — Vercel
 * sends it as `Authorization: Bearer ${CRON_SECRET}`. Runs as the app owner
 * (APP_OWNER_EMAIL) since there's no session.
 *
 * Does ONE bounded pass per invocation so it can never exceed the 60s function
 * limit. A pass is at most one Gmail sync chunk, one merge batch, or the
 * (fast) finalize. Catch-up across passes happens over successive cron runs;
 * the in-app "Sync & rebuild" button loops the same pipeline for an immediate
 * full catch-up.
 *
 * Requires CRON_SECRET in the Vercel project env. `/api/cron` is in proxy.ts's
 * PUBLIC_PATHS so the session middleware doesn't redirect it.
 */
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getOwnerEmail } from "@/lib/auth";
import { runRebuildPass } from "@/lib/rebuild";

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "iad1"; // co-locate with the us-east-1 database

function isAuthorized(auth: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const authBuf = Buffer.from(auth);
  const expectedBuf = Buffer.from(expected);
  if (authBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(authBuf, expectedBuf);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !isAuthorized(auth, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ownerEmail = await getOwnerEmail();
  const [owner] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, ownerEmail))
    .limit(1);
  if (!owner) {
    return NextResponse.json({ error: "owner not found" }, { status: 404 });
  }

  const last = await runRebuildPass(owner.id);
  return NextResponse.json({ last });
}
