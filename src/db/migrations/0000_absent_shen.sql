CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_auth_subject" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_status_check" CHECK ("admin_users"."status" in ('ACTIVE', 'DISABLED'))
);
--> statement-breakpoint
CREATE TABLE "admission_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year" smallint NOT NULL,
	"lifecycle_status" text NOT NULL,
	"admission_mode" text NOT NULL,
	"is_public_focus" boolean DEFAULT false NOT NULL,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycles_id_school_unique" UNIQUE("id","school_id"),
	CONSTRAINT "admission_cycles_academic_year_check" CHECK ("admission_cycles"."academic_year" between 2020 and 2100),
	CONSTRAINT "admission_cycles_lifecycle_status_check" CHECK ("admission_cycles"."lifecycle_status" in ('PLANNED', 'MONITORING', 'ANNOUNCED', 'ACTIVE', 'CLOSED', 'COMPLETED', 'ARCHIVED')),
	CONSTRAINT "admission_cycles_admission_mode_check" CHECK ("admission_cycles"."admission_mode" in ('FIXED_WINDOW', 'ROLLING', 'MULTI_ROUND', 'HYBRID', 'UNKNOWN'))
);
--> statement-breakpoint
CREATE TABLE "admission_event_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_event_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"supersedes_version_id" uuid,
	"is_current" boolean DEFAULT false NOT NULL,
	"verification_status" text NOT NULL,
	"knowledge_state" text NOT NULL,
	"event_status" text NOT NULL,
	"display_title" text NOT NULL,
	"event_start_date" date,
	"event_start_time" time,
	"event_end_date" date,
	"event_end_time" time,
	"registration_open_date" date,
	"registration_open_time" time,
	"registration_close_date" date,
	"registration_close_time" time,
	"timezone" text DEFAULT 'Asia/Seoul' NOT NULL,
	"venue" text,
	"action_url" text,
	"official_notes" text,
	"verified_at" timestamp with time zone,
	"verified_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_versions_id_event_unique" UNIQUE("id","admission_event_id"),
	CONSTRAINT "admission_event_versions_version_no_check" CHECK ("admission_event_versions"."version_no" > 0),
	CONSTRAINT "admission_event_versions_verification_status_check" CHECK ("admission_event_versions"."verification_status" in ('DRAFT', 'UNVERIFIED', 'VERIFIED', 'REJECTED', 'SUPERSEDED')),
	CONSTRAINT "admission_event_versions_knowledge_state_check" CHECK ("admission_event_versions"."knowledge_state" in ('KNOWN', 'NOT_ANNOUNCED', 'NOT_FOUND', 'SOURCE_ERROR', 'NOT_APPLICABLE')),
	CONSTRAINT "admission_event_versions_event_status_check" CHECK ("admission_event_versions"."event_status" in ('SCHEDULED', 'ACTIVE', 'CLOSED', 'COMPLETED', 'CANCELLED')),
	CONSTRAINT "admission_event_versions_event_date_order_check" CHECK ("admission_event_versions"."event_end_date" is null or "admission_event_versions"."event_start_date" is null or "admission_event_versions"."event_end_date" >= "admission_event_versions"."event_start_date"),
	CONSTRAINT "admission_event_versions_registration_date_order_check" CHECK ("admission_event_versions"."registration_close_date" is null or "admission_event_versions"."registration_open_date" is null or "admission_event_versions"."registration_close_date" >= "admission_event_versions"."registration_open_date"),
	CONSTRAINT "event_versions_not_self_superseding_check" CHECK ("admission_event_versions"."supersedes_version_id" is null or "admission_event_versions"."supersedes_version_id" <> "admission_event_versions"."id"),
	CONSTRAINT "event_versions_current_not_superseded_check" CHECK (not ("admission_event_versions"."is_current" and "admission_event_versions"."verification_status" = 'SUPERSEDED'))
);
--> statement-breakpoint
CREATE TABLE "admission_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_cycle_id" uuid NOT NULL,
	"event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"occurrence_no" smallint DEFAULT 1 NOT NULL,
	"canonical_title" text NOT NULL,
	"audience_summary" text,
	"audience_data" jsonb,
	"importance" text DEFAULT 'NORMAL' NOT NULL,
	"actionability" text DEFAULT 'INFORMATIONAL' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_id_cycle_unique" UNIQUE("id","admission_cycle_id"),
	CONSTRAINT "admission_events_event_type_check" CHECK ("admission_events"."event_type" in ('BRIEFING', 'OPEN_HOUSE', 'APPLICATION', 'DOCUMENT_SUBMISSION', 'ASSESSMENT', 'INTERVIEW', 'LOTTERY', 'RESULT_ANNOUNCEMENT', 'REGISTRATION', 'ADDITIONAL_RECRUITMENT', 'OTHER')),
	CONSTRAINT "admission_events_occurrence_no_check" CHECK ("admission_events"."occurrence_no" > 0),
	CONSTRAINT "admission_events_importance_check" CHECK ("admission_events"."importance" in ('CRITICAL', 'HIGH', 'NORMAL', 'LOW')),
	CONSTRAINT "admission_events_actionability_check" CHECK ("admission_events"."actionability" in ('ACTION_REQUIRED', 'ATTENDANCE', 'INFORMATIONAL', 'OUTCOME'))
);
--> statement-breakpoint
CREATE TABLE "admission_fact_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_fact_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"supersedes_version_id" uuid,
	"is_current" boolean DEFAULT false NOT NULL,
	"verification_status" text NOT NULL,
	"knowledge_state" text NOT NULL,
	"value_kind" text NOT NULL,
	"value_text" text,
	"value_number" numeric,
	"value_boolean" boolean,
	"value_date" date,
	"value_json" jsonb,
	"display_value" text,
	"verified_at" timestamp with time zone,
	"verified_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fact_versions_id_fact_unique" UNIQUE("id","admission_fact_id"),
	CONSTRAINT "admission_fact_versions_version_no_check" CHECK ("admission_fact_versions"."version_no" > 0),
	CONSTRAINT "admission_fact_versions_verification_status_check" CHECK ("admission_fact_versions"."verification_status" in ('DRAFT', 'UNVERIFIED', 'VERIFIED', 'REJECTED', 'SUPERSEDED')),
	CONSTRAINT "admission_fact_versions_knowledge_state_check" CHECK ("admission_fact_versions"."knowledge_state" in ('KNOWN', 'NOT_ANNOUNCED', 'NOT_FOUND', 'SOURCE_ERROR', 'NOT_APPLICABLE')),
	CONSTRAINT "admission_fact_versions_value_kind_check" CHECK ("admission_fact_versions"."value_kind" in ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'JSON')),
	CONSTRAINT "admission_fact_versions_typed_value_check" CHECK ((
        "admission_fact_versions"."knowledge_state" <> 'KNOWN'
        and "admission_fact_versions"."value_text" is null
        and "admission_fact_versions"."value_number" is null
        and "admission_fact_versions"."value_boolean" is null
        and "admission_fact_versions"."value_date" is null
        and "admission_fact_versions"."value_json" is null
      ) or (
        "admission_fact_versions"."knowledge_state" = 'KNOWN'
        and (
          ("admission_fact_versions"."value_kind" = 'TEXT' and "admission_fact_versions"."value_text" is not null and "admission_fact_versions"."value_number" is null and "admission_fact_versions"."value_boolean" is null and "admission_fact_versions"."value_date" is null and "admission_fact_versions"."value_json" is null)
          or ("admission_fact_versions"."value_kind" = 'NUMBER' and "admission_fact_versions"."value_text" is null and "admission_fact_versions"."value_number" is not null and "admission_fact_versions"."value_boolean" is null and "admission_fact_versions"."value_date" is null and "admission_fact_versions"."value_json" is null)
          or ("admission_fact_versions"."value_kind" = 'BOOLEAN' and "admission_fact_versions"."value_text" is null and "admission_fact_versions"."value_number" is null and "admission_fact_versions"."value_boolean" is not null and "admission_fact_versions"."value_date" is null and "admission_fact_versions"."value_json" is null)
          or ("admission_fact_versions"."value_kind" = 'DATE' and "admission_fact_versions"."value_text" is null and "admission_fact_versions"."value_number" is null and "admission_fact_versions"."value_boolean" is null and "admission_fact_versions"."value_date" is not null and "admission_fact_versions"."value_json" is null)
          or ("admission_fact_versions"."value_kind" = 'JSON' and "admission_fact_versions"."value_text" is null and "admission_fact_versions"."value_number" is null and "admission_fact_versions"."value_boolean" is null and "admission_fact_versions"."value_date" is null and "admission_fact_versions"."value_json" is not null)
        )
      )),
	CONSTRAINT "fact_versions_not_self_superseding_check" CHECK ("admission_fact_versions"."supersedes_version_id" is null or "admission_fact_versions"."supersedes_version_id" <> "admission_fact_versions"."id"),
	CONSTRAINT "fact_versions_current_not_superseded_check" CHECK (not ("admission_fact_versions"."is_current" and "admission_fact_versions"."verification_status" = 'SUPERSEDED'))
);
--> statement-breakpoint
CREATE TABLE "admission_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_cycle_id" uuid NOT NULL,
	"admission_event_id" uuid,
	"fact_key" text NOT NULL,
	"fact_type" text NOT NULL,
	"scope" text NOT NULL,
	"is_critical" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facts_id_cycle_unique" UNIQUE("id","admission_cycle_id"),
	CONSTRAINT "admission_facts_scope_check" CHECK (("admission_facts"."scope" = 'CYCLE' and "admission_facts"."admission_event_id" is null) or ("admission_facts"."scope" = 'EVENT' and "admission_facts"."admission_event_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"provider_message_id" text,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_deliveries_channel_check" CHECK ("alert_deliveries"."channel" in ('EMAIL')),
	CONSTRAINT "alert_deliveries_status_check" CHECK ("alert_deliveries"."status" in ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'SUPPRESSED', 'CANCELLED')),
	CONSTRAINT "alert_deliveries_attempt_count_check" CHECK ("alert_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_cycle_id" uuid NOT NULL,
	"meaningful_change_id" uuid,
	"alert_type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text NOT NULL,
	"subject_template_data" jsonb,
	"body_template_data" jsonb,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_type_check" CHECK ("alerts"."alert_type" in ('NEW_ANNOUNCEMENT', 'REGISTRATION_OPEN', 'DATE_CHANGED', 'DEADLINE_CHANGED', 'ADDITIONAL_RECRUITMENT', 'IMPORTANT_ELIGIBILITY_CHANGE', 'RESULT_PUBLISHED', 'EVENT_CANCELLED', 'CORRECTION')),
	CONSTRAINT "alerts_status_check" CHECK ("alerts"."status" in ('DRAFT', 'READY', 'DISPATCHING', 'COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"admin_user_id" uuid,
	"action_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before_data" jsonb,
	"after_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "detected_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"previous_observation_id" bigint,
	"current_observation_id" bigint NOT NULL,
	"previous_snapshot_id" uuid,
	"current_snapshot_id" uuid NOT NULL,
	"detection_type" text NOT NULL,
	"status" text NOT NULL,
	"change_fingerprint" text,
	"diff_summary" text,
	"diff_payload" jsonb,
	"detected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "detected_changes_status_check" CHECK ("detected_changes"."status" in ('DETECTED', 'EXTRACTED', 'REVIEW_REQUIRED', 'PROCESSED', 'IGNORED', 'DUPLICATE', 'ERROR'))
);
--> statement-breakpoint
CREATE TABLE "event_version_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_version_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_observation_id" bigint,
	"snapshot_id" uuid,
	"evidence_excerpt" text,
	"evidence_locator" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_version_evidence_logical_unique" UNIQUE NULLS NOT DISTINCT("event_version_id","source_id","source_observation_id")
);
--> statement-breakpoint
CREATE TABLE "expected_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admission_cycle_id" uuid NOT NULL,
	"event_type" text,
	"prediction_type" text NOT NULL,
	"window_start_date" date NOT NULL,
	"window_end_date" date NOT NULL,
	"precision" text NOT NULL,
	"methodology" text NOT NULL,
	"sample_size" smallint NOT NULL,
	"confidence_score" numeric(5, 4),
	"is_current" boolean DEFAULT true NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expected_windows_prediction_type_check" CHECK ("expected_windows"."prediction_type" in ('ANNOUNCEMENT_WINDOW', 'EVENT_WINDOW', 'APPLICATION_WINDOW')),
	CONSTRAINT "expected_windows_precision_check" CHECK ("expected_windows"."precision" in ('EARLY_MONTH', 'MID_MONTH', 'LATE_MONTH', 'DATE_RANGE', 'MONTH', 'MONTH_RANGE')),
	CONSTRAINT "expected_windows_date_order_check" CHECK ("expected_windows"."window_end_date" >= "expected_windows"."window_start_date"),
	CONSTRAINT "expected_windows_sample_size_check" CHECK ("expected_windows"."sample_size" > 0),
	CONSTRAINT "expected_windows_confidence_score_check" CHECK ("expected_windows"."confidence_score" is null or ("expected_windows"."confidence_score" >= 0 and "expected_windows"."confidence_score" <= 1))
);
--> statement-breakpoint
CREATE TABLE "fact_version_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fact_version_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_observation_id" bigint,
	"snapshot_id" uuid,
	"evidence_excerpt" text,
	"evidence_locator" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fact_version_evidence_logical_unique" UNIQUE NULLS NOT DISTINCT("fact_version_id","source_id","source_observation_id")
);
--> statement-breakpoint
CREATE TABLE "guides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body_markdown" text NOT NULL,
	"seo_title" text,
	"meta_description" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guides_status_check" CHECK ("guides"."status" in ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "meaningful_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"detected_change_id" uuid,
	"admission_cycle_id" uuid NOT NULL,
	"admission_event_id" uuid,
	"admission_fact_id" uuid,
	"change_type" text NOT NULL,
	"significance" text NOT NULL,
	"review_status" text NOT NULL,
	"alert_candidate" boolean DEFAULT false NOT NULL,
	"public_summary" text,
	"before_data" jsonb,
	"after_data" jsonb,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_admin_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meaningful_changes_id_cycle_unique" UNIQUE("id","admission_cycle_id"),
	CONSTRAINT "meaningful_changes_type_check" CHECK ("meaningful_changes"."change_type" in ('NEW_EVENT', 'EVENT_DATE_CHANGED', 'REGISTRATION_WINDOW_CHANGED', 'APPLICATION_WINDOW_CHANGED', 'DEADLINE_EXTENDED', 'EVENT_CANCELLED', 'ELIGIBILITY_CHANGED', 'DOCUMENT_REQUIREMENT_CHANGED', 'RESULT_PUBLISHED', 'ADDITIONAL_RECRUITMENT', 'OTHER')),
	CONSTRAINT "meaningful_changes_significance_check" CHECK ("meaningful_changes"."significance" in ('CRITICAL', 'HIGH', 'NORMAL', 'LOW')),
	CONSTRAINT "meaningful_changes_review_status_check" CHECK ("meaningful_changes"."review_status" in ('REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'IGNORED', 'PUBLISHED'))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_status_check" CHECK ("outbox_events"."status" in ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'CANCELLED')),
	CONSTRAINT "outbox_events_attempt_count_check" CHECK ("outbox_events"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "school_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"alias_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_aliases_alias_type_check" CHECK ("school_aliases"."alias_type" in ('KOREAN', 'ENGLISH', 'ABBREVIATION', 'FORMER_NAME', 'COMMON_NAME', 'OTHER'))
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"canonical_name" text NOT NULL,
	"name_en" text,
	"school_type" text NOT NULL,
	"lifecycle_status" text NOT NULL,
	"country_code" char(2) DEFAULT 'KR' NOT NULL,
	"region1" text,
	"region2" text,
	"address" text,
	"official_website_url" text,
	"short_description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_school_type_check" CHECK ("schools"."school_type" in ('PRIVATE_ELEMENTARY', 'INTERNATIONAL_SCHOOL', 'FOREIGN_SCHOOL')),
	CONSTRAINT "schools_lifecycle_status_check" CHECK ("schools"."lifecycle_status" in ('ACTIVE', 'PAUSED', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "source_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"admission_cycle_id" uuid,
	"source_role" text NOT NULL,
	"priority" smallint DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_bindings_logical_unique" UNIQUE NULLS NOT DISTINCT("source_id","school_id","admission_cycle_id","source_role"),
	CONSTRAINT "source_bindings_role_check" CHECK ("source_bindings"."source_role" in ('PRIMARY_ADMISSIONS', 'NOTICE_BOARD', 'APPLICATION', 'ELIGIBILITY', 'HISTORICAL', 'DISCOVERY', 'OTHER')),
	CONSTRAINT "source_bindings_priority_check" CHECK ("source_bindings"."priority" > 0)
);
--> statement-breakpoint
CREATE TABLE "source_monitor_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"collection_strategy" text NOT NULL,
	"monitoring_profile" text NOT NULL,
	"custom_interval_minutes" integer,
	"seasonal_enabled" boolean DEFAULT true NOT NULL,
	"browser_required" boolean DEFAULT false NOT NULL,
	"max_attempts" smallint DEFAULT 3 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_monitor_configs_strategy_check" CHECK ("source_monitor_configs"."collection_strategy" in ('HTTP', 'BROWSER', 'DOCUMENT', 'MANUAL')),
	CONSTRAINT "source_monitor_configs_profile_check" CHECK ("source_monitor_configs"."monitoring_profile" in ('CRITICAL_SEASONAL', 'STANDARD_SEASONAL', 'LOW_CHANGE', 'DOCUMENT_STATIC', 'MANUAL')),
	CONSTRAINT "source_monitor_configs_interval_check" CHECK ("source_monitor_configs"."custom_interval_minutes" is null or "source_monitor_configs"."custom_interval_minutes" > 0),
	CONSTRAINT "source_monitor_configs_max_attempts_check" CHECK ("source_monitor_configs"."max_attempts" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "source_observations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "source_observations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	"http_status" integer,
	"final_url" text,
	"content_hash" text,
	"text_hash" text,
	"response_bytes" bigint,
	"duration_ms" integer,
	"error_code" text,
	"error_message" text,
	"snapshot_id" uuid,
	"etag" text,
	"last_modified" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_observations_outcome_check" CHECK ("source_observations"."outcome" in ('SUCCESS', 'UNCHANGED', 'CHANGED', 'NOT_FOUND', 'ACCESS_ERROR', 'PARSE_ERROR', 'TIMEOUT', 'OTHER_ERROR')),
	CONSTRAINT "source_observations_http_status_check" CHECK ("source_observations"."http_status" is null or "source_observations"."http_status" between 100 and 599),
	CONSTRAINT "source_observations_response_bytes_check" CHECK ("source_observations"."response_bytes" is null or "source_observations"."response_bytes" >= 0),
	CONSTRAINT "source_observations_duration_ms_check" CHECK ("source_observations"."duration_ms" is null or "source_observations"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "source_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"text_hash" text,
	"normalized_text" text,
	"raw_storage_key" text,
	"mime_type" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_url" text NOT NULL,
	"source_type" text NOT NULL,
	"authority_level" text NOT NULL,
	"lifecycle_status" text NOT NULL,
	"source_name" text NOT NULL,
	"requires_js" boolean DEFAULT false NOT NULL,
	"content_type_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_source_type_check" CHECK ("sources"."source_type" in ('OFFICIAL_ADMISSION_PAGE', 'OFFICIAL_NOTICE_BOARD', 'OFFICIAL_DOCUMENT', 'OFFICIAL_APPLICATION_PORTAL', 'OFFICIAL_SCHOOL_PAGE', 'OFFICIAL_SOCIAL', 'THIRD_PARTY_DISCOVERY', 'OTHER')),
	CONSTRAINT "sources_authority_level_check" CHECK ("sources"."authority_level" in ('PRIMARY', 'SECONDARY_OFFICIAL', 'DISCOVERY_ONLY')),
	CONSTRAINT "sources_lifecycle_status_check" CHECK ("sources"."lifecycle_status" in ('DISCOVERED', 'ACTIVE', 'PAUSED', 'RETIRED'))
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"status" text NOT NULL,
	"first_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_status_check" CHECK ("subscribers"."status" in ('ACTIVE', 'BOUNCED', 'SUPPRESSED'))
);
--> statement-breakpoint
CREATE TABLE "subscription_action_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_action_tokens_purpose_check" CHECK ("subscription_action_tokens"."purpose" in ('VERIFY', 'UNSUBSCRIBE'))
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"admission_cycle_id" uuid NOT NULL,
	"status" text NOT NULL,
	"consent_version" text NOT NULL,
	"consent_source" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_id_subscriber_unique" UNIQUE("id","subscriber_id"),
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('PENDING', 'VERIFIED', 'UNSUBSCRIBED', 'BOUNCED', 'SUPPRESSED'))
);
--> statement-breakpoint
CREATE TABLE "update_changes" (
	"update_id" uuid NOT NULL,
	"meaningful_change_id" uuid NOT NULL,
	CONSTRAINT "update_changes_pk" PRIMARY KEY("update_id","meaningful_change_id")
);
--> statement-breakpoint
CREATE TABLE "updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"school_id" uuid,
	"admission_cycle_id" uuid,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body_markdown" text NOT NULL,
	"seo_title" text,
	"meta_description" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "updates_status_check" CHECK ("updates"."status" in ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'))
);
--> statement-breakpoint
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_event_versions" ADD CONSTRAINT "admission_event_versions_verified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_event_versions" ADD CONSTRAINT "event_versions_event_fk" FOREIGN KEY ("admission_event_id") REFERENCES "public"."admission_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_event_versions" ADD CONSTRAINT "event_versions_supersedes_fk" FOREIGN KEY ("supersedes_version_id","admission_event_id") REFERENCES "public"."admission_event_versions"("id","admission_event_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_events" ADD CONSTRAINT "admission_events_admission_cycle_id_admission_cycles_id_fk" FOREIGN KEY ("admission_cycle_id") REFERENCES "public"."admission_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_fact_versions" ADD CONSTRAINT "admission_fact_versions_admission_fact_id_admission_facts_id_fk" FOREIGN KEY ("admission_fact_id") REFERENCES "public"."admission_facts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_fact_versions" ADD CONSTRAINT "admission_fact_versions_verified_by_admin_id_admin_users_id_fk" FOREIGN KEY ("verified_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_fact_versions" ADD CONSTRAINT "fact_versions_supersedes_fk" FOREIGN KEY ("supersedes_version_id","admission_fact_id") REFERENCES "public"."admission_fact_versions"("id","admission_fact_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_facts" ADD CONSTRAINT "admission_facts_admission_cycle_id_admission_cycles_id_fk" FOREIGN KEY ("admission_cycle_id") REFERENCES "public"."admission_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_facts" ADD CONSTRAINT "facts_event_cycle_fk" FOREIGN KEY ("admission_event_id","admission_cycle_id") REFERENCES "public"."admission_events"("id","admission_cycle_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_subscription_subscriber_fk" FOREIGN KEY ("subscription_id","subscriber_id") REFERENCES "public"."subscriptions"("id","subscriber_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_admission_cycle_id_admission_cycles_id_fk" FOREIGN KEY ("admission_cycle_id") REFERENCES "public"."admission_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_change_cycle_fk" FOREIGN KEY ("meaningful_change_id","admission_cycle_id") REFERENCES "public"."meaningful_changes"("id","admission_cycle_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_changes" ADD CONSTRAINT "detected_changes_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_changes" ADD CONSTRAINT "detected_changes_previous_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("previous_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_changes" ADD CONSTRAINT "detected_changes_current_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("current_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_changes" ADD CONSTRAINT "detected_changes_previous_observation_fk" FOREIGN KEY ("previous_observation_id") REFERENCES "public"."source_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_changes" ADD CONSTRAINT "detected_changes_current_observation_fk" FOREIGN KEY ("current_observation_id") REFERENCES "public"."source_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_version_evidence" ADD CONSTRAINT "event_version_evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_version_evidence" ADD CONSTRAINT "event_version_evidence_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_version_evidence" ADD CONSTRAINT "event_evidence_event_version_fk" FOREIGN KEY ("event_version_id") REFERENCES "public"."admission_event_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_version_evidence" ADD CONSTRAINT "event_evidence_observation_fk" FOREIGN KEY ("source_observation_id") REFERENCES "public"."source_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_windows" ADD CONSTRAINT "expected_windows_admission_cycle_id_admission_cycles_id_fk" FOREIGN KEY ("admission_cycle_id") REFERENCES "public"."admission_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expected_windows" ADD CONSTRAINT "expected_windows_reviewed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_version_evidence" ADD CONSTRAINT "fact_version_evidence_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_version_evidence" ADD CONSTRAINT "fact_version_evidence_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_version_evidence" ADD CONSTRAINT "fact_evidence_fact_version_fk" FOREIGN KEY ("fact_version_id") REFERENCES "public"."admission_fact_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_version_evidence" ADD CONSTRAINT "fact_evidence_observation_fk" FOREIGN KEY ("source_observation_id") REFERENCES "public"."source_observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaningful_changes" ADD CONSTRAINT "meaningful_changes_detected_change_id_detected_changes_id_fk" FOREIGN KEY ("detected_change_id") REFERENCES "public"."detected_changes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaningful_changes" ADD CONSTRAINT "meaningful_changes_admission_cycle_id_admission_cycles_id_fk" FOREIGN KEY ("admission_cycle_id") REFERENCES "public"."admission_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaningful_changes" ADD CONSTRAINT "meaningful_changes_reviewed_by_admin_id_admin_users_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaningful_changes" ADD CONSTRAINT "meaningful_changes_event_cycle_fk" FOREIGN KEY ("admission_event_id","admission_cycle_id") REFERENCES "public"."admission_events"("id","admission_cycle_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaningful_changes" ADD CONSTRAINT "meaningful_changes_fact_cycle_fk" FOREIGN KEY ("admission_fact_id","admission_cycle_id") REFERENCES "public"."admission_facts"("id","admission_cycle_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_aliases" ADD CONSTRAINT "school_aliases_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_bindings" ADD CONSTRAINT "source_bindings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_bindings" ADD CONSTRAINT "source_bindings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_bindings" ADD CONSTRAINT "source_bindings_cycle_school_fk" FOREIGN KEY ("admission_cycle_id","school_id") REFERENCES "public"."admission_cycles"("id","school_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_monitor_configs" ADD CONSTRAINT "source_monitor_configs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_observations" ADD CONSTRAINT "source_observations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_observations" ADD CONSTRAINT "source_observations_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_action_tokens" ADD CONSTRAINT "subscription_action_tokens_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_admission_cycle_id_admission_cycles_id_fk" FOREIGN KEY ("admission_cycle_id") REFERENCES "public"."admission_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_changes" ADD CONSTRAINT "update_changes_update_id_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."updates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_changes" ADD CONSTRAINT "update_changes_meaningful_change_id_meaningful_changes_id_fk" FOREIGN KEY ("meaningful_change_id") REFERENCES "public"."meaningful_changes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "updates" ADD CONSTRAINT "updates_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "updates" ADD CONSTRAINT "updates_admission_cycle_id_admission_cycles_id_fk" FOREIGN KEY ("admission_cycle_id") REFERENCES "public"."admission_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_external_auth_subject_unique" ON "admin_users" USING btree ("external_auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_cycles_school_year_unique" ON "admission_cycles" USING btree ("school_id","academic_year");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_cycles_one_public_focus_per_school" ON "admission_cycles" USING btree ("school_id") WHERE "admission_cycles"."is_public_focus" = true;--> statement-breakpoint
CREATE INDEX "admission_cycles_year_lifecycle_idx" ON "admission_cycles" USING btree ("academic_year","lifecycle_status");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_event_versions_event_version_unique" ON "admission_event_versions" USING btree ("admission_event_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_event_versions_one_current_per_event" ON "admission_event_versions" USING btree ("admission_event_id") WHERE "admission_event_versions"."is_current" = true;--> statement-breakpoint
CREATE INDEX "admission_event_versions_current_event_date_idx" ON "admission_event_versions" USING btree ("event_start_date") WHERE "admission_event_versions"."is_current" = true and "admission_event_versions"."verification_status" = 'VERIFIED';--> statement-breakpoint
CREATE INDEX "admission_event_versions_current_registration_idx" ON "admission_event_versions" USING btree ("registration_open_date","registration_close_date") WHERE "admission_event_versions"."is_current" = true and "admission_event_versions"."verification_status" = 'VERIFIED';--> statement-breakpoint
CREATE UNIQUE INDEX "admission_events_cycle_key_unique" ON "admission_events" USING btree ("admission_cycle_id","event_key");--> statement-breakpoint
CREATE INDEX "admission_events_cycle_type_idx" ON "admission_events" USING btree ("admission_cycle_id","event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_fact_versions_fact_version_unique" ON "admission_fact_versions" USING btree ("admission_fact_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_fact_versions_one_current_per_fact" ON "admission_fact_versions" USING btree ("admission_fact_id") WHERE "admission_fact_versions"."is_current" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "admission_facts_cycle_key_unique" ON "admission_facts" USING btree ("admission_cycle_id","fact_key");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_deliveries_logical_unique" ON "alert_deliveries" USING btree ("alert_id","subscription_id","channel");--> statement-breakpoint
CREATE INDEX "alert_deliveries_status_created_idx" ON "alert_deliveries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "alert_deliveries_subscriber_created_idx" ON "alert_deliveries" USING btree ("subscriber_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_dedupe_key_unique" ON "alerts" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "alerts_status_generated_idx" ON "alerts" USING btree ("status","generated_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_created_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "detected_changes_source_fingerprint_unique" ON "detected_changes" USING btree ("source_id","change_fingerprint") WHERE "detected_changes"."change_fingerprint" is not null;--> statement-breakpoint
CREATE INDEX "detected_changes_status_detected_idx" ON "detected_changes" USING btree ("status","detected_at");--> statement-breakpoint
CREATE INDEX "expected_windows_cycle_current_idx" ON "expected_windows" USING btree ("admission_cycle_id","is_current");--> statement-breakpoint
CREATE UNIQUE INDEX "guides_slug_unique" ON "guides" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "guides_status_published_idx" ON "guides" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "meaningful_changes_review_created_idx" ON "meaningful_changes" USING btree ("review_status","created_at");--> statement-breakpoint
CREATE INDEX "meaningful_changes_cycle_published_idx" ON "meaningful_changes" USING btree ("admission_cycle_id","published_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_available_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "school_aliases_school_normalized_unique" ON "school_aliases" USING btree ("school_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "school_aliases_normalized_idx" ON "school_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE UNIQUE INDEX "schools_slug_unique" ON "schools" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "schools_type_region_idx" ON "schools" USING btree ("school_type","region1");--> statement-breakpoint
CREATE INDEX "schools_lifecycle_public_idx" ON "schools" USING btree ("lifecycle_status","is_public");--> statement-breakpoint
CREATE INDEX "source_bindings_school_active_idx" ON "source_bindings" USING btree ("school_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "source_monitor_configs_source_unique" ON "source_monitor_configs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_observations_source_observed_idx" ON "source_observations" USING btree ("source_id","observed_at");--> statement-breakpoint
CREATE INDEX "source_observations_outcome_idx" ON "source_observations" USING btree ("outcome");--> statement-breakpoint
CREATE UNIQUE INDEX "source_snapshots_source_content_hash_unique" ON "source_snapshots" USING btree ("source_id","content_hash");--> statement-breakpoint
CREATE INDEX "source_snapshots_source_captured_idx" ON "source_snapshots" USING btree ("source_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_canonical_url_unique" ON "sources" USING btree ("canonical_url");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_email_normalized_unique" ON "subscribers" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_action_tokens_hash_unique" ON "subscription_action_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "subscription_action_tokens_subscription_idx" ON "subscription_action_tokens" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_subscriber_cycle_unique" ON "subscriptions" USING btree ("subscriber_id","admission_cycle_id");--> statement-breakpoint
CREATE INDEX "subscriptions_cycle_status_idx" ON "subscriptions" USING btree ("admission_cycle_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_subscriber_status_idx" ON "subscriptions" USING btree ("subscriber_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "updates_slug_unique" ON "updates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "updates_status_published_idx" ON "updates" USING btree ("status","published_at");--> statement-breakpoint
CREATE FUNCTION "set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;--> statement-breakpoint
DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'admin_users',
    'schools',
    'admission_cycles',
    'admission_events',
    'admission_facts',
    'sources',
    'source_bindings',
    'source_monitor_configs',
    'detected_changes',
    'meaningful_changes',
    'updates',
    'guides',
    'subscribers',
    'subscriptions',
    'alerts',
    'alert_deliveries'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at_before_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      target_table
    );
  END LOOP;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "validate_alert_delivery_cycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  alert_cycle_id uuid;
  subscription_cycle_id uuid;
BEGIN
  SELECT admission_cycle_id
  INTO alert_cycle_id
  FROM alerts
  WHERE id = NEW.alert_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT admission_cycle_id
  INTO subscription_cycle_id
  FROM subscriptions
  WHERE id = NEW.subscription_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF alert_cycle_id IS DISTINCT FROM subscription_cycle_id THEN
    RAISE EXCEPTION 'alert delivery must target a subscription in the alert cycle'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "validate_alert_delivery_cycle_before_write"
BEFORE INSERT OR UPDATE OF alert_id, subscription_id
ON "alert_deliveries"
FOR EACH ROW
EXECUTE FUNCTION "validate_alert_delivery_cycle"();--> statement-breakpoint
CREATE FUNCTION "validate_alert_cycle_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.admission_cycle_id IS DISTINCT FROM OLD.admission_cycle_id
    AND EXISTS (
      SELECT 1
      FROM alert_deliveries AS delivery
      JOIN subscriptions AS subscription
        ON subscription.id = delivery.subscription_id
      WHERE delivery.alert_id = NEW.id
        AND subscription.admission_cycle_id <> NEW.admission_cycle_id
    )
  THEN
    RAISE EXCEPTION 'alert cycle conflicts with an existing delivery subscription'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "validate_alert_cycle_before_update"
BEFORE UPDATE OF admission_cycle_id
ON "alerts"
FOR EACH ROW
EXECUTE FUNCTION "validate_alert_cycle_update"();--> statement-breakpoint
CREATE FUNCTION "validate_subscription_cycle_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.admission_cycle_id IS DISTINCT FROM OLD.admission_cycle_id
    AND EXISTS (
      SELECT 1
      FROM alert_deliveries AS delivery
      JOIN alerts AS alert
        ON alert.id = delivery.alert_id
      WHERE delivery.subscription_id = NEW.id
        AND alert.admission_cycle_id <> NEW.admission_cycle_id
    )
  THEN
    RAISE EXCEPTION 'subscription cycle conflicts with an existing delivery alert'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "validate_subscription_cycle_before_update"
BEFORE UPDATE OF admission_cycle_id
ON "subscriptions"
FOR EACH ROW
EXECUTE FUNCTION "validate_subscription_cycle_update"();
