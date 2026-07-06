# net-work Audit Remediation — Orchestrated Execution Plan

## Context

A five-agent audit (2026-07-06) of the net-work codebase (`03-build/web` Next.js app + `03-build/mac-agent` Python agent) produced a prioritized findings report covering: confirmed bugs (incl. an unpatched Next.js middleware-bypass CVE where middleware IS the auth gate, an email-direction typo corrupting all LLM summaries, and the calendar-sync 504 root cause never actually fixed), redundancy/duplication, performance problems, and production-readiness gaps. Robb approved executing **Stages 1–3 + ops** (bug fixes, pipeline repairs, consolidation, CI/observability) now, **deferring multi-tenancy and privacy retrofit** until the go-to-market decision. Full findings are archived in memory: `~/.claude/projects/-Users-robbstowell-Projects-net-work/memory/codebase-audit-2026-07.md`.

**Approved decisions (do not re-ask):**
- Scope: Stages 1–3 + ops. NO multi-tenancy schema work in this run.
- Live DB: auto-apply everything — but see **DB sequencing rule** below (some steps must wait for deploy).
- Shipping: one integration branch → single PR to `main` for Robb's review at the end. Nothing merges to main without him.
- Sentry: fully wire it; runs as no-op until Robb pastes a DSN into Vercel (one manual step for him at the end).

## Orchestration model

- **Orchestrator** = the strongest model in the driving session (Fable 5 today; Opus 4.8 if resumed later). The orchestrator personally implements packages marked **[ORCH]** (subtle correctness work), reviews every subagent diff, merges packages, and runs the verification gate.
- **Sonnet subagents** implement packages marked **[SONNET]** — well-specified mechanical/medium work. Each package = one Agent-tool subagent with `isolation: worktree`, given the package spec below verbatim plus the acceptance criteria. Subagent commits its work in its worktree branch; orchestrator reviews the diff, merges into the integration branch, runs the gate.
- **Never delegate [ORCH] packages below the orchestrator model. Never delegate anything below Sonnet.**
- Run independent packages of a wave **in parallel** (multiple Agent calls in one message).

### Resume protocol (for Opus 4.8 or any later session)
1. Read this plan file top to bottom.
2. `git log --oneline` on branch `chore/audit-hardening` and read `03-build/EXECUTION_PLAN.md` in the repo (a committed copy of this file with live status checkboxes — P0 creates it; the repo copy is the source of truth for progress once it exists).
3. Continue from the first unchecked package, respecting waves and dependencies.
4. Update checkboxes in the repo copy as packages complete; commit the update with each merge.

### Branch & verification
- Integration branch: `chore/audit-hardening`, created from `origin/main` (P0). All packages merge here.
- **Verification gate** (must pass before every package merge, run in `03-build/web`):
  `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`
  Baseline before P1: lint has 2 known errors; 141 tests pass; tsc clean.
- Final delivery: one PR `chore/audit-hardening` → `main` with a plain-English summary for Robb.

### DB sequencing rule (critical — auto-apply ≠ apply immediately)
The live Vercel deployment runs OLD code until Robb merges the final PR. Therefore:
- **Apply now (additive, helps prod immediately):** new indexes (P2a).
- **Apply ONLY after the final PR is merged and deployed (P13 post-deploy checklist):**
  - `DROP TABLE scores, score_history, sessions` — currently-deployed search code LEFT JOINs `scores`; dropping early breaks live search.
  - Clearing cached thread/relationship summaries — regeneration must run against NEW code (with the direction-typo fix), not the deployed old code.
- Migrations are applied by hand via Supabase (MCP `apply_migration`/`execute_sql`) — NEVER `drizzle-kit push` (it drops the hand-made FTS indexes; see memory `drizzle-push-drops-fts-indexes`). Every DB change also gets a numbered SQL file in `db/migrations/` and, where Drizzle supports it, a matching `schema.ts` definition.

---

## Work packages

### WAVE 1 (parallel)

#### P0 [ORCH] Setup — no subagent
- Create `chore/audit-hardening` from `origin/main`.
- Commit a copy of this plan as `03-build/EXECUTION_PLAN.md` (add status checkboxes; this becomes the durable progress tracker).
- Run baseline verification gate; record results in the plan copy.

