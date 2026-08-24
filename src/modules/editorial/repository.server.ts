import "server-only";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { NotFoundError } from "@/src/application/errors";
import {
  articleInstitutions,
  articleOpportunities,
  articles,
  institutions,
  opportunities,
  urlRedirects,
} from "@/src/db/schema";
import type {
  DatabaseExecutor,
  TransactionExecutor,
} from "@/src/infrastructure/db/runtime.server";

export type InsertArticleDraftValues = Omit<typeof articles.$inferInsert, "id">;

export type UpdateArticleRecordValues = Partial<
  Omit<typeof articles.$inferInsert, "id" | "createdAt">
>;

function requireTransactionExecutor(
  executor: TransactionExecutor,
): TransactionExecutor {
  if (executor.scope !== "transaction") {
    throw new Error("Editorial write requires a transaction executor.");
  }
  return executor;
}

export async function findArticleById(executor: DatabaseExecutor, id: string) {
  const [article] = await executor.drizzle
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);

  return article ?? null;
}

export async function findArticleBySlug(
  executor: DatabaseExecutor,
  slug: string,
) {
  const [article] = await executor.drizzle
    .select()
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);
  return article ?? null;
}

export async function findArticleForUpdate(
  executor: TransactionExecutor,
  id: string,
) {
  requireTransactionExecutor(executor);
  const [article] = await executor.drizzle
    .select()
    .from(articles)
    .where(eq(articles.id, id))
    .for("update")
    .limit(1);

  return article ?? null;
}

export async function insertArticleDraft(
  executor: TransactionExecutor,
  values: InsertArticleDraftValues,
) {
  requireTransactionExecutor(executor);
  const [article] = await executor.drizzle
    .insert(articles)
    .values(values)
    .returning();
  return article!;
}

export async function updateArticleRecord(
  executor: TransactionExecutor,
  articleId: string,
  values: UpdateArticleRecordValues,
) {
  requireTransactionExecutor(executor);
  const [article] = await executor.drizzle
    .update(articles)
    .set(values)
    .where(eq(articles.id, articleId))
    .returning();
  if (!article) throw new NotFoundError();
  return article;
}

export async function loadArticleRelationIds(
  executor: DatabaseExecutor,
  articleId: string,
): Promise<{
  institutionIds: string[];
  opportunityIds: string[];
}> {
  const [institutionRows, opportunityRows] = await Promise.all([
    executor.drizzle
      .select({ id: articleInstitutions.institutionId })
      .from(articleInstitutions)
      .where(eq(articleInstitutions.articleId, articleId))
      .orderBy(
        asc(articleInstitutions.sortOrder),
        asc(articleInstitutions.institutionId),
      ),
    executor.drizzle
      .select({ id: articleOpportunities.opportunityId })
      .from(articleOpportunities)
      .where(eq(articleOpportunities.articleId, articleId))
      .orderBy(
        asc(articleOpportunities.sortOrder),
        asc(articleOpportunities.opportunityId),
      ),
  ]);

  return {
    institutionIds: institutionRows.map((row) => row.id),
    opportunityIds: opportunityRows.map((row) => row.id),
  };
}

export async function requireRelationTargetsExist(
  executor: TransactionExecutor,
  institutionIds: readonly string[],
  opportunityIds: readonly string[],
): Promise<void> {
  requireTransactionExecutor(executor);
  const [institutionRows, opportunityRows] = await Promise.all([
    institutionIds.length === 0
      ? Promise.resolve([])
      : executor.drizzle
          .select({ id: institutions.id })
          .from(institutions)
          .where(inArray(institutions.id, [...institutionIds])),
    opportunityIds.length === 0
      ? Promise.resolve([])
      : executor.drizzle
          .select({ id: opportunities.id })
          .from(opportunities)
          .where(inArray(opportunities.id, [...opportunityIds])),
  ]);

  if (
    institutionRows.length !== new Set(institutionIds).size ||
    opportunityRows.length !== new Set(opportunityIds).size
  ) {
    throw new NotFoundError();
  }
}

