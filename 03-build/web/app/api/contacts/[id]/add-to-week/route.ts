import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { commitPlan } from "@/lib/weekly-plan";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await context.params;
  const result = await commitPlan(user.id, [id], "add_to_this_week");
  return NextResponse.json(result);
}
