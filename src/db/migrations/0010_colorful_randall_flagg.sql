CREATE TABLE "email_provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_message_id" text,
	"event_type" text NOT NULL,
	"provider_created_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_status" text DEFAULT 'RECEIVED' NOT NULL,
	"processed_at" timestamp with time zone,
	"payload_hash" text NOT NULL,
	"safe_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_provider_events_provider_check" CHECK (length("email_provider_events"."provider") between 1 and 32 and "email_provider_events"."provider" ~ '^[A-Z0-9_]+$'),
	CONSTRAINT "email_provider_events_provider_event_id_check" CHECK (length("email_provider_events"."provider_event_id") between 1 and 255 and "email_provider_events"."provider_event_id" ~ '^[!-~]+$'),
	CONSTRAINT "email_provider_events_provider_message_id_check" CHECK ("email_provider_events"."provider_message_id" is null or (length("email_provider_events"."provider_message_id") between 1 and 255 and "email_provider_events"."provider_message_id" ~ '^[!-~]+$')),
	CONSTRAINT "email_provider_events_event_type_check" CHECK (length("email_provider_events"."event_type") between 1 and 128 and "email_provider_events"."event_type" ~ '^[a-z0-9._-]+$'),
	CONSTRAINT "email_provider_events_processing_status_check" CHECK ("email_provider_events"."processing_status" in ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')),
	CONSTRAINT "email_provider_events_processing_lifecycle_check" CHECK (("email_provider_events"."processing_status" = 'RECEIVED' and "email_provider_events"."processed_at" is null)
        or ("email_provider_events"."processing_status" <> 'RECEIVED' and "email_provider_events"."processed_at" is not null)),
	CONSTRAINT "email_provider_events_payload_hash_check" CHECK ("email_provider_events"."payload_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "email_provider_events_safe_error_code_check" CHECK ("email_provider_events"."safe_error_code" is null or (length("email_provider_events"."safe_error_code") between 1 and 128 and "email_provider_events"."safe_error_code" ~ '^[A-Z0-9._:-]+$'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_provider_events_provider_event_unique" ON "email_provider_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "email_provider_events_provider_message_idx" ON "email_provider_events" USING btree ("provider","provider_message_id");--> statement-breakpoint
CREATE INDEX "email_provider_events_status_received_idx" ON "email_provider_events" USING btree ("processing_status","received_at");