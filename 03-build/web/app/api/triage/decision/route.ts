import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

type Body = {
  contactId: string;
  decision: "keep" | "skip" | "undo";
  category?: "personal" | "business" | "both" | null;
};

export async function POST(req: Request) {
  const user = await requireUser();
  const body = (await req.json()) as Body;
  if (!body?.contactId || !body?.decision) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const next: Partial<typeof schema.contacts.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.decision === "keep") {
    next.triageStatus = "kept";
    if (body.category) next.category = body.category;
  } else if (body.decision === "skip") {
    next.triageStatus = "skipped";
  } else if (body.decision === "undo") {
    next.triageStatus = "to_triage";
    next.category = null;
  }

  await db
    .update(schema.contacts)
    .set(next)
    .where(
      and(
        eq(schema.contacts.id, body.contactId),
        eq(schema.contacts.userId, user.id),
      ),
    );
  return NextResponse.json({ ok: true });
}
