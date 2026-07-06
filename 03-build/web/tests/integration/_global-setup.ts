/**
 * Vitest `globalSetup` — runs exactly ONCE for the whole integration run, in
 * a separate context from the per-file test modules (unlike `setupFiles`,
 * which vitest re-runs for every isolated test-file module). That makes it
 * the right place to apply migrations: `CREATE TYPE`/`CREATE TABLE` (no
 * `IF NOT EXISTS` on the enum types) would throw "already exists" if each
 * test file tried to apply them again in its own beforeAll.
 */
import { applyMigrations, closeTestSql } from "./_harness";

export async function setup() {
  if (!process.env.TEST_DATABASE_URL) return; // suite will skip itself
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await applyMigrations();
  await closeTestSql();
}
