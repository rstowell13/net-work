import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";

type Body = {
  contactIds: string[];
  action:
    | "keep"
    | "skip"
    | "to_triage"
    | "set_category";
  category?: "personal" | "business" | "both" | null;
};

export async function POST(req: Request) {
  const user = await requireUser();
  const body = (await req.json()) as Body;
  if (!Array.isArray(body?.contactIds) || body.contactIds.length === 0) {
    return NextResponse.json({ error: "no_contacts" }, { status: 400 });
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
      return NextResponse.json({ error: "bad_action" }, { status: 400 });
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
}
