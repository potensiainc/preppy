import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { ApplicationError } from "@/src/application/errors";
import { assertSameOriginForMutation } from "@/src/modules/auth/origin.server";
import type { AdminAuthRuntime, AdminLogoutRuntime } from "./runtime.server";
import type { AdminOidcFlowCookieDescriptor } from "./flow-cookie.server";
import {
  ADMIN_OIDC_NONCE_COOKIE_NAME,
  ADMIN_OIDC_PKCE_COOKIE_NAME,
  ADMIN_OIDC_STATE_COOKIE_NAME,
  ADMIN_OIDC_FLOW_TTL_SECONDS,
  clearAdminOidcFlowCookies,
  readAdminOidcNonceCookie,
  readAdminOidcPkceCookie,
  readAdminOidcStateCookie,
  type ClearAdminOidcFlowCookieDescriptor,
} from "./flow-cookie.server";
import { createS256CodeChallenge } from "./oidc-client.server";
import {
  clearAdminSessionCookie,
  type AdminSessionCookieDescriptor,
} from "./session.server";

const PRIVATE_NO_STORE = "private, no-store";
const ADMIN_LOGIN_RATE_LIMIT = 120;
const ADMIN_LOGIN_RATE_WINDOW_MS = 60_000;
const ADMIN_LOGIN_RATE_KEY = "admin-oidc-start:process-global";

type SerializableCookie =
  | AdminOidcFlowCookieDescriptor
  | ClearAdminOidcFlowCookieDescriptor
  | AdminSessionCookieDescriptor;

class AdminLoginRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Admin login start was rate limited");
  }
}

function privateHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("cache-control", PRIVATE_NO_STORE);
  headers.set("pragma", "no-cache");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-robots-tag", "noindex, nofollow");
  return headers;
}

