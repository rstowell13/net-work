import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { rankSurvivorId } from "./apply";

export interface CandidateView {
  id: string;
  confidence: "exact" | "high" | "ambiguous";
  rawContactIds: string[];
  signals: Record<string, unknown> | null;
  members: Array<{
    id: string;
    name: string | null;
    sourceKind: string;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    avatarUrl: string | null;
    contactId: string | null;
  }>;
  /** Distinct saved contacts this candidate spans (empty for a fresh group). */
  existingContacts: Array<{
    id: string;
    displayName: string;
    triageStatus: string;
    isSurvivor: boolean;
  }>;
  /** Display name of the contact that will be kept when existing contacts merge. */
  survivorName: string | null;
  primaryName: string;
  primarySignal: string;
}

function describeSignal(c: CandidateView): string {
  const s = c.signals as
    | {
        sharedEmails?: string[];
        sharedPhones?: string[];
        sharedLinkedIn?: string[];
        sharedName?: string | null;
        sharedNameKey?: string | null;
      }
    | null;
  if (s?.sharedEmails && s.sharedEmails.length > 0) return "email match";
  if (s?.sharedPhones && s.sharedPhones.length > 0) return "phone match";
  if (s?.sharedLinkedIn && s.sharedLinkedIn.length > 0) return "LinkedIn match";
  if (s?.sharedName) return "name match";
  if (s?.sharedNameKey) return "nickname match";
  return "name overlap";
}

export async function getPendingCandidates(
  userId: string,
): Promise<CandidateView[]> {
  const candidates = await db
    .select()
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.userId, userId),
        eq(schema.mergeCandidates.status, "pending"),
      ),
    )
    .orderBy(schema.mergeCandidates.createdAt);

  if (candidates.length === 0) return [];

  const allRawIds = [...new Set(candidates.flatMap((c) => c.rawContactIds))];
  const raws = await db
    .select({
      id: schema.rawContacts.id,
      contactId: schema.rawContacts.contactId,
      name: schema.rawContacts.name,
      emails: schema.rawContacts.emails,
      phones: schema.rawContacts.phones,
      linkedinUrl: schema.rawContacts.linkedinUrl,
      avatarUrl: schema.rawContacts.avatarUrl,
      sourceKind: schema.sources.kind,
    })
    .from(schema.rawContacts)
    .innerJoin(
      schema.sources,
      eq(schema.sources.id, schema.rawContacts.sourceId),
    )
    .where(inArray(schema.rawContacts.id, allRawIds));

  const byId = new Map(raws.map((r) => [r.id, r]));

  // Batch-load every saved contact any candidate touches, plus its raw-record
  // count, so each card can show "merges N saved contacts → keeps X" and predict
  // the survivor with the same rule the merge uses — without per-candidate queries.
  const existingIds = [
    ...new Set(raws.map((r) => r.contactId).filter((c): c is string => !!c)),
  ];
  const contactById = new Map<
    string,
    {
      id: string;
      displayName: string;
      triageStatus: string;
      category: string | null;
      createdAt: Date;
    }
  >();
  const rawCountById = new Map<string, number>();
  if (existingIds.length > 0) {
    const contactRows = await db
      .select({
        id: schema.contacts.id,
        displayName: schema.contacts.displayName,
        triageStatus: schema.contacts.triageStatus,
        category: schema.contacts.category,
        createdAt: schema.contacts.createdAt,
      })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.userId, userId),
          inArray(schema.contacts.id, existingIds),
          isNull(schema.contacts.deletedAt),
        ),
      );
    for (const r of contactRows) contactById.set(r.id, r);
    const counts = await db
      .select({
        contactId: schema.rawContacts.contactId,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.rawContacts)
      .where(inArray(schema.rawContacts.contactId, existingIds))
      .groupBy(schema.rawContacts.contactId);
    for (const c of counts) rawCountById.set(c.contactId as string, c.n);
  }

  const views: CandidateView[] = candidates.map((c) => {
    const members = c.rawContactIds
      .map((id) => byId.get(id))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({
        id: m.id,
        name: m.name,
        sourceKind: m.sourceKind,
        email: m.emails?.[0] ?? null,
        phone: m.phones?.[0] ?? null,
        linkedinUrl: m.linkedinUrl,
        avatarUrl: m.avatarUrl,
        contactId: m.contactId,
      }));

    // Distinct live saved contacts this candidate spans, with the survivor flagged.
    const involvedIds = [
      ...new Set(
        members.map((m) => m.contactId).filter((id): id is string => !!id),
      ),
    ].filter((id) => contactById.has(id));
    const survivorId = rankSurvivorId(
      involvedIds.map((id) => contactById.get(id)!),
      rawCountById,
    );
    const existingContacts = involvedIds.map((id) => {
      const row = contactById.get(id)!;
      return {
        id: row.id,
        displayName: row.displayName,
        triageStatus: row.triageStatus,
        isSurvivor: id === survivorId,
      };
    });
    const survivorName = survivorId
      ? (contactById.get(survivorId)?.displayName ?? null)
      : null;

    const primaryName =
      survivorName ??
      members.find((m) => m.name && m.name.trim().length > 0)?.name ??
      "Unknown";
    const view: CandidateView = {
      id: c.id,
      confidence: c.confidence,
      rawContactIds: c.rawContactIds,
      signals: c.signals as Record<string, unknown> | null,
      members,
      existingContacts,
      survivorName,
      primaryName,
      primarySignal: "",
    };
    view.primarySignal = describeSignal(view);
    return view;
  });

  return views;
}

export async function getStats(
  userId: string,
): Promise<{ pending: number; exact: number; high: number; ambiguous: number }> {
  const rows = await db
    .select({
      confidence: schema.mergeCandidates.confidence,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.mergeCandidates)
    .where(
      and(
        eq(schema.mergeCandidates.userId, userId),
        eq(schema.mergeCandidates.status, "pending"),
      ),
    )
    .groupBy(schema.mergeCandidates.confidence);
  const out = { pending: 0, exact: 0, high: 0, ambiguous: 0 };
  for (const r of rows) {
    out[r.confidence] = r.n;
    out.pending += r.n;
  }
  return out;
}
