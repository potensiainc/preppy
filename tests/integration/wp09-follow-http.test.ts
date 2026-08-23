import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { NoopAnalyticsTracker } from "@/src/analytics/tracker";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { createUserSessionCookie } from "@/src/modules/auth/session.server";
import { activateFollow } from "@/src/modules/follow/activate-follow.server";
import { deactivateFollow } from "@/src/modules/follow/deactivate-follow.server";
import {
  createFollowDeleteHandler,
  createFollowPostHandler,
  createFollowStatusHandler,
} from "@/src/modules/follow/http.server";
import { getFollowStatus } from "@/src/modules/follow/status-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const appBaseUrl = "https://preppy.example";
const sessionSecret = "integration-session-secret-at-least-thirty-two-bytes";
const occurredAt = new Date("2026-08-23T09:10:11.000Z");
const tracker = new NoopAnalyticsTracker();
const userIds = new Set<string>();
const institutionIds = new Set<string>();
const opportunityIds = new Set<string>();
const sourceIds = new Set<string>();

async function createUser(
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED",
) {
  const id = randomUUID();
  userIds.add(id);
  await runtime.client`
    insert into users (id, status, activated_at)
    values (${id}, ${status}, ${status === "ACTIVE" ? occurredAt.toISOString() : null})
  `;
  return id;
}

async function createInstitution() {
  const id = randomUUID();
  const sourceId = randomUUID();
  const opportunityId = randomUUID();
  const versionId = randomUUID();
  institutionIds.add(id);
  sourceIds.add(sourceId);
  opportunityIds.add(opportunityId);
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into institutions (
        id, slug, display_name, category, publication_state, operational_state
      ) values (
        ${id}, ${`wp-09-http-${id}`}, 'WP-09 HTTP Institution',
        'ENGLISH_KINDERGARTEN', 'PUBLISHED', 'ACTIVE'
      )
    `;
    await transaction`
      insert into sources (
        id, canonical_url, source_type, authority_level, lifecycle_status, source_name
      ) values (
        ${sourceId}, ${`https://wp09-http-source.example.test/${sourceId}`},
        'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP-09 HTTP source'
      )
    `;
    await transaction`
      insert into source_monitor_configs (
        source_id, collection_strategy, monitoring_profile, is_enabled
      ) values (${sourceId}, 'HTTP', 'STANDARD_SEASONAL', true)
    `;
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state, published_at
      ) values (
        ${opportunityId}, ${id}, ${`wp-09-http-opportunity-${opportunityId}`},
        'APPLICATION', 'NATIVE', 'PUBLISHED', ${occurredAt.toISOString()}
      )
    `;
    await transaction`
      insert into opportunity_versions (
        id, opportunity_id, truth_mode, version_number, verification_state,
        business_state, is_current, title, verified_at
      ) values (
        ${versionId}, ${opportunityId}, 'NATIVE', 1, 'VERIFIED', 'OPEN', true,
        'WP-09 HTTP monitored opportunity', ${occurredAt.toISOString()}
      )
    `;
    await transaction`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, evidence_role
      ) values (${versionId}, ${sourceId}, 'PRIMARY')
    `;
  });
  return id;
}

function cookie(userId: string): string {
  const session = createUserSessionCookie(userId, {
    secret: sessionSecret,
    now: occurredAt,
    production: true,
  });
  return `${session.name}=${encodeURIComponent(session.value)}`;
}

