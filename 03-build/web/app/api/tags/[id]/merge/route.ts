import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

/** Merge tag `id` into `intoTagId`: reassign its contacts, then delete it. */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const { intoTagId } = (await req.json()) as { intoTagId?: string };
  if (!intoTagId || intoTagId === id) {
    return NextResponse.json({ error: "bad_target" }, { status: 400 });
  }

  const owned = await db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(
      and(
        eq(schema.tags.userId, user.id),
        inArray(schema.tags.id, [id, intoTagId]),
        isNull(schema.tags.deletedAt),
      ),
    );
  if (owned.length !== 2) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const srcRows = await db
    .select({ contactId: schema.contactTags.contactId })
    .from(schema.contactTags)
    .where(eq(schema.contactTags.tagId, id));
  if (srcRows.length > 0) {
    await db
      .insert(schema.contactTags)
      .values(srcRows.map((r) => ({ contactId: r.contactId, tagId: intoTagId })))
      .onConflictDoNothing();
  }

  // Cascade clears the source tag's contact_tags + tag_cadence_rules rows.
  await db
    .delete(schema.tags)
    .where(and(eq(schema.tags.id, id), eq(schema.tags.userId, user.id)));

  return NextResponse.json({ merged: srcRows.length });
}
