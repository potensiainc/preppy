CREATE TABLE "opportunity_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_series_id_institution_unique" UNIQUE("id","institution_id"),
	CONSTRAINT "opportunity_series_slug_format_check" CHECK ("opportunity_series"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "opportunity_series_title_check" CHECK (length(btrim("opportunity_series"."title")) > 0),
	CONSTRAINT "opportunity_series_kind_check" CHECK ("opportunity_series"."kind" in ('RECRUITMENT', 'ADDITIONAL_RECRUITMENT', 'INFORMATION_SESSION', 'CONSULTATION', 'LEVEL_TEST', 'OPEN_HOUSE', 'APPLICATION', 'DOCUMENT_SUBMISSION', 'ASSESSMENT', 'INTERVIEW', 'LOTTERY', 'RESULT_ANNOUNCEMENT', 'REGISTRATION', 'DEADLINE', 'OTHER'))
);
--> statement-breakpoint
CREATE TABLE "opportunity_series_members" (
	"opportunity_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"session_number" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_series_members_pkey" PRIMARY KEY("opportunity_id"),
	CONSTRAINT "opportunity_series_members_session_number_check" CHECK ("opportunity_series_members"."session_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "opportunity_series" ADD CONSTRAINT "opportunity_series_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_series_members" ADD CONSTRAINT "opportunity_series_members_opportunity_institution_fk" FOREIGN KEY ("opportunity_id","institution_id") REFERENCES "public"."opportunities"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_series_members" ADD CONSTRAINT "opportunity_series_members_series_institution_fk" FOREIGN KEY ("series_id","institution_id") REFERENCES "public"."opportunity_series"("id","institution_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_series_slug_unique" ON "opportunity_series" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "opportunity_series_institution_kind_idx" ON "opportunity_series" USING btree ("institution_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunity_series_members_number_unique" ON "opportunity_series_members" USING btree ("series_id","session_number");--> statement-breakpoint
CREATE INDEX "opportunity_series_members_series_idx" ON "opportunity_series_members" USING btree ("series_id");--> statement-breakpoint

-- Explicitly preserve the five reviewed multi-session groups already present in
-- the private-elementary catalog. Missing fixtures are skipped; future imports
-- write the same explicit series/member records in the persistence layer.
WITH seed(id, slug, title, opportunity_slug) AS (VALUES
  ('64b3181e-b572-5954-8a35-bc8d481bc2f1'::uuid, 'gwangwoon-2027-information-sessions', '2027학년도 광운초등학교 입학설명회', 'live-admissions-511a74d5-ed4f-5cf8-95c7-25477feffb2c-2027-event-session-1'),
  ('65c2527e-15dd-5f95-aee4-1e80c8a8e562'::uuid, 'donggwang-2027-information-sessions', '2027학년도 동광초등학교 입학설명회', 'live-admissions-301c71ed-7d55-591a-9499-a66332a9a783-2027-event-session-1'),
  ('66d07943-e8ff-5075-80bc-bc6ae0f6a149'::uuid, 'seongdong-current-information-sessions', '성동초등학교 입학설명회', 'live-admissions-10367b3a-a743-57df-9906-c4fb6bfe97d5-current-event-session-1'),
  ('67bd0955-125b-51bc-93c8-e18d95276323'::uuid, 'hanshin-2026-information-sessions', '2026학년도 한신초등학교 입학설명회·학교탐방', 'live-admissions-409f2fe0-f572-5c0f-89ab-9c11cd726424-2026-event-session-1'),
  ('68f51abb-47cd-5a3c-92bc-64ce0c0d2b3c'::uuid, 'hwarang-2027-information-sessions', '2027학년도 화랑초등학교 입학설명회', 'live-admissions-bbad0468-6d31-5061-8a48-dcc9acb50167-2027-event-session-1')
)
INSERT INTO opportunity_series (id, institution_id, slug, title, kind)
SELECT seed.id, opportunity.institution_id, seed.slug, seed.title, 'INFORMATION_SESSION'
FROM seed
JOIN opportunities opportunity ON opportunity.slug = seed.opportunity_slug
ON CONFLICT DO NOTHING;--> statement-breakpoint

WITH seed(series_slug, opportunity_slug, session_number) AS (VALUES
  ('gwangwoon-2027-information-sessions', 'live-admissions-511a74d5-ed4f-5cf8-95c7-25477feffb2c-2027-event-session-1', 1),
  ('gwangwoon-2027-information-sessions', 'live-admissions-511a74d5-ed4f-5cf8-95c7-25477feffb2c-2027-event-session-2', 2),
  ('gwangwoon-2027-information-sessions', 'live-admissions-511a74d5-ed4f-5cf8-95c7-25477feffb2c-2027-event-session-3', 3),
  ('donggwang-2027-information-sessions', 'live-admissions-301c71ed-7d55-591a-9499-a66332a9a783-2027-event-session-1', 1),
  ('donggwang-2027-information-sessions', 'live-admissions-301c71ed-7d55-591a-9499-a66332a9a783-2027-event-session-2', 2),
  ('seongdong-current-information-sessions', 'live-admissions-10367b3a-a743-57df-9906-c4fb6bfe97d5-current-event-session-1', 1),
  ('seongdong-current-information-sessions', 'live-admissions-10367b3a-a743-57df-9906-c4fb6bfe97d5-current-event-session-2', 2),
  ('hanshin-2026-information-sessions', 'live-admissions-409f2fe0-f572-5c0f-89ab-9c11cd726424-2026-event-session-1', 1),
  ('hanshin-2026-information-sessions', 'live-admissions-409f2fe0-f572-5c0f-89ab-9c11cd726424-2026-event-session-2', 2),
  ('hwarang-2027-information-sessions', 'live-admissions-bbad0468-6d31-5061-8a48-dcc9acb50167-2027-event-session-1', 1),
  ('hwarang-2027-information-sessions', 'live-admissions-bbad0468-6d31-5061-8a48-dcc9acb50167-2027-event-session-2', 2),
  ('hwarang-2027-information-sessions', 'live-admissions-bbad0468-6d31-5061-8a48-dcc9acb50167-2027-event-session-3', 3)
)
INSERT INTO opportunity_series_members (
  opportunity_id, series_id, institution_id, session_number
)
SELECT opportunity.id, series.id, opportunity.institution_id, seed.session_number
FROM seed
JOIN opportunity_series series ON series.slug = seed.series_slug
JOIN opportunities opportunity
  ON opportunity.slug = seed.opportunity_slug
 AND opportunity.institution_id = series.institution_id
ON CONFLICT DO NOTHING;
