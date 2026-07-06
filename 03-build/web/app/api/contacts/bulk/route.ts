import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

type Body = {
  contactIds: string[];
  action:
    | "keep"
    | "skip"
    | "to_triage"
    | "set_category"
    | "add_tag"
    | "remove_tag";
  category?: "personal" | "business" | "both" | null;
  tagId?: string;
};

export const POST = handleApi(async (req: Request) => {
  const user = await requireUserApi();
  const body = (await req.json()) as Body;
  if (!Array.isArray(body?.contactIds) || body.contactIds.length === 0) {
    throw new ApiError("no_contacts", 400);
  }

  // Tag actions write the contact_tags join table, not the contacts row.
  if (body.action === "add_tag" || body.action === "remove_tag") {
    if (!body.tagId) {
      throw new ApiError("no_tag", 400);
    }
    const [tag] = await db
      .select({ id: schema.tags.id })
      .from(schema.tags)
      .where(
        and(
          eq(schema.tags.id, body.tagId),
          eq(schema.tags.userId, user.id),
          isNull(schema.tags.deletedAt),
        ),
      )
      .limit(1);
    if (!tag) {
      throw new ApiError("tag_not_found", 404);
    }
    const owned = await db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.userId, user.id),
          inArray(schema.contacts.id, body.contactIds),
        ),
      );
    const ownedIds = owned.map((r) => r.id);
    if (ownedIds.length > 0) {
      if (body.action === "add_tag") {
        await db
          .insert(schema.contactTags)
          .values(ownedIds.map((cid) => ({ contactId: cid, tagId: body.tagId! })))
          .onConflictDoNothing();
      } else {
        await db
          .delete(schema.contactTags)
          .where(
            and(
              inArray(schema.contactTags.contactId, ownedIds),
              eq(schema.contactTags.tagId, body.tagId),
            ),
          );
      }
    }
    return NextResponse.json({ updated: ownedIds.length });
  }

  const update: Partial<typeof schema.contacts.$inferInsert> = {
    updatedAt: new Date(),
  };
  switch (body.action) {
    case "keep":
      update.triageStatus = "kept";
      if (body.category) update.category = body.category;
      break;
    case "skip":
      update.triageStatus = "skipped";
      break;
    case "to_triage":
      update.triageStatus = "to_triage";
      break;
    case "set_category":
      update.category = body.category ?? null;
      break;
    default:
      throw new ApiError("bad_action", 400);
  }

  const res = await db
    .update(schema.contacts)
    .set(update)
    .where(
      and(
        eq(schema.contacts.userId, user.id),
        inArray(schema.contacts.id, body.contactIds),
      ),
    )
    .returning({ id: schema.contacts.id });

  return NextResponse.json({ updated: res.length });
});