#### P1 [SONNET] Quick fixes & security patches
All in `03-build/web` unless noted.
- Bump `next` to latest 16.2.x (≥16.2.10 — middleware-bypass fix GHSA-26hh-7cqf-hhc6); run `npm audit fix`; verify build.
- Fix `"outgoing"` → `"outbound"` in `lib/llm/thread-summaries.ts:41`.
- Open-redirect guard in `app/auth/callback/route.ts`: only honor `next` if `next.startsWith("/") && !next.startsWith("//")`, else `/`.
- Fix 2 lint errors: `components/ThreadModal.tsx:209` (unescaped `'`), `lib/sync/linkedin-csv.ts:40` (`prefer-const`).
- Add `color-scheme: light` on `:root` and `color-scheme: dark` inside the dark-mode media block in `app/globals.css`.
- Constant-time compare for `CRON_SECRET` in `app/api/cron/rebuild/route.ts` (`crypto.timingSafeEqual`, length-guarded).
- Delete dead code: `lib/design-tokens.ts` (unused; contains WRONG freshness cutoffs), `components/PlaceholderPage.tsx`, `lib/merge/avatar-color.ts` shim (repoint importers e.g. `app/merge/page.tsx:5` to `@/lib/avatar-color`); remove `_unused` lint-shim variables in `lib/contacts/queries.ts:531` and `lib/suggestions/candidates.ts:186`; fix stale `initialKey` doc-comment in `lib/merge/nicknames.ts:6`.
- Acceptance: gate passes with **0 lint errors**; `npm audit` shows no high-severity issues.

#### P2 [ORCH] Database migration & schema-drift fix
- **P2a (apply to live DB now):** new migration `db/migrations/0008_perf_indexes.sql` + matching `schema.ts` index definitions:
  - `emails (contact_id, sent_at)`, `emails (thread_id)`, `emails (from_email)`
  - `messages (thread_id)`
  - `calendar_events (contact_id, starts_at)`
  - Partial indexes `WHERE contact_id IS NULL` on `emails`, `messages`, `message_threads`, `call_logs`, `calendar_events` (bounds the relink dangling scans).
  Apply via Supabase MCP with `CREATE INDEX CONCURRENTLY` semantics if table sizes warrant.
- **P2b (code + files only, DB step deferred to P13):** verify `scores`, `score_history`, `sessions` are empty/unwritten (audit says: no inserts anywhere); write `0009_drop_dead_tables.sql` (NOT applied yet); remove code refs: the always-NULL `scores` join + freshness tiebreak in `lib/search/queries.ts:156-165,206` (rank on `lastSeenAt` recency instead), the scores-migration block in `lib/merge/apply.ts:263-271`, and the three tables from `schema.ts`.
- **P2c:** move the 0005 FTS/trigram indexes into `schema.ts` as Drizzle expression indexes (`.using("gin", sql\`to_tsvector(...)\`)`); document the `pg_trgm` extension caveat in a comment + in `db/migrations/README` note. This defuses the `drizzle-kit push` footgun permanently.
- Acceptance: gate passes; `EXPLAIN` via Supabase confirms new indexes are used by a contact-page aggregate query.

#### P11 [SONNET] Ops & DX (independent files; safe alongside Wave 1)
- `.github/workflows/ci.yml`: on PR + push to main — `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build` (working-directory `03-build/web`).
- Error/loading surfaces: root `app/error.tsx`, `app/global-error.tsx`, and `loading.tsx` for the main route groups (home, contacts, merge, triage, follow-ups, suggestions, settings, search). Match existing visual language (CSS vars, serif headings).
- `lib/env.ts`: startup validation of all 12 env vars (fail fast with named-var error); import from `next.config.ts`; replace the `!` non-null assertions in `proxy.ts`. Commit `.env.example` listing every var with comments (no values).
- Sentry: `@sentry/nextjs` wired for server + client; entirely no-op when `SENTRY_DSN` unset; add DSN to `.env.example`.
- Replace `03-build/web/README.md` (currently create-next-app boilerplate) with real setup docs: Supabase, Google OAuth app, env vars, hand-applied-migrations workflow, cron. Update root `DEPLOYMENT.md` similarly.
- Staleness banner: in the app shell or home, show a dismissible banner when any source has `lastSyncError`/`needs_reauth`, or the mac-agent token's `lastSeenAt` > 48h. Reuse status logic from `app/settings/sources/page.tsx` / `components/MacAgentCard.tsx`.
- Acceptance: gate passes; CI file lints (actionlint not required — YAML sanity is enough); app builds with and without `SENTRY_DSN`.

