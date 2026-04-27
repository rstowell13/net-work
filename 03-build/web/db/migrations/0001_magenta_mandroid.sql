ALTER TABLE "calendar_events" DROP CONSTRAINT "calendar_events_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "email_threads" DROP CONSTRAINT "email_threads_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "message_threads" DROP CONSTRAINT "message_threads_contact_id_contacts_id_fk";
--> statement-breakpoint
DROP INDEX "calendar_events_contact_external_uniq";--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "contact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "email_threads" ALTER COLUMN "contact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message_threads" ALTER COLUMN "contact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_external_uniq" ON "calendar_events" USING btree ("external_id");