import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  handleAdminLogoutRoute,
  handleAdminLoginCallbackRoute,
  handleAdminLoginStartRoute,
  startAdminLogin,
} from "@/src/modules/admin/auth/http.server";
import {
  getAdminLogoutRuntime,
  type AdminAuthRuntime,
} from "@/src/modules/admin/auth/runtime.server";
import {
  createAdminOidcFlowCookies,
  createAdminOidcNonceCookie,
  createAdminOidcPkceCookie,
  createAdminOidcStateCookie,
  ADMIN_OIDC_NONCE_COOKIE_NAME,
  ADMIN_OIDC_PKCE_COOKIE_NAME,
  ADMIN_OIDC_STATE_COOKIE_NAME,
  readAdminOidcNonceCookie,
  readAdminOidcPkceCookie,
  readAdminOidcStateCookie,
} from "@/src/modules/admin/auth/flow-cookie.server";
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionCookie,
  readAdminSession,
} from "@/src/modules/admin/auth/session.server";
import { USER_SESSION_COOKIE_NAME } from "@/src/modules/auth/session.server";

const appBaseUrl = "https://preppy.example";
const flowSecret = "admin-flow-secret-that-is-at-least-thirty-two-bytes";
const sessionSecret = "admin-session-secret-that-is-at-least-thirty-two-bytes";
const now = new Date("2026-08-24T05:06:07.000Z");
const discovery = {
  issuer: "https://issuer.example/tenant",
  authorization_endpoint: "https://issuer.example/oauth2/authorize",
  token_endpoint: "https://issuer.example/oauth2/token",
  jwks_uri: "https://issuer.example/.well-known/jwks.json",
  response_types_supported: ["code"],
  id_token_signing_alg_values_supported: ["RS256"],
  grant_types_supported: ["authorization_code"],
  token_endpoint_auth_methods_supported: ["client_secret_basic"],
  code_challenge_methods_supported: ["S256"],
  response_modes_supported: ["query"],
};

function allowingRateLimiter() {
  return {
    consume: vi.fn(() => ({
      allowed: true,
      remaining: 119,
      retryAfterSeconds: 0,
    })),
  };
}

function baseRuntime(
  overrides: Partial<AdminAuthRuntime> = {},
): AdminAuthRuntime {
  return {
    config: {
      APP_BASE_URL: appBaseUrl,
      ADMIN_AUTH_ISSUER: discovery.issuer,
      ADMIN_AUTH_CLIENT_ID: "fixed-admin-client",
      ADMIN_AUTH_CLIENT_SECRET:
        "admin-client-secret-that-is-at-least-thirty-two-bytes",
      ADMIN_SESSION_SECRET: sessionSecret,
      ADMIN_OIDC_FLOW_SECRET: flowSecret,
      redirectUri: `${appBaseUrl}/admin/auth/callback`,
    },
    production: true,
    now: () => now,
    rateLimiter: allowingRateLimiter(),
    replayStore: {
      register: vi.fn(() => true),
      consume: vi.fn(() => "REGISTERED" as const),
    },
    createFlowCookies: (issuedAt) =>
      createAdminOidcFlowCookies({
        secret: flowSecret,
        now: issuedAt,
        production: true,
      }),
    loadDiscovery: vi.fn(async () => discovery),
    exchangeAuthorizationCode: vi.fn(async () => ({
      id_token: "header.payload.signature",
      token_type: "Bearer",
    })),
    verifyIdToken: vi.fn(async () => ({
      sub: "verified-admin-subject",
      iss: discovery.issuer,
      aud: "fixed-admin-client",
      iat: Math.floor(now.getTime() / 1_000),
      exp: Math.floor(now.getTime() / 1_000) + 300,
    })),
    requireActiveAdmin: vi.fn(async () => ({
      adminUserId: "550e8400-e29b-41d4-a716-446655440000",
      displayName: "WP-11 Operator",
    })),
    createSessionCookie: (adminUserId, issuedAt) =>
      createAdminSessionCookie(adminUserId, {
        secret: sessionSecret,
        now: issuedAt,
        production: true,
      }),
    ...overrides,
  };
}

