import { describe, expect, it, vi } from "vitest";

import { TestAnalyticsTracker } from "@/src/analytics/tracker";
import {
  createFollowIntentHandler,
  createKakaoCallbackRuntimeRouteHandler,
  createKakaoCallbackHandler,
  createKakaoStartHandler,
  createLogoutRuntimeRouteHandler,
  createOnboardingCompleteHandler,
  createOnboardingGetHandler,
  createRuntimeRouteHandler,
} from "@/src/modules/auth/http.server";
import type { KakaoAuthProvider } from "@/src/modules/auth/kakao-provider.server";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE_NAME,
} from "@/src/modules/auth/oauth-state.server";
import { ProcessLocalOAuthReplayStore } from "@/src/modules/auth/oauth-replay.server";
import type { RateLimitRequest } from "@/src/modules/auth/rate-limit.server";
import {
  createPendingFollowIntent,
  PENDING_FOLLOW_INTENT_COOKIE_NAME,
} from "@/src/modules/auth/pending-follow-intent.server";
import {
  createUserSessionCookie,
  USER_SESSION_COOKIE_NAME,
} from "@/src/modules/auth/session.server";

const appBaseUrl = "https://preppy.example";
const stateSecret = "state-secret-that-is-at-least-thirty-two-characters";
const followSecret = "follow-secret-that-is-at-least-thirty-two-characters";
const sessionSecret = "session-secret-that-is-at-least-thirty-two-characters";
const now = new Date("2026-08-23T03:00:00.000Z");
const institutionId = "550e8400-e29b-41d4-a716-446655440000";
const userId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function cookiesRequest(
  url: string,
  cookies: Record<string, string>,
  init: RequestInit = {},
): Request {
  return new Request(url, {
    ...init,
    headers: {
      cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join("; "),
      ...init.headers,
    },
  });
}

function provider(): KakaoAuthProvider {
  return {
    buildAuthorizationUrl: vi.fn(
      (state: string) =>
        `https://kauth.kakao.com/oauth/authorize?state=${state}`,
    ),
    exchangeCode: vi.fn(async () => ({}) as never),
    resolveIdentity: vi.fn(async () => ({ subject: "123456789" })),
  };
}

function replayStore() {
  return new ProcessLocalOAuthReplayStore({ maxEntries: 20 });
}

function allowingCallbackGuards() {
  return {
    rateLimiter: {
      consume: () => ({
        allowed: true,
        remaining: 119,
        retryAfterSeconds: 0,
      }),
    },
    resolvePendingFollowTarget: async () => null,
    activateFollow: async () => ({
      followId: "8ba7b810-9dad-11d1-80b4-00c04fd430c8",
      institutionId,
      state: "ACTIVE" as const,
      activatedAt: now.toISOString(),
      created: true,
      reactivated: false,
      activeFollowCount: 1,
    }),
  };
}

