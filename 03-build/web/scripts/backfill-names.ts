/**
 * Lean Gmail name backfill (operational, not in the app bundle).
 *
 *   node --env-file=.env.local --conditions=react-server --import tsx scripts/backfill-names.ts
 *
 * Re-fetches Gmail thread headers (From/To/Cc) only to harvest display names,
 * then batch-updates raw_contacts.name for gmail-derived rows whose name is
 * still null. Unlike the full syncGmail re-run, it does NOT re-write emails /
 * threads, and it batches DB writes — so it isn't bottlenecked by the single
 * pooled DB connection. Idempotent and resumable (only fills null names).
 */
import { eq, sql } from "drizzle-orm";
import { google } from "googleapis";
import { db, schema } from "@/lib/db";
import { getGmailSourceForUser } from "@/lib/sync/gmail";
import { clientFromTokens } from "@/lib/google";
import { getSelfEmails } from "@/lib/relink";
import { parseAddressEntries } from "@/lib/sync/parse-addresses";
import { getOwner, log } from "./_shared";

const CONCURRENCY = 25;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const u = await getOwner();

  const src = await getGmailSourceForUser(u.id);
  if (!src) throw new Error("no gmail source");
  const [tok] = await db
    .select()
    .from(schema.oauthTokens)
    .where(eq(schema.oauthTokens.sourceId, src.id))
    .limit(1);
  if (!tok) throw new Error("no gmail token");

  const auth = clientFromTokens({
    accessToken: tok.accessToken,
    refreshToken: tok.refreshToken,
    expiresAt: tok.expiresAt,
    scopes: tok.scopes,
  });
  const gmail = google.gmail({ version: "v1", auth });
  const self = await getSelfEmails(u.id);

  const rows = await db
    .select({ tid: schema.emailThreads.externalThreadId })
    .from(schema.emailThreads);
  const threadIds = rows.map((r) => r.tid).filter((t): t is string => !!t);
  log(`threads to scan: ${threadIds.length}`);

  const addrName = new Map<string, string>();
  let done = 0;
  let errors = 0;

  async function fetchOne(tid: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const r = await gmail.users.threads.get({
          userId: "me",
          id: tid,
          format: "metadata",
          metadataHeaders: ["From", "To", "Cc"],
        });
        for (const m of r.data.messages ?? []) {
          for (const h of m.payload?.headers ?? []) {
            for (const e of parseAddressEntries(h.value ?? "")) {
              if (e.name && !self.has(e.email) && !addrName.has(e.email)) {
                addrName.set(e.email, e.name);
              }
            }
          }
        }
        return;
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (/quota|rate|429|500|503|backendError|ECONNRESET|ETIMEDOUT/i.test(msg)) {
          await sleep(400 * (attempt + 1) * (attempt + 1));
          continue;
        }
        errors++;
        return;
      }
    }
    errors++;
  }

  const t0 = Date.now();
  for (let i = 0; i < threadIds.length; i += CONCURRENCY) {
    await Promise.all(threadIds.slice(i, i + CONCURRENCY).map(fetchOne));
    done = Math.min(i + CONCURRENCY, threadIds.length);
    if (done % 1000 < CONCURRENCY) {
      const rate = done / ((Date.now() - t0) / 1000);
      log(
        `fetched ${done}/${threadIds.length} · names=${addrName.size} · errors=${errors} · ${rate.toFixed(1)}/s`,
      );
    }
  }
  log(`harvest done: ${addrName.size} distinct named addresses, ${errors} errors`);

  // Batch-update gmail-derived raw_contacts whose name is still null.
  let updated = 0;
  const entries = [...addrName.entries()];
  const CH = 200;
  for (let i = 0; i < entries.length; i += CH) {
    const chunk = entries.slice(i, i + CH);
    const values = sql.join(
      chunk.map(([e, n]) => sql`(${e}::text, ${n}::text)`),
      sql`, `,
    );
    const res = await db.execute(sql`
      UPDATE raw_contacts AS rc
      SET name = v.name, updated_at = now()
      FROM (VALUES ${values}) AS v(email, name)
      WHERE rc.source_id = ${src.id}
        AND rc.external_id = v.email
        AND rc.name IS NULL
      RETURNING rc.id
    `);
    updated += (res as unknown as unknown[]).length;
  }
  log(`raw_contacts named: ${updated}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
