import { NextResponse } from "next/server";
import { ApiError, handleApi, requireUserApi } from "@/lib/api";
import { commitPlan } from "@/lib/weekly-plan";

export const runtime = "nodejs";

export const POST = handleApi(async (req: Request) => {
  const user = await requireUserApi();
  const body = (await req.json()) as {
    contactIds?: string[];
    source?: "suggestions_flow" | "add_to_this_week";
  };
  if (!body?.contactIds) {
    throw new ApiError("missing_fields", 400);
  }
  const result = await commitPlan(
    user.id,
    body.contactIds,
    body.source ?? "suggestions_flow",
  );
  return NextResponse.json(result);
});
