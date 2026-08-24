import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { asc, eq } from "drizzle-orm";

import {
  articleInstitutions,
  articleOpportunities,
  articles,
  institutions,
  opportunities,
} from "@/src/db/schema";
import {
  getRuntimeDatabase,
  type TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import {
  parseArticleCacheRevalidationPayload,
  type ArticleCacheRevalidationPayloadV1,
} from "@/src/modules/cache/revalidation-contract";
import {
  getCacheRevalidationConfig,
  type CacheRevalidationConfig,
} from "@/src/modules/cache/config.server";
import {
  cacheReplayRegistry,
  type CacheReplayRegistry,
} from "@/src/modules/cache/replay.server";
import { parseCanonicalArticlePath } from "@/src/modules/editorial/redirects.server";
import { listRedirectSourcesByTarget } from "@/src/modules/editorial/repository.server";
import { parseSecurityJson } from "@/src/modules/admin/auth/security-json.server";

const MAX_BODY_BYTES = 16 * 1024;
const EVENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SIGNATURE = /^v1=([0-9a-f]{64})$/u;
const TIMESTAMP = /^\d{1,15}$/u;

class CacheRequestError extends Error {
  constructor(readonly status: number) {
    super("Cache revalidation request rejected");
  }
}

export type AuthenticatedCacheRevalidationRequest = Readonly<{
  eventId: string;
  timestamp: number;
  payload: ArticleCacheRevalidationPayloadV1;
}>;

export type CacheInvalidationSet = Readonly<{
  paths: readonly string[];
  tags: readonly string[];
}>;

export type CacheRevalidationHandlerDependencies = Readonly<{
  getConfig: () => CacheRevalidationConfig;
  now: () => Date;
  transactionManager: Pick<TransactionManager, "run">;
  replayRegistry: CacheReplayRegistry;
  revalidatePath: (path: string) => void;
  revalidateTag: (tag: string, profile: "max") => void;
}>;

export function createCacheRevalidationSignature(
  input: Readonly<{
    secret: string;
    timestamp: string;
    eventId: string;
    rawBody: Uint8Array;
  }>,
): string {
  const bodyHash = createHash("sha256").update(input.rawBody).digest("hex");
  const canonical = `v1\n${input.timestamp}\n${input.eventId}\n${bodyHash}`;
  return `v1=${createHmac("sha256", input.secret).update(canonical).digest("hex")}`;
}

function requiredSingleHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (!value || value.includes(",") || value.trim() !== value) {
    throw new CacheRequestError(400);
  }
  return value;
}

async function readRawBody(request: Request): Promise<Uint8Array> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") throw new CacheRequestError(400);
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 1 ||
      parsed > MAX_BODY_BYTES
    ) {
      try {
        await request.body?.cancel();
      } catch {
        /* generic rejection */
      }
      throw new CacheRequestError(400);
    }
  }
  if (!request.body) throw new CacheRequestError(400);
  const reader = request.body.getReader();
  const output = new Uint8Array(MAX_BODY_BYTES);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (
        !(value instanceof Uint8Array) ||
        value.byteLength > MAX_BODY_BYTES - length
      ) {
        throw new CacheRequestError(400);
      }
      output.set(value, length);
      length += value.byteLength;
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      /* generic rejection */
    }
    if (error instanceof CacheRequestError) throw error;
    throw new CacheRequestError(400);
  } finally {
    reader.releaseLock();
  }
  if (length === 0) throw new CacheRequestError(400);
  return output.slice(0, length);
}

export async function readAuthenticatedCacheRevalidationRequest(
  request: Request,
  config: CacheRevalidationConfig,
  now: Date,
  replayRegistry: CacheReplayRegistry,
): Promise<AuthenticatedCacheRevalidationRequest> {
  if (
    request.method !== "POST" ||
    request.headers.has("cookie") ||
    new URL(request.url).search !== ""
  ) {
    throw new CacheRequestError(400);
  }
  const timestampHeader = requiredSingleHeader(
    request.headers,
    "x-preppy-revalidation-timestamp",
  );
  const eventId = requiredSingleHeader(
    request.headers,
    "x-preppy-revalidation-event-id",
  );
  const signatureHeader = requiredSingleHeader(
    request.headers,
    "x-preppy-revalidation-signature",
  );
  if (
    !TIMESTAMP.test(timestampHeader) ||
    !EVENT_ID.test(eventId) ||
    !SIGNATURE.test(signatureHeader)
  ) {
    throw new CacheRequestError(400);
  }
  const timestamp = Number(timestampHeader);
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (
    !Number.isSafeInteger(timestamp) ||
    !Number.isFinite(nowSeconds) ||
    Math.abs(nowSeconds - timestamp) > config.maxClockSkewSeconds
  ) {
    throw new CacheRequestError(401);
  }
  const rawBody = await readRawBody(request);
  const expected = createCacheRevalidationSignature({
    secret: config.secret,
    timestamp: timestampHeader,
    eventId,
    rawBody,
  });
  const actualBytes = Buffer.from(signatureHeader.slice(3), "hex");
  const expectedBytes = Buffer.from(expected.slice(3), "hex");
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw new CacheRequestError(401);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    throw new CacheRequestError(400);
  }
  let rawPayload: unknown;
  try {
    rawPayload = parseSecurityJson(text, {
      maxBytes: MAX_BODY_BYTES,
      maxStringBytes: MAX_BODY_BYTES,
    });
  } catch {
    throw new CacheRequestError(400);
  }
  const payload = parseArticleCacheRevalidationPayload(rawPayload);
  if (!payload) throw new CacheRequestError(400);
  const replayKey = createHash("sha256")
    .update(`${timestampHeader}:${signatureHeader}`)
    .digest("hex");
  const replay = replayRegistry.consume({
    key: replayKey,
    now,
    expiresAt: new Date((timestamp + config.maxClockSkewSeconds) * 1_000),
  });
  if (replay === "REPLAY") throw new CacheRequestError(409);
  if (replay === "CAPACITY_EXCEEDED") throw new CacheRequestError(503);
  return { eventId, timestamp, payload };
}

