CREATE TABLE "institution_school_links" (
	"institution_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"link_reason" text,
	CONSTRAINT "institution_school_links_pkey" PRIMARY KEY("institution_id"),
	CONSTRAINT "institution_school_links_institution_school_unique" UNIQUE("institution_id","school_id")
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"category" text NOT NULL,
	"international_subtype" text,
	"operational_state" text DEFAULT 'UNKNOWN' NOT NULL,
	"publication_state" text DEFAULT 'DRAFT' NOT NULL,
	"region_code" text,
	"city" text,
	"district" text,
	"address_line" text,
	"latitude" numeric,
	"longitude" numeric,
	"website_url" text,
	"short_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "institutions_category_check" CHECK ("institutions"."category" in ('ENGLISH_KINDERGARTEN', 'PRIVATE_ELEMENTARY', 'INTERNATIONAL_SCHOOL')),
	CONSTRAINT "institutions_international_subtype_check" CHECK ("institutions"."international_subtype" is null or "institutions"."international_subtype" in ('INTERNATIONAL_SCHOOL', 'FOREIGN_SCHOOL', 'OTHER_INTERNATIONAL')),
	CONSTRAINT "institutions_subtype_category_check" CHECK ("institutions"."category" = 'INTERNATIONAL_SCHOOL' or "institutions"."international_subtype" is null),
	CONSTRAINT "institutions_operational_state_check" CHECK ("institutions"."operational_state" in ('ACTIVE', 'INACTIVE', 'CLOSED', 'UNKNOWN')),
	CONSTRAINT "institutions_publication_state_check" CHECK ("institutions"."publication_state" in ('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED')),
	CONSTRAINT "institutions_latitude_range_check" CHECK ("institutions"."latitude" is null or ("institutions"."latitude" >= -90 and "institutions"."latitude" <= 90)),
	CONSTRAINT "institutions_longitude_range_check" CHECK ("institutions"."longitude" is null or ("institutions"."longitude" >= -180 and "institutions"."longitude" <= 180))
);
--> statement-breakpoint
ALTER TABLE "institution_school_links" ADD CONSTRAINT "institution_school_links_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "institution_school_links" ADD CONSTRAINT "institution_school_links_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "institution_school_links_school_id_unique" ON "institution_school_links" USING btree ("school_id");--> statement-breakpoint
CREATE UNIQUE INDEX "institutions_slug_unique" ON "institutions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "institutions_publication_category_idx" ON "institutions" USING btree ("publication_state","category");--> statement-breakpoint
CREATE INDEX "institutions_publication_region_idx" ON "institutions" USING btree ("publication_state","region_code");--> statement-breakpoint
CREATE INDEX "institutions_category_region_district_idx" ON "institutions" USING btree ("category","region_code","district");--> statement-breakpoint
CREATE INDEX "institutions_display_name_idx" ON "institutions" USING btree ("display_name");--> statement-breakpoint
CREATE TRIGGER "set_updated_at_before_update_institutions"
BEFORE UPDATE ON "institutions"
FOR EACH ROW
EXECUTE FUNCTION "set_updated_at"();
