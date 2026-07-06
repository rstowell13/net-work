-- Performance indexes for the hottest query paths (2026-07 audit).
--
-- Applied by hand (see 0002/0004/0005). Every statement is additive and
-- idempotent (IF NOT EXISTS). Plain CREATE INDEX briefly locks writes; on a
-- very large table run the statement alone as CREATE INDEX CONCURRENTLY
-- (outside a transaction) instead.
--
-- These match the predicates in lib/contacts/queries.ts (aggregates),
-- lib/diary.ts, lib/llm/thread-summaries.ts, and lib/relink.ts.

-- emails: largest table, previously had ONLY the external-id unique index.
CREATE INDEX IF NOT EXISTS "emails_contact_sent_idx" ON "emails" ("contact_id", "sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_thread_idx" ON "emails" ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emails_from_email_idx" ON "emails" ("from_email");--> statement-breakpoint

-- messages: thread lookups (thread summaries, relink cascades).
CREATE INDEX IF NOT EXISTS "messages_thread_idx" ON "messages" ("thread_id");--> statement-breakpoint

-- calendar_events: diary / triage preview / relink read by contact.
CREATE INDEX IF NOT EXISTS "calendar_events_contact_starts_idx" ON "calendar_events" ("contact_id", "starts_at");--> statement-breakpoint

-- Partial "dangling rows" indexes: relink scans SELECT ... WHERE contact_id IS
-- NULL on all five diary tables; these keep those scans bounded as the tables
-- grow (gmail-derived rows that never match a contact accumulate forever).
CREATE INDEX IF NOT EXISTS "emails_dangling_idx" ON "emails" ("from_email") WHERE "contact_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_dangling_idx" ON "messages" ("thread_id") WHERE "contact_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_threads_dangling_idx" ON "message_threads" ("handle") WHERE "contact_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_logs_dangling_idx" ON "call_logs" ("handle") WHERE "contact_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_dangling_idx" ON "calendar_events" ("starts_at") WHERE "contact_id" IS NULL;
