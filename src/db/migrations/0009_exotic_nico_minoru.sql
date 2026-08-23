CREATE TABLE "institution_source_bindings" (
	"institution_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"role" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unbound_at" timestamp with time zone,
	CONSTRAINT "institution_source_bindings_target_source_role_unique" UNIQUE("institution_id","source_id","role"),
	CONSTRAINT "institution_source_bindings_role_check" CHECK ("institution_source_bindings"."role" in ('OFFICIAL_MAIN', 'ADMISSIONS', 'TUITION', 'CURRICULUM', 'APPLICATION', 'OTHER')),
	CONSTRAINT "institution_source_bindings_lifecycle_check" CHECK (("institution_source_bindings"."is_active" = true and "institution_source_bindings"."unbound_at" is null) or ("institution_source_bindings"."is_active" = false and "institution_source_bindings"."unbound_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "opportunity_source_bindings" (
	"opportunity_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"role" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unbound_at" timestamp with time zone,
	CONSTRAINT "opportunity_source_bindings_target_source_role_unique" UNIQUE("opportunity_id","source_id","role"),
	CONSTRAINT "opportunity_source_bindings_role_check" CHECK ("opportunity_source_bindings"."role" in ('PRIMARY_NOTICE', 'APPLICATION', 'DETAILS', 'SUPPORTING', 'OTHER')),
	CONSTRAINT "opportunity_source_bindings_lifecycle_check" CHECK (("opportunity_source_bindings"."is_active" = true and "opportunity_source_bindings"."unbound_at" is null) or ("opportunity_source_bindings"."is_active" = false and "opportunity_source_bindings"."unbound_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "institution_source_bindings" ADD CONSTRAINT "institution_source_bindings_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_source_bindings" ADD CONSTRAINT "institution_source_bindings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_source_bindings" ADD CONSTRAINT "opportunity_source_bindings_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_source_bindings" ADD CONSTRAINT "opportunity_source_bindings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "institution_source_bindings_institution_active_idx" ON "institution_source_bindings" USING btree ("institution_id","is_active");--> statement-breakpoint
CREATE INDEX "institution_source_bindings_source_active_idx" ON "institution_source_bindings" USING btree ("source_id","is_active");--> statement-breakpoint
CREATE INDEX "institution_source_bindings_role_active_idx" ON "institution_source_bindings" USING btree ("role","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "institution_source_bindings_active_primary_main_unique" ON "institution_source_bindings" USING btree ("institution_id") WHERE "institution_source_bindings"."is_primary" = true and "institution_source_bindings"."is_active" = true and "institution_source_bindings"."role" = 'OFFICIAL_MAIN';--> statement-breakpoint
CREATE INDEX "opportunity_source_bindings_opportunity_active_idx" ON "opportunity_source_bindings" USING btree ("opportunity_id","is_active");--> statement-breakpoint
CREATE INDEX "opportunity_source_bindings_source_active_idx" ON "opportunity_source_bindings" USING btree ("source_id","is_active");--> statement-breakpoint
CREATE INDEX "opportunity_source_bindings_role_active_idx" ON "opportunity_source_bindings" USING btree ("role","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_source_bindings_active_primary_role_unique" ON "opportunity_source_bindings" USING btree ("opportunity_id","role") WHERE "opportunity_source_bindings"."is_primary" = true and "opportunity_source_bindings"."is_active" = true;