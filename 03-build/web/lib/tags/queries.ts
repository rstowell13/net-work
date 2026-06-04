import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Tag, TagWithCount } from "./types";

export type { Tag, TagWithCount } from "./types";

/**
 * All of a user's tags (alphabetical) with how many non-deleted contacts carry
 * each. Used by the management page and, ignoring the count, by the pickers.
 */
export async function listTags(userId: string): Promise<TagWithCount[]> {
  const rows = await db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      color: schema.tags.color,
      contactCount: sql<number>`count(distinct ${schema.contacts.id})::int`,
    })
    .from(schema.tags)
    .leftJoin(
      schema.contactTags,
      eq(schema.contactTags.tagId, schema.tags.id),
    )
    .leftJoin(
      schema.contacts,
      and(
        eq(schema.contacts.id, schema.contactTags.contactId),
        isNull(schema.contacts.deletedAt),
      ),
    )
    .where(and(eq(schema.tags.userId, userId), isNull(schema.tags.deletedAt)))
    .groupBy(schema.tags.id)
    .orderBy(asc(schema.tags.name));
  return rows;
}

/**
 * contactId → its tags. One query + JS merge, mirroring aggregateSources in
 * lib/contacts/queries.ts so list rows can be hydrated in a single round-trip.
 */
export async function aggregateTags(
  contactIds: string[],
): Promise<Map<string, Tag[]>> {
  if (contactIds.length === 0) return new Map();
  const rows = await db
    .select({
      contactId: schema.contactTags.contactId,
      id: schema.tags.id,
      name: schema.tags.name,
      color: schema.tags.color,
    })
    .from(schema.contactTags)
    .innerJoin(
      schema.tags,
      and(
        eq(schema.tags.id, schema.contactTags.tagId),
        isNull(schema.tags.deletedAt),
      ),
    )
    .where(inArray(schema.contactTags.contactId, contactIds))
    .orderBy(asc(schema.tags.name));
  const out = new Map<string, Tag[]>();
  for (const r of rows) {
    const arr = out.get(r.contactId) ?? [];
    arr.push({ id: r.id, name: r.name, color: r.color });
    out.set(r.contactId, arr);
  }
  return out;
}

export async function getTagsForContact(contactId: string): Promise<Tag[]> {
  return (await aggregateTags([contactId])).get(contactId) ?? [];
}

/** tagId → count of kept, non-deleted contacts (mirrors getCategoryCounts). */
export async function getTagCounts(userId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      tagId: schema.contactTags.tagId,
      n: sql<number>`count(distinct ${schema.contactTags.contactId})::int`,
    })
    .from(schema.contactTags)
    .innerJoin(
      schema.contacts,
      eq(schema.contacts.id, schema.contactTags.contactId),
    )
    .innerJoin(schema.tags, eq(schema.tags.id, schema.contactTags.tagId))
    .where(
      and(
        eq(schema.tags.userId, userId),
        isNull(schema.tags.deletedAt),
        isNull(schema.contacts.deletedAt),
        eq(schema.contacts.triageStatus, "kept"),
      ),
    )
    .groupBy(schema.contactTags.tagId);
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.tagId, r.n);
  return out;
}
