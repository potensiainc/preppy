import { describe, expect, it } from "vitest";

import { parseAuthConfig } from "@/src/modules/auth/config.server";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_STATE_TTL_SECONDS,
  oauthStateCookieAttributes,
  validateOAuthState,
} from "@/src/modules/auth/oauth-state.server";
import {
  createPendingFollowIntent,
  PENDING_FOLLOW_INTENT_COOKIE_NAME,
  PENDING_FOLLOW_INTENT_TTL_SECONDS,
  pendingFollowIntentCookieAttributes,
  readPendingFollowIntent,
} from "@/src/modules/auth/pending-follow-intent.server";
import { assertSameOriginForMutation } from "@/src/modules/auth/origin.server";
import { ProcessLocalRateLimiter } from "@/src/modules/auth/rate-limit.server";
import { isSafeRedirectPath } from "@/src/modules/auth/safe-redirect";
import { secureCookieAttributes } from "@/src/modules/auth/secure-cookie.server";

const stateSecret = "state-secret-that-is-at-least-thirty-two-characters";
const followSecret = "follow-secret-that-is-at-least-thirty-two-characters";
const now = new Date("2026-08-23T00:00:00.000Z");

describe("auth configuration", () => {
  it("parses auth capability settings without database or admin settings", () => {
    expect(
      parseAuthConfig({
        APP_BASE_URL: "https://preppy.example",
        KAKAO_CLIENT_ID: "rest-api-key",
        KAKAO_CLIENT_SECRET: "client-secret",
        KAKAO_REDIRECT_URI: "https://preppy.example/auth/kakao/callback",
        USER_SESSION_SECRET:
          "user-secret-that-is-at-least-thirty-two-characters",
        OAUTH_STATE_SECRET: stateSecret,
        FOLLOW_INTENT_SECRET: followSecret,
      }),
    ).toEqual({
      APP_BASE_URL: "https://preppy.example",
      KAKAO_CLIENT_ID: "rest-api-key",
      KAKAO_CLIENT_SECRET: "client-secret",
      KAKAO_REDIRECT_URI: "https://preppy.example/auth/kakao/callback",
      USER_SESSION_SECRET: "user-secret-that-is-at-least-thirty-two-characters",
      OAUTH_STATE_SECRET: stateSecret,
      FOLLOW_INTENT_SECRET: followSecret,
    });
  });

  it("treats an empty optional Kakao client secret as absent", () => {
    const config = parseAuthConfig({
      APP_BASE_URL: "http://localhost:3000",
      KAKAO_CLIENT_ID: "rest-api-key",
      KAKAO_CLIENT_SECRET: "",
      KAKAO_REDIRECT_URI: "http://localhost:3000/auth/kakao/callback",
      USER_SESSION_SECRET: "user-secret-that-is-at-least-thirty-two-characters",
      OAUTH_STATE_SECRET: stateSecret,
      FOLLOW_INTENT_SECRET: followSecret,
    });

    expect(config.KAKAO_CLIENT_SECRET).toBeUndefined();
  });

  it("rejects cross-origin callbacks", () => {
    expect(() =>
      parseAuthConfig({
        APP_BASE_URL: "https://preppy.example",
        KAKAO_CLIENT_ID: "rest-api-key",
        KAKAO_REDIRECT_URI: "https://evil.example/auth/kakao/callback",
        USER_SESSION_SECRET:
          "user-secret-that-is-at-least-thirty-two-characters",
        OAUTH_STATE_SECRET: stateSecret,
        FOLLOW_INTENT_SECRET: followSecret,
      }),
    ).toThrow(/KAKAO_REDIRECT_URI/);
  });

  it.each([
    ["user and OAuth", stateSecret, stateSecret, followSecret],
    ["user and follow", followSecret, stateSecret, followSecret],
    ["OAuth and follow", stateSecret, followSecret, followSecret],
  ])(
    "rejects reused %s capability secrets",
    (_case, userSecret, oauthSecret, intentSecret) => {
      const environment = {
        APP_BASE_URL: "https://preppy.example",
        KAKAO_CLIENT_ID: "rest-api-key",
        KAKAO_REDIRECT_URI: "https://preppy.example/auth/kakao/callback",
        USER_SESSION_SECRET: userSecret,
        OAUTH_STATE_SECRET: oauthSecret,
        FOLLOW_INTENT_SECRET: intentSecret,
      };

      expect(() => parseAuthConfig(environment)).toThrow(/distinct/i);
    },
  );
});

