ALTER TABLE "message_threads" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "message_threads" ADD COLUMN "external_thread_id" text;--> statement-breakpoint
ALTER TABLE "call_logs" ADD COLUMN "handle" text;--> statement-breakpoint
CREATE UNIQUE INDEX "message_threads_external_uniq" ON "message_threads" USING btree ("external_thread_id");--> statement-breakpoint
CREATE INDEX "message_threads_handle_idx" ON "message_threads" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "call_logs_handle_idx" ON "call_logs" USING btree ("handle");
