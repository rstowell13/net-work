# net-work

A personal CRM: it pulls your contacts, email, calendar, iMessages, and call
history from Google + your Mac into one place, merges duplicates, and
surfaces a weekly plan of who to reach out to — so keeping up with the
people you care about doesn't depend on remembering to.

## Local setup

```bash
npm ci
cp .env.example .env.local   # then fill in real values, see below
npm run dev
```

Open http://localhost:3000.

## Environment variables

See `.env.example` for the full list with inline comments. Validated centrally
in `lib/env.ts` — required vars throw a precise error at first *runtime* use
(never at build time, so `npm run build` succeeds even with none set).

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (Supabase). |
| `DATABASE_URL_POOLED` | yes | Same DB via Supabase's transaction-mode pooler (port 6543). Preferred at runtime — far higher concurrency under serverless than the session-mode pooler. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. Public — also used by the browser client. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key. Public. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | yes | One Google Cloud OAuth app grants Contacts + Gmail + Calendar in a single consent flow. |
| `APP_OWNER_EMAIL` | yes | The only email allowed to sign in — this is a single-user app. |
| `CRON_SECRET` | yes | Shared secret Vercel Cron sends as `Authorization: Bearer <value>` to `/api/cron/rebuild`. |
| `OPENROUTER_API_KEY` | no | LLM-backed features (thread/relationship summaries) degrade gracefully when unset — no crash, just no summaries. |
| `OPENROUTER_MODEL` | no | Defaults to `deepseek/deepseek-chat`. |
| `OPENROUTER_FALLBACK_MODELS` | no | Comma-separated fallback model ids, tried in order if the primary fails. |
| `SENTRY_DSN` | no | Sentry is a complete no-op (no init, no network calls) when unset. |

## Supabase setup

1. Create a project at supabase.com.
2. Grab the project URL + anon key (Project Settings → API) for
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Grab both connection strings (Project Settings → Database):
   the direct/session-mode string for `DATABASE_URL`, and the
   transaction-mode pooler string (port 6543) for `DATABASE_URL_POOLED`.
4. Auth → Providers: magic-link email is enough (single user, gated by
   `APP_OWNER_EMAIL` in `lib/auth.ts`).
5. Schema: see **Migrations** below — do not `drizzle-kit push`.

## Google OAuth app setup

1. Google Cloud Console → create a project (or reuse one) → APIs & Services
   → OAuth consent screen → External, add yourself as a test user (or
   publish once verified).
2. Enable the People API, Gmail API, and Calendar API.
3. Credentials → Create OAuth client ID → Web application.
4. Authorized redirect URI: `https://<your-domain>/api/auth/google/callback`
   (and `http://localhost:3000/api/auth/google/callback` for local dev —
   add both, one per environment).
5. Copy the client ID/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`;
   set `GOOGLE_REDIRECT_URI` to match whichever redirect URI that
   environment uses.

## Migrations — hand-applied, CRITICAL

Migrations in `db/migrations/` are applied **by hand** via the Supabase SQL
editor (or the Supabase MCP `apply_migration` / `execute_sql` tools) —
**never run `drizzle-kit push`.** It drops the hand-made full-text-search
and trigram indexes added in `0005_search_indexes.sql` (Postgres GIN/trgm
indexes that Drizzle's schema introspection doesn't fully round-trip), and
`db:push` will happily "fix" the drift by dropping them.

Workflow for a schema change:
1. Write the SQL migration by hand as the next numbered file in
   `db/migrations/` (e.g. `0008_whatever.sql`).
2. Apply it directly against the database (Supabase SQL editor or MCP).
3. Update `db/schema.ts` to match, where Drizzle can express it — some
   things (custom GIN/trgm indexes) only exist in the SQL file.
4. `npm run db:generate` is fine to review what Drizzle *thinks* the diff
   is, but do not apply it with `db:push`.

## Vercel cron

`vercel.json` schedules `GET /api/cron/rebuild` daily at 09:00 UTC. The
route authenticates via `Authorization: Bearer $CRON_SECRET` (Vercel sends
this automatically for configured cron jobs once `CRON_SECRET` — actually
the project's own env var, matched inside the route — is set in the
Vercel project's environment variables). It runs one bounded pass of the
sync/merge/rebuild pipeline per invocation (kept under the 60s function
limit); the in-app "Sync & rebuild" button on Settings → Sources loops the
same pipeline for an immediate full catch-up.

## Tests

```bash
npx vitest run      # or: npm test
npx vitest           # watch mode
npx tsc --noEmit     # type check
npm run lint         # eslint
```

CI (`.github/workflows/ci.yml`) runs lint, type check, tests, and build on
every PR and on push to `main`.

## Integration tests

The unit suite above only covers pure functions. A separate suite
(`tests/integration/`, config `vitest.integration.config.ts`) exercises the
destructive, DB-touching paths against a real Postgres: the merge engine
(`lib/merge/apply.ts`), relink (`lib/relink.ts`), and the mac-agent ingest
pipelines (`lib/sync/mac-agent.ts`). It's excluded from the default `npx
vitest run` / CI's main job — run it explicitly:

```bash
# 1. Start a disposable Postgres, e.g. one of:
supabase start                                              # Supabase CLI (needs Docker)
docker run -d -p 54329:5432 -e POSTGRES_PASSWORD=test postgres:17

# 2. Point at it and create the pg_trgm extension it opportunistically uses
#    (harness treats a missing extension as non-fatal, but creating it first
#    avoids the warning):
psql "postgres://postgres:test@localhost:54329/postgres" -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'

# 3. Run the suite
export TEST_DATABASE_URL="postgres://postgres:test@localhost:54329/postgres"
npm run test:integration
```

The suite applies every file in `db/migrations/` (in order, skipping
`0009_drop_dead_tables.sql`, a deferred post-deploy drop) against
`TEST_DATABASE_URL` and truncates all tables between tests. If
`TEST_DATABASE_URL` is unset, the whole suite is skipped with a clear message
— it's safe to run `npm test` / `npm run test:integration` with no database
configured.