describe("auth cookie contracts", () => {
  it("keeps OAuth and follow cookies separate with their required TTLs", () => {
    expect(OAUTH_STATE_COOKIE_NAME).toBe("preppy_oauth_state");
    expect(PENDING_FOLLOW_INTENT_COOKIE_NAME).toBe("preppy_follow_intent");
    expect(OAUTH_STATE_COOKIE_NAME).not.toBe(PENDING_FOLLOW_INTENT_COOKIE_NAME);
    expect(OAUTH_STATE_TTL_SECONDS).toBe(10 * 60);
    expect(PENDING_FOLLOW_INTENT_TTL_SECONDS).toBe(60 * 60);
  });

  it("uses host-only HttpOnly Lax root-path cookies with environment-bound Secure", () => {
    expect(oauthStateCookieAttributes).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_STATE_TTL_SECONDS,
    });
    expect(pendingFollowIntentCookieAttributes).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: PENDING_FOLLOW_INTENT_TTL_SECONDS,
    });
    expect("domain" in oauthStateCookieAttributes).toBe(false);
    expect("domain" in pendingFollowIntentCookieAttributes).toBe(false);
    expect(
      secureCookieAttributes({ maxAgeSeconds: 60, production: false }),
    ).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
    expect(
      secureCookieAttributes({ maxAgeSeconds: 60, production: true }),
    ).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
  });
});

describe("OAuth state", () => {
  it("creates a random browser value separate from its protected cookie", () => {
    const first = createOAuthState({ secret: stateSecret, now });
    const second = createOAuthState({ secret: stateSecret, now });

    expect(first.state).not.toBe(first.cookieValue);
    expect(first.state).not.toBe(second.state);
    expect(first.cookieValue).not.toBe(second.cookieValue);
    expect(
      validateOAuthState({
        browserState: first.state,
        cookieValue: first.cookieValue,
        secret: stateSecret,
        now,
      }),
    ).toBe(true);
  });

  it.each([
    ["missing browser state", undefined, undefined],
    ["missing cookie", "browser-state", undefined],
    ["mismatched state", "not-the-issued-state", "issued"],
  ])("rejects %s", (_case, browserState, cookieMode) => {
    const issued = createOAuthState({ secret: stateSecret, now });

    expect(
      validateOAuthState({
        browserState,
        cookieValue: cookieMode === "issued" ? issued.cookieValue : undefined,
        secret: stateSecret,
        now,
      }),
    ).toBe(false);
  });

  it("rejects expired, malformed, tampered, and wrong-purpose cookies", () => {
    const issued = createOAuthState({ secret: stateSecret, now });
    const tampered = `${issued.cookieValue.slice(0, -1)}${issued.cookieValue.endsWith("A") ? "B" : "A"}`;

    expect(
      validateOAuthState({
        browserState: issued.state,
        cookieValue: issued.cookieValue,
        secret: stateSecret,
        now: new Date(now.getTime() + 11 * 60 * 1000),
      }),
    ).toBe(false);
    expect(
      validateOAuthState({
        browserState: issued.state,
        cookieValue: "not-a-cookie",
        secret: stateSecret,
        now,
      }),
    ).toBe(false);
    expect(
      validateOAuthState({
        browserState: issued.state,
        cookieValue: tampered,
        secret: stateSecret,
        now,
      }),
    ).toBe(false);
    expect(
      validateOAuthState({
        browserState: issued.state,
        cookieValue: issued.cookieValue,
        secret: followSecret,
        now,
      }),
    ).toBe(false);
  });
});

describe("pending follow intent", () => {
  const input = {
    institutionId: "550E8400-E29B-41D4-A716-446655440000",
    context: "ARTICLE" as const,
    articleId: "6BA7B810-9DAD-11D1-80B4-00C04FD430C8",
    returnPath: "/institutions/preppy-kindergarten",
  };

  it("round-trips canonical bounded intent data with nonce and timestamps", () => {
    const cookieValue = createPendingFollowIntent(input, {
      secret: followSecret,
      now,
    });

    expect(Buffer.byteLength(cookieValue, "utf8")).toBeLessThan(1024);
    expect(
      readPendingFollowIntent(cookieValue, { secret: followSecret, now }),
    ).toEqual({
      version: 1,
      institutionId: "550e8400-e29b-41d4-a716-446655440000",
      context: "ARTICLE",
      articleId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      returnPath: "/institutions/preppy-kindergarten",
      nonce: expect.stringMatching(/^[A-Za-z0-9_-]{32,}$/),
      issuedAt: Math.floor(now.getTime() / 1000),
      expiresAt: Math.floor(now.getTime() / 1000) + 60 * 60,
    });
  });

  it("rejects expired and tampered intent cookies", () => {
    const cookieValue = createPendingFollowIntent(input, {
      secret: followSecret,
      now,
    });
    const tampered = `${cookieValue.slice(0, -1)}${cookieValue.endsWith("A") ? "B" : "A"}`;

    expect(
      readPendingFollowIntent(cookieValue, {
        secret: followSecret,
        now: new Date(now.getTime() + 61 * 60 * 1000),
      }),
    ).toBeNull();
    expect(
      readPendingFollowIntent(tampered, { secret: followSecret, now }),
    ).toBeNull();
  });

  it("rejects noncanonical IDs, unknown context, unsafe returns, and oversized input", () => {
    expect(() =>
      createPendingFollowIntent(
        { ...input, institutionId: "not-a-uuid" },
        { secret: followSecret, now },
      ),
    ).toThrow();
    expect(() =>
      createPendingFollowIntent(
        { ...input, context: "SEARCH_RESULT" as never },
        { secret: followSecret, now },
      ),
    ).toThrow();
    expect(() =>
      createPendingFollowIntent(
        { ...input, returnPath: "https://evil.example" },
        { secret: followSecret, now },
      ),
    ).toThrow();
    expect(() =>
      createPendingFollowIntent(
        { ...input, returnPath: `/institutions/${"a".repeat(900)}` },
        { secret: followSecret, now },
      ),
    ).toThrow();
  });
});

