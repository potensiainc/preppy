import { describe, expect, it, vi } from "vitest";

import {
  ADMIN_OIDC_FLOW_TTL_SECONDS,
  ADMIN_OIDC_NONCE_COOKIE_NAME,
  ADMIN_OIDC_NONCE_COOKIE_PURPOSE,
  ADMIN_OIDC_PKCE_COOKIE_NAME,
  ADMIN_OIDC_PKCE_COOKIE_PURPOSE,
  ADMIN_OIDC_STATE_COOKIE_NAME,
  ADMIN_OIDC_STATE_COOKIE_PURPOSE,
  clearAdminOidcFlowCookies,
  clearAdminOidcNonceCookie,
  clearAdminOidcPkceCookie,
  clearAdminOidcStateCookie,
  createAdminOidcFlowCookies,
  readAdminOidcNonceCookie,
  readAdminOidcPkceCookie,
  readAdminOidcStateCookie,
} from "@/src/modules/admin/auth/flow-cookie.server";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_COOKIE_PURPOSE,
  ADMIN_SESSION_TTL_SECONDS,
  clearAdminSessionCookie,
  createAdminSessionCookie,
  readAdminSession,
} from "@/src/modules/admin/auth/session.server";
import {
  adminLoginRateLimiter,
  ProcessLocalAdminLoginRateLimiter,
} from "@/src/modules/admin/auth/rate-limit.server";
import {
  adminFlowReplayStore,
  ProcessLocalAdminFlowReplayStore,
} from "@/src/modules/admin/auth/replay.server";
import {
  createUserSessionCookie,
  readUserSession,
  USER_SESSION_COOKIE_NAME,
  USER_SESSION_TTL_SECONDS,
} from "@/src/modules/auth/session.server";
import {
  sealSecureCookie,
  secureCookieAttributes,
} from "@/src/modules/auth/secure-cookie.server";

const flowSecret = "admin-flow-secret-that-is-at-least-thirty-two-bytes";
const sessionSecret = "admin-session-secret-that-is-at-least-thirty-two-bytes";
const sharedCrossoverSecret =
  "test-only-shared-secret-that-is-at-least-thirty-two-bytes";
const now = new Date("2026-08-24T01:02:03.000Z");
const adminUserId = "550e8400-e29b-41d4-a716-446655440000";

