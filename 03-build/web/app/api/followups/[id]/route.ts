import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const body = (await req.json()) as {
    status?: "open" | "done" | "snoozed";
    snoozeUntil?: string;
  };

  // Verify the follow-up belongs to a contact owned by the user.
  const ownedContacts = db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(eq(schema.contacts.userId, user.id));

  const next: Partial<typeof schema.followUps.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.status) {
    next.status = body.status;
    if (body.status === "done") next.doneAt = new Date();
    if (body.status === "open") next.doneAt = null;
  }
  if (body.snoozeUntil) next.snoozeUntil = new Date(body.snoozeUntil);

  const res = await db
    .update(schema.followUps)
    .set(next)
    .where(
      and(
        eq(schema.followUps.id, id),
        inArray(schema.followUps.contactId, ownedContacts),
      ),
    )
    .returning({ id: schema.followUps.id });
  if (res.length === 0)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
