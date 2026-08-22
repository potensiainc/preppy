ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_status_check";--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "max_attempts" integer;--> statement-breakpoint
ALTER TABLE "outbox_events" ALTER COLUMN "max_attempts" SET DEFAULT 3;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "last_error_code" text;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "last_error_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "dead_lettered_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "outbox_events_due_claim_idx" ON "outbox_events" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_stale_recovery_idx" ON "outbox_events" USING btree ("status","locked_at") WHERE "outbox_events"."status" = 'PROCESSING';--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_dedupe_key_unique" ON "outbox_events" USING btree ("dedupe_key") WHERE "outbox_events"."dedupe_key" is not null;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_max_attempts_check" CHECK ("outbox_events"."max_attempts" is null or "outbox_events"."max_attempts" between 1 and 10);--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_locked_by_check" CHECK ("outbox_events"."locked_by" is null or (length("outbox_events"."locked_by") <= 128 and "outbox_events"."locked_by" ~ '[^[:space:]]'));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_last_error_code_check" CHECK ("outbox_events"."last_error_code" is null or (length("outbox_events"."last_error_code") <= 128 and "outbox_events"."last_error_code" ~ '^[A-Z0-9._:-]+$'));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_locked_pair_check" CHECK (("outbox_events"."locked_at" is null) = ("outbox_events"."locked_by" is null));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_processing_lock_check" CHECK ("outbox_events"."status" <> 'PROCESSING' or ("outbox_events"."locked_at" is not null and "outbox_events"."locked_by" is not null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_processed_at_check" CHECK ("outbox_events"."status" <> 'PROCESSED' or "outbox_events"."processed_at" is not null) NOT VALID;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_dead_lettered_at_check" CHECK ("outbox_events"."status" <> 'DEAD_LETTER' or "outbox_events"."dead_lettered_at" is not null) NOT VALID;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_status_check" CHECK ("outbox_events"."status" in ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'CANCELLED', 'DEAD_LETTER'));
