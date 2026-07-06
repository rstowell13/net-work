/**
 * Apply a MergeCandidate. Two cases, decided by whether the member records
 * already belong to saved contacts:
 *
 *  - None belong to a saved contact → create a NEW contact (original behavior).
 *  - One or more belong to saved contacts → merge them into a single SURVIVOR
 *    contact, moving every related record (tags, notes, follow-ups, diary,
 *    scores, plan items) onto the survivor and soft-deleting the losers.
 */
import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { normalizeRaw } from "./normalize";
import { classify } from "./confidence";
import { pickSurvivor } from "./survivor";
import { moveCuratedContent } from "./move-content";
import {
  validatePartition,
  pluralityBucketIndex,
  type PartitionBucket,
} from "./partition-plan";
import { relinkContact } from "@/lib/relink";

// Higher = preferred for canonical fields.
const SOURCE_PRIORITY: Record<string, number> = {
  apple_contacts: 100,
  google_contacts: 90,
  linkedin_csv: 80,
  mac_agent: 70,
  gmail: 50,
  google_calendar: 40,
};

interface MemberRow {
  id: string;
  sourceId: string;
  kind: string;
  contactId: string | null;
  name: string | null;
  emails: string[] | null;
  phones: string[] | null;
  linkedinUrl: string | null;
  avatarUrl: string | null;
  updatedAt: Date;
}

function pickBest<T>(
  rows: MemberRow[],
  pluck: (r: MemberRow) => T | null | undefined,
): T | null {
  const sorted = [...rows].sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.kind] ?? 0;
    const pb = SOURCE_PRIORITY[b.kind] ?? 0;
    if (pb !== pa) return pb - pa;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
  for (const r of sorted) {
    const v = pluck(r);
    if (v !== null && v !== undefined && v !== "") return v as T;
  }
  return null;
}

async function loadMembers(rawIds: string[]): Promise<MemberRow[]> {
  if (rawIds.length === 0) return [];
  return db
    .select({
      id: schema.rawContacts.id,
      sourceId: schema.rawContacts.sourceId,
      kind: schema.sources.kind,
      contactId: schema.rawContacts.contactId,
      name: schema.rawContacts.name,
      emails: schema.rawContacts.emails,
      phones: schema.rawContacts.phones,
      linkedinUrl: schema.rawContacts.linkedinUrl,
      avatarUrl: schema.rawContacts.avatarUrl,
      updatedAt: schema.rawContacts.updatedAt,
    })
    .from(schema.rawContacts)
    .innerJoin(
      schema.sources,
      eq(schema.sources.id, schema.rawContacts.sourceId),
    )
    .where(inArray(schema.rawContacts.id, rawIds));
}

/**
 * Create a brand-new contact from member raw records and link them. Used when a
 * candidate's records are all loose (none belong to a saved contact yet).
 */
async function createContactFromMembers(
  userId: string,
  candidateId: string,
  members: MemberRow[],
): Promise<string> {
  const displayName = pickBest(members, (r) => r.name) ?? "Unknown";
  const photoUrl = pickBest(members, (r) => r.avatarUrl);
  const primaryEmail =
    pickBest(members, (r) => normalizeRaw(r).emails[0] ?? null) ?? null;
  const primaryPhone =
    pickBest(members, (r) => normalizeRaw(r).phones[0] ?? null) ?? null;
  const linkedinUrl = pickBest(members, (r) => normalizeRaw(r).linkedin);
  const memberIds = members.map((m) => m.id);

  return db.transaction(async (tx) => {
    // Atomic claim: only one concurrent apply can flip pending → approved.
    // The row lock serializes racers; the loser sees 0 rows and rolls back
    // before creating a duplicate contact (TOCTOU guard — the pending check
    // in applyCandidate happens outside this transaction).
    const claimed = await tx
      .update(schema.mergeCandidates)
      .set({ status: "approved", updatedAt: new Date() })
      .where(
        and(
          eq(schema.mergeCandidates.id, candidateId),
          eq(schema.mergeCandidates.status, "pending"),
        ),
      )
      .returning({ id: schema.mergeCandidates.id });
    if (claimed.length === 0) throw new Error("candidate_already_resolved");

    const [c] = await tx
      .insert(schema.contacts)
      .values({
        userId,
        displayName,
        photoUrl,
        primaryEmail,
        primaryPhone,
        linkedinUrl,
      })
      .returning({ id: schema.contacts.id });
    await tx
      .update(schema.rawContacts)
      .set({ contactId: c.id, updatedAt: new Date() })
      .where(inArray(schema.rawContacts.id, memberIds));
    await tx
      .update(schema.mergeCandidates)
      .set({
        resultingContactId: c.id,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.mergeCandidates.id, candidateId));
    return c.id;
  });
}