function request(
  path: string,
  options: { method?: "POST" | "DELETE"; userId?: string; body?: unknown } = {},
) {
  return new Request(`${appBaseUrl}${path}`, {
    method: options.method,
    headers: {
      ...(options.method ? { origin: appBaseUrl } : {}),
      ...(options.userId ? { cookie: cookie(options.userId) } : {}),
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

const post = createFollowPostHandler({
  appBaseUrl,
  sessionSecret,
  now: () => occurredAt,
  activateFollow: (context, input) =>
    activateFollow(context, input, {
      transactionManager: runtime.transactionManager,
      tracker,
    }),
});
const remove = createFollowDeleteHandler({
  appBaseUrl,
  sessionSecret,
  now: () => occurredAt,
  deactivateFollow: (context, input) =>
    deactivateFollow(context, input, {
      transactionManager: runtime.transactionManager,
    }),
});
const status = createFollowStatusHandler({
  getStatus: (sessionCookie, institutionId) =>
    getFollowStatus(sessionCookie, institutionId, {
      executor: runtime.executor,
      sessionSecret,
      now: occurredAt,
    }),
});

async function clearFixtures() {
  const users = [...userIds];
  const institutions = [...institutionIds];
  const opportunities = [...opportunityIds];
  const sources = [...sourceIds];
  try {
    await runtime.client.begin(async (transaction) => {
      await transaction.unsafe("set local session_replication_role = replica");
      if (users.length > 0) {
        await transaction`delete from follow_episodes where follow_id in (
          select id from follows where user_id in ${transaction(users)}
        )`;
        await transaction`delete from follows where user_id in ${transaction(users)}`;
        await transaction`delete from users where id in ${transaction(users)}`;
      }
      if (opportunities.length > 0) {
        await transaction`delete from opportunity_version_evidence
          where opportunity_version_id in (
            select id from opportunity_versions where opportunity_id in ${transaction(opportunities)}
          )`;
        await transaction`delete from opportunity_versions
          where opportunity_id in ${transaction(opportunities)}`;
        await transaction`delete from opportunities where id in ${transaction(opportunities)}`;
      }
      if (institutions.length > 0) {
        await transaction`delete from institutions where id in ${transaction(institutions)}`;
      }
      if (sources.length > 0) {
        await transaction`delete from source_monitor_configs where source_id in ${transaction(sources)}`;
        await transaction`delete from sources where id in ${transaction(sources)}`;
      }
    });
  } finally {
    userIds.clear();
    institutionIds.clear();
    opportunityIds.clear();
    sourceIds.clear();
  }
}

describe("WP-09 Follow HTTP integration", () => {
  beforeAll(async () => {
    await schemaLockSql`
      select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
    `;
    await migrateDatabase(databaseUrl);
  });
  afterEach(clearFixtures);
  afterAll(async () => {
    await schemaLockSql`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
    await schemaLockSql.end({ timeout: 5 });
    await closeRuntimeDatabase();
  });

  it("round-trips activate/idempotent status/deactivate without deleting history", async () => {
    const userId = await createUser("ACTIVE");
    const institutionId = await createInstitution();

    const first = await post(
      request("/api/me/follows", {
        method: "POST",
        userId,
        body: { institutionId },
      }),
    );
    const retry = await post(
      request("/api/me/follows", {
        method: "POST",
        userId,
        body: { institutionId },
      }),
    );
    expect(first.status).toBe(200);
    expect((await first.json()).data).toMatchObject({
      institutionId,
      state: "ACTIVE",
      created: true,
      reactivated: false,
      activeFollowCount: 1,
    });
    expect((await retry.json()).data).toMatchObject({
      institutionId,
      state: "ACTIVE",
      created: false,
      reactivated: false,
      activeFollowCount: 1,
    });

    const active = await status(
      request(`/api/me/follows/status?institutionId=${institutionId}`, {
        userId,
      }),
    );
    expect(await active.json()).toEqual({
      data: { authenticated: true, following: true },
    });

    const deactivated = await remove(
      request(`/api/me/follows/${institutionId}`, {
        method: "DELETE",
        userId,
      }),
      institutionId,
    );
    expect(deactivated.status).toBe(204);
    const inactive = await status(
      request(`/api/me/follows/status?institutionId=${institutionId}`, {
        userId,
      }),
    );
    expect(await inactive.json()).toEqual({
      data: { authenticated: true, following: false },
    });
    await expect(
      runtime.client`select count(*)::int as count from follow_episodes where follow_id in (
        select id from follows where user_id = ${userId} and institution_id = ${institutionId}
      )`,
    ).resolves.toEqual([{ count: 1 }]);
  });

  it.each(["PENDING", "SUSPENDED", "DELETED"] as const)(
    "denies current DB %s sessions for POST, DELETE, and status",
    async (userState) => {
      const userId = await createUser(userState);
      const institutionId = await createInstitution();
      const activated = await post(
        request("/api/me/follows", {
          method: "POST",
          userId,
          body: { institutionId },
        }),
      );
      const deleted = await remove(
        request(`/api/me/follows/${institutionId}`, {
          method: "DELETE",
          userId,
        }),
        institutionId,
      );
      const current = await status(
        request(`/api/me/follows/status?institutionId=${institutionId}`, {
          userId,
        }),
      );

      expect([activated.status, deleted.status]).toEqual([403, 403]);
      expect((await activated.json()).error.code).toBe("USER_NOT_ACTIVE");
      expect((await deleted.json()).error.code).toBe("USER_NOT_ACTIVE");
      expect(await current.json()).toEqual({
        data: { authenticated: false, following: false },
      });
      await expect(
        runtime.client`select id from follows where user_id = ${userId}`,
      ).resolves.toHaveLength(0);
    },
  );
});
