import "server-only";

import { AuditWriter } from "@/src/application/audit-writer.server";
import type { AdminCommandContext } from "@/src/application/context";
import {
  ConflictError,
  NotEligibleError,
  NotFoundError,
  ValidationError,
} from "@/src/application/errors";
import { OutboxWriter } from "@/src/application/outbox-writer.server";
import { mapDatabaseError } from "@/src/infrastructure/db/errors";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import {
  CACHE_REVALIDATION_EVENT,
  parseArticleCacheRevalidationOutboxInput,
  type ArticleCacheReason,
  type ArticleCacheRevalidationPayloadV1,
} from "@/src/modules/cache/revalidation-contract";

import {
  type ArticleCommandResult,
  type ArticleSlugChangeResult,
  parseArticleLifecycleInput,
  parseChangeArticleSlugInput,
  parseCreateArticleDraftInput,
  parsePublishArticleInput,
  parseSetArticleRelationsInput,
  parseUpdateArticleDraftInput,
} from "./contracts";
import {
  acquireArticleSlugRegistryLock,
  findArticleForUpdate,
  findArticleSlugOwner,
  findRedirectBySourcePath,
  insertArticleDraft,
  loadArticleRelationIds,
  listRedirectSourcesByTarget,
  replaceArticleRelations,
  requireRelationTargetsExist,
  updateArticleRecord,
  upsertFlattenedArticleRedirects,
} from "./repository.server";
import { sanitizeArticleHtmlV1 } from "./sanitizer.server";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type ArticleCommandDependencies = Readonly<{
  transactionManager: Pick<TransactionManager, "run">;
  appBaseUrl: string;
  sanitizeHtml?: typeof sanitizeArticleHtmlV1;
  writeAudit?: typeof AuditWriter.write;
  enqueueOutbox?: typeof OutboxWriter.enqueue;
}>;

function parseContext(context: AdminCommandContext): AdminCommandContext {
  if (
    !UUID.test(context.adminUserId) ||
    !UUID.test(context.correlationId) ||
    !(context.occurredAt instanceof Date) ||
    !Number.isFinite(context.occurredAt.getTime())
  ) {
    throw ValidationError.invalidRequest();
  }
  return context;
}

function selfCanonicalUrl(
  candidate: string | null,
  slug: string,
  appBaseUrl: string,
): string | null {
  if (candidate === null) return null;
  let app: URL;
  try {
    app = new URL(appBaseUrl);
  } catch {
    throw ValidationError.invalidRequest();
  }
  if (
    (app.protocol !== "http:" && app.protocol !== "https:") ||
    app.username !== "" ||
    app.password !== ""
  ) {
    throw ValidationError.invalidRequest();
  }
  const expected = new URL(`/articles/${slug}`, app.origin).toString();
  if (candidate !== expected) throw ValidationError.invalidRequest();
  return expected;
}

function result(article: {
  id: string;
  status: ArticleCommandResult["status"];
  updatedAt: Date;
}): ArticleCommandResult {
  return {
    articleId: article.id,
    status: article.status,
    updatedAt: article.updatedAt.toISOString(),
  };
}

async function executeMapped<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const cause =
      typeof error === "object" && error !== null && "cause" in error
        ? error.cause
        : error;
    throw mapDatabaseError(cause);
  }
}

function requireMutableDraftState(status: string): void {
  if (status !== "DRAFT" && status !== "UNPUBLISHED") {
    throw new NotEligibleError();
  }
}