describe("WP-11 Admin OIDC flow cookies", () => {
  it("issues independently random capabilities bound to one flow and exact cookie contracts", () => {
    // Mutation caught: reusing state/nonce/verifier, changing a cookie name/path/TTL, or losing common flow binding.
    const issued = createAdminOidcFlowCookies({
      secret: flowSecret,
      now,
      production: true,
    });
    const flowStartedAt = Math.floor(now.getTime() / 1_000);

    expect([
      ADMIN_OIDC_STATE_COOKIE_NAME,
      ADMIN_OIDC_NONCE_COOKIE_NAME,
      ADMIN_OIDC_PKCE_COOKIE_NAME,
    ]).toEqual([
      "preppy_admin_oidc_state",
      "preppy_admin_oidc_nonce",
      "preppy_admin_oidc_pkce",
    ]);
    expect([
      ADMIN_OIDC_STATE_COOKIE_PURPOSE,
      ADMIN_OIDC_NONCE_COOKIE_PURPOSE,
      ADMIN_OIDC_PKCE_COOKIE_PURPOSE,
    ]).toEqual(["admin-oidc-state", "admin-oidc-nonce", "admin-oidc-pkce"]);
    expect(ADMIN_OIDC_FLOW_TTL_SECONDS).toBe(600);
    expect(
      new Set([issued.flowId, issued.state, issued.nonce, issued.codeVerifier])
        .size,
    ).toBe(4);
    for (const capability of [
      issued.flowId,
      issued.state,
      issued.nonce,
      issued.codeVerifier,
    ]) {
      expect(capability).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }

    for (const [cookie, name] of [
      [issued.cookies.state, ADMIN_OIDC_STATE_COOKIE_NAME],
      [issued.cookies.nonce, ADMIN_OIDC_NONCE_COOKIE_NAME],
      [issued.cookies.pkce, ADMIN_OIDC_PKCE_COOKIE_NAME],
    ] as const) {
      expect(cookie).toEqual({
        name,
        value: expect.any(String),
        attributes: {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/admin/auth",
          maxAge: 600,
        },
      });
      expect(cookie.value).not.toContain(issued.flowId);
    }

    expect(
      readAdminOidcStateCookie(issued.cookies.state.value, {
        secret: flowSecret,
        now,
      }),
    ).toEqual({
      version: 1,
      flowId: issued.flowId,
      flowStartedAt,
      state: issued.state,
    });
    expect(
      readAdminOidcNonceCookie(issued.cookies.nonce.value, {
        secret: flowSecret,
        now,
      }),
    ).toEqual({
      version: 1,
      flowId: issued.flowId,
      flowStartedAt,
      nonce: issued.nonce,
    });
    expect(
      readAdminOidcPkceCookie(issued.cookies.pkce.value, {
        secret: flowSecret,
        now,
      }),
    ).toEqual({
      version: 1,
      flowId: issued.flowId,
      flowStartedAt,
      codeVerifier: issued.codeVerifier,
    });
  });

  it("keeps every flow parser in a distinct cryptographic and payload domain", () => {
    // Mutation caught: sharing a purpose/parser or accepting extra/cross-capability payload fields.
    const issued = createAdminOidcFlowCookies({ secret: flowSecret, now });

    expect(
      readAdminOidcNonceCookie(issued.cookies.state.value, {
        secret: flowSecret,
        now,
      }),
    ).toBeNull();
    expect(
      readAdminOidcPkceCookie(issued.cookies.nonce.value, {
        secret: flowSecret,
        now,
      }),
    ).toBeNull();
    expect(
      readAdminOidcStateCookie(issued.cookies.pkce.value, {
        secret: flowSecret,
        now,
      }),
    ).toBeNull();
    expect(
      readAdminSession(issued.cookies.state.value, {
        secret: flowSecret,
        now,
      }),
    ).toBeNull();
    for (const cookieValue of [
      issued.cookies.state.value,
      issued.cookies.nonce.value,
      issued.cookies.pkce.value,
    ]) {
      expect(
        readUserSession(cookieValue, { secret: flowSecret, now }),
      ).toBeNull();
    }

    const malformedState = sealSecureCookie(
      {
        version: 1,
        flowId: issued.flowId,
        flowStartedAt: Math.floor(now.getTime() / 1_000),
        state: issued.state,
        nonce: issued.nonce,
      },
      {
        purpose: ADMIN_OIDC_STATE_COOKIE_PURPOSE,
        secret: flowSecret,
        ttlSeconds: ADMIN_OIDC_FLOW_TTL_SECONDS,
        now,
      },
    );
    expect(
      readAdminOidcStateCookie(malformedState, { secret: flowSecret, now }),
    ).toBeNull();
  });

  it("provides all three host-only deletion descriptors without preventing prior reads", () => {
    // Mutation caught: omitting a callback deletion, widening its path, or deleting before values can be read.
    const issued = createAdminOidcFlowCookies({ secret: flowSecret, now });
    expect(
      readAdminOidcStateCookie(issued.cookies.state.value, {
        secret: flowSecret,
        now,
      }),
    ).not.toBeNull();
    expect(clearAdminOidcFlowCookies({ production: false })).toEqual([
      {
        name: ADMIN_OIDC_STATE_COOKIE_NAME,
        value: "",
        attributes: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/admin/auth",
          maxAge: 0,
        },
      },
      {
        name: ADMIN_OIDC_NONCE_COOKIE_NAME,
        value: "",
        attributes: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/admin/auth",
          maxAge: 0,
        },
      },
      {
        name: ADMIN_OIDC_PKCE_COOKIE_NAME,
        value: "",
        attributes: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/admin/auth",
          maxAge: 0,
        },
      },
    ]);
    for (const cookie of clearAdminOidcFlowCookies()) {
      expect("domain" in cookie.attributes).toBe(false);
    }
    expect([
      clearAdminOidcStateCookie({ production: false }),
      clearAdminOidcNonceCookie({ production: false }),
      clearAdminOidcPkceCookie({ production: false }),
    ]).toEqual(clearAdminOidcFlowCookies({ production: false }));
  });
});

