import "server-only";

import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import {
  admissionEventVersions,
  articleInstitutions,
  articleOpportunities,
  articles,
  institutions,
  opportunities,
  opportunityAdmissionEventLinks,
  opportunityVersions,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { sanitizeArticleHtmlV1 } from "@/src/modules/editorial/sanitizer.server";

import type {
  AdminArticleDTO,
  AdminArticleDetailDTO,
  AdminPageDTO,
  ArticleRelationOptionDTO,
} from "./contracts";
import {
  parseArticleAdminListInput,
  parseArticleRelationOptionsInput,
} from "./input";

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

async function relationCounts(
  executor: DatabaseExecutor,
  articleIds: readonly string[],
): Promise<{
  institutions: Map<string, number>;
  opportunities: Map<string, number>;
}> {
  if (articleIds.length === 0) {
    return { institutions: new Map(), opportunities: new Map() };
  }
  const [institutionRows, opportunityRows] = await Promise.all([
    executor.drizzle
      .select({
        articleId: articleInstitutions.articleId,
        count: sql<number>`count(*)::int`,
      })
      .from(articleInstitutions)
      .where(inArray(articleInstitutions.articleId, articleIds))
      .groupBy(articleInstitutions.articleId),
    executor.drizzle
      .select({
        articleId: articleOpportunities.articleId,
        count: sql<number>`count(*)::int`,
      })
      .from(articleOpportunities)
      .where(inArray(articleOpportunities.articleId, articleIds))
      .groupBy(articleOpportunities.articleId),
  ]);
  return {
    institutions: new Map(
      institutionRows.map((row) => [row.articleId, row.count]),
    ),
    opportunities: new Map(
      opportunityRows.map((row) => [row.articleId, row.count]),
    ),
  };
}

export async function listAdminArticles(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<AdminArticleDTO>> {
  const input = parseArticleAdminListInput(rawInput);
  const conditions = [
    input.type === undefined ? undefined : eq(articles.type, input.type),
    input.status === undefined ? undefined : eq(articles.status, input.status),
  ].filter((condition) => condition !== undefined);
  const where = conditions.length === 0 ? undefined : and(...conditions);
  const [rows, totals] = await Promise.all([
    executor.drizzle
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        type: articles.type,
        category: articles.category,
        status: articles.status,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(where)
      .orderBy(desc(articles.updatedAt), desc(articles.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(articles)
      .where(where),
  ]);
  const counts = await relationCounts(
    executor,
    rows.map((row) => row.id),
  );
  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      type: row.type,
      category: row.category,
      status: row.status,
      publishedAt: iso(row.publishedAt),
      institutionRelationCount: counts.institutions.get(row.id) ?? 0,
      opportunityRelationCount: counts.opportunities.get(row.id) ?? 0,
    })),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      hasNext: input.page * input.pageSize < total,
    },
  };
}

export async function getAdminArticleDetail(
  executor: DatabaseExecutor,
  articleId: string,
  appBaseUrl: string,
): Promise<AdminArticleDetailDTO | null> {
  const rows = await executor.drizzle
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      type: articles.type,
      category: articles.category,
      status: articles.status,
      publishedAt: articles.publishedAt,
      excerpt: articles.excerpt,
      unsafeStoredContentHtml: articles.contentHtml,
      seoTitle: articles.seoTitle,
      seoDescription: articles.seoDescription,
      canonicalUrl: articles.canonicalUrl,
      robotsIndex: articles.robotsIndex,
      robotsFollow: articles.robotsFollow,
      featuredImageUrl: articles.featuredImageUrl,
      featuredImageAlt: articles.featuredImageAlt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const [institutionRows, opportunityRows, counts] = await Promise.all([
    executor.drizzle
      .select({ id: articleInstitutions.institutionId })
      .from(articleInstitutions)
      .where(eq(articleInstitutions.articleId, articleId))
      .orderBy(asc(articleInstitutions.institutionId)),
    executor.drizzle
      .select({ id: articleOpportunities.opportunityId })
      .from(articleOpportunities)
      .where(eq(articleOpportunities.articleId, articleId))
      .orderBy(asc(articleOpportunities.opportunityId)),
    relationCounts(executor, [articleId]),
  ]);
  const sanitizedContentHtml = sanitizeArticleHtmlV1(
    row.unsafeStoredContentHtml,
    { appBaseUrl },
  ).html;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    category: row.category,
    status: row.status,
    publishedAt: iso(row.publishedAt),
    institutionRelationCount: counts.institutions.get(row.id) ?? 0,
    opportunityRelationCount: counts.opportunities.get(row.id) ?? 0,
    excerpt: row.excerpt,
    sanitizedContentHtml,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    canonicalUrl: row.canonicalUrl,
    robotsIndex: row.robotsIndex,
    robotsFollow: row.robotsFollow,
    featuredImageUrl: row.featuredImageUrl,
    featuredImageAlt: row.featuredImageAlt,
    institutionIds: institutionRows.map((item) => item.id),
    opportunityIds: opportunityRows.map((item) => item.id),
    updatedAt: iso(row.updatedAt)!,
  };
}