### WAVE 2 (parallel, after P1+P2 merged)

#### P3 [SONNET, ORCH review mandatory] Sync pipeline repairs
- **Calendar rewrite** (`lib/sync/google-calendar.ts`): mirror the Gmail pattern from `lib/sync/gmail.ts` — `timeMin` watermark stored in `sources.config`, `TIME_BUDGET_MS` (~12s) checked per page, batched multi-row upserts for events/attendees/raw-contacts (batching pattern exists at `app/api/ingest/[kind]/route.ts:353-365`). No more one-INSERT-per-event/attendee.
- **Gmail bail fix** (`lib/sync/gmail.ts:162-167, 366-378`): when `bailedEarly` in incremental (`after:`) mode, do NOT advance `newest_synced_unix` (upserts are idempotent; re-listing is cheap). Backfill mode unchanged.
- **recordsNew via xmax**: replace the 5-second `createdAt` clock-skew heuristic (`gmail.ts:235-242`, `lib/sync/google-contacts.ts:106-112`, ingest route `:192`) with `RETURNING (xmax = 0) AS inserted` on the upserts.
- **Stale-run sweep** (`lib/sync/run.ts`): at sync start, mark any `import_runs` row for that source stuck `running` > 5 min as `failed` with error `interrupted`.
- Acceptance: gate passes; existing `tests/sync/*` green; add unit tests for the watermark-advance decision (extract as pure function like `rebuild-phase.ts`).

#### P4 [ORCH] Merge engine correctness + split
- Rebuild no-progress fallthrough (`lib/rebuild.ts:143-166`): if a merging pass applies 0 of >0 safe candidates, mark them `skipped` with the error in `signals` and proceed to finalize — never loop the identical batch.
- TOCTOU fix (`lib/merge/apply.ts:452-499`): claim step `UPDATE merge_candidates SET status='approved' WHERE id=$1 AND status='pending' RETURNING id`; bail if no row.
- Suppression semantics (`lib/merge/grouping.ts:67-69,145`): change split/skip suppression from exact sorted-id-set matching to **pair-level** suppression (record "raw A must not merge with raw B" edges), so new cluster members don't resurrect rejected groups. Preserve behavior verified by `tests/merge/grouping.test.ts` + new tests.
- Split `lib/merge/apply.ts` (846 lines) along existing function seams: `survivor.ts` (pure rank/pick — add unit tests), `move-content.ts` (curated-content moves), `apply.ts` (orchestration only). Pure re-organization; no behavior change beyond the fixes above.
- Acceptance: gate passes; new tests for pair suppression + survivor ranking; all existing merge tests green.

#### P10 [SONNET] Query-efficiency quick wins
- `lib/home.ts:35`: fetch this week's plan-item contact ids first; aggregate only those (not 2,000 contacts).
- `lib/merge/promote.ts:165-171` (`enrichAndPromote`): replace the full-table `emails` scan with a bounded query (`WHERE from_email = ANY($wanted) OR to_emails && $wanted`, or GROUP BY restricted to the wanted set) — relies on P2a's `from_email` index.
- `lib/contacts/queries.ts:251-308` (`listContacts`): apply the recency filter in SQL before LIMIT, not in JS after.
- Small: remove the dead double query in `lib/sync/google-contacts.ts:139-147`; narrow `getGmailSourceForUser` select (`lib/sync/gmail.ts:88-91`).
- Do NOT redesign triage aggregation (`getNextTriageContact`) in this run — depends on a score-persistence decision deferred with multi-tenancy.
- Acceptance: gate passes; behavior identical (same rows returned for listContacts given the filter fix is a *correctness* improvement — note it in the PR description).

### WAVE 3 (parallel, after Wave 2 merged)

