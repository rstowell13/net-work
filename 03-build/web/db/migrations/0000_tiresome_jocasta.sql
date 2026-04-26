CREATE TYPE "public"."cadence_window" AS ENUM('week', 'month', 'quarter');--> statement-breakpoint
CREATE TYPE "public"."call_direction" AS ENUM('inbound', 'outbound', 'missed');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('personal', 'business', 'both');--> statement-breakpoint
CREATE TYPE "public"."email_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."followup_source" AS ENUM('manual', 'extracted');--> statement-breakpoint
CREATE TYPE "public"."followup_status" AS ENUM('open', 'done', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."freshness_label" AS ENUM('fresh', 'warm', 'fading', 'cold', 'dormant');--> statement-breakpoint
CREATE TYPE "public"."import_run_status" AS ENUM('running', 'success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."merge_confidence" AS ENUM('exact', 'high', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."merge_status" AS ENUM('pending', 'approved', 'split', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('imessage', 'sms');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."plan_item_source" AS ENUM('suggestions_flow', 'add_to_this_week');--> statement-breakpoint
CREATE TYPE "public"."plan_item_status" AS ENUM('not_yet_reached', 'reached', 'connected');--> statement-breakpoint
CREATE TYPE "public"."score_kind" AS ENUM('freshness');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('apple_contacts', 'google_contacts', 'gmail', 'google_calendar', 'linkedin_csv', 'mac_agent');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('not_connected', 'connected', 'needs_reauth', 'error');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('active', 'never');--> statement-breakpoint
CREATE TYPE "public"."theme_preference" AS ENUM('auto', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."triage_status" AS ENUM('to_triage', 'kept', 'skipped');--> statement-breakpoint
CREATE TABLE "agent_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cadence_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_per_week" integer DEFAULT 5 NOT NULL,
	"personal_pct" integer DEFAULT 60 NOT NULL,
	"min_days_since_last_contact" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cadence_rules_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"attendees" text[],
	"self_attended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid,
	"external_id" text NOT NULL,
	"direction" "call_direction" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_tags" (
	"contact_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_tags_contact_id_tag_id_pk" PRIMARY KEY("contact_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"photo_url" text,
	"primary_phone" text,
	"primary_email" text,
	"linkedin_url" text,
	"category" "category",
	"triage_status" "triage_status" DEFAULT 'to_triage' NOT NULL,
	"suggestion_status" "suggestion_status" DEFAULT 'active' NOT NULL,
	"merge_notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"external_thread_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"summary_generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid,
	"thread_id" uuid,
	"external_id" text NOT NULL,
	"direction" "email_direction" NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"subject" text,
	"body" text,
	"from_email" text,
	"to_emails" text[],
	"cc_emails" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"text" text NOT NULL,
	"source" "followup_source" DEFAULT 'manual' NOT NULL,
	"status" "followup_status" DEFAULT 'open' NOT NULL,
	"snooze_until" timestamp with time zone,
	"done_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "import_run_status" DEFAULT 'running' NOT NULL,
	"records_seen" integer DEFAULT 0 NOT NULL,
	"records_new" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "merge_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"raw_contact_ids" uuid[] NOT NULL,
	"confidence" "merge_confidence" NOT NULL,
	"signals" jsonb,
	"status" "merge_status" DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resulting_contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"summary_generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid,
	"thread_id" uuid,
	"external_id" text NOT NULL,
	"direction" "message_direction" NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"body" text,
	"channel" "message_channel" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"contact_id" uuid,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"name" text,
	"emails" text[],
	"phones" text[],
	"linkedin_url" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationship_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"body" text NOT NULL,
	"model" text NOT NULL,
	"inputs_hash" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" "score_kind" NOT NULL,
	"value" integer NOT NULL,
	"label" "freshness_label",
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" "score_kind" NOT NULL,
	"value" integer NOT NULL,
	"label" "freshness_label",
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inputs_summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"status" "source_status" DEFAULT 'not_connected' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestion_state" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"last_suggested_at" timestamp with time zone,
	"last_dismissed_at" timestamp with time zone,
	"dismiss_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_cadence_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"target_count" integer NOT NULL,
	"window" "cadence_window" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"theme_preference" "theme_preference" DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weekly_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" "plan_item_status" DEFAULT 'not_yet_reached' NOT NULL,
	"reached_at" timestamp with time zone,
	"connected_at" timestamp with time zone,
	"source" "plan_item_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cadence_rules" ADD CONSTRAINT "cadence_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tags" ADD CONSTRAINT "contact_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_thread_id_email_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."email_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_candidates" ADD CONSTRAINT "merge_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_candidates" ADD CONSTRAINT "merge_candidates_resulting_contact_id_contacts_id_fk" FOREIGN KEY ("resulting_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_contacts" ADD CONSTRAINT "raw_contacts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_contacts" ADD CONSTRAINT "raw_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_summaries" ADD CONSTRAINT "relationship_summaries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_history" ADD CONSTRAINT "score_history_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_state" ADD CONSTRAINT "suggestion_state_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_cadence_rules" ADD CONSTRAINT "tag_cadence_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_cadence_rules" ADD CONSTRAINT "tag_cadence_rules_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_contact_external_uniq" ON "calendar_events" USING btree ("contact_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "call_logs_external_uniq" ON "call_logs" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "call_logs_contact_started_idx" ON "call_logs" USING btree ("contact_id","started_at");--> statement-breakpoint
CREATE INDEX "contacts_user_triage_idx" ON "contacts" USING btree ("user_id","triage_status");--> statement-breakpoint
CREATE INDEX "contacts_user_category_idx" ON "contacts" USING btree ("user_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "email_threads_external_uniq" ON "email_threads" USING btree ("external_thread_id");--> statement-breakpoint
CREATE INDEX "email_threads_contact_ended_idx" ON "email_threads" USING btree ("contact_id","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "emails_external_uniq" ON "emails" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "follow_ups_contact_status_idx" ON "follow_ups" USING btree ("contact_id","status");--> statement-breakpoint
CREATE INDEX "merge_candidates_user_status_idx" ON "merge_candidates" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "message_threads_contact_ended_idx" ON "message_threads" USING btree ("contact_id","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_external_uniq" ON "messages" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "messages_contact_sent_idx" ON "messages" USING btree ("contact_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_contacts_source_external_uniq" ON "raw_contacts" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "raw_contacts_contact_idx" ON "raw_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "relationship_summaries_contact_idx" ON "relationship_summaries" USING btree ("contact_id","generated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scores_contact_kind_uniq" ON "scores" USING btree ("contact_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_user_kind_uniq" ON "sources" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_name_uniq" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plan_items_plan_contact_uniq" ON "weekly_plan_items" USING btree ("plan_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_plans_user_week_uniq" ON "weekly_plans" USING btree ("user_id","iso_year","iso_week");