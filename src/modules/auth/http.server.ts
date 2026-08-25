import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { AnalyticsTracker } from "@/src/analytics/tracker";
import { ApplicationError } from "@/src/application/errors";
import type { UserCommandContext } from "@/src/application/context";
import type {
  CompleteSignupResult,
  CompleteSignupServerInput,
} from "@/src/modules/auth/complete-signup.server";
import type { ActivateFollowResult } from "@/src/modules/follow/activate-follow.server";
import type {
  KakaoAuthProvider,
  KakaoIdentity,
} from "@/src/modules/auth/kakao-provider.server";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_TTL_SECONDS,
  oauthStateCookieAttributes,
  validateOAuthState,
} from "@/src/modules/auth/oauth-state.server";
import type { OAuthReplayStore } from "@/src/modules/auth/oauth-replay.server";
import { assertSameOriginForMutation } from "@/src/modules/auth/origin.server";
import {
  createPendingFollowIntent,
  PENDING_FOLLOW_INTENT_COOKIE_NAME,
  pendingFollowIntentCookieAttributes,
  readPendingFollowIntent,
} from "@/src/modules/auth/pending-follow-intent.server";
import {
  resolveCanonicalPendingFollowTarget,
  type ResolvedPendingFollowTarget,
} from "@/src/modules/auth/pending-follow-target.server";
import type { RateLimiter } from "@/src/modules/auth/rate-limit.server";
import {
  clearUserSessionCookie,
  createUserSessionCookie,
  readUserSession,
  USER_SESSION_COOKIE_NAME,
} from "@/src/modules/auth/session.server";

const MAX_BODY_BYTES = 16 * 1_024;
const PRIVATE_NO_STORE = "private, no-store";
// Emergency process ceiling only. This is neither caller isolation nor a
// production-grade distributed limiter; a trusted edge/shared limiter remains
// deployment hardening outside this no-infrastructure work package.
const KAKAO_START_EMERGENCY_PROCESS_LIMIT = 120;
const KAKAO_START_EMERGENCY_WINDOW_MS = 60_000;
const KAKAO_START_EMERGENCY_PROCESS_KEY = "kakao-start:process-global";
const KAKAO_CALLBACK_EMERGENCY_PROCESS_LIMIT = 120;
const KAKAO_CALLBACK_EMERGENCY_WINDOW_MS = 60_000;
const KAKAO_CALLBACK_EMERGENCY_PROCESS_KEY = "kakao-callback:process-global";

type Clock = () => Date;

type PublicIntentInstitution = {
  id: string;
  slug: string;
  publicationState: string;
  operationalState: string;
};

type ResolvedUser = {
  id: string;
  status: "PENDING" | "ACTIVE";
};

type OnboardingHttpSource = {
  userState: "PENDING";
  defaults: {
    email: string | null;
    childBirthYear: number | null;
    interestRegions: readonly string[];
    interestCategories: readonly string[];
    serviceEmailUpdatesConsent: boolean;
  };
  policyVersions: {
    TERMS_OF_SERVICE: string;
    PRIVACY_POLICY: string;
    SERVICE_EMAIL_UPDATES: string;
  };
  pendingInstitution: {
    id: string;
    slug: string;
    displayName: string;
    category: string;
    regionCode: string | null;
  } | null;
};

type CookieAttributes = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

class BodyReadError extends Error {
  constructor(readonly status: 400 | 413 | 503) {
    super("Request body could not be read safely");
  }
}

const followIntentSchema = z
  .object({
    institutionId: z.uuid().transform((value) => value.toLowerCase()),
    context: z.enum(["INSTITUTION", "ARTICLE", "OPPORTUNITY"]),
    articleId: z.uuid().optional(),
    opportunityId: z.uuid().optional(),
    returnPath: z.string(),
  })
  .strict();

function privateHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("cache-control", PRIVATE_NO_STORE);
  headers.set("pragma", "no-cache");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

