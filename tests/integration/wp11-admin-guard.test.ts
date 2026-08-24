import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getCurrentUser } from "@/src/application/current-user.server";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  requireCurrentAdmin,
  type AdminCookieReader,
} from "@/src/modules/admin/auth/current-admin.server";
import { requireActiveAdminByExternalSubject } from "@/src/modules/admin/auth/repository.server";
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionCookie,
} from "@/src/modules/admin/auth/session.server";
import {
  createUserSessionCookie,
  USER_SESSION_COOKIE_NAME,
} from "@/src/modules/auth/session.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp-11-admin-guard-${randomUUID()}-`;
const sessionSecret = "admin-session-secret-that-is-at-least-thirty-two-bytes";
const sharedCrossoverSecret =
  "test-only-shared-secret-that-is-at-least-thirty-two-bytes";
const now = new Date("2026-08-24T03:04:05.000Z");
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 8,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const trackedUserIds = new Set<string>();

type AdminStatus = "ACTIVE" | "DISABLED";

async function createAdminFixture(options: {
  status: AdminStatus;
  suffix: string;
  displayName?: string;
}): Promise<{ adminUserId: string; externalAuthSubject: string }> {
  const adminUserId = randomUUID();
  const externalAuthSubject = `${prefix}${options.suffix}`;
  await runtime.client`
    insert into admin_users (
      id, external_auth_subject, email, display_name, status
    ) values (
      ${adminUserId}, ${externalAuthSubject},
      ${`${options.suffix}@example.test`},
      ${options.displayName ?? "WP-11 Operator"}, ${options.status}
    )
  `;
  return { adminUserId, externalAuthSubject };
}

function cookieReader(
  values: Readonly<Record<string, string>>,
  requestedNames: string[] = [],
): AdminCookieReader {
  return {
    get(name) {
      requestedNames.push(name);
      const value = values[name];
      return value === undefined ? undefined : { value };
    },
  };
}

function guardDependencies(
  cookieStore: AdminCookieReader,
  secret = sessionSecret,
) {
  return {
    cookieStore,
    executor: runtime.executor,
    sessionSecret: secret,
    now,
  };
}