function requireExpectedUpdatedAt(
  current: Date,
  expectedUpdatedAt: string,
): void {
  if (current.toISOString() !== expectedUpdatedAt) throw new ConflictError();
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

async function enqueueCacheIntent(
  executor: Parameters<typeof OutboxWriter.enqueue>[1],
  context: AdminCommandContext,
  articleId: string,
  reason: ArticleCacheReason,
  currentCanonicalPath: `/articles/${string}`,
  relations: Readonly<{
    institutionIds: readonly string[];
    opportunityIds: readonly string[];
  }>,
  enqueueOutbox: typeof OutboxWriter.enqueue,
  previousCanonicalPath?: `/articles/${string}`,
): Promise<void> {
  const payloadSafe: ArticleCacheRevalidationPayloadV1 = {
    version: 1,
    articleId,
    reason,
    currentCanonicalPath,
    ...(previousCanonicalPath === undefined ? {} : { previousCanonicalPath }),
    relatedInstitutionIds: [...relations.institutionIds].sort(),
    relatedOpportunityIds: [...relations.opportunityIds].sort(),
  };
  const validated = parseArticleCacheRevalidationOutboxInput({
    eventType: CACHE_REVALIDATION_EVENT,
    aggregateType: "ARTICLE",
    aggregateId: articleId,
    payloadSafe,
  });
  if (!validated) throw ValidationError.invalidRequest();
  await enqueueOutbox(
    {
      ...validated,
      dedupeKey: `${CACHE_REVALIDATION_EVENT}:${articleId}:${reason}:${context.correlationId}`,
      availableAt: context.occurredAt,
    },
    executor,
  );
}

export function createArticleDraft(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult> {
  const parsedContext = parseContext(context);
  const input = parseCreateArticleDraftInput(rawInput);
  const sanitizeHtml = dependencies.sanitizeHtml ?? sanitizeArticleHtmlV1;
  const writeAudit = dependencies.writeAudit ?? AuditWriter.write;

  return executeMapped(() =>
    dependencies.transactionManager.run(async (executor) => {
      await acquireArticleSlugRegistryLock(executor);
      const canonicalPath = `/articles/${input.slug}`;
      const [slugOwner, redirect] = await Promise.all([
        findArticleSlugOwner(executor, input.slug),
        findRedirectBySourcePath(executor, canonicalPath),
      ]);
      if (slugOwner || redirect) throw new ConflictError();

      const sanitized = sanitizeHtml("", {
        appBaseUrl: dependencies.appBaseUrl,
      });
      const article = await insertArticleDraft(executor, {
        slug: input.slug,
        type: input.type,
        category: input.category,
        status: "DRAFT",
        title: input.title,
        excerpt: null,
        contentHtml: sanitized.html,
        seoTitle: null,
        seoDescription: null,
        canonicalUrl: null,
        robotsIndex: false,
        robotsFollow: true,
        featuredImageUrl: null,
        featuredImageAlt: null,
        authorAdminId: parsedContext.adminUserId,
        publishedAt: null,
        unpublishedAt: null,
        archivedAt: null,
        createdAt: parsedContext.occurredAt,
        updatedAt: parsedContext.occurredAt,
      });

      await writeAudit(
        {
          adminUserId: parsedContext.adminUserId,
          actionType: "ARTICLE_DRAFT_CREATED",
          entityType: "ARTICLE",
          entityId: article.id,
          correlationId: parsedContext.correlationId,
          occurredAt: parsedContext.occurredAt,
          metadata: {
            changedFields: [
              "SLUG",
              "TITLE",
              "TYPE",
              "CATEGORY",
              "CONTENT_HTML",
              "ROBOTS_INDEX",
              "ROBOTS_FOLLOW",
              "AUTHOR_ADMIN_ID",
            ],
            contentFingerprint: sanitized.fingerprint,
          },
        },
        executor,
      );

      return result(article);
    }),
  );
}

export function updateArticleDraft(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult> {
  const parsedContext = parseContext(context);
  const input = parseUpdateArticleDraftInput(rawInput);
  const sanitizeHtml = dependencies.sanitizeHtml ?? sanitizeArticleHtmlV1;
  const writeAudit = dependencies.writeAudit ?? AuditWriter.write;

  return executeMapped(() =>
    dependencies.transactionManager.run(async (executor) => {
      const current = await findArticleForUpdate(executor, input.articleId);
      if (!current) throw new NotFoundError();
      requireMutableDraftState(current.status);
      requireExpectedUpdatedAt(current.updatedAt, input.expectedUpdatedAt);

      const sanitized = sanitizeHtml(input.candidate.contentHtml, {
        appBaseUrl: dependencies.appBaseUrl,
      });
      const canonicalUrl = selfCanonicalUrl(
        input.candidate.canonicalUrl,
        current.slug,
        dependencies.appBaseUrl,
      );
      const article = await updateArticleRecord(executor, current.id, {
        title: input.candidate.title,
        type: input.candidate.type,
        category: input.candidate.category,
        excerpt: input.candidate.excerpt,
        contentHtml: sanitized.html,
        seoTitle: input.candidate.seoTitle,
        seoDescription: input.candidate.seoDescription,
        canonicalUrl,
        robotsIndex: input.candidate.robotsIndex,
        robotsFollow: input.candidate.robotsFollow,
        featuredImageUrl: input.candidate.featuredImageUrl,
        featuredImageAlt: input.candidate.featuredImageAlt,
        updatedAt: parsedContext.occurredAt,
      });

      await writeAudit(
        {
          adminUserId: parsedContext.adminUserId,
          actionType: "ARTICLE_DRAFT_UPDATED",
          entityType: "ARTICLE",
          entityId: article.id,
          correlationId: parsedContext.correlationId,
          occurredAt: parsedContext.occurredAt,
          metadata: {
            changedFields: [
              "TITLE",
              "TYPE",
              "CATEGORY",
              "EXCERPT",
              "CONTENT_HTML",
              "SEO_TITLE",
              "SEO_DESCRIPTION",
              "CANONICAL_URL",
              "ROBOTS_INDEX",
              "ROBOTS_FOLLOW",
              "FEATURED_IMAGE_URL",
              "FEATURED_IMAGE_ALT",
            ],
            contentFingerprint: sanitized.fingerprint,
          },
        },
        executor,
      );
      return result(article);
    }),
  );
}

export function setArticleRelations(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult> {
  const parsedContext = parseContext(context);
  const input = parseSetArticleRelationsInput(rawInput);
  const writeAudit = dependencies.writeAudit ?? AuditWriter.write;

  return executeMapped(() =>
    dependencies.transactionManager.run(async (executor) => {
      const current = await findArticleForUpdate(executor, input.articleId);
      if (!current) throw new NotFoundError();
      requireMutableDraftState(current.status);
      requireExpectedUpdatedAt(current.updatedAt, input.expectedUpdatedAt);
      await requireRelationTargetsExist(
        executor,
        input.institutionIds,
        input.opportunityIds,
      );
      await replaceArticleRelations(
        executor,
        current.id,
        input.institutionIds,
        input.opportunityIds,
      );
      const article = await updateArticleRecord(executor, current.id, {
        updatedAt: parsedContext.occurredAt,
      });
      await writeAudit(
        {
          adminUserId: parsedContext.adminUserId,
          actionType: "ARTICLE_RELATIONS_UPDATED",
          entityType: "ARTICLE",
          entityId: article.id,
          correlationId: parsedContext.correlationId,
          occurredAt: parsedContext.occurredAt,
          metadata: {
            changedFields: ["INSTITUTION_RELATIONS", "OPPORTUNITY_RELATIONS"],
          },
        },
        executor,
      );
      return result(article);
    }),
  );
}

export function publishArticle(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult> {
  const parsedContext = parseContext(context);
  const input = parsePublishArticleInput(rawInput);
  const sanitizeHtml = dependencies.sanitizeHtml ?? sanitizeArticleHtmlV1;
  const writeAudit = dependencies.writeAudit ?? AuditWriter.write;
  const enqueueOutbox = dependencies.enqueueOutbox ?? OutboxWriter.enqueue;

  return executeMapped(() =>
    dependencies.transactionManager.run(async (executor) => {
      const current = await findArticleForUpdate(executor, input.articleId);
      if (!current) throw new NotFoundError();
      if (
        current.status !== "DRAFT" &&
        current.status !== "UNPUBLISHED" &&
        current.status !== "PUBLISHED"
      ) {
        throw new NotEligibleError();
      }
      requireExpectedUpdatedAt(current.updatedAt, input.expectedUpdatedAt);

      const sanitized = sanitizeHtml(input.candidate.contentHtml, {
        appBaseUrl: dependencies.appBaseUrl,
      });
      if (
        sanitized.nonWhitespaceCodePoints < 40 ||
        (input.candidate.seoDescription ?? input.candidate.excerpt) === null
      ) {
        throw new NotEligibleError();
      }
      let canonicalUrl: string | null;
      try {
        canonicalUrl = selfCanonicalUrl(
          input.candidate.canonicalUrl,
          current.slug,
          dependencies.appBaseUrl,
        );
      } catch (error) {
        if (error instanceof ValidationError) throw new NotEligibleError();
        throw error;
      }

      await requireRelationTargetsExist(
        executor,
        input.candidate.institutionIds,
        input.candidate.opportunityIds,
      );
      const existingRelations = await loadArticleRelationIds(
        executor,
        current.id,
      );
      const relationsChanged =
        !sameIds(
          existingRelations.institutionIds,
          input.candidate.institutionIds,
        ) ||
        !sameIds(
          existingRelations.opportunityIds,
          input.candidate.opportunityIds,
        );
      const reason: ArticleCacheReason =
        current.status === "DRAFT"
          ? "ARTICLE_PUBLISHED"
          : current.status === "PUBLISHED" && relationsChanged
            ? "ARTICLE_RELATIONS_CHANGED"
            : "ARTICLE_REPUBLISHED";

      await replaceArticleRelations(
        executor,
        current.id,
        input.candidate.institutionIds,
        input.candidate.opportunityIds,
      );
      const article = await updateArticleRecord(executor, current.id, {
        title: input.candidate.title,
        type: input.candidate.type,
        category: input.candidate.category,
        excerpt: input.candidate.excerpt,
        contentHtml: sanitized.html,
        seoTitle: input.candidate.seoTitle,
        seoDescription: input.candidate.seoDescription,
        canonicalUrl,
        robotsIndex: input.candidate.robotsIndex,
        robotsFollow: input.candidate.robotsFollow,
        featuredImageUrl: input.candidate.featuredImageUrl,
        featuredImageAlt: input.candidate.featuredImageAlt,
        status: "PUBLISHED",
        publishedAt: current.publishedAt ?? parsedContext.occurredAt,
        unpublishedAt: null,
        archivedAt: null,
        updatedAt: parsedContext.occurredAt,
      });
      await writeAudit(
        {
          adminUserId: parsedContext.adminUserId,
          actionType: reason,
          entityType: "ARTICLE",
          entityId: article.id,
          correlationId: parsedContext.correlationId,
          occurredAt: parsedContext.occurredAt,
          metadata: {
            changedFields: [
              "TITLE",
              "TYPE",
              "CATEGORY",
              "EXCERPT",
              "CONTENT_HTML",
              "SEO_TITLE",
              "SEO_DESCRIPTION",
              "CANONICAL_URL",
              "ROBOTS_INDEX",
              "ROBOTS_FOLLOW",
              "FEATURED_IMAGE_URL",
              "FEATURED_IMAGE_ALT",
              "STATUS",
              "PUBLISHED_AT",
              "UNPUBLISHED_AT",
              "INSTITUTION_RELATIONS",
              "OPPORTUNITY_RELATIONS",
            ],
            contentFingerprint: sanitized.fingerprint,
          },
        },
        executor,
      );
      await enqueueCacheIntent(
        executor,
        parsedContext,
        article.id,
        reason,
        `/articles/${article.slug}`,
        {
          institutionIds: input.candidate.institutionIds,
          opportunityIds: input.candidate.opportunityIds,
        },
        enqueueOutbox,
      );
      return result(article);
    }),
  );
}

export function unpublishArticle(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult> {
  const parsedContext = parseContext(context);
  const input = parseArticleLifecycleInput(rawInput);
  const writeAudit = dependencies.writeAudit ?? AuditWriter.write;
  const enqueueOutbox = dependencies.enqueueOutbox ?? OutboxWriter.enqueue;

  return executeMapped(() =>
    dependencies.transactionManager.run(async (executor) => {
      const current = await findArticleForUpdate(executor, input.articleId);
      if (!current) throw new NotFoundError();
      if (current.status !== "PUBLISHED") throw new NotEligibleError();
      requireExpectedUpdatedAt(current.updatedAt, input.expectedUpdatedAt);
      const article = await updateArticleRecord(executor, current.id, {
        status: "UNPUBLISHED",
        unpublishedAt: parsedContext.occurredAt,
        updatedAt: parsedContext.occurredAt,
      });
      const relations = await loadArticleRelationIds(executor, current.id);
      await writeAudit(
        {
          adminUserId: parsedContext.adminUserId,
          actionType: "ARTICLE_UNPUBLISHED",
          entityType: "ARTICLE",
          entityId: article.id,
          correlationId: parsedContext.correlationId,
          occurredAt: parsedContext.occurredAt,
          metadata: {
            changedFields: ["STATUS", "UNPUBLISHED_AT", "UPDATED_AT"],
          },
        },
        executor,
      );
      await enqueueCacheIntent(
        executor,
        parsedContext,
        article.id,
        "ARTICLE_UNPUBLISHED",
        `/articles/${article.slug}`,
        relations,
        enqueueOutbox,
      );
      return result(article);
    }),
  );
}

export function archiveArticle(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleCommandResult> {
  const parsedContext = parseContext(context);
  const input = parseArticleLifecycleInput(rawInput);
  const writeAudit = dependencies.writeAudit ?? AuditWriter.write;
  const enqueueOutbox = dependencies.enqueueOutbox ?? OutboxWriter.enqueue;

  return executeMapped(() =>
    dependencies.transactionManager.run(async (executor) => {
      const current = await findArticleForUpdate(executor, input.articleId);
      if (!current) throw new NotFoundError();
      if (current.status === "ARCHIVED") throw new NotEligibleError();
      requireExpectedUpdatedAt(current.updatedAt, input.expectedUpdatedAt);
      const wasPublic = current.status === "PUBLISHED";
      const article = await updateArticleRecord(executor, current.id, {
        status: "ARCHIVED",
        archivedAt: parsedContext.occurredAt,
        updatedAt: parsedContext.occurredAt,
      });
      await writeAudit(
        {
          adminUserId: parsedContext.adminUserId,
          actionType: "ARTICLE_ARCHIVED",
          entityType: "ARTICLE",
          entityId: article.id,
          correlationId: parsedContext.correlationId,
          occurredAt: parsedContext.occurredAt,
          metadata: {
            changedFields: ["STATUS", "ARCHIVED_AT", "UPDATED_AT"],
          },
        },
        executor,
      );
      if (wasPublic) {
        const relations = await loadArticleRelationIds(executor, current.id);
        await enqueueCacheIntent(
          executor,
          parsedContext,
          article.id,
          "ARTICLE_ARCHIVED",
          `/articles/${article.slug}`,
          relations,
          enqueueOutbox,
        );
      }
      return result(article);
    }),
  );
}

export function changeArticleSlug(
  context: AdminCommandContext,
  rawInput: unknown,
  dependencies: ArticleCommandDependencies,
): Promise<ArticleSlugChangeResult> {
  const parsedContext = parseContext(context);
  const input = parseChangeArticleSlugInput(rawInput);
  const writeAudit = dependencies.writeAudit ?? AuditWriter.write;
  const enqueueOutbox = dependencies.enqueueOutbox ?? OutboxWriter.enqueue;

  return executeMapped(() =>
    dependencies.transactionManager.run(async (executor) => {
      const current = await findArticleForUpdate(executor, input.articleId);
      if (!current) throw new NotFoundError();
      if (current.status === "ARCHIVED") throw new NotEligibleError();
      requireExpectedUpdatedAt(current.updatedAt, input.expectedUpdatedAt);
      if (current.slug === input.newSlug) throw new ConflictError();

      await acquireArticleSlugRegistryLock(executor);
      const previousCanonicalPath = `/articles/${current.slug}` as const;
      const currentCanonicalPath = `/articles/${input.newSlug}` as const;
      const [slugOwner, redirectSource] = await Promise.all([
        findArticleSlugOwner(executor, input.newSlug),
        findRedirectBySourcePath(executor, currentCanonicalPath),
      ]);
      if (slugOwner || redirectSource) throw new ConflictError();

      let canonicalUrl: string | null = null;
      if (current.canonicalUrl !== null) {
        try {
          selfCanonicalUrl(
            current.canonicalUrl,
            current.slug,
            dependencies.appBaseUrl,
          );
          const app = new URL(dependencies.appBaseUrl);
          canonicalUrl = new URL(currentCanonicalPath, app.origin).toString();
        } catch (error) {
          if (error instanceof ValidationError) throw new NotEligibleError();
          throw error;
        }
      }

      const article = await updateArticleRecord(executor, current.id, {
        slug: input.newSlug,
        canonicalUrl,
        updatedAt: parsedContext.occurredAt,
      });
      const affectsHistory = current.publishedAt !== null;
      if (affectsHistory) {
        await upsertFlattenedArticleRedirects(
          executor,
          previousCanonicalPath,
          currentCanonicalPath,
          parsedContext.occurredAt,
        );
        const historicalSources = await listRedirectSourcesByTarget(
          executor,
          currentCanonicalPath,
          101,
        );
        if (historicalSources.length > 100) throw new ConflictError();
      }

      await writeAudit(
        {
          adminUserId: parsedContext.adminUserId,
          actionType: "ARTICLE_SLUG_CHANGED",
          entityType: "ARTICLE",
          entityId: article.id,
          correlationId: parsedContext.correlationId,
          occurredAt: parsedContext.occurredAt,
          metadata: {
            changedFields: ["SLUG", "CANONICAL_URL", "UPDATED_AT"],
          },
        },
        executor,
      );
      if (affectsHistory) {
        const relations = await loadArticleRelationIds(executor, article.id);
        await enqueueCacheIntent(
          executor,
          parsedContext,
          article.id,
          "ARTICLE_SLUG_CHANGED",
          currentCanonicalPath,
          relations,
          enqueueOutbox,
          previousCanonicalPath,
        );
      }

      return {
        ...result(article),
        previousCanonicalPath,
        currentCanonicalPath,
      };
    }),
  );
}
