import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { refreshContactThreadSummaries } from "@/lib/llm/thread-summaries";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const [contact] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(
      and(eq(schema.contacts.id, id), eq(schema.contacts.userId, user.id)),
    )
    .limit(1);
  if (!contact)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await refreshContactThreadSummaries(id);
  return NextResponse.json(result);
}
