import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_shared";
import { adminUsers } from "./admin";
import { institutions } from "./institutions";
import { opportunities } from "./opportunities";

export const articleTypeValues = ["GUIDE", "UPDATE", "ROUNDUP"] as const;
export type ArticleType = (typeof articleTypeValues)[number];

export const articleCategoryValues = [
  "ENGLISH_KINDERGARTEN",
  "PRIVATE_ELEMENTARY",
  "INTERNATIONAL_SCHOOL",
  "ADMISSIONS_GENERAL",
] as const;
export type ArticleCategory = (typeof articleCategoryValues)[number];

export const articleStatusValues = [
  "DRAFT",
  "PUBLISHED",
  "UNPUBLISHED",
  "ARCHIVED",
] as const;
export type ArticleStatus = (typeof articleStatusValues)[number];

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    type: text("type").$type<ArticleType>().notNull(),
    category: text("category").$type<ArticleCategory>().notNull(),
    status: text("status").$type<ArticleStatus>().notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    contentHtml: text("content_html").notNull(),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    canonicalUrl: text("canonical_url"),
    robotsIndex: boolean("robots_index").notNull(),
    robotsFollow: boolean("robots_follow").notNull(),
    featuredImageUrl: text("featured_image_url"),
    featuredImageAlt: text("featured_image_alt"),
    authorAdminId: uuid("author_admin_id").references(() => adminUsers.id, {
      onDelete: "restrict",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    unpublishedAt: timestamp("unpublished_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("articles_slug_unique").on(table.slug),
    index("articles_status_published_idx").on(
      table.status,
      table.publishedAt.desc(),
    ),
    check(
      "articles_slug_format_check",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "articles_type_check",
      sql`${table.type} in ('GUIDE', 'UPDATE', 'ROUNDUP')`,
    ),
    check(
      "articles_category_check",
      sql`${table.category} in ('ENGLISH_KINDERGARTEN', 'PRIVATE_ELEMENTARY', 'INTERNATIONAL_SCHOOL', 'ADMISSIONS_GENERAL')`,
    ),
    check(
      "articles_status_check",
      sql`${table.status} in ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')`,
    ),
    check(
      "articles_published_completeness_check",
      sql`${table.status} <> 'PUBLISHED' or (length(regexp_replace(${table.title}, '[[:space:]]', '', 'g')) > 0 and length(regexp_replace(${table.contentHtml}, '[[:space:]]', '', 'g')) > 0 and ${table.publishedAt} is not null)`,
    ),
  ],
);

export const articleRelationTypeValues = ["RELATED"] as const;
export type ArticleRelationType = (typeof articleRelationTypeValues)[number];

export const articleInstitutions = pgTable(
  "article_institutions",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    relationType: text("relation_type")
      .$type<ArticleRelationType>()
      .notNull()
      .default("RELATED"),
    sortOrder: integer("sort_order"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("article_institutions_article_institution_relation_unique").on(
      table.articleId,
      table.institutionId,
      table.relationType,
    ),
    index("article_institutions_target_article_idx").on(
      table.institutionId,
      table.articleId,
    ),
    check(
      "article_institutions_relation_type_check",
      sql`${table.relationType} = 'RELATED'`,
    ),
  ],
);

export const articleOpportunities = pgTable(
  "article_opportunities",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "restrict" }),
    relationType: text("relation_type")
      .$type<ArticleRelationType>()
      .notNull()
      .default("RELATED"),
    sortOrder: integer("sort_order"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("article_opportunities_article_opportunity_relation_unique").on(
      table.articleId,
      table.opportunityId,
      table.relationType,
    ),
    index("article_opportunities_target_article_idx").on(
      table.opportunityId,
      table.articleId,
    ),
    check(
      "article_opportunities_relation_type_check",
      sql`${table.relationType} = 'RELATED'`,
    ),
  ],
);

export const urlRedirects = pgTable(
  "url_redirects",
  {
    sourcePath: text("source_path").primaryKey(),
    targetPath: text("target_path").notNull(),
    statusCode: integer("status_code").notNull(),
    createdAt: createdAt(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    reason: text("reason"),
  },
  (table) => [
    check(
      "url_redirects_status_code_check",
      sql`${table.statusCode} in (301, 308)`,
    ),
    check(
      "url_redirects_not_self_check",
      sql`${table.sourcePath} <> ${table.targetPath}`,
    ),
    check(
      "url_redirects_source_path_safe_check",
      sql`${table.sourcePath} ~ '^/' and ${table.sourcePath} !~ '^//' and ${table.sourcePath} !~ '[[:space:]\\\\?#:]' and ${table.sourcePath} !~ '[[:cntrl:]]'`,
    ),
    check(
      "url_redirects_target_path_safe_check",
      sql`${table.targetPath} ~ '^/' and ${table.targetPath} !~ '^//' and ${table.targetPath} !~ '[[:space:]\\\\?#:]' and ${table.targetPath} !~ '[[:cntrl:]]'`,
    ),
  ],
);
