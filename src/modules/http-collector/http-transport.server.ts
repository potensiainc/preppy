import {
  request as requestHttp,
  type IncomingMessage,
  type RequestOptions,
} from "node:http";
import {
  request as requestHttps,
  type RequestOptions as HttpsRequestOptions,
} from "node:https";
import type { LookupFunction } from "node:net";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import {
  assertSafeAddress,
  CollectorNetworkError,
  resolveVettedAddresses,
  type DnsResolver,
  type VettedAddress,
} from "./network-safety.server";
import {
  CollectorUrlError,
  isSameDiscoveryDomain,
  normalizeDiscoveryUrl,
  parseCollectorUrl,
} from "./url-policy";
import type { RunByteBudgetLedger } from "./run-budget";

export const HTTP_COLLECTOR_USER_AGENT =
  "PREPPY-Static-Collector/1.0 (+https://preppy.co.kr/)";

export type CollectorFailureCode =
  | "DNS_ERROR"
  | "CONNECT_TIMEOUT"
  | "READ_TIMEOUT"
  | "TLS_ERROR"
  | "TOO_MANY_REDIRECTS"
  | "REDIRECT_EXTERNAL_HOST"
  | "RESPONSE_TOO_LARGE"
  | "BYTE_BUDGET_EXCEEDED"
  | "SSRF_BLOCKED"
  | "ROBOTS_BLOCKED"
  | "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED"
  | "INVALID_URL"
  | "BODY_READ_ERROR"
  | "UNKNOWN_FETCH_ERROR";

export type RedirectEvidence = Readonly<{
  status: number;
  url: string;
  location: string;
  nextUrl: string;
}>;

export type StaticHttpResponse = Readonly<{
  requestedUrl: string;
  finalUrl: string;
  redirectChain: readonly RedirectEvidence[];
  httpStatus: number;
  contentType: string | null;
  contentLengthHeader: string | null;
  actualResponseBytes: number;
  fetchedAt: Date;
  elapsedMs: number;
  etag: string | null;
  lastModified: string | null;
  entityBytes: Buffer;
}>;

export type StaticHttpFailure = Readonly<{
  code: CollectorFailureCode;
  message: string;
  requestedUrl: string;
  finalUrl: string | null;
  redirectChain: readonly RedirectEvidence[];
  httpStatus: number | null;
  contentType: string | null;
  contentLengthHeader: string | null;
  actualResponseBytes: number;
  fetchedAt: Date;
  elapsedMs: number;
}>;

export type StaticHttpFetchResult =
  | Readonly<{ ok: true; response: StaticHttpResponse }>
  | Readonly<{ ok: false; failure: StaticHttpFailure }>;

export type StaticHttpFetchInput = Readonly<{
  url: string;
  maxResponseBytes: number;
  requestTimeoutMs: number;
  connectTimeoutMs: number;
  maxRedirects: number;
  redirectAllowed?: (requestedUrl: string, destinationUrl: string) => boolean;
  beforeRequest?: (url: string) => Promise<void>;
  beforeRedirect?: (destinationUrl: string) => Promise<
    Readonly<{
      allowed: boolean;
      code: "ROBOTS_BLOCKED" | "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED" | null;
    }>
  >;
  runBudget?: RunByteBudgetLedger;
}>;

export type StaticHttpTransport = Readonly<{
  fetch(input: StaticHttpFetchInput): Promise<StaticHttpFetchResult>;
}>;

type TransportDependencies = Readonly<{
  resolver?: DnsResolver;
  assertAddressSafe?: (address: string) => void;
  now?: () => Date;
  clockMs?: () => number;
  tlsCa?: string | Buffer;
}>;

class BodyReadFailure extends Error {
  constructor(
    readonly code:
      "RESPONSE_TOO_LARGE" | "BYTE_BUDGET_EXCEEDED" | "BODY_READ_ERROR",
    readonly actualResponseBytes: number,
  ) {
    super(
      code === "RESPONSE_TOO_LARGE"
        ? "HTTP response exceeded byte limit"
        : code === "BYTE_BUDGET_EXCEEDED"
          ? "HTTP collector run byte budget was exceeded"
          : "HTTP response body could not be read",
    );
  }
}

