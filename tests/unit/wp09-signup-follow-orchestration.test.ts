import { describe, expect, it, vi } from "vitest";

import { TestAnalyticsTracker } from "@/src/analytics/tracker";
import {
  createKakaoCallbackHandler,
  createOnboardingCompleteHandler,
} from "@/src/modules/auth/http.server";
import type { KakaoAuthProvider } from "@/src/modules/auth/kakao-provider.server";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE_NAME,
} from "@/src/modules/auth/oauth-state.server";
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

function setCookieHeader(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
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

function callbackRequest(intentCookie: string): Request {
  const issued = createOAuthState({ secret: stateSecret, now });
  return cookieRequest(
    `${appBaseUrl}/auth/kakao/callback?code=provider-code&state=${issued.state}`,
    {
      [OAUTH_STATE_COOKIE_NAME]: issued.cookieValue,
      [PENDING_FOLLOW_INTENT_COOKIE_NAME]: intentCookie,
    },
  );
}

function validIntent(): string {
  return createPendingFollowIntent(
    {
      institutionId,
      context: "INSTITUTION",
      returnPath: "/institutions/seoul-international-school",
    },
    { secret: followSecret, now },
  );
}

function callbackDependencies() {
  return {
    oauthStateSecret: stateSecret,
    sessionSecret,
    followIntentSecret: followSecret,
    provider: fakeProvider(),
    replayStore: {
      register: vi.fn(() => true),
      consume: vi.fn(() => "REGISTERED" as const),
    },
    rateLimiter: {
      consume: () => ({
        allowed: true,
        remaining: 119,
        retryAfterSeconds: 0,
      }),
    },
    resolveIdentity: async () => ({ id: userId, status: "ACTIVE" as const }),
    resolvePendingFollowTarget: async () => ({
      institution: {
        id: institutionId,
        slug: "seoul-international-school",
        publicationState: "PUBLISHED",
        operationalState: "ACTIVE",
      },
      canonicalPath: "/institutions/seoul-international-school",
    }),
    tracker: new TestAnalyticsTracker(),
    now: () => now,
    production: true,
  };
}

function onboardingRequest(
  intentCookie: string,
  hostileAuthority: Record<string, string> = {},
): Request {
  const session = createUserSessionCookie(userId, {
    secret: sessionSecret,
    now,
  }).value;
  return cookieRequest(
    `${appBaseUrl}/api/me/onboarding/complete`,
    {
      [USER_SESSION_COOKIE_NAME]: session,
      [PENDING_FOLLOW_INTENT_COOKIE_NAME]: intentCookie,
    },
    {
      method: "POST",
      headers: {
        origin: appBaseUrl,
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        termsPolicyVersion: "2026-08-23",
        privacyPolicyVersion: "2026-08-23",
        termsConsent: "on",
        privacyConsent: "on",
        ...hostileAuthority,
      }),
    },
  );
}