/**
 * Merge one or more loser contacts into a survivor. Moves every record that
 * references a loser contact onto the survivor (handling the unique/PK
 * constrained tables), fills any empty survivor fields, soft-deletes the losers,
 * then relinks the survivor's diary. Reused by both candidate approval and the
 * manual "Merge with…" action.
 */
export async function mergeIntoSurvivor(
  userId: string,
  survivorId: string,
  loserIds: string[],
  memberRawIds: string[],
  members: MemberRow[],
  opts: { candidateId?: string; relink?: boolean } = {},
): Promise<{ contactId: string }> {
  const involved = await db
    .select({
      id: schema.contacts.id,
      displayName: schema.contacts.displayName,
      photoUrl: schema.contacts.photoUrl,
      primaryEmail: schema.contacts.primaryEmail,
      primaryPhone: schema.contacts.primaryPhone,
      linkedinUrl: schema.contacts.linkedinUrl,
      mergeNotes: schema.contacts.mergeNotes,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        inArray(schema.contacts.id, [survivorId, ...loserIds]),
      ),
    );
  const survivor = involved.find((c) => c.id === survivorId);
  if (!survivor) throw new Error("survivor_not_found");
  const losers = involved.filter((c) => loserIds.includes(c.id));

  // Fill-only field derivation: keep curated survivor values, only fill blanks.
  const curatedName =
    survivor.displayName && survivor.displayName !== "Unknown"
      ? survivor.displayName
      : null;
  const displayName =
    curatedName ?? pickBest(members, (r) => r.name) ?? survivor.displayName;
  const primaryEmail =
    survivor.primaryEmail ??
    pickBest(members, (r) => normalizeRaw(r).emails[0] ?? null);
  const primaryPhone =
    survivor.primaryPhone ??
    pickBest(members, (r) => normalizeRaw(r).phones[0] ?? null);
  const linkedinUrl =
    survivor.linkedinUrl ?? pickBest(members, (r) => normalizeRaw(r).linkedin);
  const photoUrl = survivor.photoUrl ?? pickBest(members, (r) => r.avatarUrl);

  const provenance =
    loserIds.length > 0
      ? `Merged ${loserIds.length} duplicate contact${loserIds.length === 1 ? "" : "s"}.`
      : null;
  const mergeNotes =
    [survivor.mergeNotes, ...losers.map((l) => l.mergeNotes), provenance]
      .filter((s): s is string => !!s)
      .join("\n") || null;

  // Loose member records (no contact yet) also attach to the survivor.
  const looseRawIds = members.filter((m) => !m.contactId).map((m) => m.id);

  await db.transaction(async (tx) => {
    const now = new Date();

    // 0. Atomic claim when applying a stored candidate — see
    //    createContactFromMembers for the race this guards against.
    if (opts.candidateId) {
      const claimed = await tx
        .update(schema.mergeCandidates)
        .set({ status: "approved", updatedAt: now })
        .where(
          and(
            eq(schema.mergeCandidates.id, opts.candidateId),
            eq(schema.mergeCandidates.status, "pending"),
          ),
        )
        .returning({ id: schema.mergeCandidates.id });
      if (claimed.length === 0) throw new Error("candidate_already_resolved");
    }

    // 1. Move raw records — ALL records of the loser contacts (not just the
    //    matched ones, or they'd orphan when the loser is soft-deleted) plus any
    //    loose member records.
    if (loserIds.length > 0) {
      await tx
        .update(schema.rawContacts)
        .set({ contactId: survivorId, updatedAt: now })
        .where(inArray(schema.rawContacts.contactId, loserIds));
    }
    if (looseRawIds.length > 0) {
      await tx
        .update(schema.rawContacts)
        .set({ contactId: survivorId, updatedAt: now })
        .where(inArray(schema.rawContacts.id, looseRawIds));
    }

    if (loserIds.length > 0) {
      // Move diary (keyed by handle) directly onto the survivor.
      await tx
        .update(schema.messageThreads)
        .set({ contactId: survivorId, updatedAt: now })
        .where(inArray(schema.messageThreads.contactId, loserIds));
      await tx
        .update(schema.messages)
        .set({ contactId: survivorId })
        .where(inArray(schema.messages.contactId, loserIds));
      await tx
        .update(schema.emailThreads)
        .set({ contactId: survivorId, updatedAt: now })
        .where(inArray(schema.emailThreads.contactId, loserIds));
      await tx
        .update(schema.emails)
        .set({ contactId: survivorId })
        .where(inArray(schema.emails.contactId, loserIds));
      await tx
        .update(schema.callLogs)
        .set({ contactId: survivorId })
        .where(inArray(schema.callLogs.contactId, loserIds));
      await tx
        .update(schema.calendarEvents)
        .set({ contactId: survivorId })
        .where(inArray(schema.calendarEvents.contactId, loserIds));

      // Move curated content (tags/notes/follow-ups/plan-items/scores/…).
      await moveCuratedContent(tx, loserIds, survivorId);

      // Soft-delete the losers (never hard delete — raw_contacts.contact_id is
      // ON DELETE SET NULL, so a hard delete could orphan records).
      await tx
        .update(schema.contacts)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(schema.contacts.id, loserIds));
    }

    // 7. Update survivor (fill-only fields + merged notes).
    await tx
      .update(schema.contacts)
      .set({
        displayName,
        photoUrl,
        primaryEmail,
        primaryPhone,
        linkedinUrl,
        mergeNotes,
        updatedAt: now,
      })
      .where(eq(schema.contacts.id, survivorId));

    // 8. Record the merge result on the claimed candidate.
    if (opts.candidateId) {
      await tx
        .update(schema.mergeCandidates)
        .set({
          resultingContactId: survivorId,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.mergeCandidates.id, opts.candidateId));
    }
  });

  // Stamp any dangling diary rows that match the survivor's now-combined
  // phone/email set, and fill still-empty primaries. Outside the transaction so
  // a relink failure doesn't unwind the merge. Skippable for bulk rebuilds that
  // run one global relink at the end.
  if (opts.relink !== false) {
    await relinkContact(survivorId).catch((err) => {
      console.error(`relink failed for contact ${survivorId}:`, err);
    });
  }

  return { contactId: survivorId };
}