function serializeCookie(
  name: string,
  value: string,
  attributes: CookieAttributes,
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${attributes.path}`,
    `Max-Age=${attributes.maxAge}`,
    "HttpOnly",
    `SameSite=${attributes.sameSite === "lax" ? "Lax" : attributes.sameSite}`,
  ];
  if (attributes.secure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookieAttributes(attributes: CookieAttributes): CookieAttributes {
  return { ...attributes, maxAge: 0 };
}

function validateTrustedApplicationOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== value ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

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

async function readBoundedText(request: Request): Promise<string> {
  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) throw new BodyReadError(400);
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength)) throw new BodyReadError(400);
    if (parsedLength > MAX_BODY_BYTES) {
      try {
        await request.body?.cancel();
      } catch {
        // The caller receives only the bounded 413 response.
      }
      throw new BodyReadError(413);
    }
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new BodyReadError(413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BodyReadError) throw error;
    try {
      await reader.cancel();
    } catch {
      // The generic 503 below is the only observable stream error.
    }
    throw new BodyReadError(503);
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    totalBytes,
  ).toString("utf8");
}

async function readBody(request: Request): Promise<{
  value: unknown;
  form: URLSearchParams | null;
}> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (
    contentType !== "application/json" &&
    contentType !== "application/x-www-form-urlencoded"
  ) {
    throw new BodyReadError(400);
  }
  const text = await readBoundedText(request);
  if (contentType === "application/json") {
    try {
      return { value: JSON.parse(text) as unknown, form: null };
    } catch {
      throw new BodyReadError(400);
    }
  }
  const form = new URLSearchParams(text);
  return { value: Object.fromEntries(form), form };
}

function jsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: privateHeaders({ "content-type": "application/json" }),
  });
}

function safeMutationFailure(status: number): Response {
  const message =
    status === 401
      ? "로그인이 필요합니다."
      : status === 403
        ? "요청을 확인할 수 없습니다."
        : status === 404
          ? "관심기관을 확인할 수 없습니다."
          : status === 413
            ? "요청 본문이 너무 큽니다."
            : status === 503
              ? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
              : "요청을 처리하지 못했습니다.";
  return jsonResponse({ error: message }, status);
}

function applicationErrorStatus(error: unknown): number {
  return error instanceof ApplicationError ? error.status : 500;
}

function bodyErrorStatus(error: unknown): number {
  return error instanceof BodyReadError ? error.status : 400;
}

function loginFailureResponse(options: {
  status: 400 | 429 | 502 | 503;
  retryable?: boolean;
  retryAfterSeconds?: number;
  stateCookieSecure: boolean;
}): Response {
  const detail =
    options.status === 429
      ? "로그인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
      : options.retryable
        ? "인증 서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요."
        : "로그인을 완료하지 못했습니다. 처음부터 다시 시도해 주세요.";
  const body = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="robots" content="noindex"><title>로그인 오류 | PREPPY</title><body><main><h1>로그인을 완료하지 못했습니다</h1><p>${detail}</p><p><a href="/auth/kakao/start">카카오 로그인 다시 시도</a></p><p><a href="/">PREPPY 홈으로 돌아가기</a></p></main></body></html>`;
  const headers = privateHeaders({
    "content-type": "text/html; charset=utf-8",
  });
  if (options.retryAfterSeconds !== undefined) {
    headers.set("retry-after", String(options.retryAfterSeconds));
  }
  headers.append(
    "set-cookie",
    serializeCookie(
      OAUTH_STATE_COOKIE_NAME,
      "",
      clearCookieAttributes({
        ...oauthStateCookieAttributes,
        secure: options.stateCookieSecure,
      }),
    ),
  );
  return new Response(body, { status: options.status, headers });
}

async function bestEffortTrack(
  tracker: AnalyticsTracker,
  ...event: Parameters<AnalyticsTracker["track"]>
): Promise<void> {
  try {
    await tracker.track(...event);
  } catch {
    // Product analytics never changes auth behavior.
  }
}

