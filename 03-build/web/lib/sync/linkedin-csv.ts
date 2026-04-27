/**
 * Sync LinkedIn CSV export → raw_contacts rows.
 *
 * The standard LinkedIn export has columns:
 *   First Name, Last Name, URL, Email Address, Company, Position, Connected On
 *
 * We treat each row as one contact, keyed by their LinkedIn profile URL
 * (the only stable identifier across exports).
 *
 * Refs: ROADMAP M2.6
 */
import Papa from "papaparse";
import { db } from "@/lib/db";
import { rawContacts } from "@/db/schema";
import { runImport, type ImportCounters } from "./run";

type LinkedInRow = {
  "First Name"?: string;
  "Last Name"?: string;
  URL?: string;
  "Email Address"?: string;
  Company?: string;
  Position?: string;
  "Connected On"?: string;
};

export type ParseResult = {
  rows: LinkedInRow[];
  errors: { line: number; message: string }[];
};

/**
 * Parse a LinkedIn CSV export. The export commonly has a few "Notes:"
 * preamble lines before the actual header row — Papa's `header: true`
 * will mis-parse those. We strip leading non-header lines defensively.
 */
export function parseLinkedinCsv(text: string): ParseResult {
  // Find the line that starts with "First Name,"
  const lines = text.split(/\r?\n/);
  let headerLineIdx = lines.findIndex((l) =>
    l.toLowerCase().startsWith("first name,"),
  );
  if (headerLineIdx === -1) {
    return {
      rows: [],
      errors: [
        {
          line: 0,
          message:
            'Could not find "First Name," header row. Is this a LinkedIn export?',
        },
      ],
    };
  }
  const cleaned = lines.slice(headerLineIdx).join("\n");

  const result = Papa.parse<LinkedInRow>(cleaned, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const errors = result.errors.map((e) => ({
    line: (e.row ?? 0) + headerLineIdx + 1,
    message: e.message,
  }));
  return { rows: result.data, errors };
}

export async function importLinkedinCsv(args: {
  sourceId: string;
  csvText: string;
}) {
  return runImport({
    sourceId: args.sourceId,
    fn: async (counters: ImportCounters) => {
      const { rows, errors } = parseLinkedinCsv(args.csvText);
      if (errors.length > 0) {
        // Log but continue if we got data; throw if we got nothing
        if (rows.length === 0) {
          throw new Error(
            `LinkedIn CSV parse failed: ${errors.slice(0, 3).map((e) => `line ${e.line}: ${e.message}`).join("; ")}`,
          );
        }
      }

      for (const row of rows) {
        counters.recordsSeen += 1;

        const url = row.URL?.trim();
        if (!url) continue; // skip rows without a profile URL — no stable id

        const externalId = url; // canonical
        const name = `${row["First Name"] ?? ""} ${row["Last Name"] ?? ""}`.trim() || null;
        const email = row["Email Address"]?.toLowerCase().trim() || null;

        const upserted = await db
          .insert(rawContacts)
          .values({
            sourceId: args.sourceId,
            externalId,
            payload: row as Record<string, unknown>,
            name,
            emails: email ? [email] : [],
            phones: [],
            linkedinUrl: url,
            avatarUrl: null,
          })
          .onConflictDoUpdate({
            target: [rawContacts.sourceId, rawContacts.externalId],
            set: {
              payload: row as Record<string, unknown>,
              name,
              emails: email ? [email] : [],
              linkedinUrl: url,
              updatedAt: new Date(),
            },
          })
          .returning({ id: rawContacts.id, createdAt: rawContacts.createdAt });

        if (upserted[0]) {
          const wasNew =
            upserted[0].createdAt &&
            Date.now() - upserted[0].createdAt.getTime() < 5_000;
          if (wasNew) counters.recordsNew += 1;
          else counters.recordsUpdated += 1;
        }
      }
    },
  });
}
