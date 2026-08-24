import "server-only";

import { z } from "zod";

import type { AdminCommandContext } from "@/src/application/context";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { getAdminLogoutConfig } from "@/src/modules/admin/auth/config.server";
import {
  runAdminCommandRequest,
  type AdminCommandRequestDependencies,
} from "@/src/modules/admin/http/command-handler.server";
import {
  archiveArticle,
  changeArticleSlug,
  createArticleDraft,
  publishArticle,
  setArticleRelations,
  unpublishArticle,
  updateArticleDraft,
} from "@/src/modules/editorial/article-commands.server";
import type {
  ArticleCommandResult,
  ArticleSlugChangeResult,
} from "@/src/modules/editorial/contracts";
import { articleCategoryValues, articleTypeValues } from "@/src/db/schema";

const ARTICLE_MAX_BODY_BYTES = 192 * 1024;
const ARTICLE_MAX_STRING_BYTES = 128 * 1024;
const exactIsoTimestamp = z.string().refine((value) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
});
const articlePathSchema = z.object({ articleId: z.uuid() }).strict();
const expectedBodySchema = z
  .object({ expectedUpdatedAt: exactIsoTimestamp })
  .strict();
const nullableText = (max: number) => z.string().max(max).nullable();
const nullableHttpUrl = z
  .string()
  .max(2_048)
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
  .nullable();
const relationIds = z.array(z.uuid()).max(12);
const draftCandidateSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    type: z.enum(articleTypeValues),
    category: z.enum(articleCategoryValues),
    excerpt: nullableText(500),
    contentHtml: z.string(),
    seoTitle: nullableText(70),
    seoDescription: nullableText(320),
    canonicalUrl: nullableHttpUrl,
    robotsIndex: z.boolean(),
    robotsFollow: z.boolean(),
    featuredImageUrl: nullableHttpUrl,
    featuredImageAlt: nullableText(300),
  })
  .strict();
const createBodySchema = z
  .object({
    slug: z
      .string()
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    title: z.string().trim().min(1).max(160),
    type: z.enum(articleTypeValues),
    category: z.enum(articleCategoryValues),
  })
  .strict();
const updateBodySchema = z
  .object({
    expectedUpdatedAt: exactIsoTimestamp,
    candidate: draftCandidateSchema,
  })
  .strict();
const relationsBodySchema = z
  .object({
    expectedUpdatedAt: exactIsoTimestamp,
    institutionIds: relationIds,
    opportunityIds: relationIds,
  })
  .strict();
const publishBodySchema = z
  .object({
    expectedUpdatedAt: exactIsoTimestamp,
    candidate: draftCandidateSchema
      .extend({ institutionIds: relationIds, opportunityIds: relationIds })
      .strict(),
  })
  .strict();
const slugBodySchema = z
  .object({
    expectedUpdatedAt: exactIsoTimestamp,
    newSlug: z
      .string()
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  })
  .strict();
const noPathSchema = z.object({}).strict();

type ArticleHttpCommand = (
  context: AdminCommandContext,
  input: unknown,
) => Promise<ArticleCommandResult>;
type ArticleSlugHttpCommand = (
  context: AdminCommandContext,
  input: unknown,
) => Promise<ArticleSlugChangeResult>;

export type AdminArticleCommandRequestDependencies =
  Partial<AdminCommandRequestDependencies> &
    Readonly<{
      createArticleDraft?: ArticleHttpCommand;
      updateArticleDraft?: ArticleHttpCommand;
      setArticleRelations?: ArticleHttpCommand;
      publishArticle?: ArticleHttpCommand;
      unpublishArticle?: ArticleHttpCommand;
      archiveArticle?: ArticleHttpCommand;
      changeArticleSlug?: ArticleSlugHttpCommand;
    }>;

function commandDependencies() {
  return {
    transactionManager: getRuntimeDatabase().transactionManager,
    appBaseUrl: getAdminLogoutConfig().APP_BASE_URL,
  };
}

const defaultCreate: ArticleHttpCommand = (context, input) =>
  createArticleDraft(context, input, commandDependencies());
const defaultUpdate: ArticleHttpCommand = (context, input) =>
  updateArticleDraft(context, input, commandDependencies());
const defaultRelations: ArticleHttpCommand = (context, input) =>
  setArticleRelations(context, input, commandDependencies());
const defaultPublish: ArticleHttpCommand = (context, input) =>
  publishArticle(context, input, commandDependencies());
const defaultUnpublish: ArticleHttpCommand = (context, input) =>
  unpublishArticle(context, input, commandDependencies());
const defaultArchive: ArticleHttpCommand = (context, input) =>
  archiveArticle(context, input, commandDependencies());
