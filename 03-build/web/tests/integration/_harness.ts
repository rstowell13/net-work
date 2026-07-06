/**
 * Integration test harness: connects to TEST_DATABASE_URL, applies the schema
 * by replaying db/migrations/*.sql (the project's migrations are hand-applied
 * — see README.md "Migrations" — so replaying the files IS the schema setup,
 * same as production), truncates all tables between tests, and provides
 * fixture helpers for the destructive-path suites.
 *
 * NOT imported by any lib module — this file owns its own postgres-js
 * connection so tests can truncate/seed directly, separate from the `db`
 * proxy that application code under test uses (which points at the same
 * database via DATABASE_URL, set in _setup.ts).
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../db/migrations");

// Applied in order; skips the meta/ snapshot dir (not SQL) and 0009 (a
// deferred DROP TABLE for tables this app never uses — applying it would
// just be extra work, and it's explicitly gated to run post-deploy in prod).
const SKIP_FILES = new Set(["0009_drop_dead_tables.sql"]);

let sql: ReturnType<typeof postgres> | undefined;

export function getTestSql(): ReturnType<typeof postgres> {
  if (sql) return sql;
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set — the integration suite should have been skipped.",
    );
  }
  sql = postgres(url, { max: 5 });
  return sql;
}

/**
 * Apply every migration file in order against a fresh database. Idempotent
 * migrations (IF NOT EXISTS everywhere) make this safe to call once per test
 * run against an empty disposable Postgres.
 *
 * 0005_search_indexes.sql creates the pg_trgm extension and depends on it for
 * a trigram index; a vanilla Postgres image ships the contrib module but some
 * minimal images don't. Its failure is treated as non-fatal (logged, not
 * thrown) since none of the integration tests exercise ILIKE trigram search —
 * they exercise the destructive write paths.
 *
 * Skips entirely if the schema already looks applied (`users` table exists)
 * — CI's postgres:17 service container is fresh every run, but a developer
 * reusing the same disposable Postgres across local runs would otherwise hit
 * "type already exists" from the enum CREATE TYPE statements, which (unlike
 * the CREATE TABLE/INDEX statements) aren't written with an idempotent guard.
 */
