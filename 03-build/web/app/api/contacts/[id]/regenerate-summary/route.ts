import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getRelationshipInputs } from "@/lib/diary";
import { getOrGenerateRelationshipSummary } from "@/lib/llm/summary";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const [contact] = await db
    .select()
    .from(schema.contacts)
    .where(
      and(eq(schema.contacts.id, id), eq(schema.contacts.userId, user.id)),
    )
    .limit(1);
  if (!contact)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const inputs = await getRelationshipInputs(id);
  const result = await getOrGenerateRelationshipSummary(
    id,
    {
      contactName: contact.displayName,
      category: contact.category,
      ...inputs,
    },
    { force: true },
  );
  if (!result) {
    return NextResponse.json(
      {
        error:
          "OPENROUTER_API_KEY is not configured. Set it in your Vercel environment.",
      },
      { status: 503 },
    );
  }
  return NextResponse.json(result);
}