function responseCookieValue(response: Response, name: string): string | null {
  const match = response.headers
    .get("set-cookie")
    ?.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`));
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

function cookieRequest(
  url: string,
  cookies: Readonly<Record<string, string>>,
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

function issuedFlow() {
  return createAdminOidcFlowCookies({
    secret: flowSecret,
    now,
    production: true,
  });
}

function flowCookieRecord(
  flow: ReturnType<typeof issuedFlow>,
): Record<string, string> {
  return {
    [ADMIN_OIDC_STATE_COOKIE_NAME]: flow.cookies.state.value,
    [ADMIN_OIDC_NONCE_COOKIE_NAME]: flow.cookies.nonce.value,
    [ADMIN_OIDC_PKCE_COOKIE_NAME]: flow.cookies.pkce.value,
  };
}

function expectAllFlowCookiesCleared(response: Response): void {
  const setCookie = response.headers.get("set-cookie") ?? "";
  for (const name of [
    ADMIN_OIDC_STATE_COOKIE_NAME,
    ADMIN_OIDC_NONCE_COOKIE_NAME,
    ADMIN_OIDC_PKCE_COOKIE_NAME,
  ]) {
    expect(setCookie).toMatch(
      new RegExp(`${name}=; Path=/admin/auth; Max-Age=0`),
    );
  }
}

function preserveLogoutEnvironment(): () => void {
  return () => vi.unstubAllEnvs();
}

function setValidLogoutOriginWithUnrelatedAdminEnvironment(
  mode: "absent" | "invalid",
): void {
  vi.stubEnv("APP_BASE_URL", appBaseUrl);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv(
    "DATABASE_URL",
    mode === "absent" ? undefined : "not-a-database-url",
  );
  if (mode === "absent") {
    for (const name of [
      "ADMIN_AUTH_ISSUER",
      "ADMIN_AUTH_CLIENT_ID",
      "ADMIN_AUTH_CLIENT_SECRET",
      "ADMIN_SESSION_SECRET",
      "ADMIN_OIDC_FLOW_SECRET",
    ] as const) {
      vi.stubEnv(name, undefined);
    }
    return;
  }
  vi.stubEnv("ADMIN_AUTH_ISSUER", "not-an-issuer");
  vi.stubEnv("ADMIN_AUTH_CLIENT_ID", "");
  vi.stubEnv("ADMIN_AUTH_CLIENT_SECRET", "short");
  vi.stubEnv("ADMIN_SESSION_SECRET", "also-short");
  vi.stubEnv("ADMIN_OIDC_FLOW_SECRET", "also-invalid");
}

describe("WP-11 Admin OIDC start", () => {
  it("validates discovery before capability creation and returns fixed S256 redirect instructions", async () => {
    // Mutation caught: issuing capabilities before discovery, reusing a capability, or allowing request-controlled OIDC truth.
    const order: string[] = [];
    const runtime = baseRuntime({
      loadDiscovery: vi.fn(async () => {
        order.push("discovery");
        return discovery;
      }),
      createFlowCookies: (issuedAt) => {
        order.push("flow");
        return createAdminOidcFlowCookies({
          secret: flowSecret,
          now: issuedAt,
          production: true,
        });
      },
      replayStore: {
        register: vi.fn(() => {
          order.push("register");
          return true;
        }),
        consume: vi.fn(() => "REGISTERED" as const),
      },
    });

    const result = await startAdminLogin(
      new Request(
        `${appBaseUrl}/admin/auth/start?returnUrl=https://evil.example&redirect_uri=https://evil.example/callback&issuer=https://evil.example&client_id=evil-client&code_challenge_method=plain`,
      ),
      runtime,
    );

    expect(order).toEqual(["discovery", "flow", "register"]);
    const redirect = new URL(result.redirectUrl);
    expect(`${redirect.origin}${redirect.pathname}`).toBe(
      discovery.authorization_endpoint,
    );
    expect(Object.fromEntries(redirect.searchParams)).toEqual({
      client_id: "fixed-admin-client",
      redirect_uri: `${appBaseUrl}/admin/auth/callback`,
      response_type: "code",
      response_mode: "query",
      scope: "openid",
      state: expect.any(String),
      nonce: expect.any(String),
      code_challenge: expect.any(String),
      code_challenge_method: "S256",
    });
    expect(redirect.href).not.toContain("evil.example");
    expect(redirect.href).not.toContain("evil-client");
    expect(redirect.href).not.toContain("plain");

    const state = readAdminOidcStateCookie(result.cookies[0]?.value, {
      secret: flowSecret,
      now,
    });
    const nonce = readAdminOidcNonceCookie(result.cookies[1]?.value, {
      secret: flowSecret,
      now,
    });
    const pkce = readAdminOidcPkceCookie(result.cookies[2]?.value, {
      secret: flowSecret,
      now,
    });
    expect(state).not.toBeNull();
    expect(nonce).not.toBeNull();
    expect(pkce).not.toBeNull();
    expect(state?.flowId).toBe(nonce?.flowId);
    expect(state?.flowId).toBe(pkce?.flowId);
    expect(new Set([state?.state, nonce?.nonce, pkce?.codeVerifier]).size).toBe(
      3,
    );
    expect(redirect.searchParams.get("state")).toBe(state?.state);
    expect(redirect.searchParams.get("nonce")).toBe(nonce?.nonce);
    expect(redirect.searchParams.get("code_challenge")).toBe(
      await crypto.subtle
        .digest("SHA-256", new TextEncoder().encode(pkce?.codeVerifier))
        .then((digest) => Buffer.from(digest).toString("base64url")),
    );
    expect(runtime.replayStore.register).toHaveBeenCalledWith(state?.flowId, {
      nowMs: now.getTime(),
      expiresAtMs: now.getTime() + 600_000,
    });
  });

  it("returns a private generic denial without cookies or provider redirect when discovery fails", async () => {
    // Mutation caught: generating/registering flow capabilities or redirecting after incompatible discovery.
    const replayStore = {
      register: vi.fn(() => true),
      consume: vi.fn(() => "REGISTERED" as const),
    };
    const createFlowCookies = vi.fn((issuedAt: Date) =>
      createAdminOidcFlowCookies({
        secret: flowSecret,
        now: issuedAt,
        production: true,
      }),
    );
    const runtime = baseRuntime({
      replayStore,
      createFlowCookies,
      loadDiscovery: vi.fn(async () => {
        throw new Error("provider discovery details must remain private");
      }),
    });

    const response = await handleAdminLoginStartRoute(
      new Request(`${appBaseUrl}/admin/auth/start`),
      () => runtime,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await response.text()).not.toContain("provider discovery details");
    expect(createFlowCookies).not.toHaveBeenCalled();
    expect(replayStore.register).not.toHaveBeenCalled();
  });

  it("applies the bounded process limiter before discovery without issuing a flow", async () => {
    // Mutation caught: discovering/generating before rate-limit denial or emitting cookies on a rejected start.
    const loadDiscovery = vi.fn(async () => discovery);
    const createFlowCookies = vi.fn(() => issuedFlow());
    const runtime = baseRuntime({
      rateLimiter: {
        consume: vi.fn(() => ({
          allowed: false,
          remaining: 0,
          retryAfterSeconds: 47,
        })),
      },
      loadDiscovery,
      createFlowCookies,
    });

    const response = await handleAdminLoginStartRoute(
      new Request(`${appBaseUrl}/admin/auth/start`),
      () => runtime,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("47");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(loadDiscovery).not.toHaveBeenCalled();
    expect(createFlowCookies).not.toHaveBeenCalled();
  });

  it("keeps the exact start Route Handler thin over the runtime seam", async () => {
    // Mutation caught: adding a bypass route/env or letting the exact route diverge from startAdminLogin.
    const runtime = baseRuntime();
    vi.resetModules();
    vi.doMock("@/src/modules/admin/auth/runtime.server", () => ({
      getAdminAuthRuntime: vi.fn(() => runtime),
    }));
    const route = await import("@/app/admin/(auth)/auth/start/route");

    const response = await route.GET(
      new Request(`${appBaseUrl}/admin/auth/start?client_id=browser-client`),
    );

    expect(route.dynamic).toBe("force-dynamic");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "client_id=fixed-admin-client",
    );
    expect(response.headers.get("location")).not.toContain("browser-client");
    expect(responseCookieValue(response, "preppy_admin_oidc_state")).not.toBe(
      null,
    );
    vi.doUnmock("@/src/modules/admin/auth/runtime.server");
  });

  it("renders the exact private Admin login page with only the fixed start link", async () => {
    // Mutation caught: accepting a return target/client parameter in UI or omitting noindex metadata.
    const pageModule = await import("@/app/admin/(auth)/login/page");
    const html = renderToStaticMarkup(pageModule.default());

    expect(pageModule.dynamic).toBe("force-dynamic");
    expect(pageModule.revalidate).toBe(0);
    expect(pageModule.metadata).toMatchObject({
      robots: { index: false, follow: false },
    });
    expect(html).toContain('href="/admin/auth/start"');
    expect(html).not.toContain("returnUrl");
    expect(html).not.toContain("client_id");
  });
});

