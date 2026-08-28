ALTER TABLE "source_observations" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD COLUMN "raw_body" "bytea";