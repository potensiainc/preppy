export const CACHE_REVALIDATION_EVENT = "CACHE_REVALIDATION_REQUESTED" as const;

export const articleCacheReasons = [
  "ARTICLE_PUBLISHED",
  "ARTICLE_REPUBLISHED",
  "ARTICLE_UNPUBLISHED",
  "ARTICLE_ARCHIVED",
  "ARTICLE_SLUG_CHANGED",
  "ARTICLE_RELATIONS_CHANGED",
] as const;

export type ArticleCacheReason = (typeof articleCacheReasons)[number];

export type ArticleCacheRevalidationPayloadV1 = Readonly<{
  version: 1;
  articleId: string;
  reason: ArticleCacheReason;
  currentCanonicalPath: `/articles/${string}`;
  previousCanonicalPath?: `/articles/${string}`;
  relatedInstitutionIds: readonly string[];
  relatedOpportunityIds: readonly string[];
}>;

export type ArticleCacheRevalidationOutboxInput = Readonly<{
  eventType: typeof CACHE_REVALIDATION_EVENT;
  aggregateType: "ARTICLE";
  aggregateId: string;
  payloadSafe: ArticleCacheRevalidationPayloadV1;
}>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ARTICLE_PATH = /^\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_RELATIONS = 12;

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (
      typeof key !== "string" ||
      key === "__proto__" ||
      key === "prototype" ||
      key === "constructor"
    ) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && "value" in descriptor;
  });
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function parseSortedUuidSet(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_RELATIONS) return null;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1 ||
    !keys.includes("length") ||
    !value.every(
      (candidate) => typeof candidate === "string" && UUID.test(candidate),
    )
  ) {
    return null;
  }
  const cloned = [...(value as string[])];
  const sorted = [...cloned].sort();
  if (
    new Set(cloned).size !== cloned.length ||
    !cloned.every((id, index) => id === sorted[index])
  ) {
    return null;
  }
  return cloned;
}

function isArticleReason(value: unknown): value is ArticleCacheReason {
  return (
    typeof value === "string" &&
    articleCacheReasons.some((reason) => reason === value)
  );
}

function isCanonicalArticlePath(value: string): boolean {
  return (
    ARTICLE_PATH.test(value) && value.slice("/articles/".length).length <= 120
  );
}

export function parseArticleCacheRevalidationPayload(
  value: unknown,
): ArticleCacheRevalidationPayloadV1 | null {
  if (!isPlainDataRecord(value) || !isArticleReason(value.reason)) return null;
  const isSlugChange = value.reason === "ARTICLE_SLUG_CHANGED";
  const expectedKeys = [
    "articleId",
    "currentCanonicalPath",
    ...(isSlugChange ? ["previousCanonicalPath"] : []),
    "reason",
    "relatedInstitutionIds",
    "relatedOpportunityIds",
    "version",
  ];
  if (!exactKeys(value, expectedKeys)) return null;

  const institutionIds = parseSortedUuidSet(value.relatedInstitutionIds);
  const opportunityIds = parseSortedUuidSet(value.relatedOpportunityIds);
  if (
    value.version !== 1 ||
    typeof value.articleId !== "string" ||
    !UUID.test(value.articleId) ||
    typeof value.currentCanonicalPath !== "string" ||
    !isCanonicalArticlePath(value.currentCanonicalPath) ||
    (isSlugChange &&
      (typeof value.previousCanonicalPath !== "string" ||
        !isCanonicalArticlePath(value.previousCanonicalPath))) ||
    !institutionIds ||
    !opportunityIds
  ) {
    return null;
  }

  return {
    version: 1,
    articleId: value.articleId,
    reason: value.reason,
    currentCanonicalPath: value.currentCanonicalPath as `/articles/${string}`,
    ...(isSlugChange
      ? {
          previousCanonicalPath:
            value.previousCanonicalPath as `/articles/${string}`,
        }
      : {}),
    relatedInstitutionIds: institutionIds,
    relatedOpportunityIds: opportunityIds,
  };
}

export function parseArticleCacheRevalidationOutboxInput(
  value: unknown,
): ArticleCacheRevalidationOutboxInput | null {
  if (
    !isPlainDataRecord(value) ||
    !exactKeys(value, [
      "aggregateId",
      "aggregateType",
      "eventType",
      "payloadSafe",
    ]) ||
    value.eventType !== CACHE_REVALIDATION_EVENT ||
    value.aggregateType !== "ARTICLE" ||
    typeof value.aggregateId !== "string"
  ) {
    return null;
  }
  const payloadSafe = parseArticleCacheRevalidationPayload(value.payloadSafe);
  if (!payloadSafe || value.aggregateId !== payloadSafe.articleId) return null;
  return {
    eventType: CACHE_REVALIDATION_EVENT,
    aggregateType: "ARTICLE",
    aggregateId: value.aggregateId,
    payloadSafe,
  };
}