async function deriveInvalidationSet(
  transactionManager: Pick<TransactionManager, "run">,
  payload: ArticleCacheRevalidationPayloadV1,
): Promise<CacheInvalidationSet> {
  return transactionManager.run(async (executor) => {
    const [article] = await executor.drizzle
      .select({ id: articles.id, slug: articles.slug })
      .from(articles)
      .where(eq(articles.id, payload.articleId))
      .limit(1);
    if (!article) throw new CacheRequestError(404);
    const [institutionRows, opportunityRows] = await Promise.all([
      executor.drizzle
        .select({ id: institutions.id, slug: institutions.slug })
        .from(articleInstitutions)
        .innerJoin(
          institutions,
          eq(institutions.id, articleInstitutions.institutionId),
        )
        .where(eq(articleInstitutions.articleId, article.id))
        .orderBy(asc(institutions.id)),
      executor.drizzle
        .select({ id: opportunities.id, slug: opportunities.slug })
        .from(articleOpportunities)
        .innerJoin(
          opportunities,
          eq(opportunities.id, articleOpportunities.opportunityId),
        )
        .where(eq(articleOpportunities.articleId, article.id))
        .orderBy(asc(opportunities.id)),
    ]);
    const currentPath = `/articles/${article.slug}`;
    const historical = await listRedirectSourcesByTarget(
      executor,
      currentPath,
      101,
    );
    if (historical.length > 100) throw new CacheRequestError(503);
    if (
      historical.some(
        (path) =>
          parseCanonicalArticlePath(path) === null || path === currentPath,
      )
    ) {
      throw new CacheRequestError(503);
    }
    if (
      payload.reason === "ARTICLE_SLUG_CHANGED" &&
      payload.previousCanonicalPath === currentPath
    ) {
      throw new CacheRequestError(400);
    }
    const paths = new Set<string>(["/", "/sitemap.xml", currentPath]);
    for (const row of institutionRows) paths.add(`/institutions/${row.slug}`);
    for (const row of opportunityRows) paths.add(`/opportunities/${row.slug}`);
    for (const path of historical) paths.add(path);
    if (payload.reason === "ARTICLE_SLUG_CHANGED")
      paths.add(payload.previousCanonicalPath!);
    const tags = new Set<string>([`article:${article.id}`, "seo:sitemap"]);
    for (const row of institutionRows) tags.add(`institution:${row.id}`);
    for (const row of opportunityRows) tags.add(`opportunity:${row.id}`);
    return { paths: [...paths].sort(), tags: [...tags].sort() };
  });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
}

export async function handleCacheRevalidationRequest(
  request: Request,
  dependencies: Partial<CacheRevalidationHandlerDependencies> = {},
): Promise<Response> {
  const resolved: CacheRevalidationHandlerDependencies = {
    getConfig: getCacheRevalidationConfig,
    now: () => new Date(),
    transactionManager:
      dependencies.transactionManager ??
      getRuntimeDatabase().transactionManager,
    replayRegistry: cacheReplayRegistry,
    revalidatePath: () => {
      throw new Error("Next revalidatePath dependency is required");
    },
    revalidateTag: () => {
      throw new Error("Next revalidateTag dependency is required");
    },
    ...dependencies,
  };
  try {
    const authenticated = await readAuthenticatedCacheRevalidationRequest(
      request,
      resolved.getConfig(),
      resolved.now(),
      resolved.replayRegistry,
    );
    const invalidation = await deriveInvalidationSet(
      resolved.transactionManager,
      authenticated.payload,
    );
    for (const path of invalidation.paths) resolved.revalidatePath(path);
    for (const tag of invalidation.tags) resolved.revalidateTag(tag, "max");
    return json(
      { data: { revalidated: true }, eventId: authenticated.eventId },
      200,
    );
  } catch (error) {
    const status = error instanceof CacheRequestError ? error.status : 500;
    return json(
      {
        error: { code: status === 500 ? "INTERNAL_ERROR" : "REQUEST_REJECTED" },
      },
      status,
    );
  }
}
