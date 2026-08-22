CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identities_provider_check" CHECK ("auth_identities"."provider" = 'KAKAO'),
	CONSTRAINT "auth_identities_status_check" CHECK ("auth_identities"."status" in ('ACTIVE', 'REVOKED')),
	CONSTRAINT "auth_identities_provider_subject_check" CHECK (length(btrim("auth_identities"."provider_subject")) > 0)
);
--> statement-breakpoint
CREATE TABLE "consent_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"consent_type" text NOT NULL,
	"policy_version" text NOT NULL,
	"decision" text NOT NULL,
	"source" text,
	"decided_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_decisions_type_check" CHECK ("consent_decisions"."consent_type" in ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'SERVICE_EMAIL_UPDATES')),
	CONSTRAINT "consent_decisions_decision_check" CHECK ("consent_decisions"."decision" in ('GRANTED', 'REVOKED')),
	CONSTRAINT "consent_decisions_policy_version_check" CHECK (length(btrim("consent_decisions"."policy_version")) > 0)
);
--> statement-breakpoint
CREATE TABLE "follow_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follow_id" uuid NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	"deactivated_at" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_episodes_interval_check" CHECK ("follow_episodes"."deactivated_at" is null or "follow_episodes"."deactivated_at" >= "follow_episodes"."activated_at")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"status" text NOT NULL,
	"first_activated_at" timestamp with time zone NOT NULL,
	"current_activated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_status_check" CHECK ("follows"."status" in ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "follows_state_check" CHECK (("follows"."status" = 'ACTIVE' and "follows"."current_activated_at" is not null and "follows"."deactivated_at" is null)
        or ("follows"."status" = 'INACTIVE' and "follows"."deactivated_at" is not null)),
	CONSTRAINT "follows_current_activation_order_check" CHECK ("follows"."current_activated_at" is null or "follows"."current_activated_at" >= "follows"."first_activated_at"),
	CONSTRAINT "follows_deactivation_first_order_check" CHECK ("follows"."deactivated_at" is null or "follows"."deactivated_at" >= "follows"."first_activated_at"),
	CONSTRAINT "follows_deactivation_current_order_check" CHECK ("follows"."deactivated_at" is null or "follows"."current_activated_at" is null or "follows"."deactivated_at" >= "follows"."current_activated_at")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_channel_check" CHECK ("notification_preferences"."channel" = 'EMAIL'),
	CONSTRAINT "notification_preferences_state_check" CHECK ("notification_preferences"."state" in ('ENABLED', 'DISABLED'))
);
--> statement-breakpoint
CREATE TABLE "user_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"source" text NOT NULL,
	"verification_state" text NOT NULL,
	"delivery_state" text NOT NULL,
	"verified_at" timestamp with time zone,
	"last_bounced_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_emails_source_check" CHECK ("user_emails"."source" in ('KAKAO', 'USER_INPUT')),
	CONSTRAINT "user_emails_verification_state_check" CHECK ("user_emails"."verification_state" in ('UNVERIFIED', 'VERIFIED')),
	CONSTRAINT "user_emails_delivery_state_check" CHECK ("user_emails"."delivery_state" in ('USABLE', 'BOUNCED', 'SUPPRESSED', 'REMOVED'))
);
--> statement-breakpoint
CREATE TABLE "user_interest_categories" (
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_interest_categories_category_check" CHECK ("user_interest_categories"."category" in ('ENGLISH_KINDERGARTEN', 'PRIVATE_ELEMENTARY', 'INTERNATIONAL_SCHOOL'))
);
--> statement-breakpoint
CREATE TABLE "user_interest_regions" (
	"user_id" uuid NOT NULL,
	"region_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_interest_regions_region_code_check" CHECK (length(btrim("user_interest_regions"."region_code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"child_birth_year" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_child_birth_year_check" CHECK ("user_profiles"."child_birth_year" is null or "user_profiles"."child_birth_year" between 1900 and 2100)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"pii_anonymized_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED'))
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_decisions" ADD CONSTRAINT "consent_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_episodes" ADD CONSTRAINT "follow_episodes_follow_id_follows_id_fk" FOREIGN KEY ("follow_id") REFERENCES "public"."follows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_emails" ADD CONSTRAINT "user_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interest_categories" ADD CONSTRAINT "user_interest_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_interest_regions" ADD CONSTRAINT "user_interest_regions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_unique" ON "auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "consent_decisions_latest_idx" ON "consent_decisions" USING btree ("user_id","consent_type","decided_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "follow_episodes_one_open_per_follow" ON "follow_episodes" USING btree ("follow_id") WHERE "follow_episodes"."deactivated_at" is null;--> statement-breakpoint
CREATE INDEX "follow_episodes_follow_activated_idx" ON "follow_episodes" USING btree ("follow_id","activated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "follows_user_institution_unique" ON "follows" USING btree ("user_id","institution_id");--> statement-breakpoint
CREATE INDEX "follows_user_status_idx" ON "follows" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "follows_institution_status_idx" ON "follows" USING btree ("institution_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_channel_unique" ON "notification_preferences" USING btree ("user_id","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "user_emails_user_unique" ON "user_emails" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_interest_categories_user_category_unique" ON "user_interest_categories" USING btree ("user_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "user_interest_regions_user_region_unique" ON "user_interest_regions" USING btree ("user_id","region_code");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE FUNCTION "prevent_consent_decision_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'consent decisions are append-only'
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "prevent_consent_decision_mutation_before_write"
BEFORE UPDATE OR DELETE ON "consent_decisions"
FOR EACH ROW EXECUTE FUNCTION "prevent_consent_decision_mutation"();