export async function applyCandidate(
  userId: string,
  candidateId: string,
  opts: { relink?: boolean } = {},
): Promise<{ contactId: string }> {
  const [candidate] = await db
    .select()
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.id, candidateId),
        eq(schema.mergeCandidates.userId, userId),
      ),
    )
    .limit(1);
  if (!candidate) throw new Error("candidate_not_found");
  if (candidate.status !== "pending") {
    if (candidate.status === "approved" && candidate.resultingContactId) {
      return { contactId: candidate.resultingContactId };
    }
    throw new Error(`candidate_status_${candidate.status}`);
  }

  const members = await loadMembers(candidate.rawContactIds);
  if (members.length === 0) throw new Error("candidate_empty");

  const existingContactIds = [
    ...new Set(
      members.map((m) => m.contactId).filter((c): c is string => !!c),
    ),
  ];

  // No member belongs to a saved contact → create a brand-new contact.
  if (existingContactIds.length === 0) {
    const contactId = await createContactFromMembers(
      userId,
      candidateId,
      members,
    );
    if (opts.relink !== false) {
      await relinkContact(contactId).catch((err) => {
        console.error(`relink failed for contact ${contactId}:`, err);
      });
    }
    return { contactId };
  }

  // Members span one or more saved contacts → merge into a survivor.
  const picked = await pickSurvivor(userId, existingContactIds);
  if (!picked) {
    // All referenced contacts vanished (race) — fall back to a fresh contact.
    const contactId = await createContactFromMembers(
      userId,
      candidateId,
      members,
    );
    if (opts.relink !== false) {
      await relinkContact(contactId).catch((err) => {
        console.error(`relink failed for contact ${contactId}:`, err);
      });
    }
    return { contactId };
  }

  return mergeIntoSurvivor(
    userId,
    picked.survivorId,
    picked.loserIds,
    candidate.rawContactIds,
    members,
    { candidateId, relink: opts.relink },
  );
}