export async function applyMigrations(): Promise<void> {
  const db = getTestSql();

  const [{ exists }] = await db<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS exists
  `;
  if (exists) return;

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !SKIP_FILES.has(f))
    .sort();

  for (const file of files) {
    const full = path.join(MIGRATIONS_DIR, file);
    const raw = fs.readFileSync(full, "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        await db.unsafe(statement);
      } catch (err) {
        if (file === "0005_search_indexes.sql") {
          // pg_trgm may not be available (or the trigram index it backs) on a
          // minimal Postgres image — non-fatal per the harness contract.
           
          console.warn(
            `[integration] 0005_search_indexes.sql statement failed (non-fatal): ${(err as Error).message}`,
          );
          continue;
        }
        throw new Error(
          `Migration ${file} failed on statement:\n${statement}\n\n${(err as Error).message}`,
        );
      }
    }
  }
}

// Truncate in FK-safe order (children before parents); CASCADE covers
// anything missed. Kept as an explicit list (rather than introspecting
// information_schema) so the harness stays simple and readable.
const TABLES_IN_TRUNCATE_ORDER = [
  "weekly_plan_items",
  "weekly_plans",
  "suggestion_state",
  "relationship_summaries",
  "contact_tags",
  "tags",
  "follow_ups",
  "notes",
  "messages",
  "message_threads",
  "emails",
  "email_threads",
  "call_logs",
  "calendar_events",
  "merge_candidates",
  "raw_contacts",
  "contacts",
  "agent_tokens",
  "oauth_tokens",
  "import_runs",
  "sources",
  "cadence_rules",
  "triage_rules",
  "tag_cadence_rules",
  "users",
];

export async function truncateAll(): Promise<void> {
  const db = getTestSql();
  const list = TABLES_IN_TRUNCATE_ORDER.map((t) => `"${t}"`).join(", ");
  await db.unsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function closeTestSql(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = undefined;
  }
}

// ============================================================
// Fixture helpers
// ============================================================

export async function createUser(overrides: { email?: string } = {}) {
  const db = getTestSql();
  const email = overrides.email ?? `user-${crypto.randomUUID()}@example.com`;
  const [row] = await db`
    INSERT INTO users (email) VALUES (${email}) RETURNING id, email
  `;
  return row as { id: string; email: string };
}

export async function createSource(
  userId: string,
  overrides: {
    kind?: string;
    accountEmail?: string;
    status?: string;
  } = {},
) {
  const db = getTestSql();
  const kind = overrides.kind ?? "mac_agent";
  const accountEmail = overrides.accountEmail ?? "";
  const status = overrides.status ?? "connected";
  const [row] = await db`
    INSERT INTO sources (user_id, kind, account_email, status)
    VALUES (${userId}, ${kind}, ${accountEmail}, ${status})
    RETURNING id, kind
  `;
  return row as { id: string; kind: string };
}

export async function createRawContact(
  sourceId: string,
  overrides: {
    externalId?: string;
    contactId?: string | null;
    name?: string | null;
    emails?: string[];
    phones?: string[];
    linkedinUrl?: string | null;
    avatarUrl?: string | null;
  } = {},
) {
  const db = getTestSql();
  const externalId = overrides.externalId ?? crypto.randomUUID();
  const name = overrides.name ?? null;
  const emails = overrides.emails ?? [];
  const phones = overrides.phones ?? [];
  const linkedinUrl = overrides.linkedinUrl ?? null;
  const avatarUrl = overrides.avatarUrl ?? null;
  const contactId = overrides.contactId ?? null;
  const [row] = await db`
    INSERT INTO raw_contacts (
      source_id, contact_id, external_id, payload, name, emails, phones,
      linkedin_url, avatar_url
    ) VALUES (
      ${sourceId}, ${contactId}, ${externalId}, ${db.json({})}, ${name},
      ${emails}, ${phones}, ${linkedinUrl}, ${avatarUrl}
    )
    RETURNING id, source_id, external_id
  `;
  return row as { id: string; source_id: string; external_id: string };
}

export async function createContact(
  userId: string,
  overrides: {
    displayName?: string;
    primaryEmail?: string | null;
    primaryPhone?: string | null;
    deletedAt?: Date | null;
  } = {},
) {
  const db = getTestSql();
  const displayName = overrides.displayName ?? "Unknown";
  const primaryEmail = overrides.primaryEmail ?? null;
  const primaryPhone = overrides.primaryPhone ?? null;
  const deletedAt = overrides.deletedAt ?? null;
  const [row] = await db`
    INSERT INTO contacts (user_id, display_name, primary_email, primary_phone, deleted_at)
    VALUES (${userId}, ${displayName}, ${primaryEmail}, ${primaryPhone}, ${deletedAt})
    RETURNING id, display_name
  `;
  return row as { id: string; display_name: string };
}

export async function createMergeCandidate(
  userId: string,
  rawContactIds: string[],
  overrides: { confidence?: string; status?: string } = {},
) {
  const db = getTestSql();
  const confidence = overrides.confidence ?? "high";
  const status = overrides.status ?? "pending";
  const [row] = await db`
    INSERT INTO merge_candidates (user_id, raw_contact_ids, confidence, status)
    VALUES (${userId}, ${rawContactIds}, ${confidence}, ${status})
    RETURNING id, status
  `;
  return row as { id: string; status: string };
}

export async function createMessageThread(overrides: {
  handle?: string | null;
  contactId?: string | null;
  externalThreadId?: string;
  isGroup?: boolean;
  participantHandles?: string[] | null;
  startedAt?: Date;
  endedAt?: Date;
} = {}) {
  const db = getTestSql();
  const handle = overrides.handle ?? null;
  const contactId = overrides.contactId ?? null;
  const externalThreadId = overrides.externalThreadId ?? crypto.randomUUID();
  const isGroup = overrides.isGroup ?? false;
  const participantHandles = overrides.participantHandles ?? null;
  const startedAt = overrides.startedAt ?? new Date();
  const endedAt = overrides.endedAt ?? new Date();
  const [row] = await db`
    INSERT INTO message_threads (
      handle, contact_id, external_thread_id, is_group, participant_handles,
      started_at, ended_at
    ) VALUES (
      ${handle}, ${contactId}, ${externalThreadId}, ${isGroup}, ${participantHandles},
      ${startedAt}, ${endedAt}
    )
    RETURNING id, handle, contact_id
  `;
  return row as { id: string; handle: string | null; contact_id: string | null };
}

export async function getContact(id: string) {
  const db = getTestSql();
  const [row] = await db`SELECT * FROM contacts WHERE id = ${id}`;
  return row as Record<string, unknown> | undefined;
}

export async function getMergeCandidate(id: string) {
  const db = getTestSql();
  const [row] = await db`SELECT * FROM merge_candidates WHERE id = ${id}`;
  return row as Record<string, unknown> | undefined;
}