function projectPage<T>(
  items: readonly T[],
  input: Readonly<{ page: number; pageSize: number }>,
  total: number,
): AdminPageDTO<T> {
  return {
    items,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      hasNext: input.page * input.pageSize < total,
    },
  };
}

export async function listAdminArticleInstitutionOptions(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<ArticleRelationOptionDTO>> {
  const input = parseArticleRelationOptionsInput(rawInput);
  const where =
    input.query === undefined
      ? undefined
      : or(
          ilike(institutions.displayName, `%${input.query}%`),
          ilike(institutions.slug, `%${input.query}%`),
        );
  const [rows, totals] = await Promise.all([
    executor.drizzle
      .select({
        id: institutions.id,
        slug: institutions.slug,
        label: institutions.displayName,
      })
      .from(institutions)
      .where(where)
      .orderBy(
        asc(sql`lower(${institutions.displayName})`),
        asc(institutions.id),
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(institutions)
      .where(where),
  ]);
  return projectPage(rows, input, totals[0]?.total ?? 0);
}

export async function listAdminArticleOpportunityOptions(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<ArticleRelationOptionDTO>> {
  const input = parseArticleRelationOptionsInput(rawInput);
  const label = sql<string>`coalesce(${opportunityVersions.title}, ${admissionEventVersions.displayTitle}, ${opportunities.slug})`;
  const where =
    input.query === undefined
      ? undefined
      : or(
          ilike(opportunities.slug, `%${input.query}%`),
          ilike(label, `%${input.query}%`),
        );
  const joined = () =>
    executor.drizzle
      .select({ id: opportunities.id, slug: opportunities.slug, label })
      .from(opportunities)
      .leftJoin(
        opportunityVersions,
        and(
          eq(opportunityVersions.opportunityId, opportunities.id),
          eq(opportunityVersions.isCurrent, true),
        ),
      )
      .leftJoin(
        opportunityAdmissionEventLinks,
        eq(opportunityAdmissionEventLinks.opportunityId, opportunities.id),
      )
      .leftJoin(
        admissionEventVersions,
        and(
          eq(
            admissionEventVersions.admissionEventId,
            opportunityAdmissionEventLinks.admissionEventId,
          ),
          eq(admissionEventVersions.isCurrent, true),
        ),
      );
  const [rows, totals] = await Promise.all([
    joined()
      .where(where)
      .orderBy(asc(sql`lower(${label})`), asc(opportunities.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    executor.drizzle
      .select({ total: sql<number>`count(distinct ${opportunities.id})::int` })
      .from(opportunities)
      .leftJoin(
        opportunityVersions,
        and(
          eq(opportunityVersions.opportunityId, opportunities.id),
          eq(opportunityVersions.isCurrent, true),
        ),
      )
      .leftJoin(
        opportunityAdmissionEventLinks,
        eq(opportunityAdmissionEventLinks.opportunityId, opportunities.id),
      )
      .leftJoin(
        admissionEventVersions,
        and(
          eq(
            admissionEventVersions.admissionEventId,
            opportunityAdmissionEventLinks.admissionEventId,
          ),
          eq(admissionEventVersions.isCurrent, true),
        ),
      )
      .where(where),
  ]);
  return projectPage(rows, input, totals[0]?.total ?? 0);
}