describe("WP-08 Task 4 review fixes", () => {
  it("maps route-level runtime initialization failures to a redacted private response", async () => {
    // Mutation caught: invoking getAuthRuntime outside the safe HTTP boundary.
    const handler = createRuntimeRouteHandler(
      () => {
        throw new Error("private runtime secret");
      },
      () => async () => new Response("unreachable"),
    );
    const response = await handler(
      new Request(`${appBaseUrl}/api/auth/session`),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).not.toContain("private runtime secret");
  });

  it("registers start state and atomically allows only one concurrent callback to reach the provider", async () => {
    // Mutation caught: relying on the eventual Set-Cookie clear instead of server-side single use.
    const store = replayStore();
    const kakao = provider();
    const start = await createKakaoStartHandler({
      oauthStateSecret: stateSecret,
      provider: kakao,
      replayStore: store,
      rateLimiter: {
        consume: () => ({
          allowed: true,
          remaining: 119,
          retryAfterSeconds: 0,
        }),
      },
      now: () => now,
    } as never)(new Request(`${appBaseUrl}/auth/kakao/start`));
    const location = new URL(start.headers.get("location")!);
    const state = location.searchParams.get("state")!;
    const stateCookie = decodeURIComponent(
      start.headers.get("set-cookie")!.match(/preppy_oauth_state=([^;]+)/)![1]!,
    );
    const callback = createKakaoCallbackHandler({
      ...allowingCallbackGuards(),
      oauthStateSecret: stateSecret,
      sessionSecret,
      followIntentSecret: followSecret,
      provider: kakao,
      replayStore: store,
      resolveIdentity: async () => ({ id: userId, status: "ACTIVE" }),
      tracker: new TestAnalyticsTracker(),
      now: () => now,
    } as never);
    const request = () =>
      cookiesRequest(
        `${appBaseUrl}/auth/kakao/callback?code=provider-code&state=${state}`,
        { [OAUTH_STATE_COOKIE_NAME]: stateCookie },
      );

    const responses = await Promise.all([
      callback(request()),
      callback(request()),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      303, 400,
    ]);
    expect(kakao.exchangeCode).toHaveBeenCalledTimes(1);
    expect(
      responses.every(
        (response) => response.headers.get("referrer-policy") === "no-referrer",
      ),
    ).toBe(true);
  });

  it("accepts protected callback state when start and callback use distinct runtime stores", async () => {
    // Mutation caught: treating an empty callback-runtime store as proof that a valid protected state was never issued.
    const startStore = replayStore();
    const callbackStore = replayStore();
    const kakao = provider();
    const startResponse = await createKakaoStartHandler({
      oauthStateSecret: stateSecret,
      provider: kakao,
      replayStore: startStore,
      rateLimiter: {
        consume: () => ({
          allowed: true,
          remaining: 119,
          retryAfterSeconds: 0,
        }),
      },
      now: () => now,
    } as never)(new Request(`${appBaseUrl}/auth/kakao/start`));
    const location = new URL(startResponse.headers.get("location")!);
    const state = location.searchParams.get("state")!;
    const stateCookie = decodeURIComponent(
      startResponse.headers
        .get("set-cookie")!
        .match(/preppy_oauth_state=([^;]+)/)![1]!,
    );

    const response = await createKakaoCallbackHandler({
      ...allowingCallbackGuards(),
      oauthStateSecret: stateSecret,
      sessionSecret,
      followIntentSecret: followSecret,
      provider: kakao,
      replayStore: callbackStore,
      resolveIdentity: async () => ({ id: userId, status: "ACTIVE" }),
      tracker: new TestAnalyticsTracker(),
      now: () => now,
    } as never)(
      cookiesRequest(
        `${appBaseUrl}/auth/kakao/callback?code=provider-code&state=${state}`,
        { [OAUTH_STATE_COOKIE_NAME]: stateCookie },
      ),
    );

    expect(response.status).toBe(303);
    expect(kakao.exchangeCode).toHaveBeenCalledTimes(1);
  });

  it("does not spend callback limiter capacity for an invalid protected state", async () => {
    // Mutation caught: rate limiting attacker-controlled callbacks before the
    // protected browser state and replay checks.
    const rateLimiter = { consume: vi.fn() };
    const kakao = provider();
    const response = await createKakaoCallbackHandler({
      oauthStateSecret: stateSecret,
      sessionSecret,
      followIntentSecret: followSecret,
      provider: kakao,
      replayStore: replayStore(),
      rateLimiter,
      resolveIdentity: vi.fn(),
      resolvePendingFollowTarget: vi.fn(),
      tracker: new TestAnalyticsTracker(),
      now: () => now,
    } as never)(
      new Request(
        `${appBaseUrl}/auth/kakao/callback?code=provider-code&state=attacker-state`,
      ),
    );

    expect(response.status).toBe(400);
    expect(rateLimiter.consume).not.toHaveBeenCalled();
    expect(kakao.exchangeCode).not.toHaveBeenCalled();
  });

  it("rate-limits a valid callback before provider and identity work", async () => {
    // Mutation caught: applying the emergency guard only on auth start.
    const issued = createOAuthState({ secret: stateSecret, now });
    const kakao = provider();
    const resolveIdentity = vi.fn();
    const rateLimiter = {
      consume: vi.fn(() => ({
        allowed: false,
        remaining: 0,
        retryAfterSeconds: 31,
      })),
    };
    const response = await createKakaoCallbackHandler({
      oauthStateSecret: stateSecret,
      sessionSecret,
      followIntentSecret: followSecret,
      provider: kakao,
      replayStore: { register: vi.fn(), consume: vi.fn(() => "REGISTERED") },
      rateLimiter,
      resolveIdentity,
      resolvePendingFollowTarget: vi.fn(),
      tracker: new TestAnalyticsTracker(),
      now: () => now,
      production: true,
    } as never)(
      cookiesRequest(
        `${appBaseUrl}/auth/kakao/callback?code=provider-code&state=${issued.state}`,
        { [OAUTH_STATE_COOKIE_NAME]: issued.cookieValue },
      ),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("31");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toContain(
      `${OAUTH_STATE_COOKIE_NAME}=;`,
    );
    expect(rateLimiter.consume).toHaveBeenCalledWith({
      key: "kakao-callback:process-global",
      limit: 120,
      windowMs: 60_000,
      nowMs: now.getTime(),
    });
    expect(kakao.exchangeCode).not.toHaveBeenCalled();
    expect(kakao.resolveIdentity).not.toHaveBeenCalled();
    expect(resolveIdentity).not.toHaveBeenCalled();
  });

  it("redacts callback limiter failures and clears state before provider work", async () => {
    // Mutation caught: allowing a failing limiter to reject outside the safe
    // callback response boundary or continuing into Kakao.
    const issued = createOAuthState({ secret: stateSecret, now });
    const kakao = provider();
    const response = await createKakaoCallbackHandler({
      oauthStateSecret: stateSecret,
      sessionSecret,
      followIntentSecret: followSecret,
      provider: kakao,
      replayStore: { register: vi.fn(), consume: vi.fn(() => "REGISTERED") },
      rateLimiter: {
        consume: () => {
          throw new Error("private callback limiter backend");
        },
      },
      resolveIdentity: vi.fn(),
      resolvePendingFollowTarget: vi.fn(),
      tracker: new TestAnalyticsTracker(),
      now: () => now,
    } as never)(
      cookiesRequest(
        `${appBaseUrl}/auth/kakao/callback?code=provider-code&state=${issued.state}`,
        { [OAUTH_STATE_COOKIE_NAME]: issued.cookieValue },
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toContain(
      `${OAUTH_STATE_COOKIE_NAME}=;`,
    );
    expect(await response.text()).not.toContain("private callback limiter");
    expect(kakao.exchangeCode).not.toHaveBeenCalled();
    expect(kakao.resolveIdentity).not.toHaveBeenCalled();
  });

  it.each([
    [
      "closed Institution",
      "INSTITUTION",
      "/institutions/old-school-slug",
      null,
      "/",
      true,
    ],
    [
      "unpublished Institution",
      "INSTITUTION",
      "/institutions/old-school-slug",
      null,
      "/",
      true,
    ],
    [
      "deleted Institution",
      "INSTITUTION",
      "/institutions/old-school-slug",
      null,
      "/",
      true,
    ],
    [
      "renamed Institution",
      "INSTITUTION",
      "/institutions/old-school-slug",
      { canonicalPath: "/institutions/current-school-slug" },
      "/my-preppy",
      true,
    ],
    [
      "valid Article source",
      "ARTICLE",
      "/articles/admissions-guide",
      { canonicalPath: "/institutions/current-school-slug" },
      "/my-preppy",
      true,
    ],
    [
      "valid Opportunity source",
      "OPPORTUNITY",
      "/opportunities/open-house",
      { canonicalPath: "/institutions/current-school-slug" },
      "/my-preppy",
      true,
    ],
    [
      "Article with invalid Institution",
      "ARTICLE",
      "/articles/admissions-guide",
      null,
      "/",
      true,
    ],
    [
      "Opportunity with invalid Institution",
      "OPPORTUNITY",
      "/opportunities/open-house",
      null,
      "/",
      true,
    ],
  ] as const)(
    "applies the ACTIVE destination policy for %s after intent issuance",
    async (
      _case,
      context,
      returnPath,
      resolvedTarget,
      expectedLocation,
      shouldClearIntent,
    ) => {
      // Mutation caught: replacing protected Article/Opportunity source paths
      // with the canonical Institution path after target revalidation.
      const issued = createOAuthState({ secret: stateSecret, now });
      const intent = createPendingFollowIntent(
        {
          institutionId,
          context,
          returnPath,
          ...(context === "ARTICLE" ? { articleId: userId } : {}),
          ...(context === "OPPORTUNITY" ? { opportunityId: userId } : {}),
        },
        { secret: followSecret, now },
      );
      const resolvePendingFollowTarget = vi.fn(async () => resolvedTarget);
      const activateFollow = vi.fn(async () => ({
        followId: "8ba7b810-9dad-11d1-80b4-00c04fd430c8",
        institutionId,
        state: "ACTIVE" as const,
        activatedAt: now.toISOString(),
        created: true,
        reactivated: false,
        activeFollowCount: 1,
      }));
      const response = await createKakaoCallbackHandler({
        oauthStateSecret: stateSecret,
        sessionSecret,
        followIntentSecret: followSecret,
        provider: provider(),
        replayStore: {
          register: vi.fn(),
          consume: vi.fn(() => "REGISTERED"),
        },
        rateLimiter: {
          consume: () => ({
            allowed: true,
            remaining: 119,
            retryAfterSeconds: 0,
          }),
        },
        resolveIdentity: async () => ({ id: userId, status: "ACTIVE" }),
        resolvePendingFollowTarget,
        activateFollow,
        tracker: new TestAnalyticsTracker(),
        now: () => now,
      } as never)(
        cookiesRequest(
          `${appBaseUrl}/auth/kakao/callback?code=provider-code&state=${issued.state}`,
          {
            [OAUTH_STATE_COOKIE_NAME]: issued.cookieValue,
            [PENDING_FOLLOW_INTENT_COOKIE_NAME]: intent,
          },
        ),
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(expectedLocation);
      expect(resolvePendingFollowTarget).toHaveBeenCalledWith(institutionId);
      expect(activateFollow).toHaveBeenCalledTimes(resolvedTarget ? 1 : 0);
      const cookies = response.headers.get("set-cookie") ?? "";
      if (shouldClearIntent) {
        expect(cookies).toMatch(
          new RegExp(`${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;[^,]*Max-Age=0`),
        );
      } else {
        expect(cookies).not.toMatch(
          new RegExp(`${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;[^,]*Max-Age=0`),
        );
      }
    },
  );

  it("rejects an external Article continuation before it can be protected", () => {
    // Mutation caught: broadening PendingFollowIntent into generic redirect
    // storage while restoring source-page continuation.
    expect(() =>
      createPendingFollowIntent(
        {
          institutionId,
          context: "ARTICLE",
          articleId: userId,
          returnPath: "https://evil.example/articles/phishing",
        },
        { secret: followSecret, now },
      ),
    ).toThrow();
  });

  it("uses a callback runtime-failure response with exact OAuth-state cookie clearing", async () => {
    // Mutation caught: routing callback initialization errors through the generic 503 response with no state-cookie expiration.
    const failingRuntime = () => {
      throw new Error("private runtime initialization detail");
    };
    const unreachableFactory = () => async () =>
      new Response("unreachable runtime handler");

    const callback = await createKakaoCallbackRuntimeRouteHandler(
      failingRuntime,
      unreachableFactory,
      { production: true },
    )(new Request(`${appBaseUrl}/auth/kakao/callback`));
    expect(callback.status).toBe(503);
    expect(callback.headers.get("set-cookie")).toBe(
      "preppy_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
    );
    expect(callback.headers.get("cache-control")).toBe("private, no-store");
    expect(callback.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await callback.text()).not.toContain("private runtime");
  });

  it.each([
    ["same-origin", "runtime", appBaseUrl, 204],
    ["same-origin", "factory", appBaseUrl, 204],
    ["hostile Origin", "runtime", "https://evil.example", 403],
    ["hostile Origin", "factory", "https://evil.example", 403],
    ["missing Origin", "runtime", null, 403],
    ["missing Origin", "factory", null, 403],
  ] as const)(
    "validates %s before a throwing %s logout boundary",
    async (_originCase, failureSource, origin, expectedStatus) => {
      // Mutation caught: clearing a session from the runtime-failure catch before mandatory Origin validation.
      const getRuntime = vi.fn(() => {
        if (failureSource === "runtime") {
          throw new Error("private runtime initialization detail");
        }
        return {};
      });
      const createHandler = vi.fn(() => {
        if (failureSource === "factory") {
          throw new Error("private handler factory detail");
        }
        return async () => new Response("unreachable runtime handler");
      });
      const headers = origin ? { origin } : undefined;

      const logout = await createLogoutRuntimeRouteHandler(
        getRuntime,
        createHandler,
        {
          production: true,
          getTrustedAppBaseUrl: () => appBaseUrl,
        },
      )(
        new Request(`${appBaseUrl}/api/auth/logout`, {
          method: "POST",
          headers,
        }),
      );

      expect(logout.status).toBe(expectedStatus);
      if (expectedStatus === 204) {
        expect(logout.headers.get("set-cookie")).toBe(
          "preppy_user_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
        );
        expect(logout.headers.get("set-cookie")).not.toContain(
          PENDING_FOLLOW_INTENT_COOKIE_NAME,
        );
        expect(logout.headers.get("set-cookie")).not.toContain(
          OAUTH_STATE_COOKIE_NAME,
        );
      } else {
        expect(logout.headers.get("set-cookie")).toBeNull();
        expect(getRuntime).not.toHaveBeenCalled();
        expect(await logout.json()).toEqual({
          error: "요청을 확인할 수 없습니다.",
        });
      }
    },
  );

  it.each([undefined, "https://preppy.example/not-an-origin"])(
    "fails closed without a cookie when the trusted logout origin is %s",
    async (trustedAppBaseUrl) => {
      // Mutation caught: treating a missing or path-bearing deployment value as a trusted application origin.
      const getRuntime = vi.fn(() => ({}));
      const logout = await createLogoutRuntimeRouteHandler(
        getRuntime,
        () => async () => new Response("unreachable runtime handler"),
        {
          production: true,
          getTrustedAppBaseUrl: () => trustedAppBaseUrl,
        },
      )(
        new Request(`${appBaseUrl}/api/auth/logout`, {
          method: "POST",
          headers: { origin: appBaseUrl },
        }),
      );

      expect(logout.status).toBe(503);
      expect(logout.headers.get("set-cookie")).toBeNull();
      expect(logout.headers.get("cache-control")).toBe("private, no-store");
      expect(getRuntime).not.toHaveBeenCalled();
    },
  );

  it("uses a process-global 120/min key that spoofed forwarding headers cannot rotate", async () => {
    // Mutation caught: deriving limiter identity from attacker-controlled proxy headers.
    const requests: Array<{ key: string; limit: number }> = [];
    const handler = createKakaoStartHandler({
      oauthStateSecret: stateSecret,
      provider: provider(),
      replayStore: replayStore(),
      rateLimiter: {
        consume: (request: RateLimitRequest) => {
          requests.push({ key: request.key, limit: request.limit });
          return { allowed: true, remaining: 119, retryAfterSeconds: 0 };
        },
      },
      now: () => now,
    } as never);
    await handler(
      new Request(`${appBaseUrl}/auth/kakao/start`, {
        headers: { "x-forwarded-for": "1.1.1.1", forwarded: "for=1.1.1.1" },
      }),
    );
    await handler(
      new Request(`${appBaseUrl}/auth/kakao/start`, {
        headers: { "x-forwarded-for": "8.8.8.8", forwarded: "for=8.8.8.8" },
      }),
    );
    expect(requests).toEqual([
      { key: "kakao-start:process-global", limit: 120 },
      { key: "kakao-start:process-global", limit: 120 },
    ]);
  });

  it("rejects declared and chunked oversized bodies before buffering and redacts stream errors", async () => {
    // Mutation caught: using request.text() before enforcing the 16 KiB bound.
    const findInstitution = vi.fn();
    const handler = createFollowIntentHandler({
      appBaseUrl,
      followIntentSecret: followSecret,
      tracker: new TestAnalyticsTracker(),
      findInstitution,
      hasMonitorableSourceCoverage: async () => true,
      now: () => now,
    });
    const declared = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    });
    const declaredResponse = await handler(
      new Request(`${appBaseUrl}/api/auth/follow-intent`, {
        method: "POST",
        headers: {
          origin: appBaseUrl,
          "content-type": " Application/JSON ; Charset=UTF-8 ",
          "content-length": "20000",
        },
        body: declared,
        duplex: "half",
      } as RequestInit),
    );
    expect(declaredResponse.status).toBe(413);

    let cancelled = false;
    const chunked = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(9_000));
        controller.enqueue(new Uint8Array(9_000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const chunkedResponse = await handler(
      new Request(`${appBaseUrl}/api/auth/follow-intent`, {
        method: "POST",
        headers: { origin: appBaseUrl, "content-type": "application/json" },
        body: chunked,
        duplex: "half",
      } as RequestInit),
    );
    expect(chunkedResponse.status).toBe(413);
    expect(cancelled).toBe(true);

    const broken = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("private stream transport detail"));
      },
    });
    const brokenResponse = await handler(
      new Request(`${appBaseUrl}/api/auth/follow-intent`, {
        method: "POST",
        headers: { origin: appBaseUrl, "content-type": "application/json" },
        body: broken,
        duplex: "half",
      } as RequestInit),
    );
    expect(brokenResponse.status).toBe(503);
    expect(brokenResponse.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(await brokenResponse.text()).not.toContain("private stream");
    expect(findInstitution).not.toHaveBeenCalled();
  });

  it("maps lookup, limiter, state registration, and provider URL failures to safe private 503 responses", async () => {
    // Mutation caught: rejecting Route Handler promises with infrastructure details.
    const validBody = JSON.stringify({
      institutionId,
      context: "INSTITUTION",
      returnPath: "/institutions/school",
    });
    const lookup = await createFollowIntentHandler({
      appBaseUrl,
      followIntentSecret: followSecret,
      tracker: new TestAnalyticsTracker(),
      findInstitution: async () => {
        throw new Error("private database host");
      },
      hasMonitorableSourceCoverage: async () => true,
    })(
      new Request(`${appBaseUrl}/api/auth/follow-intent`, {
        method: "POST",
        headers: { origin: appBaseUrl, "content-type": "application/json" },
        body: validBody,
      }),
    );
    expect(lookup.status).toBe(503);
    expect(await lookup.text()).not.toContain("private database");

    const failingLimiter = await createKakaoStartHandler({
      oauthStateSecret: stateSecret,
      provider: provider(),
      replayStore: replayStore(),
      rateLimiter: {
        consume: () => {
          throw new Error("private limiter detail");
        },
      },
    } as never)(new Request(`${appBaseUrl}/auth/kakao/start`));
    expect(failingLimiter.status).toBe(503);

    const noCapacity = await createKakaoStartHandler({
      oauthStateSecret: stateSecret,
      provider: provider(),
      replayStore: { register: () => false, consume: () => "UNKNOWN" },
      rateLimiter: {
        consume: () => ({ allowed: true, remaining: 1, retryAfterSeconds: 0 }),
      },
    } as never)(new Request(`${appBaseUrl}/auth/kakao/start`));
    expect(noCapacity.status).toBe(503);

    const badProvider = provider();
    vi.mocked(badProvider.buildAuthorizationUrl).mockImplementation(() => {
      throw new Error("private provider URL detail");
    });
    const providerFailure = await createKakaoStartHandler({
      oauthStateSecret: stateSecret,
      provider: badProvider,
      replayStore: replayStore(),
      rateLimiter: {
        consume: () => ({ allowed: true, remaining: 1, retryAfterSeconds: 0 }),
      },
    } as never)(new Request(`${appBaseUrl}/auth/kakao/start`));
    expect(providerFailure.status).toBe(503);
    expect(await providerFailure.text()).not.toContain("private provider");
  });

  it("projects an explicit onboarding API DTO without private defaults or IDs", async () => {
    // Mutation caught: serializing the internal onboarding service object directly.
    const response = await createOnboardingGetHandler({
      getState: async () => ({
        userState: "PENDING",
        defaults: {
          email: "private-parent@example.test",
          childBirthYear: 2020,
          interestRegions: ["KR-11"],
          interestCategories: ["INTERNATIONAL_SCHOOL"],
          serviceEmailUpdatesConsent: true,
        },
        policyVersions: {
          TERMS_OF_SERVICE: "2026-08-23",
          PRIVACY_POLICY: "2026-08-23",
          SERVICE_EMAIL_UPDATES: "2026-08-23",
        },
        pendingInstitution: {
          id: institutionId,
          slug: "seoul-international-school",
          displayName: "서울국제학교",
          category: "INTERNATIONAL_SCHOOL",
          regionCode: "KR-11",
        },
      }),
    })(new Request(`${appBaseUrl}/api/me/onboarding`));
    expect(await response.json()).toEqual({
      status: "PENDING",
      requiredPolicyVersions: {
        termsOfService: "2026-08-23",
        privacyPolicy: "2026-08-23",
      },
      pendingInstitution: {
        slug: "seoul-international-school",
        displayName: "서울국제학교",
        category: "INTERNATIONAL_SCHOOL",
        regionCode: "KR-11",
      },
    });
  });

  it("uses committed Follow completion for the onboarding destination and clears the source intent", async () => {
    // Mutation caught: trusting the signed source path after activation or
    // returning before the committed Follow result is available.
    const session = createUserSessionCookie(userId, {
      secret: sessionSecret,
      now,
    }).value;
    const intent = createPendingFollowIntent(
      {
        institutionId,
        context: "ARTICLE",
        articleId: "7ba7b810-9dad-11d1-80b4-00c04fd430c8",
        returnPath: "/articles/admissions-guide",
      },
      { secret: followSecret, now },
    );
    const completeSignup = vi
      .fn()
      .mockResolvedValueOnce({
        userId,
        userState: "ACTIVE" as const,
        follow: {
          followId: "8ba7b810-9dad-11d1-80b4-00c04fd430c8",
          institutionId,
          state: "ACTIVE" as const,
          activatedAt: now.toISOString(),
          created: true,
          reactivated: false,
          activeFollowCount: 1,
        },
      })
      .mockResolvedValueOnce({
        userId,
        userState: "ACTIVE" as const,
        follow: null,
      });
    const handler = createOnboardingCompleteHandler({
      appBaseUrl,
      sessionSecret,
      followIntentSecret: followSecret,
      completeSignup,
      now: () => now,
    } as never);
    const response = await handler(
      cookiesRequest(
        `${appBaseUrl}/api/me/onboarding/complete`,
        {
          [USER_SESSION_COOKIE_NAME]: session,
          [PENDING_FOLLOW_INTENT_COOKIE_NAME]: intent,
        },
        {
          method: "POST",
          headers: {
            origin: appBaseUrl,
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      redirectTo: "/my-preppy",
      message: "관심기관 등록이 완료되었습니다.",
    });
    expect(completeSignup).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
      expect.any(Object),
      { pendingFollow: { institutionId } },
    );
    expect(response.headers.get("set-cookie")).toContain(
      USER_SESSION_COOKIE_NAME,
    );
    expect(response.headers.get("set-cookie")).toContain(
      `${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;`,
    );

    const neutral = await handler(
      cookiesRequest(
        `${appBaseUrl}/api/me/onboarding/complete`,
        {
          [USER_SESSION_COOKIE_NAME]: session,
          [PENDING_FOLLOW_INTENT_COOKIE_NAME]: intent,
        },
        {
          method: "POST",
          headers: {
            origin: appBaseUrl,
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        },
      ),
    );
    expect(await neutral.json()).toEqual({ redirectTo: "/" });
  });
});
