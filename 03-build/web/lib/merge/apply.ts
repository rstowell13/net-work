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

// Survivor selection: a human's "kept" decision must outrank an untriaged or
// skipped record.
const TRIAGE_RANK: Record<string, number> = {
  kept: 3,
  to_triage: 2,
  skipped: 1,
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
        status: "approved",
        resultingContactId: c.id,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.mergeCandidates.id, candidateId));
    return c.id;
  });
}

/**
 * Pure survivor ranking, shared by the merge itself and the queue preview:
 * kept > to_triage > skipped, then has-category, then most raw records, then
 * oldest. Returns null for an empty list.
 */
export function rankSurvivorId(
  rows: {
    id: string;
    triageStatus: string;
    category: string | null;
    createdAt: Date;
  }[],
  rawCountById: Map<string, number>,
): string | null {
  if (rows.length === 0) return null;
  const ranked = [...rows].sort((a, b) => {
    const ta = TRIAGE_RANK[a.triageStatus] ?? 0;
    const tb = TRIAGE_RANK[b.triageStatus] ?? 0;
    if (tb !== ta) return tb - ta;
    const ca = a.category ? 1 : 0;
    const cb = b.category ? 1 : 0;
    if (cb !== ca) return cb - ca;
    const na = rawCountById.get(a.id) ?? 0;
    const nb = rawCountById.get(b.id) ?? 0;
    if (nb !== na) return nb - na;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return ranked[0].id;
}

/**
 * Choose which saved contact survives a merge. Returns null if none of the
 * referenced contacts are still live.
 */
export async function pickSurvivor(
  userId: string,
  contactIds: string[],
): Promise<{ survivorId: string; loserIds: string[] } | null> {
  const rows = await db
    .select({
      id: schema.contacts.id,
      triageStatus: schema.contacts.triageStatus,
      category: schema.contacts.category,
      createdAt: schema.contacts.createdAt,
    })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.userId, userId),
        inArray(schema.contacts.id, contactIds),
        isNull(schema.contacts.deletedAt),
      ),
    );
  if (rows.length === 0) return null;

  const counts = await db
    .select({
      contactId: schema.rawContacts.contactId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.rawContacts)
    .where(inArray(schema.rawContacts.contactId, contactIds))
    .groupBy(schema.rawContacts.contactId);
  const countMap = new Map<string, number>(
    counts.map((c) => [c.contactId as string, c.n]),
  );

  const survivorId = rankSurvivorId(rows, countMap);
  if (!survivorId) return null;
  // Losers = every other referenced contact (even any already soft-deleted by a
  // race), so their records all get swept onto the survivor.
  const loserIds = contactIds.filter((id) => id !== survivorId);
  return { survivorId, loserIds };
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
      // 2. contact_tags — PK (contact_id, tag_id). Move only tags the survivor
      //    doesn't already have; drop the duplicates.
      const survTags = await tx
        .select({ tagId: schema.contactTags.tagId })
        .from(schema.contactTags)
        .where(eq(schema.contactTags.contactId, survivorId));
      const survSet = new Set(survTags.map((t) => t.tagId));
      const loserTags = await tx
        .select({ tagId: schema.contactTags.tagId })
        .from(schema.contactTags)
        .where(inArray(schema.contactTags.contactId, loserIds));
      const toAdd = [...new Set(loserTags.map((t) => t.tagId))].filter(
        (t) => !survSet.has(t),
      );
      await tx
        .delete(schema.contactTags)
        .where(inArray(schema.contactTags.contactId, loserIds));
      if (toAdd.length > 0) {
        await tx
          .insert(schema.contactTags)
          .values(toAdd.map((tagId) => ({ contactId: survivorId, tagId })));
      }

      // 3. Plain moves (no uniqueness on contact_id).
      await tx
        .update(schema.followUps)
        .set({ contactId: survivorId, updatedAt: now })
        .where(inArray(schema.followUps.contactId, loserIds));
      await tx
        .update(schema.notes)
        .set({ contactId: survivorId, updatedAt: now })
        .where(inArray(schema.notes.contactId, loserIds));
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
      await tx
        .update(schema.scoreHistory)
        .set({ contactId: survivorId })
        .where(inArray(schema.scoreHistory.contactId, loserIds));

      // 4. Constrained / derived tables — drop loser rows. Scores recompute on
      //    the next scoring pass; suggestion_state is one-per-contact; summaries
      //    are stale for the combined contact and regenerate on next view.
      await tx
        .delete(schema.scores)
        .where(inArray(schema.scores.contactId, loserIds));
      await tx
        .delete(schema.suggestionState)
        .where(inArray(schema.suggestionState.contactId, loserIds));
      await tx
        .delete(schema.relationshipSummaries)
        .where(inArray(schema.relationshipSummaries.contactId, loserIds));

      // 5. weekly_plan_items — UNIQUE (plan_id, contact_id). Move one item per
      //    plan the survivor isn't already in; drop the rest.
      const survPlans = await tx
        .select({ planId: schema.weeklyPlanItems.planId })
        .from(schema.weeklyPlanItems)
        .where(eq(schema.weeklyPlanItems.contactId, survivorId));
      const claimed = new Set(survPlans.map((p) => p.planId));
      const loserItems = await tx
        .select({
          id: schema.weeklyPlanItems.id,
          planId: schema.weeklyPlanItems.planId,
        })
        .from(schema.weeklyPlanItems)
        .where(inArray(schema.weeklyPlanItems.contactId, loserIds));
      const moveItemIds: string[] = [];
      const dropItemIds: string[] = [];
      for (const it of loserItems) {
        if (claimed.has(it.planId)) {
          dropItemIds.push(it.id);
        } else {
          claimed.add(it.planId);
          moveItemIds.push(it.id);
        }
      }
      if (moveItemIds.length > 0) {
        await tx
          .update(schema.weeklyPlanItems)
          .set({ contactId: survivorId })
          .where(inArray(schema.weeklyPlanItems.id, moveItemIds));
      }
      if (dropItemIds.length > 0) {
        await tx
          .delete(schema.weeklyPlanItems)
          .where(inArray(schema.weeklyPlanItems.id, dropItemIds));
      }

      // 6. Soft-delete the losers (never hard delete — raw_contacts.contact_id
      //    is ON DELETE SET NULL, so a hard delete could orphan records).
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

    // 8. Mark the candidate approved when applying a stored candidate.
    if (opts.candidateId) {
      await tx
        .update(schema.mergeCandidates)
        .set({
          status: "approved",
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
