/**
 * Group unmerged RawContacts into MergeCandidate rows via union-find on
 * shared normalized identifiers. Idempotent.
 */
import "server-only";
import { and, eq, isNull, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { normalizeRaw } from "./normalize";
import { classify, type ConfidenceInput } from "./confidence";

class UnionFind {
  parent = new Map<string, string>();
  find(x: string): string {
    let p = this.parent.get(x) ?? x;
    if (p === x) return x;
    p = this.find(p);
    this.parent.set(x, p);
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
  add(x: string) {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }
}

export interface DedupeStats {
  candidatesCreated: number;
  exact: number;
  high: number;
  ambiguous: number;
  rawConsidered: number;
}

export async function runDedupe(userId: string): Promise<DedupeStats> {
  // Pull all unmerged raw contacts for this user.
  const raws = await db
    .select({
      id: schema.rawContacts.id,
      sourceId: schema.rawContacts.sourceId,
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
    .where(
      and(
        eq(schema.sources.userId, userId),
        isNull(schema.rawContacts.contactId),
      ),
    );

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

  const uf = new UnionFind();
  candidates.forEach((r) => uf.add(r.id));

  const indexBy = (key: string, val: string, id: string, map: Map<string, string[]>) => {
    const k = `${key}:${val}`;
    const arr = map.get(k) ?? [];
    arr.push(id);
    map.set(k, arr);
  };
  const map = new Map<string, string[]>();

  for (const r of candidates) {
    const n = normalizeRaw(r);
    for (const e of n.emails) indexBy("email", e, r.id, map);
    for (const p of n.phones) indexBy("phone", p, r.id, map);
    if (n.linkedin) indexBy("linkedin", n.linkedin, r.id, map);
    if (n.name) indexBy("name", n.name, r.id, map);
  }

  for (const ids of map.values()) {
    for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
  }

  const groups = new Map<string, string[]>();
  for (const r of candidates) {
    const root = uf.find(r.id);
    const g = groups.get(root) ?? [];
    g.push(r.id);
    groups.set(root, g);
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));

  const stats: DedupeStats = {
    candidatesCreated: 0,
    exact: 0,
    high: 0,
    ambiguous: 0,
    rawConsidered: candidates.length,
  };

  const inserts: typeof schema.mergeCandidates.$inferInsert[] = [];
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const members: ConfidenceInput[] = ids.map((id) => byId.get(id)!);
    const result = classify(members);
    if (!result) continue;
    inserts.push({
      userId,
      rawContactIds: ids,
      confidence: result.confidence,
      signals: result.signals as unknown as Record<string, unknown>,
      status: "pending",
    });
    stats.candidatesCreated++;
    stats[result.confidence]++;
  }

  if (inserts.length > 0) {
    // Insert in chunks to avoid huge single statements.
    const CHUNK = 200;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      await db.insert(schema.mergeCandidates).values(inserts.slice(i, i + CHUNK));
    }
  }

  return stats;
}
