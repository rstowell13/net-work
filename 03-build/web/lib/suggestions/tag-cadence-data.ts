import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { listContacts, type ContactListRow } from "@/lib/contacts/queries";
import {
  computeTagShortfalls,
  type TagCadenceRule,
  type TagShortfall,
} from "./tag-cadence";

/** Active per-tag outreach rules for a user (excludes deleted tags). */
export async function loadTagRules(userId: string): Promise<TagCadenceRule[]> {
  const rows = await db
    .select({
      tagId: schema.tagCadenceRules.tagId,
      tagName: schema.tags.name,
      targetCount: schema.tagCadenceRules.targetCount,
      window: schema.tagCadenceRules.window,
    })
    .from(schema.tagCadenceRules)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.tagCadenceRules.tagId))
    .where(
      and(
        eq(schema.tagCadenceRules.userId, userId),
        isNull(schema.tags.deletedAt),
      ),
    );
  return rows.map((r) => ({
    tagId: r.tagId,
    tagName: r.tagName,
    targetCount: r.targetCount,
    window: r.window,
  }));
}

/** Derive per-tag shortfalls from an already-loaded kept-contact pool. */
export function shortfallsFromPool(
  rules: TagCadenceRule[],
  pool: ContactListRow[],
  now: Date,
): Map<string, TagShortfall> {
  const seen = pool.flatMap((c) =>
    c.tags.map((t) => ({ tagId: t.id, lastSeenAt: c.lastSeenAt })),
  );
  return computeTagShortfalls(rules, seen, now);
}

/** Rules + current-window progress for pages that don't already hold the pool. */
export async function getTagCadenceState(
  userId: string,
  now: Date,
): Promise<{ rules: TagCadenceRule[]; shortfalls: Map<string, TagShortfall> }> {
  const [rules, pool] = await Promise.all([
    loadTagRules(userId),
    listContacts(userId, { status: "kept" }, 1000),
  ]);
  return { rules, shortfalls: shortfallsFromPool(rules, pool, now) };
}
