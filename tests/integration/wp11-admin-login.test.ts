import { randomUUID } from "node:crypto";

import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { handleAdminLoginCallbackRoute } from "@/src/modules/admin/auth/http.server";
import type { AdminAuthRuntime } from "@/src/modules/admin/auth/runtime.server";
import {
  ADMIN_OIDC_NONCE_COOKIE_NAME,
  ADMIN_OIDC_PKCE_COOKIE_NAME,
  ADMIN_OIDC_STATE_COOKIE_NAME,
  createAdminOidcFlowCookies,
} from "@/src/modules/admin/auth/flow-cookie.server";
import { requireActiveAdminByExternalSubject } from "@/src/modules/admin/auth/repository.server";
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionCookie,
  readAdminSession,
} from "@/src/modules/admin/auth/session.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const appBaseUrl = "https://preppy.example";
const issuer = "https://issuer.example/tenant";
const flowSecret = "admin-flow-secret-that-is-at-least-thirty-two-bytes";
const sessionSecret = "admin-session-secret-that-is-at-least-thirty-two-bytes";
const prefix = `wp-11-admin-login-${randomUUID()}-`;
const now = new Date("2026-08-24T07:08:09.000Z");
const runtimeDatabase = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 8,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

type AdminStatus = "ACTIVE" | "DISABLED";

async function createAdminFixture(options: {
  suffix: string;
  status: AdminStatus;
}): Promise<{ adminUserId: string; subject: string }> {
  const adminUserId = randomUUID();
  const subject = `${prefix}${options.suffix}`;
  await runtimeDatabase.client`
    insert into admin_users (
      id, external_auth_subject, email, display_name, status
    ) values (
      ${adminUserId}, ${subject}, ${`${prefix}${options.suffix}@example.test`},
      ${`WP-11 ${options.suffix}`}, ${options.status}
    )
  `;
  return { adminUserId, subject };
}

function flow() {
  return createAdminOidcFlowCookies({
    secret: flowSecret,
    now,
    production: true,
  });
}

function callbackRequest(
  issued: ReturnType<typeof flow>,
  code = "provider-code-must-not-escape",
): Request {
  return new Request(
    `${appBaseUrl}/admin/auth/callback?state=${issued.state}&code=${code}`,
    {
      headers: {
        cookie: [
          `${ADMIN_OIDC_STATE_COOKIE_NAME}=${encodeURIComponent(issued.cookies.state.value)}`,
          `${ADMIN_OIDC_NONCE_COOKIE_NAME}=${encodeURIComponent(issued.cookies.nonce.value)}`,
          `${ADMIN_OIDC_PKCE_COOKIE_NAME}=${encodeURIComponent(issued.cookies.pkce.value)}`,
        ].join("; "),
      },
    },
  );
}

function responseCookieValue(response: Response, name: string): string | null {
  const match = response.headers
    .get("set-cookie")
    ?.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`));
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

function authRuntime(verifiedSubject: string): AdminAuthRuntime {
  const discovery = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    response_types_supported: ["code"],
    id_token_signing_alg_values_supported: ["RS256"],
  };
  return {
    config: {
      APP_BASE_URL: appBaseUrl,
      ADMIN_AUTH_ISSUER: issuer,
      ADMIN_AUTH_CLIENT_ID: "fixed-admin-client",
      ADMIN_AUTH_CLIENT_SECRET:
        "admin-client-secret-that-is-at-least-thirty-two-bytes",
      ADMIN_SESSION_SECRET: sessionSecret,
      ADMIN_OIDC_FLOW_SECRET: flowSecret,
      redirectUri: `${appBaseUrl}/admin/auth/callback`,
    },
    production: true,
    now: () => now,
    rateLimiter: {
      consume: () => ({
        allowed: true,
        remaining: 119,
        retryAfterSeconds: 0,
      }),
    },
    replayStore: {
      register: vi.fn(() => true),
      consume: vi.fn(() => "REGISTERED" as const),
    },
    createFlowCookies: () => flow(),
    loadDiscovery: vi.fn(async () => discovery),
    exchangeAuthorizationCode: vi.fn(async () => ({
      id_token: "raw-id-token-must-not-escape",
      token_type: "Bearer",
      sub: `${prefix}unverified-response-subject`,
      access_token: "access-token-must-not-escape",
      refresh_token: "refresh-token-must-not-escape",
    })),
    verifyIdToken: vi.fn(async () => ({
      sub: verifiedSubject,
      iss: issuer,
      aud: "fixed-admin-client",
      iat: Math.floor(now.getTime() / 1_000),
      exp: Math.floor(now.getTime() / 1_000) + 300,
    })),
    requireActiveAdmin: (subject) =>
      requireActiveAdminByExternalSubject(runtimeDatabase.executor, subject),
    createSessionCookie: (adminUserId, issuedAt) =>
      createAdminSessionCookie(adminUserId, {
        secret: sessionSecret,
        now: issuedAt,
        production: true,
      }),
  };
}

async function clearFixtures(): Promise<void> {
  await runtimeDatabase.client`
    delete from admin_users where external_auth_subject like ${`${prefix}%`}
  `;
}

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(88001105)`;
  try {
    await migrateDatabase(databaseUrl);
  } finally {
    await schemaLockSql`select pg_advisory_unlock(88001105)`;
  }
});