function headerValue(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function responseBodyStream(response: IncomingMessage): Readable {
  const encoding = headerValue(
    response.headers["content-encoding"],
  )?.toLowerCase();
  if (!encoding || encoding === "identity") return response;
  if (encoding === "gzip") return response.pipe(createGunzip());
  if (encoding === "br") return response.pipe(createBrotliDecompress());
  if (encoding === "deflate") return response.pipe(createInflate());
  throw new BodyReadFailure("BODY_READ_ERROR", 0);
}

async function readEntityBytes(
  response: IncomingMessage,
  maximumBytes: number,
  runBudget: RunByteBudgetLedger | undefined,
): Promise<Buffer> {
  const encoding = headerValue(
    response.headers["content-encoding"],
  )?.toLowerCase();
  const declared = headerValue(response.headers["content-length"]);
  if (
    (!encoding || encoding === "identity") &&
    declared &&
    /^\d+$/.test(declared)
  ) {
    const declaredBytes = Number(declared);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumBytes) {
      response.resume();
      throw new BodyReadFailure("RESPONSE_TOO_LARGE", 0);
    }
  }
  let actualBytes = 0;
  const chunks: Buffer[] = [];
  let stream: Readable;
  try {
    stream = responseBodyStream(response);
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
      actualBytes += buffer.length;
      runBudget?.charge(buffer.length);
      if (runBudget?.exceeded) {
        stream.destroy();
        throw new BodyReadFailure("BYTE_BUDGET_EXCEEDED", actualBytes);
      }
      if (actualBytes > maximumBytes) {
        stream.destroy();
        throw new BodyReadFailure("RESPONSE_TOO_LARGE", actualBytes);
      }
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof BodyReadFailure) throw error;
    throw new BodyReadFailure("BODY_READ_ERROR", actualBytes);
  }
  return Buffer.concat(chunks, actualBytes);
}

function mapRequestError(error: NodeJS.ErrnoException): Readonly<{
  code: CollectorFailureCode;
  message: string;
}> {
  if (error.code === "ENOTFOUND" || error.code === "EAI_AGAIN") {
    return { code: "DNS_ERROR", message: "DNS resolution failed" };
  }
  if (error.code === "ETIMEDOUT") {
    return { code: "CONNECT_TIMEOUT", message: "HTTP connection timed out" };
  }
  if (
    error.code?.startsWith("ERR_TLS") ||
    error.code?.includes("CERT") ||
    error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
  ) {
    return { code: "TLS_ERROR", message: "TLS validation failed" };
  }
  return { code: "UNKNOWN_FETCH_ERROR", message: "HTTP request failed" };
}

async function resolveWithinTimeout(
  hostname: string,
  timeoutMs: number,
  resolver: DnsResolver | undefined,
  addressAssertion: (address: string) => void,
): Promise<readonly VettedAddress[]> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      resolveVettedAddresses(hostname, resolver, addressAssertion),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new CollectorNetworkError(
                "DNS_ERROR",
                "DNS resolution timed out",
              ),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type OneRequestResult =
  | Readonly<{ ok: true; response: IncomingMessage; entityBytes: Buffer }>
  | Readonly<{
      ok: false;
      code: CollectorFailureCode;
      message: string;
      response: IncomingMessage | null;
      actualResponseBytes: number;
    }>;

async function requestPinned(
  url: URL,
  address: VettedAddress,
  input: StaticHttpFetchInput,
  tlsCa: string | Buffer | undefined,
): Promise<OneRequestResult> {
  return new Promise((resolve) => {
    let settled = false;
    let connectTimer: NodeJS.Timeout | undefined;
    let totalTimer: NodeJS.Timeout | undefined;
    const finish = (result: OneRequestResult) => {
      if (settled) return;
      settled = true;
      if (connectTimer) clearTimeout(connectTimer);
      if (totalTimer) clearTimeout(totalTimer);
      resolve(result);
    };
    const lookup = ((_hostname, options, callback) => {
      if (typeof options === "object" && options.all) {
        callback(null, [{ address: address.address, family: address.family }]);
        return;
      }
      callback(null, address.address, address.family);
    }) as LookupFunction;
    const options: RequestOptions & HttpsRequestOptions = {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      agent: false,
      lookup,
      servername: url.hostname,
      ca: tlsCa,
      headers: {
        host: url.host,
        accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1",
        "accept-encoding": "gzip, br, deflate",
        "user-agent": HTTP_COLLECTOR_USER_AGENT,
      },
    };
    const request = (url.protocol === "https:" ? requestHttps : requestHttp)(
      options,
      (response) => {
        if (connectTimer) clearTimeout(connectTimer);
        void readEntityBytes(
          response,
          input.maxResponseBytes,
          input.runBudget,
        ).then(
          (entityBytes) => finish({ ok: true, response, entityBytes }),
          (error: unknown) => {
            const failure =
              error instanceof BodyReadFailure
                ? error
                : new BodyReadFailure("BODY_READ_ERROR", 0);
            response.destroy();
            finish({
              ok: false,
              code: failure.code,
              message: failure.message,
              response,
              actualResponseBytes: failure.actualResponseBytes,
            });
          },
        );
      },
    );
    request.once("socket", (socket) => {
      if (!socket.connecting) return;
      connectTimer = setTimeout(() => {
        request.destroy(
          Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT" }),
        );
        finish({
          ok: false,
          code: "CONNECT_TIMEOUT",
          message: "HTTP connection timed out",
          response: null,
          actualResponseBytes: 0,
        });
      }, input.connectTimeoutMs);
      socket.once(
        url.protocol === "https:" ? "secureConnect" : "connect",
        () => {
          if (connectTimer) clearTimeout(connectTimer);
        },
      );
    });
    request.once("error", (error: NodeJS.ErrnoException) => {
      const mapped = mapRequestError(error);
      finish({ ok: false, ...mapped, response: null, actualResponseBytes: 0 });
    });
    totalTimer = setTimeout(() => {
      request.destroy();
      finish({
        ok: false,
        code: "READ_TIMEOUT",
        message: "HTTP response timed out",
        response: null,
        actualResponseBytes: 0,
      });
    }, input.requestTimeoutMs);
    request.end();
  });
}

