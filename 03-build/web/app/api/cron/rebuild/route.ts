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
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getOwnerEmail } from "@/lib/auth";
import { runRebuildPass } from "@/lib/rebuild";
import { runDedupe } from "@/lib/merge/dedupe";
import { enrichAndPromote } from "@/lib/merge/promote";
import { relinkAfterMerge } from "@/lib/relink";

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

  // --- temporary per-step timing diagnostic ---
  const step = new URL(req.url).searchParams.get("step");
  if (step) {
    const t = Date.now();
    let info: unknown = null;
    try {
      if (step === "dedupe") info = await runDedupe(owner.id);
      else if (step === "enrich") info = await enrichAndPromote(owner.id, { relink: false });
      else if (step === "relink") info = await relinkAfterMerge(owner.id);
      else if (step === "count") {
        const [r] = await db.execute(sql`SELECT
          (SELECT count(*) FROM emails) AS total_emails,
          (SELECT count(*) FROM emails WHERE contact_id IS NULL) AS unlinked,
          (SELECT count(*) FROM message_threads WHERE contact_id IS NULL) AS dangling_msg_threads`);
        info = r;
      }
      return NextResponse.json({ step, ms: Date.now() - t, info });
    } catch (e) {
      return NextResponse.json({ step, ms: Date.now() - t, error: (e as Error).message }, { status: 500 });
    }
  }

  const deadline = Date.now() + 30_000; // only start a pass with headroom for a full ~25s pass under 60s
  let passes = 0;
  let last: Awaited<ReturnType<typeof runRebuildPass>> | undefined;
  for (let i = 0; i < 20 && Date.now() < deadline; i++) {
    last = await runRebuildPass(owner.id);
    passes++;
    if (last.done) break;
  }

  return NextResponse.json({ ranPasses: passes, last });
}
