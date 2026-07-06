/**
 * Run dedup over a user's raw contacts and persist MergeCandidate rows. This is
 * the DB wrapper around the pure grouping core in grouping.ts.
 *
 * Includes records already attached to a saved contact (saved contacts used to
 * be invisible to dedup), so two people saved separately can be detected as
 * duplicates. Groups spanning saved contacts are merged into a survivor at apply
 * time (see apply.ts). Idempotent.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSelfEmails } from "@/lib/relink";
import { groupDuplicates, suppressionPairs } from "./grouping";

export interface DedupeStats {
  candidatesCreated: number;
  exact: number;
  high: number;
  ambiguous: number;
  rawConsidered: number;
}

export async function runDedupe(userId: string): Promise<DedupeStats> {
  // Pull ALL of this user's raw contacts — loose and already-saved alike.
  const raws = await db
    .select({
      id: schema.rawContacts.id,
      sourceId: schema.rawContacts.sourceId,
      contactId: schema.rawContacts.contactId,
      name: schema.rawContacts.name,
      emails: schema.rawContacts.emails,
      phones: schema.rawContacts.phones,
      linkedinUrl: schema.rawContacts.linkedinUrl,
    })
    .from(schema.rawContacts)
    .innerJoin(
      schema.sources,
      eq(schema.sources.id, schema.rawContacts.sourceId),
    )
    .where(eq(schema.sources.userId, userId));

  // Clear stale PENDING suggestions so each scan reflects the current matching
  // logic (a re-scan refreshes the queue). Resolved candidates are preserved:
  //  - approved → the merge already happened; the "one contact's own records"
  //    guardrail in groupDuplicates keeps it from being re-suggested. Their raws
  //    are deliberately NOT locked out of scanning — a merged contact must stay
  //    comparable to OTHER contacts, which is how cross-contact nickname dupes
  //    (Bob ↔ Robert Duncan) and absorbing new records into a saved contact work.
  //  - split / skipped → the user said "not the same"; we never re-create that
  //    exact group.
  await db
    .delete(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.userId, userId),
        eq(schema.mergeCandidates.status, "pending"),
      ),
    );

  const reviewed = await db
    .select({ rawContactIds: schema.mergeCandidates.rawContactIds })
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.userId, userId),
        inArray(schema.mergeCandidates.status, ["split", "skipped"]),
      ),
    );
  // Pair-level suppression: a rejected group blocks its member PAIRS, not just
  // the exact id-set — so the group can't resurface when a new record joins the
  // cluster (the pre-2026-07 set-key behavior let exactly that happen).
  const suppressedPairs = suppressionPairs(
    reviewed.map((c) => c.rawContactIds),
  );

  // The user's own addresses must never be a match key — the user's email is in
  // the From/To of nearly every message, so indexing it would glue the user's
  // own saved contact onto huge swaths of the address book.
  const selfEmails = await getSelfEmails(userId);

  const groups = groupDuplicates(raws, selfEmails, suppressedPairs);

  const stats: DedupeStats = {
    candidatesCreated: groups.length,
    exact: 0,
    high: 0,
    ambiguous: 0,
    rawConsidered: raws.length,
  };
  for (const g of groups) stats[g.confidence]++;

  const inserts: (typeof schema.mergeCandidates.$inferInsert)[] = groups.map(
    (g) => ({
      userId,
      rawContactIds: g.rawContactIds,
      confidence: g.confidence,
      signals: g.signals as unknown as Record<string, unknown>,
      status: "pending",
    }),
  );

  if (inserts.length > 0) {
    // Insert in chunks to avoid huge single statements.
    const CHUNK = 200;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      await db.insert(schema.mergeCandidates).values(inserts.slice(i, i + CHUNK));
    }
  }

  return stats;
}
