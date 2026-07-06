import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { getRelationshipInputs, getRelationshipStalenessInputs } from "@/lib/diary";
import { generateRelationshipSummary } from "@/lib/llm/summary";

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

  // Force regeneration: skip the cache check but still need the full bodies
  // (message/email text) to call the LLM, and the cheap staleness key so the
  // new row can be looked up by cache-check on subsequent page views.
  const [inputs, stalenessKey] = await Promise.all([
    getRelationshipInputs(id),
    getRelationshipStalenessInputs(id),
  ]);
  const result = await generateRelationshipSummary(
    id,
    {
      contactName: contact.displayName,
      category: contact.category,
      ...inputs,
    },
    stalenessKey,
  );
  if (!result) {
    throw new ApiError("llm_not_configured", 503);
  }
  return NextResponse.json(result);
});
