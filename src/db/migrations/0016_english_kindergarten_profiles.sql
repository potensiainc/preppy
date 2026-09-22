CREATE TABLE "institution_review_insight_version_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_review_insight_version_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_observation_id" bigint,
	"source_snapshot_id" uuid,
	"evidence_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_review_insight_version_evidence_logical_unique" UNIQUE NULLS NOT DISTINCT("institution_review_insight_version_id","source_id","source_observation_id","source_snapshot_id"),
	CONSTRAINT "institution_review_insight_version_evidence_role_check" CHECK (length(btrim("institution_review_insight_version_evidence"."evidence_role")) > 0)
);
--> statement-breakpoint
CREATE TABLE "institution_review_insight_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_review_insight_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"supersedes_version_id" uuid,
	"verification_state" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"period_start" date,
	"period_end" date,
	"sample_size" integer NOT NULL,
	"themes" jsonb NOT NULL,
	"limitations" text,
	"verified_at" timestamp with time zone,
	"verified_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_review_insight_versions_id_root_unique" UNIQUE("id","institution_review_insight_id"),
	CONSTRAINT "institution_review_insight_versions_number_check" CHECK ("institution_review_insight_versions"."version_number" > 0),
	CONSTRAINT "institution_review_insight_versions_verification_state_check" CHECK ("institution_review_insight_versions"."verification_state" in ('UNVERIFIED', 'VERIFIED', 'SUPERSEDED')),
	CONSTRAINT "institution_review_insight_versions_current_verified_check" CHECK (not "institution_review_insight_versions"."is_current" or "institution_review_insight_versions"."verification_state" = 'VERIFIED'),
	CONSTRAINT "institution_review_insight_versions_verified_at_check" CHECK ("institution_review_insight_versions"."verification_state" <> 'VERIFIED' or "institution_review_insight_versions"."verified_at" is not null),
	CONSTRAINT "institution_review_insight_versions_superseded_not_current_check" CHECK ("institution_review_insight_versions"."verification_state" <> 'SUPERSEDED' or not "institution_review_insight_versions"."is_current"),
	CONSTRAINT "institution_review_insight_versions_not_self_superseding_check" CHECK ("institution_review_insight_versions"."supersedes_version_id" is null or "institution_review_insight_versions"."supersedes_version_id" <> "institution_review_insight_versions"."id"),
	CONSTRAINT "institution_review_insight_versions_sample_size_check" CHECK ("institution_review_insight_versions"."sample_size" > 0),
	CONSTRAINT "institution_review_insight_versions_themes_check" CHECK (jsonb_typeof("institution_review_insight_versions"."themes") = 'array' and jsonb_array_length("institution_review_insight_versions"."themes") > 0),
	CONSTRAINT "institution_review_insight_versions_period_order_check" CHECK ("institution_review_insight_versions"."period_end" is null or "institution_review_insight_versions"."period_start" is null or "institution_review_insight_versions"."period_end" >= "institution_review_insight_versions"."period_start"),
	CONSTRAINT "institution_review_insight_versions_limitations_check" CHECK ("institution_review_insight_versions"."limitations" is null or length(btrim("institution_review_insight_versions"."limitations")) > 0)
);
--> statement-breakpoint
CREATE TABLE "institution_review_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institution_section_coverages" (
	"institution_id" uuid NOT NULL,
	"section" text NOT NULL,
	"status" text NOT NULL,
	"source_id" uuid,
	"source_snapshot_id" uuid,
	"academic_year_label" text,
	"public_note" text,
	"internal_note" text,
	"last_collected_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_section_coverages_pk" PRIMARY KEY("institution_id","section"),
	CONSTRAINT "institution_section_coverages_section_check" CHECK ("institution_section_coverages"."section" in ('TUITION', 'INFORMATION_SESSION', 'TARGET_AGE_GRADE', 'CURRICULUM', 'TRANSPORT', 'MEALS', 'REVIEWS', 'OPERATING_INFO')),
	CONSTRAINT "institution_section_coverages_status_check" CHECK ("institution_section_coverages"."status" in ('NOT_RESEARCHED', 'CONFIRMED', 'CHECKED_NOT_FOUND', 'ACCESS_FAILED', 'NEEDS_REVIEW')),
	CONSTRAINT "institution_section_coverages_snapshot_source_check" CHECK ("institution_section_coverages"."source_snapshot_id" is null or "institution_section_coverages"."source_id" is not null),
	CONSTRAINT "institution_section_coverages_year_check" CHECK ("institution_section_coverages"."academic_year_label" is null or length(btrim("institution_section_coverages"."academic_year_label")) > 0),
	CONSTRAINT "institution_section_coverages_public_note_check" CHECK ("institution_section_coverages"."public_note" is null or length(btrim("institution_section_coverages"."public_note")) > 0),
	CONSTRAINT "institution_section_coverages_internal_note_check" CHECK ("institution_section_coverages"."internal_note" is null or length(btrim("institution_section_coverages"."internal_note")) > 0),
	CONSTRAINT "institution_section_coverages_collection_order_check" CHECK ("institution_section_coverages"."last_collected_at" is null or "institution_section_coverages"."last_collected_at" <= "institution_section_coverages"."last_checked_at")
);
--> statement-breakpoint
ALTER TABLE "institution_facts" DROP CONSTRAINT "institution_facts_type_check";--> statement-breakpoint
ALTER TABLE "institution_review_insight_version_evidence" ADD CONSTRAINT "institution_review_insight_version_evidence_version_fk" FOREIGN KEY ("institution_review_insight_version_id") REFERENCES "public"."institution_review_insight_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_review_insight_version_evidence" ADD CONSTRAINT "institution_review_insight_version_evidence_source_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_review_insight_version_evidence" ADD CONSTRAINT "institution_review_insight_version_evidence_observation_source_fk" FOREIGN KEY ("source_observation_id","source_id") REFERENCES "public"."source_observations"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_review_insight_version_evidence" ADD CONSTRAINT "institution_review_insight_version_evidence_snapshot_source_fk" FOREIGN KEY ("source_snapshot_id","source_id") REFERENCES "public"."source_snapshots"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_review_insight_versions" ADD CONSTRAINT "institution_review_insight_versions_institution_review_insight_id_institution_review_insights_id_fk" FOREIGN KEY ("institution_review_insight_id") REFERENCES "public"."institution_review_insights"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_review_insight_versions" ADD CONSTRAINT "institution_review_insight_versions_verified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_review_insight_versions" ADD CONSTRAINT "institution_review_insight_versions_supersedes_fk" FOREIGN KEY ("supersedes_version_id","institution_review_insight_id") REFERENCES "public"."institution_review_insight_versions"("id","institution_review_insight_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_review_insights" ADD CONSTRAINT "institution_review_insights_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_section_coverages" ADD CONSTRAINT "institution_section_coverages_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_section_coverages" ADD CONSTRAINT "institution_section_coverages_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_section_coverages" ADD CONSTRAINT "institution_section_coverages_snapshot_source_fk" FOREIGN KEY ("source_snapshot_id","source_id") REFERENCES "public"."source_snapshots"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "institution_review_insight_versions_root_number_unique" ON "institution_review_insight_versions" USING btree ("institution_review_insight_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "institution_review_insight_versions_one_current_per_root" ON "institution_review_insight_versions" USING btree ("institution_review_insight_id") WHERE "institution_review_insight_versions"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "institution_review_insight_versions_one_successor" ON "institution_review_insight_versions" USING btree ("supersedes_version_id") WHERE "institution_review_insight_versions"."supersedes_version_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "institution_review_insights_institution_unique" ON "institution_review_insights" USING btree ("institution_id");--> statement-breakpoint
CREATE INDEX "institution_section_coverages_status_idx" ON "institution_section_coverages" USING btree ("section","status");--> statement-breakpoint
ALTER TABLE "institution_facts" ADD CONSTRAINT "institution_facts_type_check" CHECK ("institution_facts"."fact_type" in ('TUITION', 'TARGET_AGE_GRADE', 'CURRICULUM', 'ELIGIBILITY', 'TRANSPORT', 'MEALS', 'ADMISSION_PROCESS', 'OPERATING_INFO'));