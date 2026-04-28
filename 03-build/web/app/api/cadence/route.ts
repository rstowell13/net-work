import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCadence, upsertCadence } from "@/lib/suggestions/candidates";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json(await getCadence(user.id));
}

export async function POST(req: Request) {
  const user = await requireUser();
  const body = (await req.json()) as Partial<{
    targetPerWeek: number;
    personalPct: number;
    minDaysSinceLastContact: number;
  }>;
  const next = await upsertCadence(user.id, body);
  return NextResponse.json(next);
}