describe("WP-11 Admin OIDC callback", () => {
  it("consumes the bound flow in locked order and issues an eight-hour session from verified sub only", async () => {
    // Mutation caught: using an unverified token-response subject, exchanging before consumption, or retaining flow cookies.
    const flow = issuedFlow();
    const order: string[] = [];
    const runtime = baseRuntime({
      replayStore: {
        register: vi.fn(() => true),
        consume: vi.fn(() => {
          order.push("consume");
          return "REGISTERED" as const;
        }),
      },
      loadDiscovery: vi.fn(async () => {
        order.push("discovery");
        return discovery;
      }),
      exchangeAuthorizationCode: vi.fn(async () => {
        order.push("exchange");
        return {
          id_token: "raw-id-token-must-not-escape",
          token_type: "Bearer",
          sub: "unverified-token-response-subject",
          provider_extension: { accepted: true },
        };
      }),
      verifyIdToken: vi.fn(async () => {
        order.push("verify");
        return {
          sub: "verified-admin-subject",
          iss: discovery.issuer,
          aud: "fixed-admin-client",
          iat: Math.floor(now.getTime() / 1_000),
          exp: Math.floor(now.getTime() / 1_000) + 300,
        };
      }),
      requireActiveAdmin: vi.fn(async (subject) => {
        order.push(`lookup:${subject}`);
        return {
          adminUserId: "550e8400-e29b-41d4-a716-446655440000",
          displayName: "WP-11 Operator",
        };
      }),
    });

    const logSpies = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const response = await handleAdminLoginCallbackRoute(
      cookieRequest(
        `${appBaseUrl}/admin/auth/callback?state=${flow.state}&code=provider-code-must-not-escape`,
        flowCookieRecord(flow),
      ),
      () => runtime,
    );
    const serializedLogs = JSON.stringify(
      logSpies.flatMap((spy) => spy.mock.calls),
    );
    for (const spy of logSpies) spy.mockRestore();

    expect(order).toEqual([
      "consume",
      "discovery",
      "exchange",
      "verify",
      "lookup:verified-admin-subject",
    ]);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expectAllFlowCookiesCleared(response);
    const session = readAdminSession(
      responseCookieValue(response, "preppy_admin_session"),
      { secret: sessionSecret, now },
    );
    expect(session).toEqual({
      version: 1,
      adminUserId: "550e8400-e29b-41d4-a716-446655440000",
      issuedAt: Math.floor(now.getTime() / 1_000),
      expiresAt: Math.floor(now.getTime() / 1_000) + 28_800,
    });
    expect(await response.text()).not.toContain(
      "provider-code-must-not-escape",
    );
    expect(response.headers.get("set-cookie")).not.toContain(
      "raw-id-token-must-not-escape",
    );
    expect(serializedLogs).not.toContain("provider-code-must-not-escape");
    expect(serializedLogs).not.toContain("raw-id-token-must-not-escape");
    expect(runtime.requireActiveAdmin).toHaveBeenCalledWith(
      "verified-admin-subject",
    );
    expect(runtime.exchangeAuthorizationCode).toHaveBeenCalledWith({
      discovery,
      code: "provider-code-must-not-escape",
      codeVerifier: flow.codeVerifier,
    });
    expect(runtime.verifyIdToken).toHaveBeenCalledWith({
      discovery,
      idToken: "raw-id-token-must-not-escape",
      expectedNonce: flow.nonce,
      flowStartedAt: Math.floor(now.getTime() / 1_000),
      now: Math.floor(now.getTime() / 1_000),
    });
  });

  it.each([
    ["missing state", "?code=provider-code"],
    ["empty state", "?state=&code=provider-code"],
    ["duplicate state", "?state={state}&state={state}&code=provider-code"],
    ["missing result", "?state={state}"],
    ["empty code", "?state={state}&code="],
    ["duplicate code", "?state={state}&code=one&code=two"],
    ["empty error", "?state={state}&error="],
    ["duplicate error", "?state={state}&error=one&error=two"],
    ["code and error", "?state={state}&code=one&error=access_denied"],
    ["wrong state", "?state=wrong-state&code=provider-code"],
  ])(
    "rejects %s by exact query cardinality before token exchange and clears every flow cookie",
    async (_case, searchTemplate) => {
      // Mutation caught: using get()/has() rather than getAll() or leaving one flow cookie reusable.
      const flow = issuedFlow();
      const runtime = baseRuntime();
      const search = searchTemplate.replaceAll("{state}", flow.state);

      const response = await handleAdminLoginCallbackRoute(
        cookieRequest(
          `${appBaseUrl}/admin/auth/callback${search}`,
          flowCookieRecord(flow),
        ),
        () => runtime,
      );

      expect(response.status).toBe(400);
      expectAllFlowCookiesCleared(response);
      expect(responseCookieValue(response, "preppy_admin_session")).toBeNull();
      expect(runtime.exchangeAuthorizationCode).not.toHaveBeenCalled();
      expect(await response.text()).not.toContain("provider-code");
    },
  );

  it("clears all flow cookies when cookies are missing or runtime resolution fails", async () => {
    // Mutation caught: returning early before scheduling cleanup on malformed or unavailable callback paths.
    const missingCookies = await handleAdminLoginCallbackRoute(
      new Request(
        `${appBaseUrl}/admin/auth/callback?state=missing-cookie-state&code=private-code`,
      ),
      () => baseRuntime(),
    );
    expect(missingCookies.status).toBe(400);
    expectAllFlowCookiesCleared(missingCookies);

    const runtimeUnavailable = await handleAdminLoginCallbackRoute(
      new Request(
        `${appBaseUrl}/admin/auth/callback?state=unavailable&code=private-code`,
        {
          headers: {
            cookie: [
              `${ADMIN_OIDC_STATE_COOKIE_NAME}=raw-state-cookie`,
              `${ADMIN_OIDC_NONCE_COOKIE_NAME}=raw-nonce-cookie`,
              `${ADMIN_OIDC_PKCE_COOKIE_NAME}=raw-pkce-cookie`,
            ].join("; "),
          },
        },
      ),
      () => {
        throw new Error("secret config detail");
      },
    );
    expect(runtimeUnavailable.status).toBe(503);
    expectAllFlowCookiesCleared(runtimeUnavailable);
    expect(await runtimeUnavailable.text()).not.toContain(
      "secret config detail",
    );
  });

  it("rejects mixed flow IDs, mixed times, expired flows, replay, provider denial, and exchange failure after read with cleanup", async () => {
    // Mutation caught: independently accepting cookies, skipping age/replay checks, or failing to consume denial callbacks.
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    const first = issuedFlow();
    const second = issuedFlow();
    const mixedTimes = {
      [ADMIN_OIDC_STATE_COOKIE_NAME]: createAdminOidcStateCookie(
        {
          version: 1,
          flowId: first.flowId,
          flowStartedAt: nowSeconds,
          state: first.state,
        },
        { secret: flowSecret, now, production: true },
      ).value,
      [ADMIN_OIDC_NONCE_COOKIE_NAME]: createAdminOidcNonceCookie(
        {
          version: 1,
          flowId: first.flowId,
          flowStartedAt: nowSeconds - 1,
          nonce: first.nonce,
        },
        { secret: flowSecret, now, production: true },
      ).value,
      [ADMIN_OIDC_PKCE_COOKIE_NAME]: first.cookies.pkce.value,
    };
    const expired = {
      [ADMIN_OIDC_STATE_COOKIE_NAME]: createAdminOidcStateCookie(
        {
          version: 1,
          flowId: first.flowId,
          flowStartedAt: nowSeconds - 600,
          state: first.state,
        },
        { secret: flowSecret, now, production: true },
      ).value,
      [ADMIN_OIDC_NONCE_COOKIE_NAME]: createAdminOidcNonceCookie(
        {
          version: 1,
          flowId: first.flowId,
          flowStartedAt: nowSeconds - 600,
          nonce: first.nonce,
        },
        { secret: flowSecret, now, production: true },
      ).value,
      [ADMIN_OIDC_PKCE_COOKIE_NAME]: createAdminOidcPkceCookie(
        {
          version: 1,
          flowId: first.flowId,
          flowStartedAt: nowSeconds - 600,
          codeVerifier: first.codeVerifier,
        },
        { secret: flowSecret, now, production: true },
      ).value,
    };
    const cases: Array<{
      name: string;
      cookies: Record<string, string>;
      search: string;
      runtime: AdminAuthRuntime;
      status: number;
      consumed?: boolean;
    }> = [
      {
        name: "mixed flow IDs",
        cookies: {
          [ADMIN_OIDC_STATE_COOKIE_NAME]: first.cookies.state.value,
          [ADMIN_OIDC_NONCE_COOKIE_NAME]: second.cookies.nonce.value,
          [ADMIN_OIDC_PKCE_COOKIE_NAME]: first.cookies.pkce.value,
        },
        search: `?state=${first.state}&code=provider-code`,
        runtime: baseRuntime(),
        status: 400,
      },
      {
        name: "mixed flow times",
        cookies: mixedTimes,
        search: `?state=${first.state}&code=provider-code`,
        runtime: baseRuntime(),
        status: 400,
      },
      {
        name: "expired flow",
        cookies: expired,
        search: `?state=${first.state}&code=provider-code`,
        runtime: baseRuntime(),
        status: 400,
      },
      {
        name: "replayed flow",
        cookies: flowCookieRecord(first),
        search: `?state=${first.state}&code=provider-code`,
        runtime: baseRuntime({
          replayStore: {
            register: vi.fn(() => true),
            consume: vi.fn(() => "CONSUMED" as const),
          },
        }),
        status: 400,
      },
      {
        name: "provider denial",
        cookies: flowCookieRecord(first),
        search: `?state=${first.state}&error=access_denied&error_description=private-detail`,
        runtime: baseRuntime(),
        status: 400,
        consumed: true,
      },
      {
        name: "token exchange failure",
        cookies: flowCookieRecord(first),
        search: `?state=${first.state}&code=provider-code`,
        runtime: baseRuntime({
          exchangeAuthorizationCode: vi.fn(async () => {
            throw new Error("code/access/refresh/token endpoint internals");
          }),
        }),
        status: 502,
        consumed: true,
      },
    ];

    for (const testCase of cases) {
      const response = await handleAdminLoginCallbackRoute(
        cookieRequest(
          `${appBaseUrl}/admin/auth/callback${testCase.search}`,
          testCase.cookies,
        ),
        () => testCase.runtime,
      );
      expect(response.status, testCase.name).toBe(testCase.status);
      expectAllFlowCookiesCleared(response);
      expect(responseCookieValue(response, "preppy_admin_session")).toBeNull();
      const body = await response.text();
      expect(body).not.toContain("private-detail");
      expect(body).not.toContain("endpoint internals");
      if (testCase.consumed) {
        expect(testCase.runtime.replayStore.consume).toHaveBeenCalledWith(
          first.flowId,
          { nowMs: now.getTime() },
        );
      }
    }
  });

  it.each([
    ["missing id_token", { token_type: "Bearer" }],
    ["empty id_token", { id_token: "", token_type: "Bearer" }],
    ["non-string id_token", { id_token: ["one", "two"] }],
    ["unexpected token type", { id_token: "token", token_type: "MAC" }],
    ["malformed access token type", { id_token: "token", access_token: 7 }],
  ])("rejects %s as a generic token failure", async (_case, tokenResponse) => {
    // Mutation caught: accepting a missing/ambiguous ID Token or malformed known token-response field.
    const flow = issuedFlow();
    const runtime = baseRuntime({
      exchangeAuthorizationCode: vi.fn(async () => tokenResponse),
    });

    const response = await handleAdminLoginCallbackRoute(
      cookieRequest(
        `${appBaseUrl}/admin/auth/callback?state=${flow.state}&code=private-code`,
        flowCookieRecord(flow),
      ),
      () => runtime,
    );

    expect(response.status).toBe(502);
    expectAllFlowCookiesCleared(response);
    expect(runtime.verifyIdToken).not.toHaveBeenCalled();
    expect(responseCookieValue(response, "preppy_admin_session")).toBeNull();
    expect(await response.text()).not.toContain("private-code");
  });

  it("keeps the exact callback Route Handler thin over the runtime seam", async () => {
    // Mutation caught: exact route divergence, application bypass, or missing callback cleanup.
    const flow = issuedFlow();
    const runtime = baseRuntime();
    vi.resetModules();
    vi.doMock("@/src/modules/admin/auth/runtime.server", () => ({
      getAdminAuthRuntime: vi.fn(() => runtime),
    }));
    const route = await import("@/app/admin/(auth)/auth/callback/route");

    const response = await route.GET(
      cookieRequest(
        `${appBaseUrl}/admin/auth/callback?state=${flow.state}&code=provider-code`,
        flowCookieRecord(flow),
      ),
    );

    expect(route.dynamic).toBe("force-dynamic");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin");
    expectAllFlowCookiesCleared(response);
    vi.doUnmock("@/src/modules/admin/auth/runtime.server");
  });
});

