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

const nextCookieBoundary = vi.hoisted(() => ({
  adminSession: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get(name: string) {
      return name === "preppy_admin_session" &&
        nextCookieBoundary.adminSession !== undefined
        ? { value: nextCookieBoundary.adminSession }
        : undefined;
    },
  }),
}));

import { POST as postNoChangeRoute } from "@/app/api/admin/monitoring/sources/[sourceId]/no-change/route";
import { ConflictError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  requireCurrentAdmin,
  type AdminCookieReader,
} from "@/src/modules/admin/auth/current-admin.server";
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionCookie,
} from "@/src/modules/admin/auth/session.server";
import { handleAdminNoChangeRequest } from "@/src/modules/admin/http/no-change.server";
import {
  confirmNoChange,
  defaultSourceCommandPersistence,
} from "@/src/modules/monitoring/source-commands.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const appBaseUrl = "https://preppy.example";
const sessionSecret = "admin-session-secret-that-is-at-least-thirty-two-bytes";
const prefix = `wp11-no-change-${randomUUID()}`;
const sessionNow = new Date("2026-08-24T10:00:00.000Z");
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 6,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

type Fixture = Readonly<{
  adminUserId: string;
  sourceId: string;
  institutionId: string;
  opportunityId: string;
  opportunityVersionId: string;
}>;

