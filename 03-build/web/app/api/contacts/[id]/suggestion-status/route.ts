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
  const body = (await req.json()) as { status?: "active" | "never" };
  if (!body?.status)
    return NextResponse.json({ error: "missing_status" }, { status: 400 });
  await db
    .update(schema.contacts)
    .set({ suggestionStatus: body.status, updatedAt: new Date() })
    .where(
      and(eq(schema.contacts.id, id), eq(schema.contacts.userId, user.id)),
    );
  return NextResponse.json({ ok: true });
}