function serializeCookie(cookie: SerializableCookie): string {
  const parts = [
    `${cookie.name}=${encodeURIComponent(cookie.value)}`,
    `Path=${cookie.attributes.path}`,
    `Max-Age=${cookie.attributes.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (cookie.attributes.secure) parts.push("Secure");
  return parts.join("; ");
}

function appendCookies(
  headers: Headers,
  cookies: readonly SerializableCookie[],
): void {
  for (const cookie of cookies) {
    headers.append("set-cookie", serializeCookie(cookie));
  }
}

function adminLoginDenialResponse(
  status: 400 | 403 | 429 | 502 | 503,
  options: {
    retryAfterSeconds?: number;
    cookies?: readonly SerializableCookie[];
  } = {},
): Response {
  const headers = privateHeaders({
    "content-type": "text/html; charset=utf-8",
  });
  if (options.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(options.retryAfterSeconds));
  }
  appendCookies(headers, options.cookies ?? []);
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Admin sign-in denied | PREPPY</title><body><main><h1>Admin sign-in was not completed</h1><p>Access could not be granted. Start a new sign-in attempt.</p><p><a href="/admin/login">Return to Admin sign-in</a></p></main></body></html>',
    { status, headers },
  );
}

const boundedTokenString = z.string().superRefine((value, context) => {
  if (Buffer.byteLength(value, "utf8") > 16 * 1_024) {
    context.addIssue({
      code: "custom",
      message: "Token response string is too large",
    });
  }
});

const adminTokenResponseSchema = z.object({
  id_token: boundedTokenString.min(1),
  token_type: z
    .string()
    .max(64)
    .refine((value) => /^Bearer$/i.test(value), {
      message: "Token type is unsupported",
    })
    .optional(),
  access_token: boundedTokenString.optional(),
  refresh_token: boundedTokenString.optional(),
  scope: boundedTokenString.optional(),
  expires_in: z.number().int().safe().nonnegative().optional(),
});

type RawFlowCookies = Readonly<{
  state: string | null;
  nonce: string | null;
  pkce: string | null;
}>;

type CallbackParameters = Readonly<{
  states: readonly string[];
  codes: readonly string[];
  errors: readonly string[];
}>;

function readCookie(request: Request, name: string): string | null {
  const serialized = request.headers.get("cookie");
  if (!serialized) return null;
  for (const pair of serialized.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function readRawFlowCookies(request: Request): RawFlowCookies {
  return {
    state: readCookie(request, ADMIN_OIDC_STATE_COOKIE_NAME),
    nonce: readCookie(request, ADMIN_OIDC_NONCE_COOKIE_NAME),
    pkce: readCookie(request, ADMIN_OIDC_PKCE_COOKIE_NAME),
  };
}

function readCallbackParameters(request: Request): CallbackParameters {
  const search = new URL(request.url).searchParams;
  return {
    states: search.getAll("state"),
    codes: search.getAll("code"),
    errors: search.getAll("error"),
  };
}

function callbackShape(
  parameters: CallbackParameters,
):
  | { state: string; code: string; error?: never }
  | { state: string; error: string; code?: never }
  | null {
  if (parameters.states.length !== 1 || parameters.states[0] === "") {
    return null;
  }
  const state = parameters.states[0];
  if (
    parameters.codes.length === 1 &&
    parameters.codes[0] !== "" &&
    parameters.errors.length === 0
  ) {
    return { state, code: parameters.codes[0] };
  }
  if (
    parameters.errors.length === 1 &&
    parameters.errors[0] !== "" &&
    parameters.codes.length === 0
  ) {
    return { state, error: parameters.errors[0] };
  }
  return null;
}

function capabilitiesMatch(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function callbackFailure(
  status: 400 | 403 | 502 | 503,
  clearedFlowCookies: readonly ClearAdminOidcFlowCookieDescriptor[],
): Response {
  return adminLoginDenialResponse(status, { cookies: clearedFlowCookies });
}

export type AdminLoginStartResult = Readonly<{
  redirectUrl: string;
  cookies: readonly AdminOidcFlowCookieDescriptor[];
}>;

export async function startAdminLogin(
  _request: Request,
  runtime: AdminAuthRuntime,
): Promise<AdminLoginStartResult> {
  const now = runtime.now();
  const decision = runtime.rateLimiter.consume({
    key: ADMIN_LOGIN_RATE_KEY,
    limit: ADMIN_LOGIN_RATE_LIMIT,
    windowMs: ADMIN_LOGIN_RATE_WINDOW_MS,
    nowMs: now.getTime(),
  });
  if (!decision.allowed) {
    throw new AdminLoginRateLimitError(decision.retryAfterSeconds);
  }

  const discovery = await runtime.loadDiscovery();
  const issued = runtime.createFlowCookies(now);
  const registered = runtime.replayStore.register(issued.flowId, {
    nowMs: now.getTime(),
    expiresAtMs: now.getTime() + ADMIN_OIDC_FLOW_TTL_SECONDS * 1_000,
  });
  if (!registered) throw new Error("Admin OIDC flow could not be registered");

  const authorizationUrl = new URL(discovery.authorization_endpoint);
  authorizationUrl.searchParams.set(
    "client_id",
    runtime.config.ADMIN_AUTH_CLIENT_ID,
  );
  authorizationUrl.searchParams.set("redirect_uri", runtime.config.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("response_mode", "query");
  authorizationUrl.searchParams.set("scope", "openid");
  authorizationUrl.searchParams.set("state", issued.state);
  authorizationUrl.searchParams.set("nonce", issued.nonce);
  authorizationUrl.searchParams.set(
    "code_challenge",
    createS256CodeChallenge(issued.codeVerifier),
  );
  authorizationUrl.searchParams.set("code_challenge_method", "S256");

  return {
    redirectUrl: authorizationUrl.toString(),
    cookies: [issued.cookies.state, issued.cookies.nonce, issued.cookies.pkce],
  };
}

export async function handleAdminLoginStartRoute(
  request: Request,
  getRuntime: () => AdminAuthRuntime,
): Promise<Response> {
  try {
    const result = await startAdminLogin(request, getRuntime());
    const headers = privateHeaders({ location: result.redirectUrl });
    appendCookies(headers, result.cookies);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    if (error instanceof AdminLoginRateLimitError) {
      return adminLoginDenialResponse(429, {
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    return adminLoginDenialResponse(503);
  }
}

export async function handleAdminLoginCallbackRoute(
  request: Request,
  getRuntime: () => AdminAuthRuntime,
): Promise<Response> {
  // The request values are read before any deletion descriptors are created.
  // Set-Cookie only schedules response-side deletion; it never mutates this
  // request's Cookie header.
  const rawCookies = readRawFlowCookies(request);
  const parameters = readCallbackParameters(request);

  let runtime: AdminAuthRuntime;
  try {
    runtime = getRuntime();
  } catch {
    return callbackFailure(
      503,
      clearAdminOidcFlowCookies({
        production: process.env.NODE_ENV === "production",
      }),
    );
  }
  const clearedFlowCookies = clearAdminOidcFlowCookies({
    production: runtime.production,
  });
  const shape = callbackShape(parameters);
  if (!shape) return callbackFailure(400, clearedFlowCookies);

  const now = runtime.now();
  const statePayload = readAdminOidcStateCookie(rawCookies.state, {
    secret: runtime.config.ADMIN_OIDC_FLOW_SECRET,
    now,
  });
  const noncePayload = readAdminOidcNonceCookie(rawCookies.nonce, {
    secret: runtime.config.ADMIN_OIDC_FLOW_SECRET,
    now,
  });
  const pkcePayload = readAdminOidcPkceCookie(rawCookies.pkce, {
    secret: runtime.config.ADMIN_OIDC_FLOW_SECRET,
    now,
  });
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (
    !statePayload ||
    !noncePayload ||
    !pkcePayload ||
    statePayload.flowId !== noncePayload.flowId ||
    statePayload.flowId !== pkcePayload.flowId ||
    statePayload.flowStartedAt !== noncePayload.flowStartedAt ||
    statePayload.flowStartedAt !== pkcePayload.flowStartedAt ||
    statePayload.flowStartedAt > nowSeconds ||
    nowSeconds - statePayload.flowStartedAt >= ADMIN_OIDC_FLOW_TTL_SECONDS ||
    !capabilitiesMatch(shape.state, statePayload.state)
  ) {
    return callbackFailure(400, clearedFlowCookies);
  }

  let replayStatus;
  try {
    replayStatus = runtime.replayStore.consume(statePayload.flowId, {
      nowMs: now.getTime(),
    });
  } catch {
    return callbackFailure(503, clearedFlowCookies);
  }
  if (replayStatus === "CONSUMED") {
    return callbackFailure(400, clearedFlowCookies);
  }
  // UNKNOWN remains acceptable across process boundaries. The independently
  // encrypted cookie binding, state, nonce, PKCE, and one-use provider code
  // remain mandatory.
  if ("error" in shape) {
    return callbackFailure(400, clearedFlowCookies);
  }

  let discovery;
  let verifiedClaims;
  try {
    discovery = await runtime.loadDiscovery();
    const rawTokenResponse = await runtime.exchangeAuthorizationCode({
      discovery,
      code: shape.code,
      codeVerifier: pkcePayload.codeVerifier,
    });
    const tokenResponse = adminTokenResponseSchema.parse(rawTokenResponse);
    verifiedClaims = await runtime.verifyIdToken({
      discovery,
      idToken: tokenResponse.id_token,
      expectedNonce: noncePayload.nonce,
      flowStartedAt: statePayload.flowStartedAt,
      now: nowSeconds,
    });
  } catch {
    return callbackFailure(502, clearedFlowCookies);
  }

  let admin;
  try {
    admin = await runtime.requireActiveAdmin(verifiedClaims.sub);
  } catch (error) {
    return callbackFailure(
      error instanceof ApplicationError && error.code === "FORBIDDEN"
        ? 403
        : 503,
      clearedFlowCookies,
    );
  }

  let session: AdminSessionCookieDescriptor;
  try {
    session = runtime.createSessionCookie(admin.adminUserId, now);
  } catch {
    return callbackFailure(503, clearedFlowCookies);
  }
  const headers = privateHeaders({ location: "/admin" });
  appendCookies(headers, [...clearedFlowCookies, session]);
  return new Response(null, { status: 303, headers });
}

export function handleAdminLogoutRoute(
  request: Request,
  getRuntime: () => AdminLogoutRuntime,
): Response {
  let runtime: AdminLogoutRuntime;
  try {
    runtime = getRuntime();
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders() });
  }
  try {
    assertSameOriginForMutation(request, runtime.appBaseUrl);
  } catch {
    return new Response(null, { status: 403, headers: privateHeaders() });
  }

  const headers = privateHeaders();
  appendCookies(headers, [
    clearAdminSessionCookie({ production: runtime.production }),
  ]);
  return new Response(null, { status: 204, headers });
}
