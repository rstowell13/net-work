-- Drop never-written tables (2026-07 audit).
--
-- !! DO NOT APPLY until the audit-hardening deploy is live !!
-- The PREVIOUS deployed code LEFT JOINs "scores" in global search; dropping
-- these tables before that code is replaced breaks live search.
--
-- Evidence (audit 2026-07-06): no app code ever INSERTs into scores,
-- score_history, or sessions. Auth sessions live in Supabase Auth; freshness
-- is computed on the fly (lib/scoring/freshness.ts). Verify row counts are 0
-- before applying.

DROP TABLE IF EXISTS "score_history";--> statement-breakpoint
DROP TABLE IF EXISTS "scores";--> statement-breakpoint
DROP TABLE IF EXISTS "sessions";--> statement-breakpoint
DROP TYPE IF EXISTS "score_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "freshness_label";
