import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { normalizeTagName } from "@/lib/tags/colors";

export const runtime = "nodejs";

export const PATCH = handleApi(async (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  const body = (await req.json()) as { name?: string; color?: string };

  const patch: { name?: string; color?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (typeof body.name === "string") {
    const n = normalizeTagName(body.name);
    if (!n) throw new ApiError("empty_name", 400);
    patch.name = n;
  }
  if (typeof body.color === "string") patch.color = body.color;

  let updated: typeof schema.tags.$inferSelect | undefined;
  try {
    [updated] = await db
      .update(schema.tags)
      .set(patch)
      .where(and(eq(schema.tags.id, id), eq(schema.tags.userId, user.id)))
      .returning();
  } catch {
    // Unique (user_id, name) violation — a tag with that name already exists.
    throw new ApiError("name_taken", 409);
  }
  if (!updated) {
    throw new ApiError("not_found", 404);
  }
  return NextResponse.json(updated);
});

export const DELETE = handleApi(async (
  _req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  // FK cascade clears contact_tags and tag_cadence_rules for this tag.
  const res = await db
    .delete(schema.tags)
    .where(and(eq(schema.tags.id, id), eq(schema.tags.userId, user.id)))
    .returning({ id: schema.tags.id });
  return NextResponse.json({ deleted: res.length });
});