describe("WP-11 Admin token exchange server seam", () => {
  async function exchangeFunction() {
    vi.doUnmock("@/src/modules/admin/auth/runtime.server");
    vi.resetModules();
    const runtimeModule =
      await import("@/src/modules/admin/auth/runtime.server");
    return (
      runtimeModule as typeof runtimeModule & {
        exchangeAdminAuthorizationCode: (input: {
          config: AdminAuthRuntime["config"];
          discovery: typeof discovery;
          code: string;
          codeVerifier: string;
          fetchImpl: typeof fetch;
        }) => Promise<unknown>;
      }
    ).exchangeAdminAuthorizationCode;
  }

  it("posts fixed Basic/body values and parses one extensible token response through the security boundary", async () => {
    // Mutation caught: client_secret_post, request-controlled redirect, permissive text/JSON parsing, or blanket extension rejection.
    const exchangeAdminAuthorizationCode = await exchangeFunction();
    const fetchImpl = vi.fn(
      async (input: URL | RequestInfo, init?: RequestInit) => {
        expect(String(input)).toBe(discovery.token_endpoint);
        expect(init?.method).toBe("POST");
        expect(init?.redirect).toBe("error");
        const headers = new Headers(init?.headers);
        expect(headers.get("authorization")).toBe(
          "Basic Zml4ZWQtYWRtaW4tY2xpZW50OmFkbWluLWNsaWVudC1zZWNyZXQtdGhhdC1pcy1hdC1sZWFzdC10aGlydHktdHdvLWJ5dGVz",
        );
        expect(headers.get("content-type")).toBe(
          "application/x-www-form-urlencoded;charset=UTF-8",
        );
        const body = new URLSearchParams(String(init?.body));
        expect(Object.fromEntries(body)).toEqual({
          grant_type: "authorization_code",
          code: "private-provider-code",
          code_verifier: "A".repeat(43),
          redirect_uri: `${appBaseUrl}/admin/auth/callback`,
        });
        expect(body.has("client_id")).toBe(false);
        expect(body.has("client_secret")).toBe(false);
        return new Response(
          '{"id_token":"header.payload.signature","token_type":"Bearer","provider_extension":{"accepted":true}}',
          { status: 200 },
        );
      },
    ) as typeof fetch;

    await expect(
      exchangeAdminAuthorizationCode({
        config: baseRuntime().config,
        discovery,
        code: "private-provider-code",
        codeVerifier: "A".repeat(43),
        fetchImpl,
      }),
    ).resolves.toEqual({
      id_token: "header.payload.signature",
      token_type: "Bearer",
      provider_extension: { accepted: true },
    });
  });

  it.each([
    [
      "duplicate id_token members",
      new Response('{"id_token":"one","id_token":"two"}', {
        status: 200,
      }),
    ],
    [
      "malformed token-response UTF-8",
      new Response(new Uint8Array([0x7b, 0xc3, 0x28, 0x7d]), {
        status: 200,
      }),
    ],
    ["raw non-JSON response", new Response("not-json", { status: 200 })],
    [
      "oversized response",
      new Response(new Uint8Array(64 * 1_024 + 1).fill(0x20), {
        status: 200,
      }),
    ],
  ])("rejects %s before semantic token handling", async (_case, response) => {
    // Mutation caught: JSON.parse last-member wins, replacement-character decoding, or unbounded body collection.
    const exchangeAdminAuthorizationCode = await exchangeFunction();
    const fetchImpl = vi.fn(async () => response) as typeof fetch;

    await expect(
      exchangeAdminAuthorizationCode({
        config: baseRuntime().config,
        discovery,
        code: "private-provider-code",
        codeVerifier: "A".repeat(43),
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe("WP-11 Admin logout", () => {
  it("idempotently clears only the Admin session for valid, DISABLED, expired, tampered, and missing cookies", () => {
    // Mutation caught: calling the ACTIVE guard/parser before clearing, rejecting stale cookies, or clearing the consumer trust domain.
    const valid = createAdminSessionCookie(
      "550e8400-e29b-41d4-a716-446655440000",
      { secret: sessionSecret, now, production: true },
    ).value;
    const expired = createAdminSessionCookie(
      "550e8400-e29b-41d4-a716-446655440000",
      {
        secret: sessionSecret,
        now: new Date(now.getTime() - 8 * 60 * 60 * 1_000),
        production: true,
      },
    ).value;
    const cases = [
      ["valid", valid],
      ["DISABLED identity using the same opaque session shape", valid],
      ["expired", expired],
      ["tampered", `${valid.slice(0, -1)}tampered`],
      ["missing", undefined],
    ] as const;
    const runtime = { appBaseUrl, production: true };

    for (const [name, value] of cases) {
      const cookies = {
        ...(value === undefined ? {} : { [ADMIN_SESSION_COOKIE_NAME]: value }),
        [USER_SESSION_COOKIE_NAME]: "consumer-cookie-must-remain",
      };
      const response = handleAdminLogoutRoute(
        cookieRequest(`${appBaseUrl}/api/admin/auth/logout`, cookies, {
          method: "POST",
          headers: { origin: appBaseUrl },
        }),
        () => runtime,
      );

      expect(response.status, name).toBe(204);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("set-cookie"), name).toMatch(
        new RegExp(
          `${ADMIN_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure`,
        ),
      );
      expect(response.headers.get("set-cookie")).not.toContain(
        USER_SESSION_COOKIE_NAME,
      );
    }
  });

  it("rejects cross-origin POST without clearing and exposes no GET logout handler", async () => {
    // Mutation caught: clearing before Origin validation or enabling CSRF logout through GET.
    const runtime = { appBaseUrl, production: true };
    const rejected = handleAdminLogoutRoute(
      new Request(`${appBaseUrl}/api/admin/auth/logout`, {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
      () => runtime,
    );
    expect(rejected.status).toBe(403);
    expect(rejected.headers.get("set-cookie")).toBeNull();

    vi.resetModules();
    vi.doMock("@/src/modules/admin/auth/runtime.server", () => ({
      getAdminLogoutRuntime: vi.fn(() => runtime),
    }));
    const route = await import("@/app/api/admin/auth/logout/route");
    expect(route.dynamic).toBe("force-dynamic");
    expect("GET" in route).toBe(false);

    const response = await route.POST(
      new Request(`${appBaseUrl}/api/admin/auth/logout`, {
        method: "POST",
        headers: { origin: appBaseUrl },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain(
      `${ADMIN_SESSION_COOKIE_NAME}=;`,
    );
    vi.doUnmock("@/src/modules/admin/auth/runtime.server");
  });

  it.each(["absent", "invalid"] as const)(
    "uses the real production logout runtime to clear the Admin cookie when unrelated Admin settings are %s",
    (mode) => {
      // Mutation caught: routing logout through getAdminAuthConfig() or any secret/issuer/client dependency.
      const restoreEnvironment = preserveLogoutEnvironment();
      try {
        setValidLogoutOriginWithUnrelatedAdminEnvironment(mode);

        expect(getAdminLogoutRuntime()).toEqual({
          appBaseUrl,
          production: false,
        });
        const response = handleAdminLogoutRoute(
          new Request(`${appBaseUrl}/api/admin/auth/logout`, {
            method: "POST",
            headers: { origin: appBaseUrl },
          }),
          getAdminLogoutRuntime,
        );

        expect(response.status).toBe(204);
        expect(response.headers.get("set-cookie")).toBe(
          `${ADMIN_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
        );
        expect(response.headers.get("set-cookie")).not.toContain(
          USER_SESSION_COOKIE_NAME,
        );
      } finally {
        restoreEnvironment();
      }
    },
  );

  it.each(["https://evil.example", null] as const)(
    "does not clear through the real production runtime for untrusted Origin %s",
    (origin) => {
      // Mutation caught: clearing before Origin validation when unrelated OIDC settings are invalid.
      const restoreEnvironment = preserveLogoutEnvironment();
      try {
        setValidLogoutOriginWithUnrelatedAdminEnvironment("invalid");
        const headers = new Headers();
        if (origin !== null) headers.set("origin", origin);

        const response = handleAdminLogoutRoute(
          new Request(`${appBaseUrl}/api/admin/auth/logout`, {
            method: "POST",
            headers,
          }),
          getAdminLogoutRuntime,
        );

        expect(response.status).toBe(403);
        expect(response.headers.get("set-cookie")).toBeNull();
      } finally {
        restoreEnvironment();
      }
    },
  );

  it("fails closed without clearing when the real logout runtime cannot trust APP_BASE_URL", () => {
    // Mutation caught: defaulting to a request-derived Origin or clearing when the sole logout config is malformed.
    const restoreEnvironment = preserveLogoutEnvironment();
    try {
      setValidLogoutOriginWithUnrelatedAdminEnvironment("absent");
      vi.stubEnv("APP_BASE_URL", "not-a-trusted-application-url");

      const response = handleAdminLogoutRoute(
        new Request(`${appBaseUrl}/api/admin/auth/logout`, {
          method: "POST",
          headers: { origin: appBaseUrl },
        }),
        getAdminLogoutRuntime,
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
    } finally {
      restoreEnvironment();
    }
  });
});
