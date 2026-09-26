import { describe, expect, it, vi } from "vitest";
import {
  createUserSessionCookie,
  readUserSession,
  USER_SESSION_COOKIE_NAME,
} from "@/src/modules/auth/session.server";
import {
  createKakaoStartHandler,
  createKakaoCallbackHandler,
  createOnboardingCompleteHandler,
} from "@/src/modules/auth/http.server";
import { OAUTH_STATE_COOKIE_NAME } from "@/src/modules/auth/oauth-state.server";
import { TestAnalyticsTracker } from "@/src/analytics/tracker";
const secret = "test-secret-with-at-least-thirty-two-characters";
const userId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const now = new Date("2026-09-25T01:00:00.000Z");
const nowSeconds = Math.floor(now.getTime() / 1000);
function cookie(response: Response, name: string) {
  return decodeURIComponent(
    response.headers
      .get("set-cookie")
      ?.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`))?.[1] ?? "",
  );
}
const provider = {
  buildAuthorizationUrl: (state: string) =>
    `https://kauth.kakao.com/oauth/authorize?state=${state}`,
  exchangeCode: async () => ({}) as never,
  resolveIdentity: async () => ({ subject: "123456" }),
};
function guards() {
  return {
    now: () => now,
    replayStore: { register: () => true, consume: () => "REGISTERED" as const },
    rateLimiter: {
      consume: () => ({ allowed: true, remaining: 10, retryAfterSeconds: 0 }),
    },
  };
}
describe("OAuth authentication time", () => {
  it.each(["ACTIVE", "PENDING"] as const)(
    "clears another account's receipt when establishing a %s session",
    async (status) => {
      const start = createKakaoStartHandler({
        ...guards(),
        oauthStateSecret: secret,
        provider,
      });
      const begun = await start(
        new Request("https://preppy.example/auth/kakao/start"),
      );
      const state = new URL(begun.headers.get("location")!).searchParams.get(
        "state",
      );
      const callback = createKakaoCallbackHandler({
        ...guards(),
        production: true,
        oauthStateSecret: secret,
        sessionSecret: secret,
        followIntentSecret: secret,
        provider,
        resolveIdentity: async () => ({ id: userId, status }),
        resolvePendingFollowTarget: async () => null,
        activateFollow: vi.fn(),
        tracker: new TestAnalyticsTracker(),
      });
      const response = await callback(
        new Request(
          `https://preppy.example/auth/kakao/callback?state=${state}&code=code`,
          {
            headers: {
              cookie: `${OAUTH_STATE_COOKIE_NAME}=${cookie(begun, OAUTH_STATE_COOKIE_NAME)}; preppy_deletion_receipt=prior-account-receipt`,
            },
          },
        ),
      );
      expect(response.status).toBe(303);
      const cleared = response.headers
        .getSetCookie()
        .find((value) => value.startsWith("preppy_deletion_receipt="));
      expect(cleared).toContain("preppy_deletion_receipt=;");
      expect(cleared).toContain("Max-Age=0");
      expect(cleared).toContain("Path=/");
      expect(cleared).toContain("HttpOnly");
      expect(cleared).toContain("SameSite=Lax");
      expect(cleared).toContain("Secure");
    },
  );
  it("keeps legacy sessions usable without inventing a recent OAuth time", () => {
    const value = createUserSessionCookie(userId, { secret, now }).value;
    const session = readUserSession(value, { secret, now });
    expect(session?.userId).toBe(userId);
    expect(session?.oauthAuthenticatedAt).toBeUndefined();
  });
  it("preserves actual OAuth time when issuing a later session", () => {
    const value = createUserSessionCookie(userId, {
      secret,
      now,
      oauthAuthenticatedAt: nowSeconds - 7200,
    }).value;
    expect(readUserSession(value, { secret, now })).toMatchObject({
      issuedAt: nowSeconds,
      oauthAuthenticatedAt: nowSeconds - 7200,
    });
  });
  it("rejects future authentication claims", () => {
    expect(() =>
      createUserSessionCookie(userId, {
        secret,
        now,
        oauthAuthenticatedAt: nowSeconds + 1,
      }),
    ).toThrow();
  });
  it.each([undefined, nowSeconds - 7200])(
    "does not renew authentication time at onboarding refresh: %s",
    async (oauthAuthenticatedAt) => {
      const prior = createUserSessionCookie(userId, {
        secret,
        now: new Date(now.getTime() - 3600000),
        oauthAuthenticatedAt,
      }).value;
      const handler = createOnboardingCompleteHandler({
        appBaseUrl: "https://preppy.example",
        sessionSecret: secret,
        followIntentSecret: secret,
        now: () => now,
        completeSignup: async () => ({
          userId,
          userState: "ACTIVE",
          follow: null,
        }),
      });
      const response = await handler(
        new Request("https://preppy.example/api/me/onboarding/complete", {
          method: "POST",
          headers: {
            origin: "https://preppy.example",
            cookie: `${USER_SESSION_COOKIE_NAME}=${prior}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: "{}",
        }),
      );
      expect(response.status).toBe(200);
      const session = readUserSession(
        cookie(response, USER_SESSION_COOKIE_NAME),
        { secret, now },
      );
      expect(session?.issuedAt).toBe(nowSeconds);
      expect(session?.oauthAuthenticatedAt).toBe(oauthAuthenticatedAt);
    },
  );
  it.each([
    "/my-preppy/settings",
    "https://evil.example",
    "//evil.example",
    "/my-preppy/settings?delete=1",
  ])(
    "binds allowlisted return target to protected OAuth state: %s",
    async (target) => {
      const start = createKakaoStartHandler({
        ...guards(),
        oauthStateSecret: secret,
        provider,
      });
      const startResponse = await start(
        new Request(
          `https://preppy.example/auth/kakao/start?returnTo=${encodeURIComponent(target)}`,
        ),
      );
      const state = new URL(
        startResponse.headers.get("location")!,
      ).searchParams.get("state");
      const activateFollow = vi.fn();
      const callback = createKakaoCallbackHandler({
        ...guards(),
        oauthStateSecret: secret,
        sessionSecret: secret,
        followIntentSecret: secret,
        provider,
        resolveIdentity: async () => ({ id: userId, status: "ACTIVE" }),
        resolvePendingFollowTarget: async () => null,
        activateFollow,
        tracker: new TestAnalyticsTracker(),
      });
      const response = await callback(
        new Request(
          `https://preppy.example/auth/kakao/callback?state=${state}&code=code&returnTo=https://evil.example`,
          {
            headers: {
              cookie: `${OAUTH_STATE_COOKIE_NAME}=${cookie(startResponse, OAUTH_STATE_COOKIE_NAME)}`,
            },
          },
        ),
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        target === "/my-preppy/settings" ? target : "/",
      );
      expect(
        readUserSession(cookie(response, USER_SESSION_COOKIE_NAME), {
          secret,
          now,
        })?.oauthAuthenticatedAt,
      ).toBe(nowSeconds);
      expect(activateFollow).not.toHaveBeenCalled();
    },
  );
});
