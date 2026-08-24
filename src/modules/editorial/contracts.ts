import { z } from "zod";

import { ValidationError } from "@/src/application/errors";
import {
  articleCategoryValues,
  articleTypeValues,
  type ArticleCategory,
  type ArticleStatus,
  type ArticleType,
} from "@/src/db/schema";

import { ARTICLE_CANONICAL_SLUG } from "./article-links.server";
import { ARTICLE_HTML_MAX_BYTES } from "./sanitizer.server";

const ARTICLE_SLUG_MAX_CHARACTERS = 120;
const ARTICLE_TITLE_MAX_CODE_POINTS = 160;
const ARTICLE_EXCERPT_MAX_CODE_POINTS = 500;
const ARTICLE_SEO_TITLE_MAX_CODE_POINTS = 70;
const ARTICLE_SEO_DESCRIPTION_MAX_CODE_POINTS = 320;
const ARTICLE_URL_MAX_CHARACTERS = 2_048;
const ARTICLE_IMAGE_ALT_MAX_CODE_POINTS = 300;
const ARTICLE_RELATION_MAX_ITEMS = 12;
const FORBIDDEN_MEMBER_NAMES = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

function isPlainDataTree(
  value: unknown,
  ancestors = new Set<object>(),
): boolean {
  if (value === null || typeof value !== "object") return true;
  if (ancestors.has(value)) return false;
  ancestors.add(value);

  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    const valid =
      keys.length === value.length + 1 &&
      keys.includes("length") &&
      keys.every((key) => typeof key === "string") &&
      Array.from({ length: value.length }, (_, index) => String(index)).every(
        (key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return (
            descriptor?.enumerable === true &&
            "value" in descriptor &&
            isPlainDataTree(descriptor.value, ancestors)
          );
        },
      );
    ancestors.delete(value);
    return valid;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    ancestors.delete(value);
    return false;
  }

  const valid = Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string" || FORBIDDEN_MEMBER_NAMES.has(key)) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor?.enumerable === true &&
      "value" in descriptor &&
      isPlainDataTree(descriptor.value, ancestors)
    );
  });
  ancestors.delete(value);
  return valid;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  if (!isPlainDataTree(value)) throw ValidationError.invalidRequest();
  const result = schema.safeParse(value);
  if (!result.success) throw ValidationError.fromZodError(result.error);
  return result.data;
}

function codePointLength(value: string): number {
  return [...value].length;
}

function normalizedText(maxCodePoints: number, allowEmpty: boolean) {
  return z
    .string()
    .transform((value) => value.trim().replace(/\s+/gu, " "))
    .refine(
      (value) =>
        (allowEmpty || value.length > 0) &&
        codePointLength(value) <= maxCodePoints,
    );
}

function normalizedNullableText(maxCodePoints: number) {
  return z
    .union([z.string(), z.null()])
    .transform((value) => {
      if (value === null) return null;
      const normalized = value.trim().replace(/\s+/gu, " ");
      return normalized === "" ? null : normalized;
    })
    .refine(
      (value) => value === null || codePointLength(value) <= maxCodePoints,
    );
}

function absoluteHttpUrl(value: string): string | null {
  if (value.length > ARTICLE_URL_MAX_CHARACTERS) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== ""
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

const nullableHttpUrlSchema = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    const trimmed = value.trim();
    if (trimmed === "") return null;
    return trimmed;
  })
  .refine((value) => value === null || absoluteHttpUrl(value) !== null)
  .transform((value) =>
    value === null ? null : (absoluteHttpUrl(value) as string),
  );

const exactIsoTimestamp = z.string().refine((value) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
});

const canonicalSlug = z
  .string()
  .max(ARTICLE_SLUG_MAX_CHARACTERS)
  .regex(ARTICLE_CANONICAL_SLUG);

const relationIds = z
  .array(z.uuid())
  .transform((values) => [...new Set(values)].sort())
  .refine((values) => values.length <= ARTICLE_RELATION_MAX_ITEMS);

const articleDraftCandidateSchema = z
  .object({
    title: normalizedText(ARTICLE_TITLE_MAX_CODE_POINTS, false),
    type: z.enum(articleTypeValues),
    category: z.enum(articleCategoryValues),
    excerpt: normalizedNullableText(ARTICLE_EXCERPT_MAX_CODE_POINTS),
    contentHtml: z
      .string()
      .refine(
        (value) => Buffer.byteLength(value, "utf8") <= ARTICLE_HTML_MAX_BYTES,
      ),
    seoTitle: normalizedNullableText(ARTICLE_SEO_TITLE_MAX_CODE_POINTS),
    seoDescription: normalizedNullableText(
      ARTICLE_SEO_DESCRIPTION_MAX_CODE_POINTS,
    ),
    canonicalUrl: nullableHttpUrlSchema,
    robotsIndex: z.boolean(),
    robotsFollow: z.boolean(),
    featuredImageUrl: nullableHttpUrlSchema,
    featuredImageAlt: normalizedNullableText(ARTICLE_IMAGE_ALT_MAX_CODE_POINTS),
  })
  .strict();

