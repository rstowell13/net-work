ALTER TABLE "message_threads" ADD COLUMN "is_group" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "message_threads" ADD COLUMN "group_chat_id" text;--> statement-breakpoint
ALTER TABLE "message_threads" ADD COLUMN "group_display_name" text;--> statement-breakpoint
ALTER TABLE "message_threads" ADD COLUMN "participant_handles" text[];--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "is_group" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender_handle" text;--> statement-breakpoint
CREATE INDEX "message_threads_contact_group_ended_idx" ON "message_threads" USING btree ("contact_id","is_group","ended_at");--> statement-breakpoint
CREATE INDEX "message_threads_participants_idx" ON "message_threads" USING gin ("participant_handles");