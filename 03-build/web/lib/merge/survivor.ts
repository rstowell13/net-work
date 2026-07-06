/**
 * Survivor selection for contact merges: which saved contact keeps living when
 * duplicates collapse. DB wrapper around the pure ranking in survivor-rank.ts.
 * Shared by the merge itself (apply.ts) and the queue preview (queries.ts,
 * app/merge/[id]).
 */
import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { rankSurvivorId } from "./survivor-rank";

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