#### P5 [ORCH] Relink unification & freshness consistency
- Extract one shared matcher (`matchHandle(handle, emailSet, phoneSet)` + single **lowercase-everywhere** policy) used by both `relinkContact` and `relinkAfterMerge` in `lib/relink.ts`; kill the case-sensitivity divergence (SQL `inArray` on raw-case vs JS `.toLowerCase()`). Prefer implementing `relinkContact` as `relinkAfterMerge` restricted to one contact's maps.
- Scope the ingest-path relink (`app/api/ingest/[kind]/route.ts:132-145`) to handles present in the posted batch instead of a full global dangling scan per batch.
- One freshness-inputs helper: extract `getFreshnessInputs(contactId)` (reusing `aggregateLastSeen`/`aggregateInteractions365` from `lib/contacts/queries.ts`) and use it on the contact detail page (`app/contacts/[id]/page.tsx:104-116`) so list and detail agree. Make the group-message/calendar-channel policy explicit in one place. Export the aggregate helpers so `lib/contacts/unknown-contacts.ts` and `lib/merge/promote.ts` can reuse them (dedup finding 3.6).
- Acceptance: gate passes; unit tests for `matchHandle` incl. mixed-case emails; freshness parity spot-check documented in PR.

#### P6 [SONNET] API route layer consolidation
- New `lib/api.ts`: `requireUserApi()` (401 JSON, not redirect), `requireOwnedContact(userId, contactId)` (the ownership guard copy-pasted in 10 route files), `jsonError(code, status)` helper (snake_case machine codes + optional message).
- Migrate all ~33 authed routes under `app/api/` to these helpers; keep `requireUser()` (redirect) for pages only.
- Stop leaking raw `(e as Error).message` in the 4 merge mutation routes (`app/api/merge/manual`, `merge/[id]/approve`, `merge/[id]/partition`, `contacts/[id]/merge`) — map thrown errors to codes.
- Normalize error vocabulary to snake_case codes across routes.
- Acceptance: gate passes; grep shows zero `requireUser()` in `app/api/`; spot-check 3 routes manually (auth 401 shape, ownership 404).

#### P8 [SONNET] Shared UI components & helpers
- Components: `<ContactHeader>` (one responsive component replacing the ~6 duplicated mobile+desktop header blocks in `components/TriageCard.tsx`, `components/SuggestionsFlow.tsx`, `app/contacts/[id]/page.tsx`), `<SourceChip>` (6 copies of the chip class cluster), `<PageContainer>` (6 copies of the wrapper div), shared `<SearchHitList>` used by both `app/search/page.tsx` and `components/GlobalSearch.tsx`. Use `<Avatar>` on the merge pages (replaces hand-rolled circles; restores photo rendering there).
- Helpers: `lib/format-time.ts` (`daysAgoLabel`, `fmtDate`, `fmtTime` — replaces 5 per-file copies); export `SOURCE_LABEL` from the search lib (2 copies); export `recencyDecay(days)` + the 180-day constant from `lib/scoring/freshness.ts` (consumed by `lib/search/queries.ts:88-94`); merge the two transcript builders in `lib/llm/thread-summaries.ts` into one parameterized builder; move `getTokenForSource` (3 verbatim copies) + `getSelfEmailFromSource` (2 copies) into `lib/google.ts`; typed `SourceConfig` accessor in `lib/sources.ts` for the `config` jsonb reach-ins; `scripts/_shared.ts` with `getOwner()` + `log()` for the 5 scripts.
- Visual-parity requirement: extracted components must match the current rendering (the TriageCard variant is the canonical one where copies drifted).
- Acceptance: gate passes; grep confirms the old duplicated blocks/helpers are gone; screenshot-level parity check on triage + contact detail via dev server if feasible.

### WAVE 4 (after Wave 3 merged)

#### P7 [SONNET] Mac-agent ingest extraction
- Extract the pipeline bodies (`ingestContacts`, `ingestMessages`, `ingestCalls`) from `app/api/ingest/[kind]/route.ts:154-366` into `lib/sync/mac-agent.ts` (mirror `lib/sync/gmail.ts` structure); route becomes auth + dispatch (~80 lines).
- Replace the O(messages × threads) scan (`:296-305`) with a prebuilt `external_id → thread` Map; convert per-row message/contact inserts to batched multi-row upserts (the calls path at `:353-365` is the model).
- Preserve the ingest API contract EXACTLY (deployed mac agents depend on it; there is no version handshake).
- Acceptance: gate passes; a contract test posting fixture batches to the route (with a test agent token) asserts identical DB effects — if a test DB isn't available, a pure-function test over the batch-transform logic is the fallback.

