/**
 * LinkedIn CSV upload — multipart/form-data with a "file" field.
 * Creates the linkedin_csv Source row if one doesn't exist, then ingests.
 *
 * Refs: ROADMAP M2.6
 */
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { upsertSource } from "@/lib/sources";
import { importLinkedinCsv } from "@/lib/sync/linkedin-csv";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireUser();

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field." },
      { status: 400 },
    );
  }

  // 5MB cap — LinkedIn exports are typically <500KB.
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File too large (>5MB)." },
      { status: 413 },
    );
  }

  const csvText = await file.text();

  const source = await upsertSource({
    userId: user.id,
    kind: "linkedin_csv",
    status: "connected",
    config: { lastFilename: file.name, lastFileBytes: file.size },
  });

  const result = await importLinkedinCsv({
    sourceId: source.id,
    csvText,
  });

  return NextResponse.json(result);
}
