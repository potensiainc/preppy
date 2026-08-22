CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"truth_mode" text NOT NULL,
	"publication_state" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "opportunities_id_institution_unique" UNIQUE("id","institution_id"),
	CONSTRAINT "opportunities_id_truth_mode_unique" UNIQUE("id","truth_mode"),
	CONSTRAINT "opportunities_slug_format_check" CHECK ("opportunities"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "opportunities_kind_check" CHECK ("opportunities"."kind" in ('RECRUITMENT', 'ADDITIONAL_RECRUITMENT', 'INFORMATION_SESSION', 'CONSULTATION', 'LEVEL_TEST', 'OPEN_HOUSE', 'APPLICATION', 'DOCUMENT_SUBMISSION', 'ASSESSMENT', 'INTERVIEW', 'LOTTERY', 'RESULT_ANNOUNCEMENT', 'REGISTRATION', 'DEADLINE', 'OTHER')),
	CONSTRAINT "opportunities_truth_mode_check" CHECK ("opportunities"."truth_mode" in ('NATIVE', 'LEGACY_BACKED')),
	CONSTRAINT "opportunities_publication_state_check" CHECK ("opportunities"."publication_state" in ('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE TABLE "opportunity_admission_event_links" (
	"opportunity_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"truth_mode" text DEFAULT 'LEGACY_BACKED' NOT NULL,
	"admission_event_id" uuid NOT NULL,
	"admission_cycle_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_admission_event_links_pkey" PRIMARY KEY("opportunity_id"),
	CONSTRAINT "opportunity_admission_event_links_truth_mode_check" CHECK ("opportunity_admission_event_links"."truth_mode" = 'LEGACY_BACKED')
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_admission_event_links" ADD CONSTRAINT "opportunity_event_links_opportunity_institution_fk" FOREIGN KEY ("opportunity_id","institution_id") REFERENCES "public"."opportunities"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_admission_event_links" ADD CONSTRAINT "opportunity_event_links_opportunity_truth_mode_fk" FOREIGN KEY ("opportunity_id","truth_mode") REFERENCES "public"."opportunities"("id","truth_mode") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_admission_event_links" ADD CONSTRAINT "opportunity_event_links_institution_school_fk" FOREIGN KEY ("institution_id","school_id") REFERENCES "public"."institution_school_links"("institution_id","school_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_admission_event_links" ADD CONSTRAINT "opportunity_event_links_event_cycle_fk" FOREIGN KEY ("admission_event_id","admission_cycle_id") REFERENCES "public"."admission_events"("id","admission_cycle_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_admission_event_links" ADD CONSTRAINT "opportunity_event_links_cycle_school_fk" FOREIGN KEY ("admission_cycle_id","school_id") REFERENCES "public"."admission_cycles"("id","school_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_slug_unique" ON "opportunities" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "opportunities_institution_publication_idx" ON "opportunities" USING btree ("institution_id","publication_state");--> statement-breakpoint
CREATE INDEX "opportunities_publication_kind_idx" ON "opportunities" USING btree ("publication_state","kind");--> statement-breakpoint
CREATE INDEX "opportunities_publication_published_idx" ON "opportunities" USING btree ("publication_state","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "opportunities_institution_kind_idx" ON "opportunities" USING btree ("institution_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_admission_event_links_event_unique" ON "opportunity_admission_event_links" USING btree ("admission_event_id");
--> statement-breakpoint
CREATE TRIGGER "set_updated_at_before_update_opportunities"
BEFORE UPDATE ON "opportunities"
FOR EACH ROW
EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE FUNCTION "validate_published_legacy_opportunity_bridge"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_opportunity_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'opportunities' THEN
    target_opportunity_id := NEW.id;
  ELSE
    target_opportunity_id := OLD.opportunity_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM opportunities AS opportunity
    WHERE opportunity.id = target_opportunity_id
      AND opportunity.truth_mode = 'LEGACY_BACKED'
      AND opportunity.publication_state = 'PUBLISHED'
  ) AND NOT EXISTS (
    SELECT 1
    FROM opportunity_admission_event_links AS link
    WHERE link.opportunity_id = target_opportunity_id
  ) THEN
    RAISE EXCEPTION
      'PUBLISHED LEGACY_BACKED Opportunity % requires an AdmissionEvent bridge',
      target_opportunity_id
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "opportunities_published_legacy_bridge_check"
AFTER INSERT OR UPDATE ON "opportunities"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "validate_published_legacy_opportunity_bridge"();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "opportunity_links_published_legacy_bridge_check"
AFTER DELETE OR UPDATE ON "opportunity_admission_event_links"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION "validate_published_legacy_opportunity_bridge"();