describe("safe redirect paths", () => {
  it.each([
    "/",
    "/institutions",
    "/institutions/preppy-kindergarten",
    "/opportunities/2027-admissions",
    "/articles/how-to-choose",
    "/my-preppy",
  ])("accepts known internal PREPPY route %s", (path) => {
    expect(isSafeRedirectPath(path)).toBe(true);
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "javascript:alert(1)",
    "/\\evil.example",
    "/institutions/ok\\evil",
    "/%5cevil.example",
    "/%2fevil.example",
    "/institutions/x\u0000y",
    "institutions/missing-leading-slash",
    "/unknown/path",
  ])("rejects unsafe or unknown continuation %s", (path) => {
    expect(isSafeRedirectPath(path)).toBe(false);
  });
});

describe("same-origin browser mutation guard", () => {
  it("accepts matching mutation origins and ignores safe reads", () => {
    expect(() =>
      assertSameOriginForMutation(
        new Request("https://preppy.example/api/follow", {
          method: "POST",
          headers: { origin: "https://preppy.example" },
        }),
        "https://preppy.example",
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOriginForMutation(
        new Request("https://preppy.example/page", { method: "GET" }),
        "https://preppy.example",
      ),
    ).not.toThrow();
  });

  it.each([undefined, "https://evil.example", "null", "not-an-origin"])(
    "fails closed for mutation Origin %s",
    (origin) => {
      const headers = origin === undefined ? undefined : { origin };
      expect(() =>
        assertSameOriginForMutation(
          new Request("https://preppy.example/api/follow", {
            method: "DELETE",
            headers,
          }),
          "https://preppy.example",
        ),
      ).toThrow(/origin/i);
    },
  );
});

describe("process-local rate limiter", () => {
  it("limits a key within its window and reports when it can retry", () => {
    const limiter = new ProcessLocalRateLimiter();
    const request = { key: "oauth:127.0.0.1", limit: 2, windowMs: 60_000 };

    expect(limiter.consume({ ...request, nowMs: 1_000 })).toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 0,
    });
    expect(limiter.consume({ ...request, nowMs: 2_000 }).allowed).toBe(true);
    expect(limiter.consume({ ...request, nowMs: 3_000 })).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 58,
    });
    expect(limiter.consume({ ...request, nowMs: 61_000 }).allowed).toBe(true);
  });

  it("keeps independent counters and rejects invalid limits", () => {
    const limiter = new ProcessLocalRateLimiter();

    expect(
      limiter.consume({ key: "a", limit: 1, windowMs: 1_000, nowMs: 0 })
        .allowed,
    ).toBe(true);
    expect(
      limiter.consume({ key: "b", limit: 1, windowMs: 1_000, nowMs: 0 })
        .allowed,
    ).toBe(true);
    expect(() =>
      limiter.consume({ key: "a", limit: 0, windowMs: 1_000 }),
    ).toThrow();
  });

  it("bounds one-off key cardinality and reclaims expired buckets", () => {
    const limiter = new ProcessLocalRateLimiter({ maxBuckets: 2 });

    expect(
      limiter.consume({ key: "one-off-a", limit: 1, windowMs: 1_000, nowMs: 0 })
        .allowed,
    ).toBe(true);
    expect(
      limiter.consume({ key: "one-off-b", limit: 1, windowMs: 1_000, nowMs: 0 })
        .allowed,
    ).toBe(true);
    expect(
      limiter.consume({ key: "one-off-c", limit: 1, windowMs: 1_000, nowMs: 1 })
        .allowed,
    ).toBe(false);
    expect(
      limiter.consume({
        key: "one-off-c",
        limit: 1,
        windowMs: 1_000,
        nowMs: 1_000,
      }).allowed,
    ).toBe(true);
  });
});
