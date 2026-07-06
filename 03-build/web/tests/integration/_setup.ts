/**
 * Vitest `setupFiles` entry — runs once per test file, before that file's
 * module graph is imported. That makes it the last chance to set
 * `DATABASE_URL` before `lib/db.ts` (or anything that imports it) is
 * evaluated within THIS file. (Migrations are handled separately, once for
 * the whole run, in `_global-setup.ts` — vitest's `globalSetup` runs outside
 * per-file module isolation, which `setupFiles` does not.)
 *
 * lib/db.ts lazily reads DATABASE_URL_POOLED ?? DATABASE_URL on first query
 * (never at module-eval time), so setting DATABASE_URL here — before any
 * test file imports a lib module — is enough to point the whole suite at the
 * disposable test database. No connection-injection alias needed.
 */
if (!process.env.TEST_DATABASE_URL) {
   
  console.warn(
    "\n[integration] TEST_DATABASE_URL is not set — skipping the integration suite.\n" +
      "  Set it to a disposable Postgres connection string to run these tests.\n" +
      "  See README.md → 'Integration tests' for setup instructions.\n",
  );
} else {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
