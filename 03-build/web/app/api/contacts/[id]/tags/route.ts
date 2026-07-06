import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

async function authorize(userId: string, contactId: string, tagId: string) {
  const [c] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(
      and(eq(schema.contacts.id, contactId), eq(schema.contacts.userId, userId)),
    )
    .limit(1);
  const [t] = await db
    .select({ id: schema.tags.id })
    .from(schema.tags)
    .where(
      and(
        eq(schema.tags.id, tagId),
        eq(schema.tags.userId, userId),
        isNull(schema.tags.deletedAt),
      ),
    )
    .limit(1);
  return Boolean(c && t);
}

export const POST = handleApi(async (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  const { tagId } = (await req.json()) as { tagId?: string };
  if (!tagId) throw new ApiError("no_tag", 400);
  if (!(await authorize(user.id, id, tagId))) {
    throw new ApiError("not_found", 404);
  }
  await db
    .insert(schema.contactTags)
    .values({ contactId: id, tagId })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
});

export const DELETE = handleApi(async (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  const { tagId } = (await req.json()) as { tagId?: string };
  if (!tagId) throw new ApiError("no_tag", 400);
  if (!(await authorize(user.id, id, tagId))) {
    throw new ApiError("not_found", 404);
  }
  await db
    .delete(schema.contactTags)
    .where(
      and(
        eq(schema.contactTags.contactId, id),
        eq(schema.contactTags.tagId, tagId),
      ),
    );
  return NextResponse.json({ ok: true });
});