describe("WP-09 signup and pending Follow HTTP orchestration", () => {
  it("passes only the protected pending target to signup and clears intent after committed Follow completion", async () => {
    // Mutation caught: trusting form target data, clearing before completion,
    // or redirecting a committed Follow anywhere except My Preppy.
    const phases: string[] = [];
    const completeSignup = vi.fn(async (context, input, serverInput) => {
      phases.push("signup-resolved");
      expect(context).toMatchObject({ userId });
      expect(input).not.toHaveProperty("userId");
      expect(input).not.toHaveProperty("institutionId");
      expect(serverInput).toEqual({ pendingFollow: { institutionId } });
      return {
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
      };
    });
    const response = await createOnboardingCompleteHandler({
      appBaseUrl,
      sessionSecret,
      followIntentSecret: followSecret,
      completeSignup,
      now: () => now,
      production: true,
    })(
      onboardingRequest(validIntent(), {
        userId: "7ba7b810-9dad-11d1-80b4-00c04fd430c8",
        institutionId: "8ba7b810-9dad-11d1-80b4-00c04fd430c8",
        pendingFollowInstitutionId: "9ba7b810-9dad-11d1-80b4-00c04fd430c8",
      }),
    );
    phases.push("response-observed");

    expect(phases).toEqual(["signup-resolved", "response-observed"]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      redirectTo: "/my-preppy",
      message: "관심기관 등록이 완료되었습니다.",
    });
    expect(setCookieHeader(response)).toContain(
      `${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;`,
    );
    expect(setCookieHeader(response)).toContain(`${USER_SESSION_COOKIE_NAME}=`);
  });

  it("clears an invalid intent only after successful signup and makes no false Follow claim", async () => {
    // Mutation caught: blocking signup for a tampered cookie or claiming that
    // an absent/unfollowable target was registered.
    const completeSignup = vi.fn(async (_context, _input, serverInput) => {
      expect(serverInput).toEqual({ pendingFollow: null });
      return { userId, userState: "ACTIVE" as const, follow: null };
    });
    const response = await createOnboardingCompleteHandler({
      appBaseUrl,
      sessionSecret,
      followIntentSecret: followSecret,
      completeSignup,
      now: () => now,
      production: true,
    })(onboardingRequest(`${validIntent()}tampered`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/" });
    expect(setCookieHeader(response)).toContain(
      `${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;`,
    );
  });

  it("clears a still-valid signed intent only after signup commits without an unfollowable target", async () => {
    const phases: string[] = [];
    const completeSignup = vi.fn(async (_context, _input, serverInput) => {
      expect(serverInput).toEqual({ pendingFollow: { institutionId } });
      phases.push("signup-committed-without-follow");
      return { userId, userState: "ACTIVE" as const, follow: null };
    });

    const response = await createOnboardingCompleteHandler({
      appBaseUrl,
      sessionSecret,
      followIntentSecret: followSecret,
      completeSignup,
      now: () => now,
      production: true,
    })(onboardingRequest(validIntent()));
    phases.push("response-observed");

    expect(phases).toEqual([
      "signup-committed-without-follow",
      "response-observed",
    ]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/" });
    expect(setCookieHeader(response)).toContain(
      `${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;`,
    );
  });

  it("treats an expired signed intent as absent and clears it only after successful signup", async () => {
    const expiredIntent = createPendingFollowIntent(
      {
        institutionId,
        context: "INSTITUTION",
        returnPath: "/institutions/seoul-international-school",
      },
      {
        secret: followSecret,
        now: new Date("2026-08-23T02:00:00.000Z"),
      },
    );
    const completeSignup = vi.fn(async (_context, _input, serverInput) => {
      expect(serverInput).toEqual({ pendingFollow: null });
      return { userId, userState: "ACTIVE" as const, follow: null };
    });

    const response = await createOnboardingCompleteHandler({
      appBaseUrl,
      sessionSecret,
      followIntentSecret: followSecret,
      completeSignup,
      now: () => now,
      production: true,
    })(onboardingRequest(expiredIntent));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/" });
    expect(setCookieHeader(response)).toContain(
      `${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;`,
    );
  });

  it("preserves the pending intent and does not refresh the session when signup fails", async () => {
    // Mutation caught: clearing the retry capability or refreshing ACTIVE
    // session state before the business transaction commits.
    const response = await createOnboardingCompleteHandler({
      appBaseUrl,
      sessionSecret,
      followIntentSecret: followSecret,
      completeSignup: async () => {
        throw new Error("forced rollback");
      },
      now: () => now,
      production: true,
    })(onboardingRequest(validIntent()));

    expect(response.status).toBe(500);
    expect(setCookieHeader(response)).not.toContain(
      PENDING_FOLLOW_INTENT_COOKIE_NAME,
    );
    expect(setCookieHeader(response)).not.toContain(USER_SESSION_COOKIE_NAME);
  });

  it("activates a valid pending Follow for an existing ACTIVE callback before clearing and redirecting", async () => {
    // Mutation caught: redirecting without the real command, invoking signup,
    // retaining a completed intent, or returning to a public source page.
    const activateFollow = vi.fn(async () => ({
      followId: "7ba7b810-9dad-11d1-80b4-00c04fd430c8",
      institutionId,
      state: "ACTIVE" as const,
      activatedAt: now.toISOString(),
      created: true,
      reactivated: false,
      activeFollowCount: 1,
    }));
    const response = await createKakaoCallbackHandler({
      ...callbackDependencies(),
      activateFollow,
    })(callbackRequest(validIntent()));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/my-preppy");
    expect(activateFollow).toHaveBeenCalledWith(
      expect.objectContaining({ userId, occurredAt: now }),
      { institutionId },
    );
    expect(setCookieHeader(response)).toContain(
      `${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;`,
    );
  });

  it("preserves a valid ACTIVE callback intent and returns safe auth failure when Follow activation fails", async () => {
    // Mutation caught: swallowing the command failure, clearing the retryable
    // intent, or exposing the internal failure.
    const activateFollow = vi.fn(async () => {
      throw new Error("raw database secret");
    });
    const response = await createKakaoCallbackHandler({
      ...callbackDependencies(),
      activateFollow,
    })(callbackRequest(validIntent()));
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toContain("로그인을 완료하지 못했습니다");
    expect(body).not.toContain("raw database secret");
    expect(setCookieHeader(response)).not.toContain(
      PENDING_FOLLOW_INTENT_COOKIE_NAME,
    );
  });

  it("clears an invalid ACTIVE callback intent without running Follow activation", async () => {
    // Mutation caught: treating an invalid signature as authoritative or
    // leaving a permanently unusable ACTIVE-user intent behind.
    const activateFollow = vi.fn();
    const response = await createKakaoCallbackHandler({
      ...callbackDependencies(),
      activateFollow,
    })(callbackRequest(`${validIntent()}tampered`));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(activateFollow).not.toHaveBeenCalled();
    expect(setCookieHeader(response)).toContain(
      `${PENDING_FOLLOW_INTENT_COOKIE_NAME}=;`,
    );
  });
});
