CREATE TABLE "article_institutions" (
	"article_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"relation_type" text DEFAULT 'RELATED' NOT NULL,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_institutions_article_institution_relation_unique" UNIQUE("article_id","institution_id","relation_type"),
	CONSTRAINT "article_institutions_relation_type_check" CHECK ("article_institutions"."relation_type" = 'RELATED')
);
--> statement-breakpoint
CREATE TABLE "article_opportunities" (
	"article_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"relation_type" text DEFAULT 'RELATED' NOT NULL,
	"sort_order" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_opportunities_article_opportunity_relation_unique" UNIQUE("article_id","opportunity_id","relation_type"),
	CONSTRAINT "article_opportunities_relation_type_check" CHECK ("article_opportunities"."relation_type" = 'RELATED')
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text,
	"content_html" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"canonical_url" text,
	"robots_index" boolean NOT NULL,
	"robots_follow" boolean NOT NULL,
	"featured_image_url" text,
	"featured_image_alt" text,
	"author_admin_id" uuid,
	"published_at" timestamp with time zone,
	"unpublished_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "articles_slug_format_check" CHECK ("articles"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "articles_type_check" CHECK ("articles"."type" in ('GUIDE', 'UPDATE', 'ROUNDUP')),
	CONSTRAINT "articles_category_check" CHECK ("articles"."category" in ('ENGLISH_KINDERGARTEN', 'PRIVATE_ELEMENTARY', 'INTERNATIONAL_SCHOOL', 'ADMISSIONS_GENERAL')),
	CONSTRAINT "articles_status_check" CHECK ("articles"."status" in ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')),
	CONSTRAINT "articles_published_completeness_check" CHECK ("articles"."status" <> 'PUBLISHED' or (length(regexp_replace("articles"."title", '[[:space:]]', '', 'g')) > 0 and length(regexp_replace("articles"."content_html", '[[:space:]]', '', 'g')) > 0 and "articles"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "url_redirects" (
	"source_path" text PRIMARY KEY NOT NULL,
	"target_path" text NOT NULL,
	"status_code" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	"reason" text,
	CONSTRAINT "url_redirects_status_code_check" CHECK ("url_redirects"."status_code" in (301, 308)),
	CONSTRAINT "url_redirects_not_self_check" CHECK ("url_redirects"."source_path" <> "url_redirects"."target_path"),
	CONSTRAINT "url_redirects_source_path_safe_check" CHECK ("url_redirects"."source_path" ~ '^/' and "url_redirects"."source_path" !~ '^//' and "url_redirects"."source_path" !~ '[[:space:]\\?#:]' and "url_redirects"."source_path" !~ '[[:cntrl:]]'),
	CONSTRAINT "url_redirects_target_path_safe_check" CHECK ("url_redirects"."target_path" ~ '^/' and "url_redirects"."target_path" !~ '^//' and "url_redirects"."target_path" !~ '[[:space:]\\?#:]' and "url_redirects"."target_path" !~ '[[:cntrl:]]')
);
--> statement-breakpoint
ALTER TABLE "article_institutions" ADD CONSTRAINT "article_institutions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_institutions" ADD CONSTRAINT "article_institutions_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_opportunities" ADD CONSTRAINT "article_opportunities_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_opportunities" ADD CONSTRAINT "article_opportunities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_admin_id_admin_users_id_fk" FOREIGN KEY ("author_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_institutions_target_article_idx" ON "article_institutions" USING btree ("institution_id","article_id");--> statement-breakpoint
CREATE INDEX "article_opportunities_target_article_idx" ON "article_opportunities" USING btree ("opportunity_id","article_id");--> statement-breakpoint
CREATE INDEX "articles_status_published_idx" ON "articles" USING btree ("status","published_at" DESC NULLS LAST);