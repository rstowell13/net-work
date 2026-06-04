import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { normalizeTagName } from "@/lib/tags/colors";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const body = (await req.json()) as { name?: string; color?: string };

  const patch: { name?: string; color?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (typeof body.name === "string") {
    const n = normalizeTagName(body.name);
    if (!n) return NextResponse.json({ error: "empty_name" }, { status: 400 });
    patch.name = n;
  }
  if (typeof body.color === "string") patch.color = body.color;

  try {
    const [updated] = await db
      .update(schema.tags)
      .set(patch)
      .where(and(eq(schema.tags.id, id), eq(schema.tags.userId, user.id)))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch {
    // Unique (user_id, name) violation — a tag with that name already exists.
    return NextResponse.json({ error: "name_taken" }, { status: 409 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  // FK cascade clears contact_tags and tag_cadence_rules for this tag.
  const res = await db
    .delete(schema.tags)
    .where(and(eq(schema.tags.id, id), eq(schema.tags.userId, user.id)))
    .returning({ id: schema.tags.id });
  return NextResponse.json({ deleted: res.length });
}