function failureEvidence(
  input: Readonly<{
    code: CollectorFailureCode;
    message: string;
    requestedUrl: string;
    finalUrl: string | null;
    redirectChain: readonly RedirectEvidence[];
    response?: IncomingMessage | null;
    actualResponseBytes?: number;
    now: () => Date;
    elapsedMs: number;
  }>,
): StaticHttpFetchResult {
  return {
    ok: false,
    failure: {
      code: input.code,
      message: input.message,
      requestedUrl: input.requestedUrl,
      finalUrl: input.finalUrl,
      redirectChain: Object.freeze([...input.redirectChain]),
      httpStatus: input.response?.statusCode ?? null,
      contentType: headerValue(input.response?.headers["content-type"]),
      contentLengthHeader: headerValue(
        input.response?.headers["content-length"],
      ),
      actualResponseBytes: input.actualResponseBytes ?? 0,
      fetchedAt: input.now(),
      elapsedMs: input.elapsedMs,
    },
  };
}

export function createNodeHttpTransport(
  dependencies: TransportDependencies = {},
): StaticHttpTransport {
  const now = dependencies.now ?? (() => new Date());
  const clockMs = dependencies.clockMs ?? Date.now;
  const resolver = dependencies.resolver;
  const addressAssertion = dependencies.assertAddressSafe ?? assertSafeAddress;

  return {
    async fetch(input): Promise<StaticHttpFetchResult> {
      const startedAt = clockMs();
      const elapsedMs = () => Math.max(0, Math.round(clockMs() - startedAt));
      if (input.runBudget?.exhausted) {
        return failureEvidence({
          code: "BYTE_BUDGET_EXCEEDED",
          message: "HTTP collector run byte budget is exhausted",
          requestedUrl: input.url,
          finalUrl: null,
          redirectChain: [],
          now,
          elapsedMs: elapsedMs(),
        });
      }
      let requestedUrl: string;
      let current: URL;
      try {
        requestedUrl = normalizeDiscoveryUrl(input.url);
        current = parseCollectorUrl(requestedUrl);
      } catch (error) {
        const failure =
          error instanceof CollectorUrlError ? error : new CollectorUrlError();
        return failureEvidence({
          code: "INVALID_URL",
          message: failure.message,
          requestedUrl: input.url,
          finalUrl: null,
          redirectChain: [],
          now,
          elapsedMs: elapsedMs(),
        });
      }
      const redirectChain: RedirectEvidence[] = [];
      let vetted: readonly VettedAddress[] | undefined;
      while (true) {
        try {
          vetted ??= await resolveWithinTimeout(
            current.hostname,
            input.requestTimeoutMs,
            resolver,
            addressAssertion,
          );
        } catch (error) {
          const network =
            error instanceof CollectorNetworkError
              ? error
              : new CollectorNetworkError("DNS_ERROR", "DNS resolution failed");
          return failureEvidence({
            code: network.code,
            message: network.message,
            requestedUrl,
            finalUrl: current.href,
            redirectChain,
            now,
            elapsedMs: elapsedMs(),
          });
        }
        try {
          await input.beforeRequest?.(current.href);
        } catch {
          return failureEvidence({
            code: "UNKNOWN_FETCH_ERROR",
            message: "HTTP request scheduling failed",
            requestedUrl,
            finalUrl: current.href,
            redirectChain,
            now,
            elapsedMs: elapsedMs(),
          });
        }
        const requestResult = await requestPinned(
          current,
          vetted[0]!,
          input,
          dependencies.tlsCa,
        );
        if (!requestResult.ok) {
          return failureEvidence({
            code: requestResult.code,
            message: requestResult.message,
            requestedUrl,
            finalUrl: current.href,
            redirectChain,
            response: requestResult.response,
            actualResponseBytes: requestResult.actualResponseBytes,
            now,
            elapsedMs: elapsedMs(),
          });
        }
        const status = requestResult.response.statusCode ?? 0;
        const location = headerValue(requestResult.response.headers.location);
        if (status >= 300 && status <= 399 && location !== null) {
          let next: URL;
          try {
            next = parseCollectorUrl(new URL(location, current).href);
          } catch {
            return failureEvidence({
              code: "INVALID_URL",
              message: "Redirect destination is invalid",
              requestedUrl,
              finalUrl: current.href,
              redirectChain,
              response: requestResult.response,
              now,
              elapsedMs: elapsedMs(),
            });
          }
          const redirect: RedirectEvidence = Object.freeze({
            status,
            url: current.href,
            location,
            nextUrl: next.href,
          });
          redirectChain.push(redirect);
          let nextVetted: readonly VettedAddress[];
          try {
            nextVetted = await resolveWithinTimeout(
              next.hostname,
              input.requestTimeoutMs,
              resolver,
              addressAssertion,
            );
          } catch (error) {
            const network =
              error instanceof CollectorNetworkError
                ? error
                : new CollectorNetworkError(
                    "DNS_ERROR",
                    "DNS resolution failed",
                  );
            return failureEvidence({
              code: network.code,
              message: network.message,
              requestedUrl,
              finalUrl: next.href,
              redirectChain,
              now,
              elapsedMs: elapsedMs(),
            });
          }
          const allowed =
            input.redirectAllowed?.(requestedUrl, next.href) ??
            isSameDiscoveryDomain(requestedUrl, next.href);
          if (!allowed) {
            return failureEvidence({
              code: "REDIRECT_EXTERNAL_HOST",
              message: "Redirect destination is outside the allowed domain",
              requestedUrl,
              finalUrl: next.href,
              redirectChain,
              response: requestResult.response,
              now,
              elapsedMs: elapsedMs(),
            });
          }
          if (redirectChain.length > input.maxRedirects) {
            return failureEvidence({
              code: "TOO_MANY_REDIRECTS",
              message: "HTTP redirect limit exceeded",
              requestedUrl,
              finalUrl: next.href,
              redirectChain,
              response: requestResult.response,
              now,
              elapsedMs: elapsedMs(),
            });
          }
          if (input.beforeRedirect) {
            let gate: Awaited<
              ReturnType<NonNullable<StaticHttpFetchInput["beforeRedirect"]>>
            >;
            try {
              gate = await input.beforeRedirect(next.href);
            } catch {
              gate = {
                allowed: false,
                code: "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED",
              };
            }
            if (!gate.allowed) {
              return failureEvidence({
                code: gate.code ?? "ROBOTS_UNAVAILABLE_REVIEW_REQUIRED",
                message: "Redirect destination was blocked by robots policy",
                requestedUrl,
                finalUrl: next.href,
                redirectChain,
                response: requestResult.response,
                now,
                elapsedMs: elapsedMs(),
              });
            }
          }
          current = next;
          vetted = nextVetted;
          continue;
        }
        const entityBytes = requestResult.entityBytes;
        return {
          ok: true,
          response: {
            requestedUrl,
            finalUrl: current.href,
            redirectChain: Object.freeze([...redirectChain]),
            httpStatus: status,
            contentType: headerValue(
              requestResult.response.headers["content-type"],
            ),
            contentLengthHeader: headerValue(
              requestResult.response.headers["content-length"],
            ),
            actualResponseBytes: entityBytes.length,
            fetchedAt: now(),
            elapsedMs: elapsedMs(),
            etag: headerValue(requestResult.response.headers.etag),
            lastModified: headerValue(
              requestResult.response.headers["last-modified"],
            ),
            entityBytes,
          },
        };
      }
    },
  };
}