const defaultSlug: ArticleSlugHttpCommand = (context, input) =>
  changeArticleSlug(context, input, commandDependencies());

function articleRequest<TPath, TBody, TResult>(options: {
  request: Request;
  rawPath: unknown;
  pathSchema: z.ZodType<TPath>;
  bodySchema: z.ZodType<TBody>;
  reason: string;
  command: (context: AdminCommandContext, input: unknown) => Promise<TResult>;
  dependencies: Partial<AdminCommandRequestDependencies>;
  combine: (path: TPath, body: TBody) => unknown;
}): Promise<Response> {
  return runAdminCommandRequest({
    request: options.request,
    rawPath: options.rawPath,
    pathSchema: options.pathSchema,
    bodySchema: options.bodySchema,
    reason: options.reason,
    dependencies: options.dependencies,
    maxBodyBytes: ARTICLE_MAX_BODY_BYTES,
    maxStringBytes: ARTICLE_MAX_STRING_BYTES,
    execute: ({ context, path, body }) =>
      options.command(context, options.combine(path, body)),
  });
}

export function handleAdminCreateArticleRequest(
  request: Request,
  dependencies: AdminArticleCommandRequestDependencies = {},
): Promise<Response> {
  const { createArticleDraft: command = defaultCreate, ...pipeline } =
    dependencies;
  return articleRequest({
    request,
    rawPath: {},
    pathSchema: noPathSchema,
    bodySchema: createBodySchema,
    reason: "ARTICLE_CREATED",
    command,
    dependencies: pipeline,
    combine: (_path, body) => body,
  });
}

export function handleAdminUpdateArticleDraftRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminArticleCommandRequestDependencies = {},
): Promise<Response> {
  const { updateArticleDraft: command = defaultUpdate, ...pipeline } =
    dependencies;
  return articleRequest({
    request,
    rawPath,
    pathSchema: articlePathSchema,
    bodySchema: updateBodySchema,
    reason: "ARTICLE_DRAFT_UPDATED",
    command,
    dependencies: pipeline,
    combine: (path, body) => ({ articleId: path.articleId, ...body }),
  });
}

export function handleAdminSetArticleRelationsRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminArticleCommandRequestDependencies = {},
): Promise<Response> {
  const { setArticleRelations: command = defaultRelations, ...pipeline } =
    dependencies;
  return articleRequest({
    request,
    rawPath,
    pathSchema: articlePathSchema,
    bodySchema: relationsBodySchema,
    reason: "ARTICLE_RELATIONS_UPDATED",
    command,
    dependencies: pipeline,
    combine: (path, body) => ({ articleId: path.articleId, ...body }),
  });
}

export function handleAdminPublishArticleRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminArticleCommandRequestDependencies = {},
): Promise<Response> {
  const { publishArticle: command = defaultPublish, ...pipeline } =
    dependencies;
  return articleRequest({
    request,
    rawPath,
    pathSchema: articlePathSchema,
    bodySchema: publishBodySchema,
    reason: "ARTICLE_PUBLISHED",
    command,
    dependencies: pipeline,
    combine: (path, body) => ({ articleId: path.articleId, ...body }),
  });
}

export function handleAdminUnpublishArticleRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminArticleCommandRequestDependencies = {},
): Promise<Response> {
  const { unpublishArticle: command = defaultUnpublish, ...pipeline } =
    dependencies;
  return articleRequest({
    request,
    rawPath,
    pathSchema: articlePathSchema,
    bodySchema: expectedBodySchema,
    reason: "ARTICLE_UNPUBLISHED",
    command,
    dependencies: pipeline,
    combine: (path, body) => ({ articleId: path.articleId, ...body }),
  });
}

export function handleAdminArchiveArticleRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminArticleCommandRequestDependencies = {},
): Promise<Response> {
  const { archiveArticle: command = defaultArchive, ...pipeline } =
    dependencies;
  return articleRequest({
    request,
    rawPath,
    pathSchema: articlePathSchema,
    bodySchema: expectedBodySchema,
    reason: "ARTICLE_ARCHIVED",
    command,
    dependencies: pipeline,
    combine: (path, body) => ({ articleId: path.articleId, ...body }),
  });
}

export function handleAdminChangeArticleSlugRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminArticleCommandRequestDependencies = {},
): Promise<Response> {
  const { changeArticleSlug: command = defaultSlug, ...pipeline } =
    dependencies;
  return articleRequest({
    request,
    rawPath,
    pathSchema: articlePathSchema,
    bodySchema: slugBodySchema,
    reason: "ARTICLE_SLUG_CHANGED",
    command,
    dependencies: pipeline,
    combine: (path, body) => ({ articleId: path.articleId, ...body }),
  });
}