afterEach(clearFixtures);

afterAll(async () => {
  await clearFixtures();
  await closeRuntimeDatabase();
  await schemaLockSql.end({ timeout: 5 });
});

describe("WP-11 Admin login identity boundary", () => {
  it("issues an eight-hour session only for the ACTIVE row selected by verified sub", async () => {
    // Mutation caught: selecting raw token-response sub, returning identity data, or issuing a non-eight-hour session.
    const active = await createAdminFixture({
      suffix: "active",
      status: "ACTIVE",
    });
    await createAdminFixture({
      suffix: "unverified-response-subject",
      status: "DISABLED",
    });
    const issued = flow();
    const runtime = authRuntime(active.subject);

    const response = await handleAdminLoginCallbackRoute(
      callbackRequest(issued),
      () => runtime,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin");
    expect(
      readAdminSession(
        responseCookieValue(response, ADMIN_SESSION_COOKIE_NAME),
        { secret: sessionSecret, now },
      ),
    ).toEqual({
      version: 1,
      adminUserId: active.adminUserId,
      issuedAt: Math.floor(now.getTime() / 1_000),
      expiresAt: Math.floor(now.getTime() / 1_000) + 28_800,
    });
    const serializedResponse = `${response.headers.get("set-cookie") ?? ""}${await response.text()}`;
    expect(serializedResponse).not.toContain(active.subject);
    expect(serializedResponse).not.toContain("raw-id-token-must-not-escape");
    expect(serializedResponse).not.toContain("access-token-must-not-escape");
    expect(serializedResponse).not.toContain("refresh-token-must-not-escape");
  });

  it("denies unknown and DISABLED verified subjects identically with no Admin write", async () => {
    // Mutation caught: provisioning an unknown subject, mutating DISABLED identity, or leaking which denial occurred.
    const disabled = await createAdminFixture({
      suffix: "disabled",
      status: "DISABLED",
    });
    const unknownSubject = `${prefix}unknown`;
    const before = await runtimeDatabase.client<
      {
        id: string;
        external_auth_subject: string;
        display_name: string;
        status: string;
        updated_at: Date;
      }[]
    >`
      select id, external_auth_subject, display_name, status, updated_at
      from admin_users
      where external_auth_subject like ${`${prefix}%`}
      order by id
    `;

    const disabledResponse = await handleAdminLoginCallbackRoute(
      callbackRequest(flow(), "disabled-provider-code"),
      () => authRuntime(disabled.subject),
    );
    const unknownResponse = await handleAdminLoginCallbackRoute(
      callbackRequest(flow(), "unknown-provider-code"),
      () => authRuntime(unknownSubject),
    );
    const disabledBody = await disabledResponse.text();
    const unknownBody = await unknownResponse.text();

    expect(disabledResponse.status).toBe(403);
    expect(unknownResponse.status).toBe(403);
    expect(unknownBody).toBe(disabledBody);
    expect(
      responseCookieValue(disabledResponse, ADMIN_SESSION_COOKIE_NAME),
    ).toBe(null);
    expect(
      responseCookieValue(unknownResponse, ADMIN_SESSION_COOKIE_NAME),
    ).toBe(null);
    for (const response of [disabledResponse, unknownResponse]) {
      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain(`${ADMIN_OIDC_STATE_COOKIE_NAME}=;`);
      expect(setCookie).toContain(`${ADMIN_OIDC_NONCE_COOKIE_NAME}=;`);
      expect(setCookie).toContain(`${ADMIN_OIDC_PKCE_COOKIE_NAME}=;`);
    }
    expect(disabledBody).not.toContain(disabled.subject);
    expect(unknownBody).not.toContain(unknownSubject);
    expect(disabledBody).not.toContain("disabled-provider-code");
    expect(unknownBody).not.toContain("unknown-provider-code");

    const after = await runtimeDatabase.client<
      {
        id: string;
        external_auth_subject: string;
        display_name: string;
        status: string;
        updated_at: Date;
      }[]
    >`
      select id, external_auth_subject, display_name, status, updated_at
      from admin_users
      where external_auth_subject like ${`${prefix}%`}
      order by id
    `;
    expect(after).toEqual(before);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      id: disabled.adminUserId,
      external_auth_subject: disabled.subject,
      status: "DISABLED",
    });
  });
});
