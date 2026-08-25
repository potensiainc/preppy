import { describe, expect, it, vi } from "vitest";

import { TestAnalyticsTracker } from "@/src/analytics/tracker";
import {
  createFollowIntentHandler,
  createKakaoCallbackHandler,
  createKakaoStartHandler,
  createLogoutHandler,
  createOnboardingCompleteHandler,
  createOnboardingGetHandler,
  createSessionHandler,
} from "@/src/modules/auth/http.server";
import type { KakaoAuthProvider } from "@/src/modules/auth/kakao-provider.server";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE_NAME,
} from "@/src/modules/auth/oauth-state.server";
import {
  createPendingFollowIntent,
  PENDING_FOLLOW_INTENT_COOKIE_NAME,
  readPendingFollowIntent,
} from "@/src/modules/auth/pending-follow-intent.server";
import {
  createUserSessionCookie,
  readUserSession,
  USER_SESSION_COOKIE_NAME,
} from "@/src/modules/auth/session.server";

const appBaseUrl = "https://preppy.example";
const stateSecret = "state-secret-that-is-at-least-thirty-two-characters";
const followSecret = "follow-secret-that-is-at-least-thirty-two-characters";
const sessionSecret = "session-secret-that-is-at-least-thirty-two-characters";
const now = new Date("2026-08-23T03:00:00.000Z");
const institutionId = "550e8400-e29b-41d4-a716-446655440000";
const userId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function cookieValue(response: Response, name: string): string | null {
  const match = response.headers
    .get("set-cookie")
    ?.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`));
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

function cookieRequest(
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

function fakeProvider(): KakaoAuthProvider {
  return {
    buildAuthorizationUrl: vi.fn(
      (state: string) =>
        `https://kauth.kakao.com/oauth/authorize?state=${state}`,
    ),
    exchangeCode: vi.fn(async () => ({}) as never),
    resolveIdentity: vi.fn(async () => ({ subject: "123456789" })),
  };
}

function allowingReplayStore() {
  return {
    register: vi.fn(() => true),
    consume: vi.fn(() => "REGISTERED" as const),
  };
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
    resolvePendingFollowTarget: async () => ({
      institution: {
        id: institutionId,
        slug: "seoul-international-school",
        displayName: "서울국제학교",
        category: "INTERNATIONAL_SCHOOL",
        regionCode: "KR-11",
      },
      canonicalPath: "/institutions/seoul-international-school",
    }),
    activateFollow: async () => ({
      followId: "7ba7b810-9dad-11d1-80b4-00c04fd430c8",
      institutionId,
      state: "ACTIVE" as const,
      activatedAt: now.toISOString(),
      created: true,
      reactivated: false,
      activeFollowCount: 1,
    }),
  };
}

