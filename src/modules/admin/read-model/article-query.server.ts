import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import {
  articleInstitutions,
  articleOpportunities,
  articles,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type { AdminArticleDTO, AdminPageDTO } from "./contracts";
import { parseArticleAdminListInput } from "./input";

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