#### P9 [SONNET, ORCH review mandatory] Contact detail page refactor
- Add `getContactDetail(userId, contactId)` to `lib/contacts/queries.ts` consolidating the inline Drizzle queries from `app/contacts/[id]/page.tsx:42-98`; use P5's freshness helper.
- Move the relationship-summary LLM call out of the blocking RSC render (`:118-130`): render via `<Suspense>` streaming or client-fetch like `components/RefreshThreadSummaries.tsx`. Page paint must no longer wait on OpenRouter.
- Cheap staleness key: decide summary-cache validity from counts + `max(sent_at)` (one aggregate query) instead of hydrating up to 4,000 bodies per view (`lib/diary.ts:245-326` path); fetch bodies only on regeneration.
- Extract page-local helper components; target < 300 lines for the page file.
- Acceptance: gate passes; contact page renders without LLM env configured; summary streams in.

### WAVE 5

#### P12 [SONNET, stretch] Integration tests for the destructive paths
- Vitest integration suite (separate `vitest.integration.config.ts`, skipped when `TEST_DATABASE_URL` unset) against a disposable Postgres (Supabase CLI local or Docker) covering: `merge/apply` (applyCandidate, splitCandidate, mergeContacts, partition + content moves), `relink` (case-insensitivity, group handling), ingest contract.
- Wire into CI as an optional job if a service container is straightforward; otherwise document how to run locally.
- If time/complexity blows up, ship whatever subset is green and note the gap in the PR — do not block P13 on this.

#### P13 [ORCH] Final review, PR, post-deploy checklist
1. Fresh-eyes review: dispatch one reviewer subagent over the full integration diff (correctness focus) + orchestrator's own pass; fix findings.
2. Full verification gate + `npm audit`.
3. Open PR `chore/audit-hardening` → `main`. Body: plain-English summary for Robb (what was fixed, what he'll notice, the one Sentry step), grouped by user-visible impact. Include the standard Claude Code attribution.
4. **Post-deploy checklist (execute only after Robb merges and Vercel deploys; verify deployment first):**
   - Apply `0009_drop_dead_tables.sql` via Supabase (scores, score_history, sessions).
   - Clear cached summaries so they regenerate under the fixed direction logic: null the thread-summary fields (`summary`, `summary_message_count` or actual column names per schema) on message/email threads and delete `relationship_summaries` rows.
   - Smoke-check prod: search works, a contact page loads, triage card renders, Sources page shows healthy statuses.
   - Message Robb: done + the Sentry DSN instruction (create free account at sentry.io → project → copy DSN → Vercel env var `SENTRY_DSN` → redeploy).

---

## Explicitly OUT of scope this run (deferred with the market decision)
- Multi-tenancy retrofit (user_id on diary tables, composite uniques, scoped relink, signup, per-user cron).
- OAuth-token encryption, LLM-provider swap, account delete/export, Google CASA verification.
- Mac-agent packaging (signing/notarization/auto-update), version handshake, heartbeat.
- Triage aggregation redesign / score persistence.

## Status tracker (mirror in 03-build/EXECUTION_PLAN.md once P0 runs)
- [x] P0 setup · [x] P1 quick fixes (next 16.2.10, 0 high vulns) · [x] P2 DB migration (0008 APPLIED to live DB; 0009 written, deferred to post-deploy) · [x] P11 ops (CI, error surfaces, env, Sentry; orch fixed a prod db-caching bug in review)
- [x] P3 sync repairs (calendar watermark+batching rewrite, gmail incremental-bail fix, xmax recordsNew, stale-run sweep; 170 tests green) · [x] P4 merge engine (pair suppression, TOCTOU claims, rebuild loop guard, apply.ts split; 158 tests green) · [ ] P10 perf wins
- [x] P5 relink/freshness (shared pure matcher, case-proofed SQL, scoped ingest relink, unified freshness w/ group exclusion) · [ ] P6 route consolidation (agent running) · [x] P8 UI consolidation (ContactHeader/SourceChip/PageContainer/SearchHitList + shared helpers; 181 tests green)
- [ ] P7 ingest extraction · [ ] P9 contact page
- [ ] P12 integration tests (stretch) · [ ] P13 review + PR + post-deploy