async function insertFixture(): Promise<Fixture> {
  const adminUserId = randomUUID();
  const sourceId = randomUUID();
  const institutionId = randomUUID();
  const opportunityId = randomUUID();
  const opportunityVersionId = randomUUID();
  await runtime.client`
    insert into admin_users (
      id, external_auth_subject, email, display_name, status
    ) values (
      ${adminUserId}, ${`${prefix}-admin-${adminUserId}`},
      ${`${prefix}-${adminUserId}@example.test`}, 'WP-11 Operator', 'ACTIVE'
    )
  `;
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${institutionId}, ${`${prefix}-institution-${institutionId}`},
      'WP-11 Institution', 'ENGLISH_KINDERGARTEN', 'ACTIVE', 'DRAFT'
    )
  `;
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${sourceId}, ${`https://official.example.test/${prefix}/${sourceId}`},
      'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP-11 Source'
    )
  `;
  await runtime.client`
    insert into source_monitor_configs (
      source_id, collection_strategy, monitoring_profile, is_enabled
    ) values (${sourceId}, 'MANUAL', 'MANUAL', true)
  `;
  await runtime.client`
    insert into institution_source_bindings (
      institution_id, source_id, role, is_primary, is_active
    ) values (${institutionId}, ${sourceId}, 'OFFICIAL_MAIN', true, true)
  `;
  await runtime.client`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode, publication_state
    ) values (
      ${opportunityId}, ${institutionId},
      ${`${prefix}-opportunity-${opportunityId}`}, 'APPLICATION', 'NATIVE', 'DRAFT'
    )
  `;
  await runtime.client`
    insert into opportunity_versions (
      id, opportunity_id, version_number, verification_state, business_state,
      is_current, title, verified_at
    ) values (
      ${opportunityVersionId}, ${opportunityId}, 1, 'VERIFIED', 'OPEN', true,
      'Current truth', '2026-08-01T00:00:00.000Z'
    )
  `;
  await runtime.client`
    insert into opportunity_source_bindings (
      opportunity_id, source_id, role, is_primary, is_active
    ) values (${opportunityId}, ${sourceId}, 'PRIMARY_NOTICE', true, true)
  `;
  return {
    adminUserId,
    sourceId,
    institutionId,
    opportunityId,
    opportunityVersionId,
  };
}

function cookieReader(value: string | undefined): AdminCookieReader {
  return {
    get(name) {
      return name === ADMIN_SESSION_COOKIE_NAME && value !== undefined
        ? { value }
        : undefined;
    },
  };
}

function adminCookie(adminUserId: string, now = sessionNow): string {
  return createAdminSessionCookie(adminUserId, {
    secret: sessionSecret,
    now,
    production: true,
  }).value;
}

function mutationRequest(
  body: unknown,
  options: { cookie?: string; origin?: string; rawBody?: string } = {},
): Request {
  return new Request(
    `${appBaseUrl}/api/admin/monitoring/sources/source/no-change`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: options.origin ?? appBaseUrl,
        ...(options.cookie === undefined
          ? {}
          : {
              cookie: `${ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(options.cookie)}`,
            }),
      },
      body: options.rawBody ?? JSON.stringify(body),
    },
  );
}

function handlerDependencies(cookie: string | undefined) {
  return {
    requireCurrentAdmin: () =>
      requireCurrentAdmin({
        cookieStore: cookieReader(cookie),
        executor: runtime.executor,
        sessionSecret,
        now: sessionNow,
      }),
    getAppBaseUrl: () => appBaseUrl,
    confirmNoChange: (
      context: Parameters<typeof confirmNoChange>[0],
      input: unknown,
    ) =>
      confirmNoChange(context, input, {
        transactionManager: runtime.transactionManager,
      }),
  };
}

async function effectCounts(fixture: Fixture) {
  const [counts] = await runtime.client<
    {
      observations: number;
      audits: number;
      versions: number;
      facts: number;
      changes: number;
      outbox: number;
      notifications: number;
      deliveries: number;
    }[]
  >`
    select
      (select count(*)::int from source_observations where source_id = ${fixture.sourceId}) as observations,
      (select count(*)::int from audit_logs where entity_type = 'SOURCE' and entity_id = ${fixture.sourceId}) as audits,
      (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId}) as versions,
      (select count(*)::int
        from institution_fact_versions v
        join institution_facts f on f.id = v.institution_fact_id
        where f.institution_id = ${fixture.institutionId}) as facts,
      (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
      (select count(*)::int from outbox_events where aggregate_id in (${fixture.opportunityId}, ${fixture.institutionId}, ${fixture.sourceId})) as outbox,
      (select count(*)::int from notifications where opportunity_id = ${fixture.opportunityId}) as notifications,
      (select count(*)::int from notification_deliveries d
        join notifications n on n.id = d.notification_id
        where n.opportunity_id = ${fixture.opportunityId}) as deliveries
  `;
  return counts!;
}

async function cleanup(): Promise<void> {
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`
      delete from audit_logs
      where entity_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from source_observations
      where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from opportunity_source_bindings
      where opportunity_id in (select id from opportunities where slug like ${`${prefix}-%`})
    `;
    await transaction`
      delete from institution_source_bindings
      where institution_id in (select id from institutions where slug like ${`${prefix}-%`})
    `;
    await transaction`
      delete from opportunity_versions
      where opportunity_id in (select id from opportunities where slug like ${`${prefix}-%`})
    `;
    await transaction`delete from opportunities where slug like ${`${prefix}-%`}`;
    await transaction`
      delete from source_monitor_configs
      where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
    `;
    await transaction`delete from institutions where slug like ${`${prefix}-%`}`;
    await transaction`
      delete from admin_users where external_auth_subject like ${`${prefix}-%`}
    `;
  });
}

beforeAll(async () => {
  vi.stubEnv("APP_BASE_URL", appBaseUrl);
  vi.stubEnv("ADMIN_AUTH_ISSUER", "https://issuer.example/tenant");
  vi.stubEnv("ADMIN_AUTH_CLIENT_ID", "fixed-admin-client");
  vi.stubEnv(
    "ADMIN_AUTH_CLIENT_SECRET",
    "admin-client-secret-that-is-at-least-thirty-two-bytes",
  );
  vi.stubEnv("ADMIN_SESSION_SECRET", sessionSecret);
  vi.stubEnv(
    "ADMIN_OIDC_FLOW_SECRET",
    "admin-flow-secret-that-is-distinct-and-at-least-thirty-two-bytes",
  );
  vi.stubEnv("USER_SESSION_SECRET", undefined);
  vi.stubEnv("OAUTH_STATE_SECRET", undefined);
  vi.stubEnv("FOLLOW_INTENT_SECRET", undefined);
  vi.stubEnv("DATABASE_URL", databaseUrl);
  vi.stubEnv("DATABASE_MAX_CONNECTIONS", "6");
  vi.stubEnv("NODE_ENV", "test");
  await schemaLockSql`
    select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
  `;
  try {
    await migrateDatabase(databaseUrl);
  } finally {
    await schemaLockSql`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
  }
});

afterEach(async () => {
  nextCookieBoundary.adminSession = undefined;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closeRuntimeDatabase();
  await schemaLockSql.end({ timeout: 5 });
  vi.unstubAllEnvs();
});

