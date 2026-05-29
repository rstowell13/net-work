-- Phase 2: allow multiple Google accounts per user.
-- Re-key the sources unique index from (user_id, kind) to
-- (user_id, kind, account_email). account_email is "" for single-account
-- sources (mac_agent, linkedin_csv) and the Google account email otherwise.
ALTER TABLE "sources" ADD COLUMN "account_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "sources" SET "account_email" = lower("config"->>'google_email') WHERE "config"->>'google_email' IS NOT NULL;--> statement-breakpoint
DROP INDEX "sources_user_kind_uniq";--> statement-breakpoint
CREATE UNIQUE INDEX "sources_user_kind_account_uniq" ON "sources" USING btree ("user_id","kind","account_email");