describe("WP-08 auth Route Handler factories", () => {
  it("stores a protected intent without duplicating the client-owned follow_click or creating a Follow", async () => {
    // Mutation caught: trusting the browser's Institution/path, accepting a closed target, or writing a Follow at click time.
    const tracker = new TestAnalyticsTracker();
    const findInstitution = vi.fn(async () => ({
      id: institutionId,
      slug: "seoul-international-school",
      publicationState: "PUBLISHED",
      operationalState: "ACTIVE",
    }));
    const handler = createFollowIntentHandler({
      appBaseUrl,
      followIntentSecret: followSecret,
      tracker,
      findInstitution,
      hasMonitorableSourceCoverage: async () => true,
      now: () => now,
      production: true,
    });

    const response = await handler(
      new Request(`${appBaseUrl}/api/auth/follow-intent`, {
        method: "POST",
        headers: {
          origin: appBaseUrl,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          institutionId: institutionId.toUpperCase(),
          context: "INSTITUTION",
          returnPath: "/institutions/browser-supplied-wrong-school",
        }),
      }),
    );

    expect(response.status).toBe(200);
    const responseBody = (await response.json()) as Record<string, unknown>;
    expect(responseBody).toEqual({ redirectTo: "/auth/kakao/start" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toContain(
      `${PENDING_FOLLOW_INTENT_COOKIE_NAME}=`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(
      readPendingFollowIntent(
        cookieValue(response, PENDING_FOLLOW_INTENT_COOKIE_NAME),
        { secret: followSecret, now },
      ),
    ).toMatchObject({
      institutionId,
      context: "INSTITUTION",
      returnPath: "/institutions/seoul-international-school",
    });
    expect(findInstitution).toHaveBeenCalledWith(institutionId);
    expect(tracker.snapshot()).toEqual([]);
    expect(Object.keys(responseBody)).not.toContain("follow");
  });

  it("accepts form input but rejects cross-origin, unpublished, and closed intent requests without a cookie or event", async () => {
    // Mutation caught: losing form support or setting intent before origin/public eligibility checks.
    const tracker = new TestAnalyticsTracker();
    const findInstitution = vi
      .fn()
      .mockResolvedValueOnce({
        id: institutionId,
        slug: "hidden-school",
        publicationState: "DRAFT",
        operationalState: "ACTIVE",
      })
      .mockResolvedValueOnce({
        id: institutionId,
        slug: "closed-school",
        publicationState: "PUBLISHED",
        operationalState: "CLOSED",
      });
    const handler = createFollowIntentHandler({
      appBaseUrl,
      followIntentSecret: followSecret,
      tracker,
      findInstitution,
      hasMonitorableSourceCoverage: async () => true,
      now: () => now,
    });
    const form = new URLSearchParams({
      institutionId,
      context: "INSTITUTION",
      returnPath: "/institutions/seoul-international-school",
    });

    const crossOrigin = await handler(
      new Request(`${appBaseUrl}/api/auth/follow-intent`, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form,
      }),
    );
    expect(crossOrigin.status).toBe(403);
    expect(findInstitution).not.toHaveBeenCalled();

    for (const expectedStatus of [404, 404]) {
      const response = await handler(
        new Request(`${appBaseUrl}/api/auth/follow-intent`, {
          method: "POST",
          headers: {
            origin: appBaseUrl,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form,
        }),
      );
      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(tracker.snapshot()).toEqual([]);
  });

  it("rate-limits Kakao start, sets OAuth state, and redirects to the adapter without an identity call", async () => {
    // Mutation caught: omitting the start boundary, failing to issue state, or exchanging provider credentials during start.
    const provider = fakeProvider();
    const allowedHandler = createKakaoStartHandler({
      oauthStateSecret: stateSecret,
      provider,
      replayStore: allowingReplayStore(),
      rateLimiter: {
        consume: () => ({
          allowed: true,
          remaining: 4,
          retryAfterSeconds: 0,
        }),
      },
      now: () => now,
      production: true,
    });
    const response = await allowedHandler(
      new Request(`${appBaseUrl}/auth/kakao/start`),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/kauth\.kakao\.com\/oauth\/authorize\?state=/,
    );
    expect(response.headers.get("set-cookie")).toContain(
      `${OAUTH_STATE_COOKIE_NAME}=`,
    );
    expect(provider.exchangeCode).not.toHaveBeenCalled();
    expect(provider.resolveIdentity).not.toHaveBeenCalled();

    const limited = await createKakaoStartHandler({
      oauthStateSecret: stateSecret,
      provider,
      replayStore: allowingReplayStore(),
      rateLimiter: {
        consume: () => ({
          allowed: false,
          remaining: 0,
          retryAfterSeconds: 47,
        }),
      },
      now: () => now,
    })(new Request(`${appBaseUrl}/auth/kakao/start`));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("47");
    expect(limited.headers.get("location")).toBeNull();
  });

  it("clears valid state before provider exchange, creates a PREPPY session, and sends PENDING users to onboarding", async () => {
    // Mutation caught: retaining replayable state, exposing provider identity, or skipping pending onboarding.
    const issued = createOAuthState({ secret: stateSecret, now });
    const provider = fakeProvider();
    const resolveIdentity = vi.fn(async () => ({
      id: userId,
      status: "PENDING" as const,
    }));
    const tracker = new TestAnalyticsTracker();
    const handler = createKakaoCallbackHandler({
      ...allowingCallbackGuards(),
      oauthStateSecret: stateSecret,
      sessionSecret,
      followIntentSecret: followSecret,
      provider,
      replayStore: allowingReplayStore(),
      resolveIdentity,
      tracker,
      now: () => now,
      production: true,
    });
    const state = new URL(
      (provider.buildAuthorizationUrl as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0]
        ? "https://unused.example"
        : `https://preppy.example/auth/kakao/callback?code=provider-code&state=${issued.state}`,
    );
    const response = await handler(
      cookieRequest(state.toString(), {
        [OAUTH_STATE_COOKIE_NAME]: issued.cookieValue,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/onboarding");
    expect(response.headers.get("set-cookie")).toMatch(
      new RegExp(`${OAUTH_STATE_COOKIE_NAME}=;[^,]*Max-Age=0`),
    );
    const sessionCookie = cookieValue(response, USER_SESSION_COOKIE_NAME);
    expect(
      readUserSession(sessionCookie, { secret: sessionSecret, now }),
    ).toMatchObject({ userId });
    expect(resolveIdentity).toHaveBeenCalledWith({ subject: "123456789" });
    expect(tracker.snapshot()).toEqual([
      { name: "signup_start", properties: { context: "HOME" } },
    ]);
    expect(response.headers.get("set-cookie")).not.toContain("123456789");
  });

  it("completes a valid pending Follow for ACTIVE users before My Preppy", async () => {
    // Mutation caught: dropping the standalone Follow activation or retaining
    // the completed intent after redirect.
    const issued = createOAuthState({ secret: stateSecret, now });
    const intent = createPendingFollowIntent(
      {
        institutionId,
        context: "INSTITUTION",
        returnPath: "/institutions/seoul-international-school",
      },
      { secret: followSecret, now },
    );
    const handler = createKakaoCallbackHandler({
      ...allowingCallbackGuards(),
      oauthStateSecret: stateSecret,
      sessionSecret,
      followIntentSecret: followSecret,
      provider: fakeProvider(),
      replayStore: allowingReplayStore(),
      resolveIdentity: async () => ({ id: userId, status: "ACTIVE" }),
      tracker: new TestAnalyticsTracker(),
      now: () => now,
    });

    const response = await handler(
      cookieRequest(
        `${appBaseUrl}/auth/kakao/callback?code=provider-code&state=${issued.state}`,
        {
          [OAUTH_STATE_COOKIE_NAME]: issued.cookieValue,
          [PENDING_FOLLOW_INTENT_COOKIE_NAME]: intent,
        },
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/my-preppy");
    expect(response.headers.get("set-cookie")).toContain(
      `${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;`,
    );
  });

  it.each([
    ["missing state", "?code=provider-code", undefined],
    ["mismatched state", "?code=provider-code&state=wrong", "issued"],
    ["replayed cleared state", "?code=provider-code&state=issued", undefined],
  ])(
    "returns safe Korean login failure for %s before identity work",
    async (_case, search, cookieMode) => {
      // Mutation caught: performing token/identity/User work before state validation or leaking provider internals.
      const issued = createOAuthState({ secret: stateSecret, now });
      const provider = fakeProvider();
      const resolveIdentity = vi.fn();
      const normalizedSearch = search.replace(
        "state=issued",
        `state=${issued.state}`,
      );
      const request = cookieRequest(
        `${appBaseUrl}/auth/kakao/callback${normalizedSearch}`,
        cookieMode === "issued"
          ? { [OAUTH_STATE_COOKIE_NAME]: issued.cookieValue }
          : {},
      );
      const response = await createKakaoCallbackHandler({
        ...allowingCallbackGuards(),
        oauthStateSecret: stateSecret,
        sessionSecret,
        followIntentSecret: followSecret,
        provider,
        replayStore: allowingReplayStore(),
        resolveIdentity,
        tracker: new TestAnalyticsTracker(),
        now: () => now,
      })(request);

      expect(response.status).toBe(400);
      expect(await response.text()).toContain("로그인을 완료하지 못했습니다");
      expect(response.headers.get("set-cookie")).toMatch(
        new RegExp(`${OAUTH_STATE_COOKIE_NAME}=;.*Max-Age=0`),
      );
      expect(provider.exchangeCode).not.toHaveBeenCalled();
      expect(resolveIdentity).not.toHaveBeenCalled();
    },
  );

  it("handles provider denial and exchange failure with Korean copy and no internal details", async () => {
    // Mutation caught: reflecting OAuth/DB errors or provider messages in callback output.
    const issued = createOAuthState({ secret: stateSecret, now });
    const deniedProvider = fakeProvider();
    const denied = await createKakaoCallbackHandler({
      ...allowingCallbackGuards(),
      oauthStateSecret: stateSecret,
      sessionSecret,
      followIntentSecret: followSecret,
      provider: deniedProvider,
      replayStore: allowingReplayStore(),
      resolveIdentity: vi.fn(),
      tracker: new TestAnalyticsTracker(),
      now: () => now,
    })(
      cookieRequest(
        `${appBaseUrl}/auth/kakao/callback?error=access_denied&error_description=private-provider-detail&state=${issued.state}`,
        { [OAUTH_STATE_COOKIE_NAME]: issued.cookieValue },
      ),
    );
    const deniedBody = await denied.text();
    expect(denied.status).toBe(400);
    expect(deniedBody).toContain("로그인을 완료하지 못했습니다");
    expect(deniedBody).not.toContain("access_denied");
    expect(deniedBody).not.toContain("private-provider-detail");
    expect(deniedProvider.exchangeCode).not.toHaveBeenCalled();

    const failingProvider = fakeProvider();
    vi.mocked(failingProvider.exchangeCode).mockRejectedValueOnce(
      new Error("provider token and database internals"),
    );
    const failed = await createKakaoCallbackHandler({
      ...allowingCallbackGuards(),
      oauthStateSecret: stateSecret,
      sessionSecret,
      followIntentSecret: followSecret,
      provider: failingProvider,
      replayStore: allowingReplayStore(),
      resolveIdentity: vi.fn(),
      tracker: new TestAnalyticsTracker(),
      now: () => now,
    })(
      cookieRequest(
        `${appBaseUrl}/auth/kakao/callback?code=provider-code&state=${issued.state}`,
        { [OAUTH_STATE_COOKIE_NAME]: issued.cookieValue },
      ),
    );
    const failedBody = await failed.text();
    expect(failed.status).toBe(502);
    expect(failedBody).toContain("잠시 후 다시 시도해 주세요");
    expect(failedBody).not.toContain("provider token");
    expect(failedBody).not.toContain("database");
  });

  it("serves private onboarding state and completes signup with server-normalized optional form fields", async () => {
    // Mutation caught: caching onboarding, trusting a user id field, losing optional values, clearing intent, or claiming Follow creation.
    const sessionCookie = createUserSessionCookie(userId, {
      secret: sessionSecret,
      now,
    }).value;
    const intentCookie = createPendingFollowIntent(
      {
        institutionId,
        context: "INSTITUTION",
        returnPath: "/institutions/seoul-international-school",
      },
      { secret: followSecret, now },
    );
    const getState = vi.fn(async () => ({
      userState: "PENDING" as const,
      defaults: {
        email: null,
        childBirthYear: null,
        interestRegions: [],
        interestCategories: [],
        serviceEmailUpdatesConsent: false,
      },
      policyVersions: {
        TERMS_OF_SERVICE: "2026-08-23",
        PRIVACY_POLICY: "2026-08-23",
        SERVICE_EMAIL_UPDATES: "2026-08-23",
      },
      pendingInstitution: null,
    }));
    const getResponse = await createOnboardingGetHandler({ getState })(
      cookieRequest(`${appBaseUrl}/api/me/onboarding`, {
        [USER_SESSION_COOKIE_NAME]: sessionCookie,
        [PENDING_FOLLOW_INTENT_COOKIE_NAME]: intentCookie,
      }),
    );
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get("cache-control")).toBe("private, no-store");
    expect(getState).toHaveBeenCalledWith(sessionCookie, intentCookie);

    const completeSignup = vi.fn(async () => ({
      userId,
      userState: "ACTIVE" as const,
      follow: {
        followId: "7ba7b810-9dad-11d1-80b4-00c04fd430c8",
        institutionId,
        state: "ACTIVE" as const,
        activatedAt: now.toISOString(),
        created: true,
        reactivated: false,
        activeFollowCount: 1,
      },
    }));
    const complete = createOnboardingCompleteHandler({
      appBaseUrl,
      sessionSecret,
      followIntentSecret: followSecret,
      completeSignup,
      now: () => now,
      production: true,
    });
    const body = new URLSearchParams([
      ["termsPolicyVersion", "2026-08-23"],
      ["privacyPolicyVersion", "2026-08-23"],
      ["termsConsent", "on"],
      ["privacyConsent", "on"],
      ["serviceEmailUpdatesConsent", "on"],
      ["email", "  Parent@Example.COM "],
      ["childBirthYear", "2020"],
      ["interestRegions", "kr-11"],
      ["interestRegions", "KR-26"],
      ["interestCategories", "INTERNATIONAL_SCHOOL"],
    ]);
    const completeResponse = await complete(
      cookieRequest(
        `${appBaseUrl}/api/me/onboarding/complete`,
        {
          [USER_SESSION_COOKIE_NAME]: sessionCookie,
          [PENDING_FOLLOW_INTENT_COOKIE_NAME]: intentCookie,
        },
        {
          method: "POST",
          headers: {
            origin: appBaseUrl,
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
        },
      ),
    );
    expect(completeResponse.status).toBe(303);
    expect(completeResponse.headers.get("location")).toBe("/my-preppy");
    expect(completeSignup).toHaveBeenCalledWith(
      expect.objectContaining({ userId, occurredAt: now }),
      {
        consents: [
          {
            type: "TERMS_OF_SERVICE",
            decision: "GRANTED",
            policyVersion: "2026-08-23",
          },
          {
            type: "PRIVACY_POLICY",
            decision: "GRANTED",
            policyVersion: "2026-08-23",
          },
        ],
        serviceEmailUpdatesConsent: true,
        email: "Parent@Example.COM",
        childBirthYear: 2020,
        interestRegions: ["kr-11", "KR-26"],
        interestCategories: ["INTERNATIONAL_SCHOOL"],
      },
      { pendingFollow: { institutionId } },
    );
    const setCookie = completeResponse.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${USER_SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain(`${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;`);
    expect(await completeResponse.text()).not.toMatch(
      /팔로우.*완료|관심기관.*등록.*완료/,
    );
  });

  it("returns only ACTIVE authentication status with no-store and logs out by clearing only the PREPPY session", async () => {
    // Mutation caught: trusting a signed session without DB recheck, returning identity fields, or clearing unrelated intent/state cookies.
    const sessionCookie = createUserSessionCookie(userId, {
      secret: sessionSecret,
      now,
    }).value;
    const getCurrentUser = vi
      .fn()
      .mockResolvedValueOnce({ id: userId, status: "ACTIVE" })
      .mockResolvedValueOnce(null);
    const sessionHandler = createSessionHandler({ getCurrentUser });
    const authenticated = await sessionHandler(
      cookieRequest(`${appBaseUrl}/api/auth/session`, {
        [USER_SESSION_COOKIE_NAME]: sessionCookie,
      }),
    );
    expect(await authenticated.json()).toEqual({ authenticated: true });
    expect(authenticated.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    const anonymous = await sessionHandler(
      cookieRequest(`${appBaseUrl}/api/auth/session`, {
        [USER_SESSION_COOKIE_NAME]: sessionCookie,
      }),
    );
    expect(await anonymous.json()).toEqual({ authenticated: false });

    const logout = createLogoutHandler({ appBaseUrl, production: true });
    const rejected = await logout(
      new Request(`${appBaseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(rejected.status).toBe(403);
    const response = await logout(
      new Request(`${appBaseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { origin: appBaseUrl },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(
      new RegExp(`${USER_SESSION_COOKIE_NAME}=;.*Max-Age=0`),
    );
    expect(response.headers.get("set-cookie")).not.toContain(
      PENDING_FOLLOW_INTENT_COOKIE_NAME,
    );
    expect(response.headers.get("set-cookie")).not.toContain(
      OAUTH_STATE_COOKIE_NAME,
    );
  });
});
