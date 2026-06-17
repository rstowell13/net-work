CREATE TABLE "triage_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"min_two_way" integer DEFAULT 1 NOT NULL,
	"min_total" integer DEFAULT 0 NOT NULL,
	"max_age_days" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "triage_rules_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "triage_rules" ADD CONSTRAINT "triage_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;