async function clearFixtures(): Promise<void> {
  if (trackedUserIds.size > 0) {
    await runtime.client`
      delete from users where id in ${runtime.client([...trackedUserIds])}
    `;
    trackedUserIds.clear();
  }
  await runtime.client`
    delete from admin_users where external_auth_subject like ${`${prefix}%`}
  `;
}

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(88001104)`;
  try {
    await migrateDatabase(databaseUrl);
  } finally {
    await schemaLockSql`select pg_advisory_unlock(88001104)`;
  }
});

afterEach(clearFixtures);

afterAll(async () => {
  await clearFixtures();
  await closeRuntimeDatabase();
  await schemaLockSql.end({ timeout: 5 });
});

describe("WP-11 Admin identity repository", () => {
  it("returns only the bounded principal for an existing ACTIVE verified subject", async () => {
    // Mutation caught: returning email/external subject/status or accepting a non-ACTIVE row.
    const active = await createAdminFixture({
      status: "ACTIVE",
      suffix: "active-subject",
      displayName: "Active Operator",
    });

    const principal = await requireActiveAdminByExternalSubject(
      runtime.executor,
      active.externalAuthSubject,
    );

    expect(principal).toEqual({
      adminUserId: active.adminUserId,
      displayName: "Active Operator",
    });
    expect(Object.keys(principal)).toEqual(["adminUserId", "displayName"]);
    expect(JSON.stringify(principal)).not.toContain(active.externalAuthSubject);
    expect(JSON.stringify(principal)).not.toContain("@example.test");
  });

  it("denies unknown and DISABLED subjects identically without provisioning or mutation", async () => {
    // Mutation caught: auto-provisioning, leaking subject/status distinctions, or enabling DISABLED login.
    const disabled = await createAdminFixture({
      status: "DISABLED",
      suffix: "disabled-subject",
    });
    const unknownSubject = `${prefix}unknown-subject`;
    const countBefore = await runtime.client<{ count: number }[]>`
      select count(*)::int as count
      from admin_users
      where external_auth_subject like ${`${prefix}%`}
    `;

    const disabledError = await requireActiveAdminByExternalSubject(
      runtime.executor,
      disabled.externalAuthSubject,
    ).catch((error: unknown) => error);
    const unknownError = await requireActiveAdminByExternalSubject(
      runtime.executor,
      unknownSubject,
    ).catch((error: unknown) => error);

    expect(disabledError).toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      message: "You do not have permission to perform this action.",
    });
    expect(unknownError).toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      message: "You do not have permission to perform this action.",
    });
    expect({
      code: (disabledError as { code: string }).code,
      status: (disabledError as { status: number }).status,
      message: (disabledError as Error).message,
    }).toEqual({
      code: (unknownError as { code: string }).code,
      status: (unknownError as { status: number }).status,
      message: (unknownError as Error).message,
    });
    expect((disabledError as Error).message).not.toContain(
      disabled.externalAuthSubject,
    );
    expect((unknownError as Error).message).not.toContain(unknownSubject);

    const countAfter = await runtime.client<{ count: number }[]>`
      select count(*)::int as count
      from admin_users
      where external_auth_subject like ${`${prefix}%`}
    `;
    expect(countAfter).toEqual(countBefore);
    const [stored] = await runtime.client<{ status: string }[]>`
      select status from admin_users where id = ${disabled.adminUserId}
    `;
    expect(stored).toEqual({ status: "DISABLED" });
  });
});

describe("WP-11 per-request current Admin guard", () => {
  it("reads only the Admin cookie, resolves by adminUserId, and returns two safe fields", async () => {
    // Mutation caught: reading the consumer cookie, resolving the session ID as external subject, or returning the DB row.
    const active = await createAdminFixture({
      status: "ACTIVE",
      suffix: "session-id-not-subject",
      displayName: "Session Operator",
    });
    const adminCookie = createAdminSessionCookie(active.adminUserId, {
      secret: sessionSecret,
      now,
    });
    const requestedNames: string[] = [];

    const principal = await requireCurrentAdmin(
      guardDependencies(
        cookieReader(
          {
            [ADMIN_SESSION_COOKIE_NAME]: adminCookie.value,
            [USER_SESSION_COOKIE_NAME]: "must-not-be-read",
          },
          requestedNames,
        ),
      ),
    );

    expect(requestedNames).toEqual([ADMIN_SESSION_COOKIE_NAME]);
    expect(principal).toEqual({
      adminUserId: active.adminUserId,
      displayName: "Session Operator",
    });
    expect(Object.keys(principal)).toEqual(["adminUserId", "displayName"]);
  });

  it("rechecks ACTIVE status and blocks the very next request with an unexpired cookie", async () => {
    // Mutation caught: treating the eight-hour cookie as an eight-hour authorization grant.
    const active = await createAdminFixture({
      status: "ACTIVE",
      suffix: "deactivate-next-request",
    });
    const adminCookie = createAdminSessionCookie(active.adminUserId, {
      secret: sessionSecret,
      now,
    });
    const dependencies = guardDependencies(
      cookieReader({ [ADMIN_SESSION_COOKIE_NAME]: adminCookie.value }),
    );

    await expect(requireCurrentAdmin(dependencies)).resolves.toMatchObject({
      adminUserId: active.adminUserId,
    });
    await runtime.client`
      update admin_users
      set status = 'DISABLED', updated_at = now()
      where id = ${active.adminUserId}
    `;
    await expect(requireCurrentAdmin(dependencies)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      status: 401,
      message: "Authentication is required.",
    });
  });

  it("rejects missing, tampered, unknown-ID, and renamed consumer sessions generically", async () => {
    // Mutation caught: trusting any encrypted consumer session or leaking why Admin authentication failed.
    const active = await createAdminFixture({
      status: "ACTIVE",
      suffix: "consumer-crossover",
    });
    const consumerCookie = createUserSessionCookie(active.adminUserId, {
      secret: sharedCrossoverSecret,
      now,
    });
    const unknownAdminCookie = createAdminSessionCookie(randomUUID(), {
      secret: sharedCrossoverSecret,
      now,
    });
    const cases = [
      cookieReader({}),
      cookieReader({ [ADMIN_SESSION_COOKIE_NAME]: "tampered" }),
      cookieReader({ [ADMIN_SESSION_COOKIE_NAME]: unknownAdminCookie.value }),
      cookieReader({
        [ADMIN_SESSION_COOKIE_NAME]: consumerCookie.value,
        [USER_SESSION_COOKIE_NAME]: consumerCookie.value,
      }),
      cookieReader({ [USER_SESSION_COOKIE_NAME]: consumerCookie.value }),
    ];

    for (const store of cases) {
      await expect(
        requireCurrentAdmin(guardDependencies(store, sharedCrossoverSecret)),
      ).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
        status: 401,
        message: "Authentication is required.",
      });
    }
  });

  it("never lets an Admin session authorize consumer code even when IDs and secrets coincide", async () => {
    // Mutation caught: consumer code sharing the Admin purpose/parser or accepting an Admin row as a User.
    const active = await createAdminFixture({
      status: "ACTIVE",
      suffix: "admin-crossover",
    });
    trackedUserIds.add(active.adminUserId);
    await runtime.client`
      insert into users (id, status) values (${active.adminUserId}, 'ACTIVE')
    `;
    const adminCookie = createAdminSessionCookie(active.adminUserId, {
      secret: sharedCrossoverSecret,
      now,
    });

    await expect(
      getCurrentUser(adminCookie.value, {
        executor: runtime.executor,
        secret: sharedCrossoverSecret,
        now,
      }),
    ).resolves.toBeNull();
  });
});
