-- Global search indexes (speed only — search is correct without them).
--
-- This project applies migrations by hand (see 0002/0004), so run this once in
-- the Supabase SQL editor during a quiet minute. Every statement is additive
-- and idempotent (IF NOT EXISTS).
--
-- The GIN indexes below match the inline full-text expressions in
-- lib/search/queries.ts exactly, so Postgres can use them instead of scanning
-- the email/message/note bodies. Plain CREATE INDEX briefly locks writes while
-- it builds; on a very large emails/messages table you can instead run each
-- statement on its own with CREATE INDEX CONCURRENTLY (which must NOT run inside
-- a transaction — paste those one at a time, not as a batch).

-- Trigram extension: makes ILIKE '%name%' on contacts index-assisted.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_display_name_trgm_idx" ON "contacts" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint

-- Full-text (mentions) — one expression GIN index per searched text source.
CREATE INDEX IF NOT EXISTS "notes_body_fts_idx" ON "notes" USING gin (to_tsvector('english', coalesce("body", '')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_fts_idx" ON "emails" USING gin (to_tsvector('english', coalesce("subject", '') || ' ' || coalesce("body", '')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_body_fts_idx" ON "messages" USING gin (to_tsvector('english', coalesce("body", '')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_threads_summary_fts_idx" ON "email_threads" USING gin (to_tsvector('english', coalesce("summary", '')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_summary_fts_idx" ON "message_threads" USING gin (to_tsvector('english', coalesce("summary", '')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationship_summaries_body_fts_idx" ON "relationship_summaries" USING gin (to_tsvector('english', coalesce("body", '')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_fts_idx" ON "calendar_events" USING gin (to_tsvector('english', coalesce("title", '') || ' ' || coalesce(array_to_string("attendees", ' '), '')));