export function createFollowIntentHandler(dependencies: {
  appBaseUrl: string;
  followIntentSecret: string;
  tracker: AnalyticsTracker;
  findInstitution(id: string): Promise<PublicIntentInstitution | null>;
  hasMonitorableSourceCoverage(id: string): Promise<boolean>;
  now?: Clock;
  production?: boolean;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      assertSameOriginForMutation(request, dependencies.appBaseUrl);
    } catch {
      return safeMutationFailure(403);
    }

    let input: z.output<typeof followIntentSchema>;
    try {
      input = followIntentSchema.parse((await readBody(request)).value);
    } catch (error) {
      return safeMutationFailure(bodyErrorStatus(error));
    }

    let resolvedTarget: ResolvedPendingFollowTarget<PublicIntentInstitution> | null;
    try {
      resolvedTarget = await resolveCanonicalPendingFollowTarget(
        input.institutionId,
        dependencies.findInstitution,
        dependencies.hasMonitorableSourceCoverage,
      );
    } catch {
      return safeMutationFailure(503);
    }
    if (!resolvedTarget) return safeMutationFailure(404);
    const institution = resolvedTarget.institution;

    let intent: string;
    try {
      intent = createPendingFollowIntent(
        input.context === "INSTITUTION"
          ? {
              ...input,
              returnPath: `/institutions/${institution.slug}`,
            }
          : input,
        {
          secret: dependencies.followIntentSecret,
          now: dependencies.now?.(),
        },
      );
    } catch {
      return safeMutationFailure(400);
    }

    const response = jsonResponse({ redirectTo: "/auth/kakao/start" });
    response.headers.append(
      "set-cookie",
      serializeCookie(PENDING_FOLLOW_INTENT_COOKIE_NAME, intent, {
        ...pendingFollowIntentCookieAttributes,
        secure:
          dependencies.production ?? process.env.NODE_ENV === "production",
      }),
    );
    return response;
  };
}

export function createKakaoStartHandler(dependencies: {
  oauthStateSecret: string;
  provider: KakaoAuthProvider;
  rateLimiter: RateLimiter;
  replayStore: OAuthReplayStore;
  now?: Clock;
  production?: boolean;
  rateLimitKey?: (request: Request) => string;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const now = dependencies.now?.() ?? new Date();
    let decision;
    try {
      decision = dependencies.rateLimiter.consume({
        key:
          dependencies.rateLimitKey?.(request) ??
          KAKAO_START_EMERGENCY_PROCESS_KEY,
        limit: KAKAO_START_EMERGENCY_PROCESS_LIMIT,
        windowMs: KAKAO_START_EMERGENCY_WINDOW_MS,
        nowMs: now.getTime(),
      });
    } catch {
      return safeMutationFailure(503);
    }
    if (!decision.allowed) {
      return new Response(
        "로그인 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        {
          status: 429,
          headers: privateHeaders({
            "content-type": "text/plain; charset=utf-8",
            "retry-after": String(decision.retryAfterSeconds),
          }),
        },
      );
    }

    let issued: ReturnType<typeof createOAuthState>;
    try {
      issued = createOAuthState({
        secret: dependencies.oauthStateSecret,
        now,
      });
    } catch {
      return safeMutationFailure(503);
    }
    let registered = false;
    try {
      registered = dependencies.replayStore.register(issued.state, {
        nowMs: now.getTime(),
        expiresAtMs: now.getTime() + OAUTH_STATE_TTL_SECONDS * 1_000,
      });
    } catch {
      return safeMutationFailure(503);
    }
    if (!registered) return safeMutationFailure(503);

    let authorizationUrl: string;
    try {
      authorizationUrl = dependencies.provider.buildAuthorizationUrl(
        issued.state,
      );
    } catch {
      dependencies.replayStore.consume(issued.state, { nowMs: now.getTime() });
      return safeMutationFailure(503);
    }
    const headers = privateHeaders({ location: authorizationUrl });
    headers.append(
      "set-cookie",
      serializeCookie(OAUTH_STATE_COOKIE_NAME, issued.cookieValue, {
        ...oauthStateCookieAttributes,
        secure:
          dependencies.production ?? process.env.NODE_ENV === "production",
      }),
    );
    return new Response(null, { status: 302, headers });
  };
}