describe("WP-11 Admin session", () => {
  it("round-trips exactly the bounded Admin identity and eight-hour metadata", () => {
    // Mutation caught: serializing PII/external subject, changing the cookie contract, or extending the grant.
    const cookie = createAdminSessionCookie(adminUserId.toUpperCase(), {
      secret: sessionSecret,
      now,
      production: true,
    });

    expect(ADMIN_SESSION_COOKIE_NAME).toBe("preppy_admin_session");
    expect(ADMIN_SESSION_COOKIE_PURPOSE).toBe("admin-session");
    expect(ADMIN_SESSION_TTL_SECONDS).toBe(28_800);
    expect(cookie).toEqual({
      name: "preppy_admin_session",
      value: expect.any(String),
      attributes: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 28_800,
      },
    });
    expect(cookie.value).not.toContain(adminUserId);
    const session = readAdminSession(cookie.value, {
      secret: sessionSecret,
      now,
    });
    expect(session).toEqual({
      version: 1,
      adminUserId,
      issuedAt: Math.floor(now.getTime() / 1_000),
      expiresAt: Math.floor(now.getTime() / 1_000) + 28_800,
    });
    expect(Object.keys(session!)).toEqual([
      "version",
      "adminUserId",
      "issuedAt",
      "expiresAt",
    ]);
  });

  it("rejects expired, tampered, wrong-purpose, and non-exact payloads", () => {
    // Mutation caught: trusting only encryption, tolerating unbounded fields, or accepting an eight-hour boundary.
    const cookie = createAdminSessionCookie(adminUserId, {
      secret: sessionSecret,
      now,
    });
    const tampered = `${cookie.value.slice(0, -1)}${
      cookie.value.endsWith("A") ? "B" : "A"
    }`;

    expect(
      readAdminSession(cookie.value, {
        secret: sessionSecret,
        now: new Date(now.getTime() + ADMIN_SESSION_TTL_SECONDS * 1_000),
      }),
    ).toBeNull();
    expect(
      readAdminSession(tampered, { secret: sessionSecret, now }),
    ).toBeNull();
    expect(
      readAdminSession(cookie.value, { secret: flowSecret, now }),
    ).toBeNull();

    const extraField = sealSecureCookie(
      {
        version: 1,
        adminUserId,
        issuedAt: Math.floor(now.getTime() / 1_000),
        expiresAt:
          Math.floor(now.getTime() / 1_000) + ADMIN_SESSION_TTL_SECONDS,
        externalAuthSubject: "must-never-enter-session",
      },
      {
        purpose: ADMIN_SESSION_COOKIE_PURPOSE,
        secret: sessionSecret,
        ttlSeconds: ADMIN_SESSION_TTL_SECONDS,
        now,
      },
    );
    expect(
      readAdminSession(extraField, { secret: sessionSecret, now }),
    ).toBeNull();
  });

  it("rejects authenticated inner timestamps shifted into a longer outer envelope", () => {
    // Mutation caught: validating only the inner duration while ignoring the authenticated envelope window.
    const issuedAt = Math.floor(now.getTime() / 1_000);
    const shiftedIssuedAt = issuedAt + 16 * 60 * 60;
    const shiftedSession = sealSecureCookie(
      {
        version: 1,
        adminUserId,
        issuedAt: shiftedIssuedAt,
        expiresAt: shiftedIssuedAt + ADMIN_SESSION_TTL_SECONDS,
      },
      {
        purpose: ADMIN_SESSION_COOKIE_PURPOSE,
        secret: sessionSecret,
        ttlSeconds: 24 * 60 * 60,
        now,
      },
    );

    expect(
      readAdminSession(shiftedSession, { secret: sessionSecret, now }),
    ).toBeNull();
  });

  it("uses one issuance instant across an unprovided-clock second boundary", () => {
    // Mutation caught: calling new Date separately for inner timestamps and the authenticated envelope.
    const OriginalDate = Date;
    const firstTimeMs = OriginalDate.parse("2026-08-24T01:02:03.999Z");
    const secondTimeMs = firstTimeMs + 1;
    let noArgumentConstructions = 0;
    class AdvancingDate extends OriginalDate {
      constructor(...args: [] | [string | number]) {
        if (args.length === 0) {
          super(noArgumentConstructions++ === 0 ? firstTimeMs : secondTimeMs);
        } else {
          super(args[0]);
        }
      }
    }
    vi.stubGlobal("Date", AdvancingDate);

    try {
      const cookie = createAdminSessionCookie(adminUserId, {
        secret: sessionSecret,
      });
      expect(
        readAdminSession(cookie.value, {
          secret: sessionSecret,
          now: new OriginalDate(secondTimeMs),
        }),
      ).toMatchObject({
        issuedAt: Math.floor(firstTimeMs / 1_000),
        expiresAt: Math.floor(firstTimeMs / 1_000) + ADMIN_SESSION_TTL_SECONDS,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("clears only the host-only root Admin cookie", () => {
    // Mutation caught: clearing a consumer/flow cookie or retaining the eight-hour max age.
    expect(clearAdminSessionCookie({ production: false })).toEqual({
      name: ADMIN_SESSION_COOKIE_NAME,
      value: "",
      attributes: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      },
    });
    expect("domain" in clearAdminSessionCookie().attributes).toBe(false);
  });

  it("keeps Admin and consumer cookies separate even under a test-only shared secret", () => {
    // Mutation caught: sharing a purpose, parser, payload schema, or cookie name across trust domains.
    const consumerCookie = createUserSessionCookie(adminUserId, {
      secret: sharedCrossoverSecret,
      now,
    });
    const adminCookie = createAdminSessionCookie(adminUserId, {
      secret: sharedCrossoverSecret,
      now,
    });

    expect(USER_SESSION_COOKIE_NAME).toBe("preppy_user_session");
    expect(USER_SESSION_TTL_SECONDS).toBe(86_400);
    expect(ADMIN_SESSION_COOKIE_NAME).not.toBe(USER_SESSION_COOKIE_NAME);
    expect(
      readAdminSession(consumerCookie.value, {
        secret: sharedCrossoverSecret,
        now,
      }),
    ).toBeNull();
    expect(
      readUserSession(adminCookie.value, {
        secret: sharedCrossoverSecret,
        now,
      }),
    ).toBeNull();
  });
});

describe("secure cookie path allowlist", () => {
  it("allows only the consumer root default and the narrow Admin flow path", () => {
    // Mutation caught: widening cookie path input to arbitrary paths or regressing the consumer default.
    expect(
      secureCookieAttributes({ maxAgeSeconds: 60, production: false }),
    ).toMatchObject({ path: "/" });
    expect(
      secureCookieAttributes({
        maxAgeSeconds: 60,
        production: false,
        path: "/admin/auth",
      }),
    ).toMatchObject({ path: "/admin/auth" });
    expect(() =>
      secureCookieAttributes({
        maxAgeSeconds: 60,
        production: false,
        path: "/admin" as "/admin/auth",
      }),
    ).toThrow(/path/i);
  });
});

describe("WP-11 process-local Admin login hardening", () => {
  it("hard-bounds login key cardinality and reclaims only expired buckets", () => {
    // Mutation caught: unbounded attacker keys, live-entry eviction, or nondeterministic wall-clock pruning.
    const limiter = new ProcessLocalAdminLoginRateLimiter({ maxBuckets: 2 });
    const request = { limit: 1, windowMs: 1_000 };

    expect(
      limiter.consume({ ...request, key: "admin-login-a", nowMs: 0 }).allowed,
    ).toBe(true);
    expect(
      limiter.consume({ ...request, key: "admin-login-b", nowMs: 0 }).allowed,
    ).toBe(true);
    expect(
      limiter.consume({ ...request, key: "admin-login-c", nowMs: 999 }),
    ).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
    expect(
      limiter.consume({ ...request, key: "admin-login-c", nowMs: 1_000 })
        .allowed,
    ).toBe(true);
    expect(limiter.enforcementScope).toBe("process-local");
  });

  it("exports a separate process-local singleton for the Admin runtime", () => {
    // Mutation caught: constructing an unbounded limiter per request instead of sharing the emergency ceiling.
    expect(adminLoginRateLimiter).toBeInstanceOf(
      ProcessLocalAdminLoginRateLimiter,
    );
    expect(adminLoginRateLimiter.enforcementScope).toBe("process-local");
  });

  it("registers only a digest and consumes each live Admin flow ID once", () => {
    // Mutation caught: retaining raw flow capabilities or allowing the same callback flow twice.
    const store = new ProcessLocalAdminFlowReplayStore({ maxEntries: 2 });
    const flowId = "A".repeat(43);

    expect(store.register(flowId, { nowMs: 1_000, expiresAtMs: 11_000 })).toBe(
      true,
    );
    const storedEntries = (
      store as unknown as {
        readonly entries: ReadonlyMap<string, unknown>;
      }
    ).entries;
    expect([...storedEntries.keys()]).toEqual([
      "DwBzhbb51LfusnSGBa_hqYSgo7-j8BTQnip4TOnlzRo",
    ]);
    expect(storedEntries.has(flowId)).toBe(false);
    expect(store.consume(flowId, { nowMs: 2_000 })).toBe("REGISTERED");
    expect(store.consume(flowId, { nowMs: 2_001 })).toBe("CONSUMED");
  });

  it("hard-bounds replay entries and TTL-prunes with the supplied clock", () => {
    // Mutation caught: evicting live flows, retaining expired flows, or admitting unbounded IDs.
    const store = new ProcessLocalAdminFlowReplayStore({ maxEntries: 2 });
    const flowA = "A".repeat(43);
    const flowB = "B".repeat(43);
    const flowC = "C".repeat(43);

    expect(store.register(flowA, { nowMs: 1_000, expiresAtMs: 2_000 })).toBe(
      true,
    );
    expect(store.register(flowB, { nowMs: 1_000, expiresAtMs: 5_000 })).toBe(
      true,
    );
    expect(store.register(flowC, { nowMs: 1_999, expiresAtMs: 5_000 })).toBe(
      false,
    );
    expect(store.consume(flowA, { nowMs: 2_000 })).toBe("UNKNOWN");
    expect(store.register(flowC, { nowMs: 2_000, expiresAtMs: 5_000 })).toBe(
      true,
    );
    expect(store.consume(flowB, { nowMs: 2_001 })).toBe("REGISTERED");
    expect(store.consume(flowC, { nowMs: 2_001 })).toBe("REGISTERED");
    expect(
      store.register("too-short", { nowMs: 2_001, expiresAtMs: 5_000 }),
    ).toBe(false);
  });

  it("exports a separate bounded replay singleton as defense in depth", () => {
    // Mutation caught: making replay state request-local or omitting the Admin flow registry.
    expect(adminFlowReplayStore).toBeInstanceOf(
      ProcessLocalAdminFlowReplayStore,
    );
    expect(adminFlowReplayStore.enforcementScope).toBe("process-local");
  });
});