const articlePublishCandidateSchema = articleDraftCandidateSchema
  .extend({
    institutionIds: relationIds,
    opportunityIds: relationIds,
  })
  .strict();

const createArticleDraftInputSchema = z
  .object({
    slug: canonicalSlug,
    title: normalizedText(ARTICLE_TITLE_MAX_CODE_POINTS, false),
    type: z.enum(articleTypeValues),
    category: z.enum(articleCategoryValues),
  })
  .strict();

const updateArticleDraftInputSchema = z
  .object({
    articleId: z.uuid(),
    expectedUpdatedAt: exactIsoTimestamp,
    candidate: articleDraftCandidateSchema,
  })
  .strict();

const setArticleRelationsInputSchema = z
  .object({
    articleId: z.uuid(),
    expectedUpdatedAt: exactIsoTimestamp,
    institutionIds: relationIds,
    opportunityIds: relationIds,
  })
  .strict();

const publishArticleInputSchema = z
  .object({
    articleId: z.uuid(),
    expectedUpdatedAt: exactIsoTimestamp,
    candidate: articlePublishCandidateSchema,
  })
  .strict();

const articleLifecycleInputSchema = z
  .object({
    articleId: z.uuid(),
    expectedUpdatedAt: exactIsoTimestamp,
  })
  .strict();

const changeArticleSlugInputSchema = articleLifecycleInputSchema
  .extend({ newSlug: canonicalSlug })
  .strict();

export type ArticleDraftCandidate = Readonly<{
  title: string;
  type: ArticleType;
  category: ArticleCategory;
  excerpt: string | null;
  contentHtml: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
}>;

export type ArticlePublishCandidate = ArticleDraftCandidate &
  Readonly<{
    institutionIds: readonly string[];
    opportunityIds: readonly string[];
  }>;

export type CreateArticleDraftInput = Readonly<{
  slug: string;
  title: string;
  type: ArticleType;
  category: ArticleCategory;
}>;

export type UpdateArticleDraftInput = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
  candidate: ArticleDraftCandidate;
}>;

export type SetArticleRelationsInput = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
  institutionIds: readonly string[];
  opportunityIds: readonly string[];
}>;

export type PublishArticleInput = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
  candidate: ArticlePublishCandidate;
}>;

export type ArticleLifecycleInput = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
}>;

export type ChangeArticleSlugInput = Readonly<{
  articleId: string;
  expectedUpdatedAt: string;
  newSlug: string;
}>;

export type ArticleCommandResult = Readonly<{
  articleId: string;
  status: ArticleStatus;
  updatedAt: string;
}>;

export type ArticleSlugChangeResult = ArticleCommandResult &
  Readonly<{
    previousCanonicalPath: `/articles/${string}`;
    currentCanonicalPath: `/articles/${string}`;
  }>;

export function parseArticleDraftCandidate(
  value: unknown,
): ArticleDraftCandidate {
  return parse(articleDraftCandidateSchema, value);
}

export function parseArticlePublishCandidate(
  value: unknown,
): ArticlePublishCandidate {
  return parse(articlePublishCandidateSchema, value);
}

export function parseCreateArticleDraftInput(
  value: unknown,
): CreateArticleDraftInput {
  return parse(createArticleDraftInputSchema, value);
}

export function parseUpdateArticleDraftInput(
  value: unknown,
): UpdateArticleDraftInput {
  return parse(updateArticleDraftInputSchema, value);
}

export function parseSetArticleRelationsInput(
  value: unknown,
): SetArticleRelationsInput {
  return parse(setArticleRelationsInputSchema, value);
}

export function parsePublishArticleInput(value: unknown): PublishArticleInput {
  return parse(publishArticleInputSchema, value);
}

export function parseArticleLifecycleInput(
  value: unknown,
): ArticleLifecycleInput {
  return parse(articleLifecycleInputSchema, value);
}

export function parseChangeArticleSlugInput(
  value: unknown,
): ChangeArticleSlugInput {
  return parse(changeArticleSlugInputSchema, value);
}

export function articleCanonicalPath(slug: string): `/articles/${string}` {
  return `/articles/${slug}`;
}

export const ARTICLE_CONTRACT_LIMITS = Object.freeze({
  slugCharacters: ARTICLE_SLUG_MAX_CHARACTERS,
  titleCodePoints: ARTICLE_TITLE_MAX_CODE_POINTS,
  excerptCodePoints: ARTICLE_EXCERPT_MAX_CODE_POINTS,
  seoTitleCodePoints: ARTICLE_SEO_TITLE_MAX_CODE_POINTS,
  seoDescriptionCodePoints: ARTICLE_SEO_DESCRIPTION_MAX_CODE_POINTS,
  urlCharacters: ARTICLE_URL_MAX_CHARACTERS,
  imageAltCodePoints: ARTICLE_IMAGE_ALT_MAX_CODE_POINTS,
  relationItems: ARTICLE_RELATION_MAX_ITEMS,
});
