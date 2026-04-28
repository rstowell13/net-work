import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";

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
  }>;
  primaryName: string;
  primarySignal: string;
}

function describeSignal(c: CandidateView): string {
  const s = c.signals as
    | { sharedEmails?: string[]; sharedPhones?: string[]; sharedLinkedIn?: string[]; sharedName?: string | null }
    | null;
  if (s?.sharedEmails && s.sharedEmails.length > 0) return "email match";
  if (s?.sharedPhones && s.sharedPhones.length > 0) return "phone match";
  if (s?.sharedLinkedIn && s.sharedLinkedIn.length > 0) return "LinkedIn match";
  if (s?.sharedName) return "name match";
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
      }));
    const primaryName =
      members.find((m) => m.name && m.name.trim().length > 0)?.name ??
      "Unknown";
    const view: CandidateView = {
      id: c.id,
      confidence: c.confidence,
      rawContactIds: c.rawContactIds,
      signals: c.signals as Record<string, unknown> | null,
      members,
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
