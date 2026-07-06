import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { getRelationshipInputs } from "@/lib/diary";
import { getOrGenerateRelationshipSummary } from "@/lib/llm/summary";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = handleApi(async (
  _req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  const [contact] = await db
    .select()
    .from(schema.contacts)
    .where(
      and(eq(schema.contacts.id, id), eq(schema.contacts.userId, user.id)),
    )
    .limit(1);
  if (!contact)
    throw new ApiError("not_found", 404);

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
    throw new ApiError("llm_not_configured", 503);
  }
  return NextResponse.json(result);
});
