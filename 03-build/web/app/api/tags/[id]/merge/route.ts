import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

/** Merge tag `id` into `intoTagId`: reassign its contacts, then delete it. */
export const POST = handleApi(async (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  const { intoTagId } = (await req.json()) as { intoTagId?: string };
  if (!intoTagId || intoTagId === id) {
    throw new ApiError("bad_target", 400);
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
    throw new ApiError("not_found", 404);
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
});
