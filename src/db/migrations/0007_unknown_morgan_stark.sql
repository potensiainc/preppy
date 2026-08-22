CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"suppress_reason" text,
	"recipient_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"queued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	CONSTRAINT "notification_deliveries_channel_check" CHECK ("notification_deliveries"."channel" = 'EMAIL'),
	CONSTRAINT "notification_deliveries_status_check" CHECK ("notification_deliveries"."status" in ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'FAILED', 'SUPPRESSED')),
	CONSTRAINT "notification_deliveries_suppress_reason_check" CHECK ("notification_deliveries"."suppress_reason" is null or "notification_deliveries"."suppress_reason" in ('USER_INACTIVE', 'FOLLOW_INACTIVE', 'PREFERENCE_DISABLED', 'CONSENT_REVOKED', 'EMAIL_UNAVAILABLE', 'EMAIL_SUPPRESSED', 'DUPLICATE', 'OTHER')),
	CONSTRAINT "notification_deliveries_suppression_check" CHECK (("notification_deliveries"."status" = 'SUPPRESSED' and "notification_deliveries"."suppress_reason" is not null and "notification_deliveries"."suppressed_at" is not null)
        or ("notification_deliveries"."status" <> 'SUPPRESSED' and "notification_deliveries"."suppress_reason" is null and "notification_deliveries"."suppressed_at" is null)),
	CONSTRAINT "notification_deliveries_recipient_hash_check" CHECK ("notification_deliveries"."recipient_hash" is null or length(btrim("notification_deliveries"."recipient_hash")) > 0)
);
--> statement-breakpoint
CREATE TABLE "notification_delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_delivery_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"attempt_status" text NOT NULL,
	"error_code" text,
	"error_message_safe" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_delivery_attempts_number_check" CHECK ("notification_delivery_attempts"."attempt_number" > 0),
	CONSTRAINT "notification_delivery_attempts_provider_check" CHECK (length(btrim("notification_delivery_attempts"."provider")) > 0),
	CONSTRAINT "notification_delivery_attempts_status_check" CHECK ("notification_delivery_attempts"."attempt_status" in ('STARTED', 'ACCEPTED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL')),
	CONSTRAINT "notification_delivery_attempts_completion_check" CHECK (("notification_delivery_attempts"."attempt_status" = 'STARTED' and "notification_delivery_attempts"."completed_at" is null)
        or ("notification_delivery_attempts"."attempt_status" <> 'STARTED' and "notification_delivery_attempts"."completed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"opportunity_change_id" uuid,
	"signal_type" text NOT NULL,
	"policy_version" text NOT NULL,
	"status" text NOT NULL,
	"signal_published_at" timestamp with time zone NOT NULL,
	"title_snapshot" text NOT NULL,
	"body_context_json" jsonb NOT NULL,
	"deep_link_path" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ready_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "notifications_signal_type_check" CHECK ("notifications"."signal_type" in ('OPPORTUNITY_PUBLISHED', 'OPPORTUNITY_CHANGED')),
	CONSTRAINT "notifications_status_check" CHECK ("notifications"."status" in ('PENDING', 'READY', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "notifications_signal_origin_check" CHECK (("notifications"."signal_type" = 'OPPORTUNITY_CHANGED' and "notifications"."opportunity_change_id" is not null)
        or ("notifications"."signal_type" = 'OPPORTUNITY_PUBLISHED' and "notifications"."opportunity_change_id" is null)),
	CONSTRAINT "notifications_policy_version_check" CHECK (length(btrim("notifications"."policy_version")) > 0),
	CONSTRAINT "notifications_title_snapshot_check" CHECK (length(btrim("notifications"."title_snapshot")) > 0),
	CONSTRAINT "notifications_body_context_object_check" CHECK (jsonb_typeof("notifications"."body_context_json") = 'object'),
	CONSTRAINT "notifications_deep_link_path_check" CHECK (length(btrim("notifications"."deep_link_path")) > 0),
	CONSTRAINT "notifications_dedupe_key_check" CHECK (length(btrim("notifications"."dedupe_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "opportunity_changes" ADD CONSTRAINT "opportunity_changes_id_opportunity_unique" UNIQUE("id","opportunity_id");--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_attempts_delivery_fk" FOREIGN KEY ("notification_delivery_id") REFERENCES "public"."notification_deliveries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_opportunity_change_opportunity_fk" FOREIGN KEY ("opportunity_change_id","opportunity_id") REFERENCES "public"."opportunity_changes"("id","opportunity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_logical_unique" ON "notification_deliveries" USING btree ("notification_id","user_id","channel");--> statement-breakpoint
CREATE INDEX "notification_deliveries_status_created_idx" ON "notification_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_created_idx" ON "notification_deliveries" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_attempts_number_unique" ON "notification_delivery_attempts" USING btree ("notification_delivery_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_attempts_provider_message_unique" ON "notification_delivery_attempts" USING btree ("provider","provider_message_id") WHERE "notification_delivery_attempts"."provider_message_id" is not null;--> statement-breakpoint
CREATE INDEX "notification_delivery_attempts_status_idx" ON "notification_delivery_attempts" USING btree ("attempt_status");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_change_policy_unique" ON "notifications" USING btree ("opportunity_change_id","policy_version") WHERE "notifications"."signal_type" = 'OPPORTUNITY_CHANGED';--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_published_policy_unique" ON "notifications" USING btree ("opportunity_id","policy_version") WHERE "notifications"."signal_type" = 'OPPORTUNITY_PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_key_unique" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_opportunity_status_idx" ON "notifications" USING btree ("opportunity_id","status");--> statement-breakpoint
CREATE INDEX "notifications_status_signal_published_idx" ON "notifications" USING btree ("status","signal_published_at");
