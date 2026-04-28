import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const body = (await req.json()) as { body?: string };
  if (!body?.body?.trim())
    return NextResponse.json({ error: "empty" }, { status: 400 });

  const [contact] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.id, id), eq(schema.contacts.userId, user.id)))
    .limit(1);
  if (!contact)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const [created] = await db
    .insert(schema.notes)
    .values({ contactId: id, body: body.body.trim() })
    .returning();
  return NextResponse.json(created);
}