export async function replaceArticleRelations(
  executor: TransactionExecutor,
  articleId: string,
  institutionIds: readonly string[],
  opportunityIds: readonly string[],
): Promise<void> {
  requireTransactionExecutor(executor);
  const sortedInstitutionIds = [...new Set(institutionIds)].sort();
  const sortedOpportunityIds = [...new Set(opportunityIds)].sort();

  await executor.drizzle
    .delete(articleInstitutions)
    .where(eq(articleInstitutions.articleId, articleId));
  await executor.drizzle
    .delete(articleOpportunities)
    .where(eq(articleOpportunities.articleId, articleId));

  if (sortedInstitutionIds.length > 0) {
    await executor.drizzle.insert(articleInstitutions).values(
      sortedInstitutionIds.map((institutionId, sortOrder) => ({
        articleId,
        institutionId,
        relationType: "RELATED" as const,
        sortOrder,
      })),
    );
  }
  if (sortedOpportunityIds.length > 0) {
    await executor.drizzle.insert(articleOpportunities).values(
      sortedOpportunityIds.map((opportunityId, sortOrder) => ({
        articleId,
        opportunityId,
        relationType: "RELATED" as const,
        sortOrder,
      })),
    );
  }
}

export async function acquireArticleSlugRegistryLock(
  executor: TransactionExecutor,
): Promise<void> {
  requireTransactionExecutor(executor);
  await executor.raw(
    sql`select pg_advisory_xact_lock(hashtext('preppy-article-slug-registry-v1'))`,
  );
}

export async function findArticleSlugOwner(
  executor: DatabaseExecutor,
  slug: string,
) {
  const [article] = await executor.drizzle
    .select({ id: articles.id, slug: articles.slug, status: articles.status })
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);
  return article ?? null;
}

export async function findRedirectBySourcePath(
  executor: DatabaseExecutor,
  sourcePath: string,
) {
  const [redirect] = await executor.drizzle
    .select()
    .from(urlRedirects)
    .where(eq(urlRedirects.sourcePath, sourcePath))
    .limit(1);
  return redirect ?? null;
}

export async function listRedirectSourcesByTarget(
  executor: DatabaseExecutor,
  targetPath: string,
  limit: number,
): Promise<string[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 101) {
    throw new RangeError(
      "Redirect source query limit must be between 1 and 101.",
    );
  }
  const rows = await executor.drizzle
    .select({ sourcePath: urlRedirects.sourcePath })
    .from(urlRedirects)
    .where(
      and(
        eq(urlRedirects.targetPath, targetPath),
        eq(urlRedirects.statusCode, 308),
        isNull(urlRedirects.disabledAt),
      ),
    )
    .orderBy(asc(urlRedirects.sourcePath))
    .limit(limit);
  return rows.map((row) => row.sourcePath);
}

export async function upsertFlattenedArticleRedirects(
  executor: TransactionExecutor,
  sourcePath: string,
  targetPath: string,
  occurredAt: Date,
): Promise<void> {
  requireTransactionExecutor(executor);
  if (sourcePath === targetPath) {
    throw new Error("An Article redirect cannot target itself.");
  }

  await executor.drizzle
    .update(urlRedirects)
    .set({
      targetPath,
      statusCode: 308,
      disabledAt: null,
      reason: "ARTICLE_SLUG_CHANGED",
    })
    .where(
      and(
        eq(urlRedirects.targetPath, sourcePath),
        ne(urlRedirects.sourcePath, targetPath),
      ),
    );

  await executor.drizzle
    .insert(urlRedirects)
    .values({
      sourcePath,
      targetPath,
      statusCode: 308,
      createdAt: occurredAt,
      disabledAt: null,
      reason: "ARTICLE_SLUG_CHANGED",
    })
    .onConflictDoUpdate({
      target: urlRedirects.sourcePath,
      set: {
        targetPath,
        statusCode: 308,
        disabledAt: null,
        reason: "ARTICLE_SLUG_CHANGED",
      },
    });
}