export async function bulkApply(
  userId: string,
  candidateIds: string[],
  opts: { relink?: boolean } = {},
): Promise<{ applied: number; failed: number; errors: string[] }> {
  let applied = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const id of candidateIds) {
    try {
      await applyCandidate(userId, id, opts);
      applied++;
    } catch (e) {
      failed++;
      errors.push(`${id}: ${(e as Error).message}`);
    }
  }
  return { applied, failed, errors };
}

export async function splitCandidate(
  userId: string,
  candidateId: string,
): Promise<void> {
  await db
    .update(schema.mergeCandidates)
    .set({
      status: "split",
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.mergeCandidates.id, candidateId),
        eq(schema.mergeCandidates.userId, userId),
        // Never demote an already-approved candidate to split (stale UI race).
        eq(schema.mergeCandidates.status, "pending"),
      ),
    );
}

export async function manualMerge(
  userId: string,
  rawContactIds: string[],
): Promise<{ contactId: string }> {
  if (rawContactIds.length < 2) throw new Error("need_at_least_two");
  const members = await loadMembers(rawContactIds);
  if (members.length !== rawContactIds.length) throw new Error("invalid_raw_id");
  const result = classify(members);
  const [candidate] = await db
    .insert(schema.mergeCandidates)
    .values({
      userId,
      rawContactIds,
      confidence: result?.confidence ?? "ambiguous",
      signals: (result?.signals ?? null) as Record<string, unknown> | null,
      status: "pending",
    })
    .returning({ id: schema.mergeCandidates.id });
  return applyCandidate(userId, candidate.id);
}

/**
 * Merge two already-saved contacts, hand-picked by the user (the manual
 * "Merge with…" action). `keepId` is the survivor; `mergeId` is absorbed.
 */
export async function mergeContacts(
  userId: string,
  keepId: string,
  mergeId: string,
): Promise<{ contactId: string }> {
  if (keepId === mergeId) throw new Error("same_contact");
  // Both must belong to the user and be live.
  const rows = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        inArray(schema.contacts.id, [keepId, mergeId]),
        isNull(schema.contacts.deletedAt),
      ),
    );
  const ids = new Set(rows.map((r) => r.id));
  if (!ids.has(keepId) || !ids.has(mergeId)) {
    throw new Error("contact_not_found");
  }
  // Members = every raw record of both contacts, so field re-derivation sees
  // the full set.
  const memberRawRows = await db
    .select({ id: schema.rawContacts.id })
    .from(schema.rawContacts)
    .where(inArray(schema.rawContacts.contactId, [keepId, mergeId]));
  const memberRawIds = memberRawRows.map((r) => r.id);
  const members = await loadMembers(memberRawIds);
  return mergeIntoSurvivor(userId, keepId, [mergeId], memberRawIds, members);
}