export function createKakaoCallbackHandler(dependencies: {
  oauthStateSecret: string;
  sessionSecret: string;
  followIntentSecret: string;
  provider: KakaoAuthProvider;
  replayStore: OAuthReplayStore;
  rateLimiter: RateLimiter;
  resolveIdentity(identity: KakaoIdentity): Promise<ResolvedUser>;
  resolvePendingFollowTarget(
    institutionId: string,
  ): Promise<Pick<ResolvedPendingFollowTarget, "canonicalPath"> | null>;
  activateFollow(
    context: UserCommandContext,
    input: { institutionId: string },
  ): Promise<ActivateFollowResult>;
  tracker: AnalyticsTracker;
  now?: Clock;
  production?: boolean;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const now = dependencies.now?.() ?? new Date();
    const production =
      dependencies.production ?? process.env.NODE_ENV === "production";
    const url = new URL(request.url);
    const browserState = url.searchParams.get("state");
    const validState = validateOAuthState({
      browserState,
      cookieValue: readCookie(request, OAUTH_STATE_COOKIE_NAME),
      secret: dependencies.oauthStateSecret,
      now,
    });
    if (!validState) {
      return loginFailureResponse({
        status: 400,
        stateCookieSecure: production,
      });
    }

    let replayStatus;
    try {
      replayStatus = dependencies.replayStore.consume(browserState!, {
        nowMs: (now ?? new Date()).getTime(),
      });
    } catch {
      return loginFailureResponse({
        status: 503,
        retryable: true,
        stateCookieSecure: production,
      });
    }
    if (replayStatus === "CONSUMED") {
      return loginFailureResponse({
        status: 400,
        stateCookieSecure: production,
      });
    }

    // REGISTERED is atomically marked CONSUMED in this process. UNKNOWN is
    // accepted because start and callback may execute in distinct runtimes;
    // protected-cookie validation above remains mandatory. Kakao's one-time
    // authorization code and canonical identity uniqueness are the available
    // cross-runtime backstops until a shared replay store exists.
    if (url.searchParams.has("error") || !url.searchParams.get("code")) {
      return loginFailureResponse({
        status: 400,
        stateCookieSecure: production,
      });
    }

    let rateLimitDecision;
    try {
      rateLimitDecision = dependencies.rateLimiter.consume({
        key: KAKAO_CALLBACK_EMERGENCY_PROCESS_KEY,
        limit: KAKAO_CALLBACK_EMERGENCY_PROCESS_LIMIT,
        windowMs: KAKAO_CALLBACK_EMERGENCY_WINDOW_MS,
        nowMs: now.getTime(),
      });
    } catch {
      return loginFailureResponse({
        status: 503,
        retryable: true,
        stateCookieSecure: production,
      });
    }
    if (!rateLimitDecision.allowed) {
      return loginFailureResponse({
        status: 429,
        retryAfterSeconds: rateLimitDecision.retryAfterSeconds,
        stateCookieSecure: production,
      });
    }

    try {
      const grant = await dependencies.provider.exchangeCode(
        url.searchParams.get("code")!,
      );
      const identity = await dependencies.provider.resolveIdentity(grant);
      const user = await dependencies.resolveIdentity(identity);
      const session = createUserSessionCookie(user.id, {
        secret: dependencies.sessionSecret,
        now,
        production,
      });
      const pendingIntentCookie = readCookie(
        request,
        PENDING_FOLLOW_INTENT_COOKIE_NAME,
      );
      const pendingIntent = readPendingFollowIntent(pendingIntentCookie, {
        secret: dependencies.followIntentSecret,
        now,
      });
      const pendingTarget = pendingIntent
        ? await dependencies.resolvePendingFollowTarget(
            pendingIntent.institutionId,
          )
        : null;
      const validPendingIntent = pendingTarget ? pendingIntent : null;
      if (user.status === "PENDING") {
        await bestEffortTrack(dependencies.tracker, "signup_start", {
          context: validPendingIntent?.context ?? "HOME",
        });
      }
      let completedActiveFollow = false;
      if (user.status === "ACTIVE" && validPendingIntent) {
        await dependencies.activateFollow(
          {
            userId: user.id,
            correlationId: randomUUID(),
            occurredAt: now,
          },
          { institutionId: validPendingIntent.institutionId },
        );
        completedActiveFollow = true;
      }
      const shouldClearPendingIntent =
        user.status === "ACTIVE" &&
        pendingIntentCookie !== null &&
        (validPendingIntent === null || completedActiveFollow);
      const headers = privateHeaders({
        location:
          user.status === "PENDING"
            ? "/onboarding"
            : completedActiveFollow
              ? "/my-preppy"
              : "/",
      });
      headers.append(
        "set-cookie",
        serializeCookie(
          OAUTH_STATE_COOKIE_NAME,
          "",
          clearCookieAttributes({
            ...oauthStateCookieAttributes,
            secure: production,
          }),
        ),
      );
      headers.append(
        "set-cookie",
        serializeCookie(session.name, session.value, session.attributes),
      );
      if (shouldClearPendingIntent) {
        headers.append(
          "set-cookie",
          serializeCookie(
            PENDING_FOLLOW_INTENT_COOKIE_NAME,
            "",
            clearCookieAttributes({
              ...pendingFollowIntentCookieAttributes,
              secure: production,
            }),
          ),
        );
      }
      return new Response(null, { status: 303, headers });
    } catch {
      return loginFailureResponse({
        status: 502,
        retryable: true,
        stateCookieSecure: production,
      });
    }
  };
}

