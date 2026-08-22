CREATE TABLE "institution_fact_version_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_fact_version_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_observation_id" bigint,
	"source_snapshot_id" uuid,
	"evidence_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_fact_version_evidence_logical_unique" UNIQUE NULLS NOT DISTINCT("institution_fact_version_id","source_id","source_observation_id","source_snapshot_id"),
	CONSTRAINT "institution_fact_version_evidence_role_check" CHECK (length(btrim("institution_fact_version_evidence"."evidence_role")) > 0)
);
--> statement-breakpoint
CREATE TABLE "institution_fact_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_fact_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"supersedes_version_id" uuid,
	"verification_state" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"value_json" jsonb NOT NULL,
	"display_text" text,
	"verified_at" timestamp with time zone,
	"verified_by_admin_id" uuid,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_fact_versions_id_fact_unique" UNIQUE("id","institution_fact_id"),
	CONSTRAINT "institution_fact_versions_number_check" CHECK ("institution_fact_versions"."version_number" > 0),
	CONSTRAINT "institution_fact_versions_verification_state_check" CHECK ("institution_fact_versions"."verification_state" in ('UNVERIFIED', 'VERIFIED', 'SUPERSEDED')),
	CONSTRAINT "institution_fact_versions_current_verified_check" CHECK (not "institution_fact_versions"."is_current" or "institution_fact_versions"."verification_state" = 'VERIFIED'),
	CONSTRAINT "institution_fact_versions_verified_at_check" CHECK ("institution_fact_versions"."verification_state" <> 'VERIFIED' or "institution_fact_versions"."verified_at" is not null),
	CONSTRAINT "institution_fact_versions_superseded_not_current_check" CHECK ("institution_fact_versions"."verification_state" <> 'SUPERSEDED' or not "institution_fact_versions"."is_current"),
	CONSTRAINT "institution_fact_versions_not_self_superseding_check" CHECK ("institution_fact_versions"."supersedes_version_id" is null or "institution_fact_versions"."supersedes_version_id" <> "institution_fact_versions"."id"),
	CONSTRAINT "institution_fact_versions_value_object_check" CHECK (jsonb_typeof("institution_fact_versions"."value_json") = 'object'),
	CONSTRAINT "institution_fact_versions_validity_order_check" CHECK ("institution_fact_versions"."valid_until" is null or "institution_fact_versions"."valid_from" is null or "institution_fact_versions"."valid_until" >= "institution_fact_versions"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "institution_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"fact_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_facts_type_check" CHECK ("institution_facts"."fact_type" in ('TUITION', 'TARGET_AGE_GRADE', 'CURRICULUM', 'ELIGIBILITY', 'TRANSPORT', 'ADMISSION_PROCESS', 'OPERATING_INFO'))
);
--> statement-breakpoint
CREATE TABLE "opportunity_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"truth_mode" text NOT NULL,
	"change_type" text NOT NULL,
	"materiality" text NOT NULL,
	"from_native_version_id" uuid,
	"to_native_version_id" uuid,
	"legacy_meaningful_change_id" uuid,
	"legacy_admission_event_id" uuid,
	"summary" text NOT NULL,
	"detected_at" timestamp with time zone,
	"verified_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_changes_type_check" CHECK ("opportunity_changes"."change_type" in ('NEW_OPPORTUNITY', 'DATE_CHANGED', 'DEADLINE_CHANGED', 'STATUS_CHANGED', 'APPLICATION_OPENED', 'APPLICATION_CLOSED', 'CANCELLED', 'MATERIAL_INFO_CHANGED')),
	CONSTRAINT "opportunity_changes_materiality_check" CHECK ("opportunity_changes"."materiality" in ('NOTIFIABLE', 'NON_NOTIFIABLE')),
	CONSTRAINT "opportunity_changes_origin_check" CHECK ((
        "opportunity_changes"."truth_mode" = 'NATIVE'
        and "opportunity_changes"."legacy_meaningful_change_id" is null
        and "opportunity_changes"."legacy_admission_event_id" is null
        and "opportunity_changes"."to_native_version_id" is not null
        and (("opportunity_changes"."change_type" = 'NEW_OPPORTUNITY' and "opportunity_changes"."from_native_version_id" is null)
          or ("opportunity_changes"."change_type" <> 'NEW_OPPORTUNITY' and "opportunity_changes"."from_native_version_id" is not null))
      ) or (
        "opportunity_changes"."truth_mode" = 'LEGACY_BACKED'
        and "opportunity_changes"."from_native_version_id" is null
        and "opportunity_changes"."to_native_version_id" is null
        and "opportunity_changes"."legacy_meaningful_change_id" is not null
        and "opportunity_changes"."legacy_admission_event_id" is not null
      )),
	CONSTRAINT "opportunity_changes_distinct_native_versions_check" CHECK ("opportunity_changes"."from_native_version_id" is null or "opportunity_changes"."from_native_version_id" <> "opportunity_changes"."to_native_version_id"),
	CONSTRAINT "opportunity_changes_summary_check" CHECK (length(btrim("opportunity_changes"."summary")) > 0),
	CONSTRAINT "opportunity_changes_dedupe_key_check" CHECK (length(btrim("opportunity_changes"."dedupe_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "opportunity_version_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_version_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_observation_id" bigint,
	"source_snapshot_id" uuid,
	"evidence_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_version_evidence_logical_unique" UNIQUE NULLS NOT DISTINCT("opportunity_version_id","source_id","source_observation_id","source_snapshot_id"),
	CONSTRAINT "opportunity_version_evidence_role_check" CHECK (length(btrim("opportunity_version_evidence"."evidence_role")) > 0)
);
--> statement-breakpoint
CREATE TABLE "opportunity_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"truth_mode" text DEFAULT 'NATIVE' NOT NULL,
	"version_number" integer NOT NULL,
	"supersedes_version_id" uuid,
	"verification_state" text NOT NULL,
	"business_state" text NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"target_audience" text,
	"event_start_at" timestamp with time zone,
	"event_end_at" timestamp with time zone,
	"application_open_at" timestamp with time zone,
	"application_close_at" timestamp with time zone,
	"action_url" text,
	"location_text" text,
	"verified_at" timestamp with time zone,
	"verified_by_admin_id" uuid,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"content_fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_versions_id_opportunity_unique" UNIQUE("id","opportunity_id"),
	CONSTRAINT "opportunity_versions_truth_mode_check" CHECK ("opportunity_versions"."truth_mode" = 'NATIVE'),
	CONSTRAINT "opportunity_versions_number_check" CHECK ("opportunity_versions"."version_number" > 0),
	CONSTRAINT "opportunity_versions_title_check" CHECK (length(btrim("opportunity_versions"."title")) > 0),
	CONSTRAINT "opportunity_versions_verification_state_check" CHECK ("opportunity_versions"."verification_state" in ('UNVERIFIED', 'VERIFIED', 'SUPERSEDED')),
	CONSTRAINT "opportunity_versions_business_state_check" CHECK ("opportunity_versions"."business_state" in ('UPCOMING', 'OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED', 'UNKNOWN')),
	CONSTRAINT "opportunity_versions_current_verified_check" CHECK (not "opportunity_versions"."is_current" or "opportunity_versions"."verification_state" = 'VERIFIED'),
	CONSTRAINT "opportunity_versions_verified_at_check" CHECK ("opportunity_versions"."verification_state" <> 'VERIFIED' or "opportunity_versions"."verified_at" is not null),
	CONSTRAINT "opportunity_versions_superseded_not_current_check" CHECK ("opportunity_versions"."verification_state" <> 'SUPERSEDED' or not "opportunity_versions"."is_current"),
	CONSTRAINT "opportunity_versions_not_self_superseding_check" CHECK ("opportunity_versions"."supersedes_version_id" is null or "opportunity_versions"."supersedes_version_id" <> "opportunity_versions"."id"),
	CONSTRAINT "opportunity_versions_event_order_check" CHECK ("opportunity_versions"."event_end_at" is null or "opportunity_versions"."event_start_at" is null or "opportunity_versions"."event_end_at" >= "opportunity_versions"."event_start_at"),
	CONSTRAINT "opportunity_versions_application_order_check" CHECK ("opportunity_versions"."application_close_at" is null or "opportunity_versions"."application_open_at" is null or "opportunity_versions"."application_close_at" >= "opportunity_versions"."application_open_at"),
	CONSTRAINT "opportunity_versions_validity_order_check" CHECK ("opportunity_versions"."valid_until" is null or "opportunity_versions"."valid_from" is null or "opportunity_versions"."valid_until" >= "opportunity_versions"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "meaningful_changes" ADD CONSTRAINT "meaningful_changes_id_event_unique" UNIQUE("id","admission_event_id");--> statement-breakpoint
ALTER TABLE "opportunity_admission_event_links" ADD CONSTRAINT "opportunity_event_links_opportunity_event_unique" UNIQUE("opportunity_id","admission_event_id");--> statement-breakpoint
ALTER TABLE "source_observations" ADD CONSTRAINT "source_observations_id_source_unique" UNIQUE("id","source_id");--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_id_source_unique" UNIQUE("id","source_id");--> statement-breakpoint
ALTER TABLE "institution_fact_version_evidence" ADD CONSTRAINT "institution_fact_version_evidence_version_fk" FOREIGN KEY ("institution_fact_version_id") REFERENCES "public"."institution_fact_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_fact_version_evidence" ADD CONSTRAINT "institution_fact_version_evidence_source_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_fact_version_evidence" ADD CONSTRAINT "institution_fact_version_evidence_observation_source_fk" FOREIGN KEY ("source_observation_id","source_id") REFERENCES "public"."source_observations"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_fact_version_evidence" ADD CONSTRAINT "institution_fact_version_evidence_snapshot_source_fk" FOREIGN KEY ("source_snapshot_id","source_id") REFERENCES "public"."source_snapshots"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_fact_versions" ADD CONSTRAINT "institution_fact_versions_institution_fact_id_institution_facts_id_fk" FOREIGN KEY ("institution_fact_id") REFERENCES "public"."institution_facts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_fact_versions" ADD CONSTRAINT "institution_fact_versions_verified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_fact_versions" ADD CONSTRAINT "institution_fact_versions_supersedes_fk" FOREIGN KEY ("supersedes_version_id","institution_fact_id") REFERENCES "public"."institution_fact_versions"("id","institution_fact_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_facts" ADD CONSTRAINT "institution_facts_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_changes" ADD CONSTRAINT "opportunity_changes_opportunity_truth_mode_fk" FOREIGN KEY ("opportunity_id","truth_mode") REFERENCES "public"."opportunities"("id","truth_mode") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_changes" ADD CONSTRAINT "opportunity_changes_from_native_version_fk" FOREIGN KEY ("from_native_version_id","opportunity_id") REFERENCES "public"."opportunity_versions"("id","opportunity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_changes" ADD CONSTRAINT "opportunity_changes_to_native_version_fk" FOREIGN KEY ("to_native_version_id","opportunity_id") REFERENCES "public"."opportunity_versions"("id","opportunity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_changes" ADD CONSTRAINT "opportunity_changes_legacy_change_event_fk" FOREIGN KEY ("legacy_meaningful_change_id","legacy_admission_event_id") REFERENCES "public"."meaningful_changes"("id","admission_event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_changes" ADD CONSTRAINT "opportunity_changes_legacy_opportunity_event_fk" FOREIGN KEY ("opportunity_id","legacy_admission_event_id") REFERENCES "public"."opportunity_admission_event_links"("opportunity_id","admission_event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_version_evidence" ADD CONSTRAINT "opportunity_version_evidence_version_fk" FOREIGN KEY ("opportunity_version_id") REFERENCES "public"."opportunity_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_version_evidence" ADD CONSTRAINT "opportunity_version_evidence_source_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_version_evidence" ADD CONSTRAINT "opportunity_version_evidence_observation_source_fk" FOREIGN KEY ("source_observation_id","source_id") REFERENCES "public"."source_observations"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_version_evidence" ADD CONSTRAINT "opportunity_version_evidence_snapshot_source_fk" FOREIGN KEY ("source_snapshot_id","source_id") REFERENCES "public"."source_snapshots"("id","source_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_versions" ADD CONSTRAINT "opportunity_versions_verified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_versions" ADD CONSTRAINT "opportunity_versions_native_opportunity_fk" FOREIGN KEY ("opportunity_id","truth_mode") REFERENCES "public"."opportunities"("id","truth_mode") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_versions" ADD CONSTRAINT "opportunity_versions_supersedes_fk" FOREIGN KEY ("supersedes_version_id","opportunity_id") REFERENCES "public"."opportunity_versions"("id","opportunity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "institution_fact_versions_fact_number_unique" ON "institution_fact_versions" USING btree ("institution_fact_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "institution_fact_versions_one_current_per_fact" ON "institution_fact_versions" USING btree ("institution_fact_id") WHERE "institution_fact_versions"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "institution_fact_versions_one_successor" ON "institution_fact_versions" USING btree ("supersedes_version_id") WHERE "institution_fact_versions"."supersedes_version_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "institution_facts_institution_type_unique" ON "institution_facts" USING btree ("institution_id","fact_type");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_changes_dedupe_key_unique" ON "opportunity_changes" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_changes_legacy_change_unique" ON "opportunity_changes" USING btree ("legacy_meaningful_change_id") WHERE "opportunity_changes"."legacy_meaningful_change_id" is not null;--> statement-breakpoint
CREATE INDEX "opportunity_changes_opportunity_published_idx" ON "opportunity_changes" USING btree ("opportunity_id","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_versions_opportunity_number_unique" ON "opportunity_versions" USING btree ("opportunity_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_versions_one_current_per_opportunity" ON "opportunity_versions" USING btree ("opportunity_id") WHERE "opportunity_versions"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_versions_one_successor" ON "opportunity_versions" USING btree ("supersedes_version_id") WHERE "opportunity_versions"."supersedes_version_id" is not null;--> statement-breakpoint
CREATE FUNCTION "validate_opportunity_version_lineage"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  predecessor_version_number integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
    OR NEW.truth_mode IS DISTINCT FROM OLD.truth_mode
    OR NEW.version_number IS DISTINCT FROM OLD.version_number
    OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
  ) THEN
    RAISE EXCEPTION 'opportunity version identity and lineage are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.verification_state = 'VERIFIED'
    AND NEW.verification_state NOT IN ('VERIFIED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'verified opportunity version cannot be downgraded'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.verification_state = 'SUPERSEDED'
    AND (
      NEW.verification_state IS DISTINCT FROM OLD.verification_state
      OR NEW.is_current IS DISTINCT FROM OLD.is_current
    ) THEN
    RAISE EXCEPTION 'superseded opportunity version state is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.verification_state IN ('VERIFIED', 'SUPERSEDED')
    AND (
      NEW.title IS DISTINCT FROM OLD.title
      OR NEW.summary IS DISTINCT FROM OLD.summary
      OR NEW.target_audience IS DISTINCT FROM OLD.target_audience
      OR NEW.business_state IS DISTINCT FROM OLD.business_state
      OR NEW.event_start_at IS DISTINCT FROM OLD.event_start_at
      OR NEW.event_end_at IS DISTINCT FROM OLD.event_end_at
      OR NEW.application_open_at IS DISTINCT FROM OLD.application_open_at
      OR NEW.application_close_at IS DISTINCT FROM OLD.application_close_at
      OR NEW.action_url IS DISTINCT FROM OLD.action_url
      OR NEW.location_text IS DISTINCT FROM OLD.location_text
      OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
      OR NEW.verified_by_admin_id IS DISTINCT FROM OLD.verified_by_admin_id
      OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
      OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
      OR NEW.content_fingerprint IS DISTINCT FROM OLD.content_fingerprint
    ) THEN
    RAISE EXCEPTION 'verified opportunity version payload is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.supersedes_version_id IS NOT NULL THEN
    SELECT version_number
      INTO predecessor_version_number
      FROM opportunity_versions
      WHERE id = NEW.supersedes_version_id
        AND opportunity_id = NEW.opportunity_id
      FOR SHARE;

    IF FOUND AND NEW.version_number <= predecessor_version_number THEN
      RAISE EXCEPTION 'opportunity version number must increase along its lineage'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "validate_opportunity_version_lineage_before_write"
BEFORE INSERT OR UPDATE ON "opportunity_versions"
FOR EACH ROW EXECUTE FUNCTION "validate_opportunity_version_lineage"();
--> statement-breakpoint
CREATE FUNCTION "validate_institution_fact_version_lineage"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  predecessor_version_number integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.institution_fact_id IS DISTINCT FROM OLD.institution_fact_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number
    OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
  ) THEN
    RAISE EXCEPTION 'institution fact version identity and lineage are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.verification_state = 'VERIFIED'
    AND NEW.verification_state NOT IN ('VERIFIED', 'SUPERSEDED') THEN
    RAISE EXCEPTION 'verified institution fact version cannot be downgraded'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.verification_state = 'SUPERSEDED'
    AND (
      NEW.verification_state IS DISTINCT FROM OLD.verification_state
      OR NEW.is_current IS DISTINCT FROM OLD.is_current
    ) THEN
    RAISE EXCEPTION 'superseded institution fact version state is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.verification_state IN ('VERIFIED', 'SUPERSEDED')
    AND (
      NEW.value_json IS DISTINCT FROM OLD.value_json
      OR NEW.display_text IS DISTINCT FROM OLD.display_text
      OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
      OR NEW.verified_by_admin_id IS DISTINCT FROM OLD.verified_by_admin_id
      OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
      OR NEW.valid_until IS DISTINCT FROM OLD.valid_until
    ) THEN
    RAISE EXCEPTION 'verified institution fact version payload is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.supersedes_version_id IS NOT NULL THEN
    SELECT version_number
      INTO predecessor_version_number
      FROM institution_fact_versions
      WHERE id = NEW.supersedes_version_id
        AND institution_fact_id = NEW.institution_fact_id
      FOR SHARE;

    IF FOUND AND NEW.version_number <= predecessor_version_number THEN
      RAISE EXCEPTION 'institution fact version number must increase along its lineage'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "validate_institution_fact_version_lineage_before_write"
BEFORE INSERT OR UPDATE ON "institution_fact_versions"
FOR EACH ROW EXECUTE FUNCTION "validate_institution_fact_version_lineage"();
--> statement-breakpoint
CREATE FUNCTION "prevent_opportunity_change_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'opportunity changes are immutable'
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "prevent_opportunity_change_mutation_before_write"
BEFORE UPDATE OR DELETE ON "opportunity_changes"
FOR EACH ROW EXECUTE FUNCTION "prevent_opportunity_change_mutation"();
--> statement-breakpoint
CREATE FUNCTION "validate_published_native_opportunity_truth"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_opportunity_id uuid;
  previous_opportunity_id uuid;
  target_version_id uuid;
  affected_source_id uuid;
  invalid_opportunity_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'sources' THEN
    affected_source_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'opportunities' THEN
    target_opportunity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME = 'opportunity_versions' THEN
    target_opportunity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.opportunity_id ELSE NEW.opportunity_id END;
  ELSE
    target_version_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.opportunity_version_id
      ELSE NEW.opportunity_version_id
    END;
    SELECT opportunity_id
      INTO target_opportunity_id
      FROM opportunity_versions
      WHERE id = target_version_id;

    IF TG_OP = 'UPDATE' THEN
      SELECT opportunity_id
        INTO previous_opportunity_id
        FROM opportunity_versions
        WHERE id = OLD.opportunity_version_id;
    END IF;
  END IF;

  SELECT opportunity.id
    INTO invalid_opportunity_id
    FROM opportunities AS opportunity
    WHERE (
        (affected_source_id IS NULL
          AND opportunity.id IN (target_opportunity_id, previous_opportunity_id))
        OR
        (affected_source_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM opportunity_versions AS affected_version
          JOIN opportunity_version_evidence AS affected_evidence
            ON affected_evidence.opportunity_version_id = affected_version.id
          WHERE affected_version.opportunity_id = opportunity.id
            AND affected_evidence.source_id = affected_source_id
        ))
      )
      AND opportunity.truth_mode = 'NATIVE'
      AND opportunity.publication_state = 'PUBLISHED'
      AND NOT EXISTS (
        SELECT 1
        FROM opportunity_versions AS version
        JOIN opportunity_version_evidence AS evidence
          ON evidence.opportunity_version_id = version.id
        JOIN sources AS source
          ON source.id = evidence.source_id
        WHERE version.opportunity_id = opportunity.id
          AND version.truth_mode = 'NATIVE'
          AND version.is_current
          AND version.verification_state = 'VERIFIED'
          AND source.source_type IN (
            'OFFICIAL_ADMISSION_PAGE',
            'OFFICIAL_NOTICE_BOARD',
            'OFFICIAL_DOCUMENT',
            'OFFICIAL_APPLICATION_PORTAL',
            'OFFICIAL_SCHOOL_PAGE',
            'OFFICIAL_SOCIAL'
          )
          AND source.authority_level IN ('PRIMARY', 'SECONDARY_OFFICIAL')
      )
    LIMIT 1;

  IF invalid_opportunity_id IS NOT NULL THEN
    RAISE EXCEPTION
      'PUBLISHED NATIVE Opportunity % requires a current VERIFIED version with authoritative official Evidence',
      invalid_opportunity_id
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "opportunities_published_native_truth_check"
AFTER INSERT OR UPDATE ON "opportunities"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_published_native_opportunity_truth"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "opportunity_versions_published_native_truth_check"
AFTER INSERT OR UPDATE OR DELETE ON "opportunity_versions"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_published_native_opportunity_truth"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "opportunity_evidence_published_native_truth_check"
AFTER INSERT OR UPDATE OR DELETE ON "opportunity_version_evidence"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_published_native_opportunity_truth"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "sources_published_native_truth_check"
AFTER UPDATE ON "sources"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_published_native_opportunity_truth"();