/**
 * Partition a merge candidate's records across MULTIPLE people. Each bucket
 * becomes one contact (a kept existing contact or a new one); its assigned
 * records move to it. Diary follows records by handle (detach all involved
 * contacts' diary, then relink each resulting contact); curated content of a
 * dissolved contact goes to the bucket holding most of its records. The
 * candidate is marked "split" so the exact group never re-surfaces.
 *
 * `buckets[i] = { keepContactId?, name?, rawIds }`. Records left out of every
 * bucket stay on their current contact.
 */
export async function partitionCandidate(
  userId: string,
  candidateId: string,
  buckets: PartitionBucket[],
): Promise<{ contactIds: string[]; primaryContactId: string }> {
  const [candidate] = await db
    .select()
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.id, candidateId),
        eq(schema.mergeCandidates.userId, userId),
      ),
    )
    .limit(1);
  if (!candidate) throw new Error("candidate_not_found");
  if (candidate.status !== "pending") {
    throw new Error(`candidate_status_${candidate.status}`);
  }

  const members = await loadMembers(candidate.rawContactIds);
  if (members.length === 0) throw new Error("candidate_empty");
  const memberById = new Map(members.map((m) => [m.id, m]));

  const involvedContactIds = [
    ...new Set(members.map((m) => m.contactId).filter((c): c is string => !!c)),
  ];

  const err = validatePartition(
    candidate.rawContactIds,
    involvedContactIds,
    buckets,
  );
  if (err) throw new Error(err);

  const nonEmpty = buckets.filter((b) => b.rawIds.length > 0);

  // One bucket covering every record into a new contact === today's Approve.
  if (
    nonEmpty.length === 1 &&
    !nonEmpty[0].keepContactId &&
    nonEmpty[0].rawIds.length === candidate.rawContactIds.length
  ) {
    const r = await applyCandidate(userId, candidateId);
    return { contactIds: [r.contactId], primaryContactId: r.contactId };
  }

  const bucketSets = nonEmpty.map((b) => new Set(b.rawIds));
  // Primary = survivor of the bucket holding the most records.
  let primaryIdx = 0;
  for (let i = 1; i < nonEmpty.length; i++) {
    if (nonEmpty[i].rawIds.length > nonEmpty[primaryIdx].rawIds.length) {
      primaryIdx = i;
    }
  }

  let survivorIds: string[] = [];
  let survivingInvolved: string[] = [];

  await db.transaction(async (tx) => {
    const now = new Date();

    // 0. Atomic claim (pending → split) — serializes a concurrent approve or
    //    double-submitted partition; the loser rolls back before moving data.
    const claimed = await tx
      .update(schema.mergeCandidates)
      .set({ status: "split", resolvedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.mergeCandidates.id, candidateId),
          eq(schema.mergeCandidates.status, "pending"),
        ),
      )
      .returning({ id: schema.mergeCandidates.id });
    if (claimed.length === 0) throw new Error("candidate_already_resolved");

    // 1. Resolve a survivor per bucket (create new where needed) + reassign
    //    exactly that bucket's records to it.
    survivorIds = [];
    for (const b of nonEmpty) {
      let survivorId = b.keepContactId ?? null;
      if (!survivorId) {
        const sub = b.rawIds
          .map((id) => memberById.get(id))
          .filter((m): m is MemberRow => !!m);
        const [c] = await tx
          .insert(schema.contacts)
          .values({
            userId,
            displayName:
              b.name?.trim() || pickBest(sub, (r) => r.name) || "Unknown",
            photoUrl: pickBest(sub, (r) => r.avatarUrl),
            primaryEmail:
              pickBest(sub, (r) => normalizeRaw(r).emails[0] ?? null) ?? null,
            primaryPhone:
              pickBest(sub, (r) => normalizeRaw(r).phones[0] ?? null) ?? null,
            linkedinUrl: pickBest(sub, (r) => normalizeRaw(r).linkedin),
          })
          .returning({ id: schema.contacts.id });
        survivorId = c.id;
      }
      survivorIds.push(survivorId);
      await tx
        .update(schema.rawContacts)
        .set({ contactId: survivorId, updatedAt: now })
        .where(inArray(schema.rawContacts.id, b.rawIds));
    }

    // 2. Curated content of a dissolving involved contact (not a kept survivor)
    //    goes to the bucket holding most of its records.
    for (const cid of involvedContactIds) {
      if (survivorIds.includes(cid)) continue; // kept — keep its content
      const cidRawIds = members
        .filter((m) => m.contactId === cid)
        .map((m) => m.id);
      const idx = pluralityBucketIndex(cidRawIds, bucketSets);
      if (idx >= 0 && survivorIds[idx] && survivorIds[idx] !== cid) {
        await moveCuratedContent(tx, [cid], survivorIds[idx]);
      }
    }

    // 3. Detach diary from every involved contact so relink can re-home each row
    //    by handle to whichever person now owns the matching record.
    if (involvedContactIds.length > 0) {
      const wh = inArray(schema.messageThreads.contactId, involvedContactIds);
      await tx.update(schema.messageThreads).set({ contactId: null }).where(wh);
      await tx
        .update(schema.messages)
        .set({ contactId: null })
        .where(inArray(schema.messages.contactId, involvedContactIds));
      await tx
        .update(schema.emailThreads)
        .set({ contactId: null })
        .where(inArray(schema.emailThreads.contactId, involvedContactIds));
      await tx
        .update(schema.emails)
        .set({ contactId: null })
        .where(inArray(schema.emails.contactId, involvedContactIds));
      await tx
        .update(schema.callLogs)
        .set({ contactId: null })
        .where(inArray(schema.callLogs.contactId, involvedContactIds));
      await tx
        .update(schema.calendarEvents)
        .set({ contactId: null })
        .where(inArray(schema.calendarEvents.contactId, involvedContactIds));
    }

    // 4. Recount records on involved contacts; soft-delete any now empty and not
    //    a kept survivor.
    const counts =
      involvedContactIds.length > 0
        ? await tx
            .select({
              contactId: schema.rawContacts.contactId,
              n: sql<number>`count(*)::int`,
            })
            .from(schema.rawContacts)
            .where(inArray(schema.rawContacts.contactId, involvedContactIds))
            .groupBy(schema.rawContacts.contactId)
        : [];
    const liveSet = new Set(
      counts.filter((c) => c.n > 0).map((c) => c.contactId as string),
    );
    survivingInvolved = involvedContactIds.filter((cid) => liveSet.has(cid));
    const toDelete = involvedContactIds.filter(
      (cid) => !liveSet.has(cid) && !survivorIds.includes(cid),
    );
    if (toDelete.length > 0) {
      await tx
        .update(schema.contacts)
        .set({ deletedAt: now, updatedAt: now })
        .where(inArray(schema.contacts.id, toDelete));
    }

    // 5. Record the primary result. (Status was already claimed as "split" in
    //    step 0; split status also suppresses the group's pairs on re-scan —
    //    see suppressionPairs in grouping.ts.)
    await tx
      .update(schema.mergeCandidates)
      .set({ resultingContactId: survivorIds[primaryIdx] ?? null })
      .where(eq(schema.mergeCandidates.id, candidateId));
  });

  // 6. Relink every contact that now holds records (new survivors + kept +
  //    leftover involved) so its diary re-attaches by handle. Outside the tx.
  const relinkTargets = [...new Set([...survivorIds, ...survivingInvolved])];
  for (const cid of relinkTargets) {
    await relinkContact(cid).catch((e) =>
      console.error(`relink failed for contact ${cid}:`, e),
    );
  }

  return {
    contactIds: [...new Set(survivorIds)],
    primaryContactId: survivorIds[primaryIdx] ?? survivorIds[0] ?? "",
  };
}
