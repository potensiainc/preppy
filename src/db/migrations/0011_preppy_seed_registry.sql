CREATE TABLE "institution_registry_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"registry_name" text NOT NULL,
	"registry_external_id" text NOT NULL,
	"registry_record_url" text NOT NULL,
	"registry_locator" text NOT NULL,
	"metadata_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "institution_registry_identities_registry_unique" UNIQUE("registry_name","registry_external_id"),
	CONSTRAINT "institution_registry_identities_registry_name_check" CHECK ("institution_registry_identities"."registry_name" in ('SCHOOLINFO', 'ISI'))
);
--> statement-breakpoint
ALTER TABLE "institution_source_bindings" DROP CONSTRAINT "institution_source_bindings_role_check";--> statement-breakpoint
ALTER TABLE "sources" DROP CONSTRAINT "sources_source_type_check";--> statement-breakpoint
ALTER TABLE "institution_registry_identities" ADD CONSTRAINT "institution_registry_identities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institution_registry_identities_institution_idx" ON "institution_registry_identities" USING btree ("institution_id");--> statement-breakpoint
ALTER TABLE "institution_source_bindings" ADD CONSTRAINT "institution_source_bindings_role_check" CHECK ("institution_source_bindings"."role" in ('OFFICIAL_MAIN', 'REGISTRY_IDENTITY', 'ADMISSIONS', 'TUITION', 'CURRICULUM', 'APPLICATION', 'OTHER'));--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_source_type_check" CHECK ("sources"."source_type" in ('OFFICIAL_ADMISSION_PAGE', 'OFFICIAL_NOTICE_BOARD', 'OFFICIAL_DOCUMENT', 'OFFICIAL_APPLICATION_PORTAL', 'OFFICIAL_SCHOOL_PAGE', 'OFFICIAL_REGISTRY', 'OFFICIAL_SOCIAL', 'THIRD_PARTY_DISCOVERY', 'OTHER'));