export function createOnboardingGetHandler(dependencies: {
  getState(
    sessionCookie: string | null,
    intentCookie: string | null,
  ): Promise<OnboardingHttpSource>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const state = await dependencies.getState(
        readCookie(request, USER_SESSION_COOKIE_NAME),
        readCookie(request, PENDING_FOLLOW_INTENT_COOKIE_NAME),
      );
      return jsonResponse({
        status: state.userState,
        requiredPolicyVersions: {
          termsOfService: state.policyVersions.TERMS_OF_SERVICE,
          privacyPolicy: state.policyVersions.PRIVACY_POLICY,
        },
        pendingInstitution: state.pendingInstitution
          ? {
              slug: state.pendingInstitution.slug,
              displayName: state.pendingInstitution.displayName,
              category: state.pendingInstitution.category,
              regionCode: state.pendingInstitution.regionCode,
            }
          : null,
      });
    } catch (error) {
      return safeMutationFailure(applicationErrorStatus(error));
    }
  };
}

function onboardingInput(
  value: unknown,
  form: URLSearchParams | null,
): unknown {
  if (!form) return value;
  const email = form.get("email")?.trim();
  const childBirthYear = form.get("childBirthYear")?.trim();
  return {
    consents: [
      ...(form.has("termsConsent")
        ? [
            {
              type: "TERMS_OF_SERVICE",
              decision: "GRANTED",
              policyVersion: form.get("termsPolicyVersion") ?? "",
            },
          ]
        : []),
      ...(form.has("privacyConsent")
        ? [
            {
              type: "PRIVACY_POLICY",
              decision: "GRANTED",
              policyVersion: form.get("privacyPolicyVersion") ?? "",
            },
          ]
        : []),
    ],
    serviceEmailUpdatesConsent: form.has("serviceEmailUpdatesConsent"),
    ...(email ? { email } : {}),
    ...(childBirthYear ? { childBirthYear: Number(childBirthYear) } : {}),
    interestRegions: form.getAll("interestRegions").filter(Boolean),
    interestCategories: form.getAll("interestCategories").filter(Boolean),
  };
}

