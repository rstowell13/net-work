/**
 * One-time Phase-1 backfill (operational, not part of the app bundle).
 *
 * Run with:
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/backfill.ts
 *
 * Phases (all idempotent / resumable):
 *   1. names   — re-fetch Gmail headers to populate raw_contacts.name (the
 *                original sync discarded display names). Resumable via the
 *                gmail source watermark.
 *   2. relink  — clear email/email_thread contact_id, enrich+promote, then
 *                relink everything with the self-exclusion fix.
 */
import { eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { syncGmail, getGmailSourceForUser } from "@/lib/sync/gmail";
import { enrichAndPromote } from "@/lib/merge/promote";
import { relinkAfterMerge } from "@/lib/relink";

function log(...a: unknown[]) {
  console.log(new Date().toISOString(), ...a);
}

async function getOwner() {
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

async function snapshot(label: string) {
  const [r] = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM contacts WHERE deleted_at IS NULL) AS contacts,
      (SELECT count(*) FROM contacts WHERE deleted_at IS NULL AND primary_email IS NOT NULL) AS contacts_with_email,
      (SELECT count(DISTINCT contact_id) FROM email_threads WHERE contact_id IS NOT NULL) AS contacts_with_email_threads,
      (SELECT count(*) FROM email_threads WHERE contact_id IS NOT NULL) AS email_threads_linked,
      (SELECT count(*) FROM raw_contacts rc JOIN sources s ON s.id=rc.source_id WHERE s.kind='gmail' AND rc.name IS NOT NULL) AS gmail_named
  `);
  log(`SNAPSHOT[${label}]`, r);
}

async function backfillNames(sourceId: string) {
  // Reset the watermark so the next runs re-fetch every thread (now capturing
  // display names). Preserve google_email.
  const [src] = await db
    .select({ config: schema.sources.config })
    .from(schema.sources)
    .where(eq(schema.sources.id, sourceId))
    .limit(1);
  const googleEmail = (src?.config as { google_email?: string } | null)?.google_email;
  await db
    .update(schema.sources)
    .set({
      config: googleEmail ? { google_email: googleEmail } : {},
      updatedAt: new Date(),
    })
    .where(eq(schema.sources.id, sourceId));

  for (let pass = 1; pass <= 120; pass++) {
    const r = await syncGmail(sourceId);
    log(`names pass ${pass}: status=${r.status} seen=${r.recordsSeen} new=${r.recordsNew} upd=${r.recordsUpdated}`);
    const [s] = await db
      .select({ config: schema.sources.config })
      .from(schema.sources)
      .where(eq(schema.sources.id, sourceId))
      .limit(1);
    const w = (s?.config ?? {}) as { backfill_complete?: boolean };
    if (w.backfill_complete) {
      log("names backfill complete");
      break;
    }
    if (r.status !== "success" || r.recordsSeen === 0) {
      log("names: stopping (no progress / error)");
      break;
    }
  }
}

async function main() {
  const mode = process.argv[2] ?? "all"; // names | relink | all
  const u = await getOwner();
  log("owner", u.email, u.id, "mode", mode);
  await snapshot("before");

  if (mode === "names" || mode === "all") {
    const src = await getGmailSourceForUser(u.id);
    if (!src) throw new Error("no gmail source connected");
    await backfillNames(src.id);
    await snapshot("after-names");
  }

  if (mode === "relink" || mode === "all") {
    log("clearing email/email_thread contact links…");
    await db
      .update(schema.emails)
      .set({ contactId: null })
      .where(isNotNull(schema.emails.contactId));
    await db
      .update(schema.emailThreads)
      .set({ contactId: null })
      .where(isNotNull(schema.emailThreads.contactId));

    log("enrich + promote…");
    const promo = await enrichAndPromote(u.id);
    log("promote stats", promo);

    log("global relink…");
    const relink = await relinkAfterMerge(u.id);
    log("relink stats", relink);
    await snapshot("after-relink");
  }

  log("DONE");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
