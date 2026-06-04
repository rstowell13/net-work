/**
 * Nightly Sync & rebuild (Vercel Cron). Authenticated by CRON_SECRET — Vercel
 * sends it as `Authorization: Bearer ${CRON_SECRET}`. Runs as the app owner
 * (APP_OWNER_EMAIL) since there's no session. Loops bounded passes within the
 * 60s budget so the incremental sync + rebuild completes in one invocation.
 *
 * Requires CRON_SECRET in the Vercel project env. `/api/cron` is in proxy.ts's
 * PUBLIC_PATHS so the session middleware doesn't redirect it.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getOwnerEmail } from "@/lib/auth";
import { runRebuildPass } from "@/lib/rebuild";

export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "iad1"; // co-locate with the us-east-1 database

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
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

  const deadline = Date.now() + 50_000;
  let passes = 0;
  let last: Awaited<ReturnType<typeof runRebuildPass>> | undefined;
  for (let i = 0; i < 20 && Date.now() < deadline; i++) {
    last = await runRebuildPass(owner.id);
    passes++;
    if (last.done) break;
  }

  return NextResponse.json({ ranPasses: passes, last });
}