export function createOnboardingCompleteHandler(dependencies: {
  appBaseUrl: string;
  sessionSecret: string;
  followIntentSecret: string;
  completeSignup(
    context: UserCommandContext,
    input: unknown,
    serverInput: CompleteSignupServerInput,
  ): Promise<CompleteSignupResult>;
  now?: Clock;
  production?: boolean;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      assertSameOriginForMutation(request, dependencies.appBaseUrl);
    } catch {
      return safeMutationFailure(403);
    }
    const now = dependencies.now?.() ?? new Date();
    const session = readUserSession(
      readCookie(request, USER_SESSION_COOKIE_NAME),
      { secret: dependencies.sessionSecret, now },
    );
    if (!session) return safeMutationFailure(401);

    let rawInput: unknown;
    try {
      const body = await readBody(request);
      rawInput = onboardingInput(body.value, body.form);
    } catch (error) {
      return safeMutationFailure(bodyErrorStatus(error));
    }

    try {
      const pendingIntentCookie = readCookie(
        request,
        PENDING_FOLLOW_INTENT_COOKIE_NAME,
      );
      const pendingIntent = readPendingFollowIntent(pendingIntentCookie, {
        secret: dependencies.followIntentSecret,
        now,
      });
      const result = await dependencies.completeSignup(
        {
          userId: session.userId,
          correlationId: randomUUID(),
          occurredAt: now,
        },
        rawInput,
        {
          pendingFollow: pendingIntent
            ? { institutionId: pendingIntent.institutionId }
            : null,
        },
      );
      const refreshed = createUserSessionCookie(result.userId, {
        secret: dependencies.sessionSecret,
        now,
        production: dependencies.production,
      });
      const redirectTo = result.follow ? "/my-preppy" : "/";
      const wantsJson = request.headers
        .get("accept")
        ?.split(",")
        .some((value) => value.trim().toLowerCase() === "application/json");
      const headers = privateHeaders(wantsJson ? {} : { location: redirectTo });
      headers.append(
        "set-cookie",
        serializeCookie(refreshed.name, refreshed.value, refreshed.attributes),
      );
      if (pendingIntentCookie !== null) {
        headers.append(
          "set-cookie",
          serializeCookie(
            PENDING_FOLLOW_INTENT_COOKIE_NAME,
            "",
            clearCookieAttributes({
              ...pendingFollowIntentCookieAttributes,
              secure:
                dependencies.production ??
                process.env.NODE_ENV === "production",
            }),
          ),
        );
      }
      const responseBody = result.follow
        ? {
            redirectTo,
            message: "관심기관 등록이 완료되었습니다.",
          }
        : { redirectTo };
      return wantsJson
        ? Response.json(responseBody, { status: 200, headers })
        : new Response(null, { status: 303, headers });
    } catch (error) {
      return safeMutationFailure(applicationErrorStatus(error));
    }
  };
}

export function createSessionHandler(dependencies: {
  getCurrentUser(sessionCookie: string | null): Promise<unknown | null>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const user = await dependencies.getCurrentUser(
        readCookie(request, USER_SESSION_COOKIE_NAME),
      );
      return jsonResponse({ authenticated: user !== null });
    } catch {
      return jsonResponse({ authenticated: false });
    }
  };
}

export function createLogoutHandler(dependencies: {
  appBaseUrl: string;
  production?: boolean;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      assertSameOriginForMutation(request, dependencies.appBaseUrl);
    } catch {
      return safeMutationFailure(403);
    }
    return clearedSessionResponse(dependencies.production);
  };
}

function clearedSessionResponse(production?: boolean): Response {
  const cleared = clearUserSessionCookie({ production });
  const headers = privateHeaders();
  headers.append(
    "set-cookie",
    serializeCookie(cleared.name, cleared.value, cleared.attributes),
  );
  return new Response(null, { status: 204, headers });
}

export function createRuntimeRouteHandler<Runtime>(
  getRuntime: () => Runtime,
  createHandler: (runtime: Runtime) => (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await createHandler(getRuntime())(request);
    } catch {
      return safeMutationFailure(503);
    }
  };
}

export function createKakaoCallbackRuntimeRouteHandler<Runtime>(
  getRuntime: () => Runtime,
  createHandler: (runtime: Runtime) => (request: Request) => Promise<Response>,
  options: { production?: boolean } = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await createHandler(getRuntime())(request);
    } catch {
      return loginFailureResponse({
        status: 503,
        retryable: true,
        stateCookieSecure:
          options.production ?? process.env.NODE_ENV === "production",
      });
    }
  };
}

export function createLogoutRuntimeRouteHandler<Runtime>(
  getRuntime: () => Runtime,
  createHandler: (runtime: Runtime) => (request: Request) => Promise<Response>,
  options: {
    getTrustedAppBaseUrl: () => string | undefined;
    production?: boolean;
  },
): (request: Request) => Promise<Response> {
  return async (request) => {
    let trustedAppBaseUrl: string | null;
    try {
      trustedAppBaseUrl = validateTrustedApplicationOrigin(
        options.getTrustedAppBaseUrl(),
      );
    } catch {
      trustedAppBaseUrl = null;
    }
    if (!trustedAppBaseUrl) return safeMutationFailure(503);

    try {
      assertSameOriginForMutation(request, trustedAppBaseUrl);
    } catch {
      return safeMutationFailure(403);
    }

    try {
      return await createHandler(getRuntime())(request);
    } catch {
      return clearedSessionResponse(options.production);
    }
  };
}
