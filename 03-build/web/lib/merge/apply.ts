/**
 * Apply a MergeCandidate: create the Contact row, link member RawContacts,
 * mark the candidate approved.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { normalizeRaw } from "./normalize";
import { classify } from "./confidence";

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

export async function applyCandidate(
  userId: string,
  candidateId: string,
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

  const displayName =
    pickBest(members, (r) => r.name) ?? "Unknown";
  const photoUrl = pickBest(members, (r) => r.avatarUrl);
  const primaryEmail =
    pickBest(members, (r) => normalizeRaw(r).emails[0] ?? null) ?? null;
  const primaryPhone =
    pickBest(members, (r) => normalizeRaw(r).phones[0] ?? null) ?? null;
  const linkedinUrl = pickBest(members, (r) => normalizeRaw(r).linkedin);

  const contactId = await db.transaction(async (tx) => {
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
      .where(inArray(schema.rawContacts.id, candidate.rawContactIds));
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

  return { contactId };
}

export async function bulkApply(
  userId: string,
  candidateIds: string[],
): Promise<{ applied: number; failed: number; errors: string[] }> {
  let applied = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const id of candidateIds) {
    try {
      await applyCandidate(userId, id);
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
  if (members.some((m) => !m)) throw new Error("invalid_raw_id");
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
