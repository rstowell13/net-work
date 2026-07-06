import { NextResponse } from "next/server";
import { handleApi, requireOwnedContact, requireUserApi } from "@/lib/api";
import { refreshContactThreadSummaries } from "@/lib/llm/thread-summaries";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = handleApi(async (
  _req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  await requireOwnedContact(user.id, id);

  const result = await refreshContactThreadSummaries(id);
  return NextResponse.json(result);
});