describe("WP-11 Admin Confirm No Change HTTP adapter", () => {
  it("runs the actual Route with default auth and canonical command composition, then denies a newly DISABLED Admin", async () => {
    // Mutation caught: the Route silently swaps in a fake guard/command or skips the next-request ACTIVE lookup.
    const fixture = await insertFixture();
    nextCookieBoundary.adminSession = adminCookie(
      fixture.adminUserId,
      new Date(),
    );
    const before = await effectCounts(fixture);

    const response = await postNoChangeRoute(
      mutationRequest(
        { note: "Production-composed official check." },
        { cookie: nextCookieBoundary.adminSession },
      ),
      { params: Promise.resolve({ sourceId: fixture.sourceId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        sourceId: fixture.sourceId,
        observationId: expect.stringMatching(/^[1-9]\d*$/),
      },
      correlationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    });
    expect(await effectCounts(fixture)).toEqual({
      ...before,
      observations: 1,
      audits: 1,
    });
    const [observation] = await runtime.client<
      { source_id: string; outcome: string; observed_at: string }[]
    >`
      select source_id, outcome, observed_at
      from source_observations where id = ${body.data.observationId}
    `;
    expect(observation).toMatchObject({
      source_id: fixture.sourceId,
      outcome: "UNCHANGED",
    });
    expect(new Date(observation!.observed_at).toISOString()).toBe(
      body.data.checkedAt,
    );
    const [audit] = await runtime.client<
      {
        action_type: string;
        admin_user_id: string;
        after_data: Record<string, unknown>;
      }[]
    >`
      select action_type, admin_user_id, after_data
      from audit_logs
      where entity_type = 'SOURCE' and entity_id = ${fixture.sourceId}
    `;
    expect(audit).toMatchObject({
      action_type: "WP10B_CONFIRM_NO_CHANGE",
      admin_user_id: fixture.adminUserId,
      after_data: {
        correlationId: body.correlationId,
        metadata: {
          sourceId: fixture.sourceId,
          observationId: body.data.observationId,
          outcomeCode: "UNCHANGED",
        },
      },
    });

    await runtime.client`
      update admin_users set status = 'DISABLED', updated_at = now()
      where id = ${fixture.adminUserId}
    `;
    const beforeDenied = await effectCounts(fixture);
    const denied = await postNoChangeRoute(
      mutationRequest({}, { cookie: nextCookieBoundary.adminSession }),
      { params: Promise.resolve({ sourceId: fixture.sourceId }) },
    );
    expect(denied.status).toBe(401);
    expect(await effectCounts(fixture)).toEqual(beforeDenied);
  });

  it("maps unknown and RETIRED Sources through the actual Route/default composition with zero write", async () => {
    // Mutation caught: Route wiring bypasses canonical NotFound/NotEligible behavior or writes before eligibility checks.
    const fixture = await insertFixture();
    nextCookieBoundary.adminSession = adminCookie(
      fixture.adminUserId,
      new Date(),
    );
    const beforeUnknown = await effectCounts(fixture);

    const unknown = await postNoChangeRoute(
      mutationRequest({}, { cookie: nextCookieBoundary.adminSession }),
      { params: Promise.resolve({ sourceId: randomUUID() }) },
    );
    expect(unknown.status).toBe(404);
    expect(await effectCounts(fixture)).toEqual(beforeUnknown);

    await runtime.client`
      update sources set lifecycle_status = 'RETIRED', updated_at = now()
      where id = ${fixture.sourceId}
    `;
    const beforeRetired = await effectCounts(fixture);
    const retired = await postNoChangeRoute(
      mutationRequest({}, { cookie: nextCookieBoundary.adminSession }),
      { params: Promise.resolve({ sourceId: fixture.sourceId }) },
    );
    expect(retired.status).toBe(403);
    expect(await effectCounts(fixture)).toEqual(beforeRetired);
  });

  it("commits exactly one UNCHANGED observation and Audit for a multiply-bound Source with zero product signals", async () => {
    const fixture = await insertFixture();
    const before = await effectCounts(fixture);
    expect(before).toEqual({
      observations: 0,
      audits: 0,
      versions: 1,
      facts: 0,
      changes: 0,
      outbox: 0,
      notifications: 0,
      deliveries: 0,
    });

    const response = await handleAdminNoChangeRequest(
      mutationRequest(
        { note: "Official Source reviewed." },
        { cookie: adminCookie(fixture.adminUserId) },
      ),
      { sourceId: fixture.sourceId },
      handlerDependencies(adminCookie(fixture.adminUserId)),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({
      data: {
        sourceId: fixture.sourceId,
        observationId: expect.stringMatching(/^[1-9]\d*$/),
        checkedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      },
      correlationId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    });
    expect(await effectCounts(fixture)).toEqual({
      ...before,
      observations: 1,
      audits: 1,
    });

    const observations = await runtime.client<
      { id: string; outcome: string; observed_at: string }[]
    >`
      select id::text, outcome, observed_at
      from source_observations where source_id = ${fixture.sourceId}
    `;
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      id: body.data.observationId,
      outcome: "UNCHANGED",
    });
    expect(new Date(observations[0]!.observed_at).toISOString()).toBe(
      body.data.checkedAt,
    );
    const [audit] = await runtime.client<
      { admin_user_id: string; after_data: Record<string, unknown> }[]
    >`
      select admin_user_id, after_data from audit_logs
      where entity_type = 'SOURCE' and entity_id = ${fixture.sourceId}
    `;
    expect(audit).toMatchObject({
      admin_user_id: fixture.adminUserId,
      after_data: {
        correlationId: body.correlationId,
        metadata: {
          sourceId: fixture.sourceId,
          observationId: body.data.observationId,
          outcomeCode: "UNCHANGED",
        },
      },
    });
  });

  it("writes nothing for missing session, wrong Origin, invalid path, malformed/strict-invalid body", async () => {
    const fixture = await insertFixture();
    const cookie = adminCookie(fixture.adminUserId);
    const cases = [
      {
        request: mutationRequest({}, {}),
        path: { sourceId: fixture.sourceId },
        deps: handlerDependencies(undefined),
        status: 401,
      },
      {
        request: mutationRequest(
          {},
          { cookie, origin: "https://evil.example" },
        ),
        path: { sourceId: fixture.sourceId },
        deps: handlerDependencies(cookie),
        status: 403,
      },
      {
        request: mutationRequest({}, { cookie }),
        path: { sourceId: "invalid" },
        deps: handlerDependencies(cookie),
        status: 400,
      },
      {
        request: mutationRequest({}, { cookie, rawBody: "{" }),
        path: { sourceId: fixture.sourceId },
        deps: handlerDependencies(cookie),
        status: 400,
      },
      {
        request: mutationRequest({ sourceId: fixture.sourceId }, { cookie }),
        path: { sourceId: fixture.sourceId },
        deps: handlerDependencies(cookie),
        status: 400,
      },
    ];

    const before = await effectCounts(fixture);
    for (const item of cases) {
      const response = await handleAdminNoChangeRequest(
        item.request,
        item.path,
        item.deps,
      );
      expect(response.status).toBe(item.status);
      expect(await effectCounts(fixture)).toEqual(before);
    }
  });

  it("rechecks ACTIVE on every request and denies the next request before command delegation", async () => {
    const fixture = await insertFixture();
    const cookie = adminCookie(fixture.adminUserId);
    const canonicalCommand = vi.fn((context, input) =>
      confirmNoChange(context, input, {
        transactionManager: runtime.transactionManager,
      }),
    );
    const deps = {
      ...handlerDependencies(cookie),
      confirmNoChange: canonicalCommand,
    };

    const first = await handleAdminNoChangeRequest(
      mutationRequest({}, { cookie }),
      { sourceId: fixture.sourceId },
      deps,
    );
    expect(first.status).toBe(200);
    await runtime.client`
      update admin_users set status = 'DISABLED', updated_at = now()
      where id = ${fixture.adminUserId}
    `;

    const beforeSecond = await effectCounts(fixture);
    const second = await handleAdminNoChangeRequest(
      mutationRequest({}, { cookie }),
      { sourceId: fixture.sourceId },
      deps,
    );
    expect(second.status).toBe(401);
    expect(canonicalCommand).toHaveBeenCalledTimes(1);
    expect(await effectCounts(fixture)).toEqual(beforeSecond);
  });

  it("returns safe generic 409 and writes nothing when the canonical command conflicts", async () => {
    const fixture = await insertFixture();
    const cookie = adminCookie(fixture.adminUserId);
    const before = await effectCounts(fixture);
    const response = await handleAdminNoChangeRequest(
      mutationRequest({}, { cookie }),
      { sourceId: fixture.sourceId },
      {
        ...handlerDependencies(cookie),
        confirmNoChange: vi.fn(async () => {
          throw new ConflictError();
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      error: {
        code: "CONFLICT",
        message:
          "다른 운영자가 먼저 변경했을 수 있습니다. 최신 데이터를 다시 확인한 뒤 변경 여부를 판단해주세요.",
      },
    });
    expect(await effectCounts(fixture)).toEqual(before);
  });

  it("keeps the root transaction atomic when Audit persistence fails", async () => {
    const fixture = await insertFixture();
    const cookie = adminCookie(fixture.adminUserId);
    const before = await effectCounts(fixture);
    const response = await handleAdminNoChangeRequest(
      mutationRequest({}, { cookie }),
      { sourceId: fixture.sourceId },
      {
        ...handlerDependencies(cookie),
        confirmNoChange: (context, input) =>
          confirmNoChange(context, input, {
            transactionManager: runtime.transactionManager,
            persistence: {
              ...defaultSourceCommandPersistence,
              writeAudit: async () => {
                throw new Error("forced SQL raw-payload rollback failure");
              },
            },
          }),
      },
    );
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).not.toMatch(/SQL|raw-payload|rollback failure/i);
    expect(await effectCounts(fixture)).toEqual(before);
  });
});
