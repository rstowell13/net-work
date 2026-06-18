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
import { groupDuplicates } from "./grouping";

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

  // Skip raws already locked into a pending or approved candidate.
  const existingPending = await db
    .select({
      id: schema.mergeCandidates.id,
      rawContactIds: schema.mergeCandidates.rawContactIds,
      status: schema.mergeCandidates.status,
    })
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.userId, userId),
        inArray(schema.mergeCandidates.status, ["pending", "approved"]),
      ),
    );
  const lockedRawIds = new Set<string>();
  for (const c of existingPending) {
    for (const rid of c.rawContactIds) lockedRawIds.add(rid);
  }

  const candidates = raws.filter((r) => !lockedRawIds.has(r.id));

  // The user's own addresses must never be a match key — the user's email is in
  // the From/To of nearly every message, so indexing it would glue the user's
  // own (now-included) saved contact onto huge swaths of the address book.
  const selfEmails = await getSelfEmails(userId);

  const groups = groupDuplicates(candidates, selfEmails);

  const stats: DedupeStats = {
    candidatesCreated: groups.length,
    exact: 0,
    high: 0,
    ambiguous: 0,
    rawConsidered: candidates.length,
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
