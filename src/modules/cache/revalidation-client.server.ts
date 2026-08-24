import "server-only";

import type { ArticleCacheRevalidationPayloadV1 } from "@/src/modules/cache/revalidation-contract";
import { createCacheRevalidationSignature } from "@/src/modules/cache/revalidation-handler.server";

const MAX_RESPONSE_BYTES = 8 * 1024;
const TIMEOUT_MS = 5_000;

export type CacheRevalidationResult =
  | Readonly<{ kind: "SUCCEEDED" }>
  | Readonly<{
      kind: "RETRYABLE_FAILURE";
      errorCode: "CACHE_REVALIDATION_RETRYABLE";
    }>
  | Readonly<{
      kind: "TERMINAL_FAILURE";
      errorCode: "CACHE_REVALIDATION_REJECTED";
    }>;

export interface CacheRevalidationClient {
  revalidate(
    input: Readonly<{
      eventId: string;
      payload: ArticleCacheRevalidationPayloadV1;
    }>,
  ): Promise<CacheRevalidationResult>;
}

type ClientOptions = Readonly<{
  appBaseUrl: string;
  secret: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}>;

async function readBoundedResponse(response: Response): Promise<boolean> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const size = Number(declared);
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_RESPONSE_BYTES) {
      try {
        await response.body?.cancel();
      } catch {
        /* bounded discard */
      }
      return false;
    }
  }
  if (!response.body) return true;
  const reader = response.body.getReader();
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return true;
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* bounded discard */
        }
        return false;
      }
    }
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}

export class HttpCacheRevalidationClient implements CacheRevalidationClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: ClientOptions) {
    const base = new URL(options.appBaseUrl);
    if (
      (base.protocol !== "http:" && base.protocol !== "https:") ||
      base.username !== "" ||
      base.password !== "" ||
      new TextEncoder().encode(options.secret).byteLength < 32
    ) {
      throw new TypeError("Invalid cache revalidation client configuration");
    }
    this.endpoint = new URL(
      "/api/internal/cache/revalidate",
      base.origin,
    ).toString();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async revalidate(
    input: Readonly<{
      eventId: string;
      payload: ArticleCacheRevalidationPayloadV1;
    }>,
  ): Promise<CacheRevalidationResult> {
    const rawBody = new TextEncoder().encode(JSON.stringify(input.payload));
    const timestamp = String(Math.floor(this.now().getTime() / 1_000));
    const signature = createCacheRevalidationSignature({
      secret: this.options.secret,
      timestamp,
      eventId: input.eventId,
      rawBody,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-preppy-revalidation-timestamp": timestamp,
          "x-preppy-revalidation-event-id": input.eventId,
          "x-preppy-revalidation-signature": signature,
        },
        body: rawBody,
      });
      const bounded = await readBoundedResponse(response);
      if (!bounded) {
        return {
          kind: "RETRYABLE_FAILURE",
          errorCode: "CACHE_REVALIDATION_RETRYABLE",
        };
      }
      if (response.ok) return { kind: "SUCCEEDED" };
      if (
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        return {
          kind: "RETRYABLE_FAILURE",
          errorCode: "CACHE_REVALIDATION_RETRYABLE",
        };
      }
      return {
        kind: "TERMINAL_FAILURE",
        errorCode: "CACHE_REVALIDATION_REJECTED",
      };
    } catch {
      return {
        kind: "RETRYABLE_FAILURE",
        errorCode: "CACHE_REVALIDATION_RETRYABLE",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
