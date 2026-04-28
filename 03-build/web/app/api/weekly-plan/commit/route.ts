import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { commitPlan } from "@/lib/weekly-plan";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = (await req.json()) as {
    contactIds?: string[];
    source?: "suggestions_flow" | "add_to_this_week";
  };
  if (!body?.contactIds) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const result = await commitPlan(
    user.id,
    body.contactIds,
    body.source ?? "suggestions_flow",
  );
  return NextResponse.json(result);
}
