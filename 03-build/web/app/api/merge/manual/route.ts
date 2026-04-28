import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { manualMerge } from "@/lib/merge/apply";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await requireUser();
  const body = (await req.json().catch(() => ({}))) as {
    rawContactIds?: string[];
  };
  if (!body.rawContactIds || body.rawContactIds.length < 2) {
    return NextResponse.json(
      { error: "rawContactIds must contain at least two IDs" },
      { status: 400 },
    );
  }
  try {
    const result = await manualMerge(user.id, body.rawContactIds);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 400 },
    );
  }
}
