import { NextResponse } from "next/server";
import { handleApi, requireUserApi } from "@/lib/api";
import { commitPlan } from "@/lib/weekly-plan";

export const runtime = "nodejs";

export const POST = handleApi(async (
  _req: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const user = await requireUserApi();
  const { id } = await context.params;
  const result = await commitPlan(user.id, [id], "add_to_this_week");
  return NextResponse.json(result);
});
