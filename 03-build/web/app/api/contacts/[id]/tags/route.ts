import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
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

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const { tagId } = (await req.json()) as { tagId?: string };
  if (!tagId) return NextResponse.json({ error: "no_tag" }, { status: 400 });
  if (!(await authorize(user.id, id, tagId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  await db
    .insert(schema.contactTags)
    .values({ contactId: id, tagId })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const { tagId } = (await req.json()) as { tagId?: string };
  if (!tagId) return NextResponse.json({ error: "no_tag" }, { status: 400 });
  if (!(await authorize(user.id, id, tagId))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
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
}
