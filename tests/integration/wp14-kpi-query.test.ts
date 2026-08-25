import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { getOperationalKpiSnapshot } from "@/src/analytics/kpi-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 2,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const ids = {
  users: Array.from({ length: 7 }, () => randomUUID()),
  institutions: Array.from({ length: 5 }, () => randomUUID()),
};

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(808014)`;
  await migrateDatabase(databaseUrl);
  await schemaLockSql`select pg_advisory_unlock(808014)`;
});

afterAll(async () => {
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`delete from consent_decisions where user_id = any(${ids.users}::uuid[])`;
    await transaction`delete from notification_preferences where user_id = any(${ids.users}::uuid[])`;
    await transaction`delete from user_emails where user_id = any(${ids.users}::uuid[])`;
    await transaction`delete from follows where user_id = any(${ids.users}::uuid[])`;
    await transaction`delete from users where id = any(${ids.users}::uuid[])`;
    await transaction`delete from institutions where id = any(${ids.institutions}::uuid[])`;
  });
  await closeRuntimeDatabase();
  await schemaLockSql.end();
});

describe.sequential("WP-14 canonical operational KPI query", () => {
  it("derives AMP, its exact denominator, and 30-day facts only from current DB truth", async () => {
    const asOf = new Date("2026-08-25T00:00:00.000Z");
    const [ampUser, revokedUser, disabledUser, bouncedUser] = ids.users;
    for (const [index, userId] of ids.users.entries()) {
      const status =
        index === 5 ? "PENDING" : index === 6 ? "DELETED" : "ACTIVE";
      await runtime.client`
        insert into users (id, status, created_at, activated_at, deleted_at)
        values (
          ${userId}, ${status},
          ${index === 4 || index === 6 ? "2026-06-01T00:00:00.000Z" : "2026-08-10T00:00:00.000Z"}::timestamptz,
          ${status === "ACTIVE" ? "2026-08-10T00:00:00.000Z" : null}::timestamptz,
          ${status === "DELETED" ? "2026-08-11T00:00:00.000Z" : null}::timestamptz
        )
      `;
    }
    for (const [index, institutionId] of ids.institutions.entries()) {
      await runtime.client`
        insert into institutions (id, slug, display_name, category)
        values (
          ${institutionId}, ${`wp14-kpi-${institutionId}`},
          ${`WP14 KPI ${index}`}, 'INTERNATIONAL_SCHOOL'
        )
      `;
    }

    const followRows = [
      [ampUser, ids.institutions[0], "2026-08-20T00:00:00.000Z"],
      [ampUser, ids.institutions[1], "2026-06-20T00:00:00.000Z"],
      [revokedUser, ids.institutions[2], "2026-08-21T00:00:00.000Z"],
      [disabledUser, ids.institutions[3], "2026-08-22T00:00:00.000Z"],
      [bouncedUser, ids.institutions[4], "2026-08-23T00:00:00.000Z"],
    ] as const;
    for (const [userId, institutionId, activatedAt] of followRows) {
      await runtime.client`
        insert into follows (
          id, user_id, institution_id, status, first_activated_at,
          current_activated_at
        ) values (
          ${randomUUID()}, ${userId}, ${institutionId}, 'ACTIVE',
          ${activatedAt}::timestamptz, ${activatedAt}::timestamptz
        )
      `;
    }

    for (const userId of [ampUser, revokedUser, disabledUser]) {
      await runtime.client`
        insert into user_emails (
          id, user_id, email, email_normalized, source,
          verification_state, delivery_state, verified_at
        ) values (
          ${randomUUID()}, ${userId}, ${`${userId}@example.test`},
          ${`${userId}@example.test`}, 'USER_INPUT', 'VERIFIED', 'USABLE',
          '2026-08-10T00:00:00.000Z'::timestamptz
        )
      `;
    }
    await runtime.client`
      insert into user_emails (
        id, user_id, email, email_normalized, source,
        verification_state, delivery_state, verified_at
      ) values (
        ${randomUUID()}, ${bouncedUser}, 'bounced@example.test',
        'bounced@example.test', 'USER_INPUT', 'VERIFIED', 'BOUNCED',
        '2026-08-10T00:00:00.000Z'::timestamptz
      )
    `;

    const beforeConsent = await getOperationalKpiSnapshot(
      runtime.executor,
      asOf,
    );
    expect(beforeConsent.activeMonitoringParents).toBe(0);
    expect(beforeConsent.averageActiveFollowsPerAmp).toBe(0);
    expect(beforeConsent.emailReadyFollowUsers).toBe(3);

    const decisions = [
      [
        "00000000-0000-4000-8000-000000000001",
        ampUser,
        "REVOKED",
        "2026-08-11T00:00:00.000Z",
      ],
      [
        "00000000-0000-4000-8000-000000000002",
        ampUser,
        "GRANTED",
        "2026-08-11T00:00:00.000Z",
      ],
      [randomUUID(), revokedUser, "GRANTED", "2026-08-10T00:00:00.000Z"],
      [randomUUID(), revokedUser, "REVOKED", "2026-08-11T00:00:00.000Z"],
      [randomUUID(), disabledUser, "GRANTED", "2026-08-11T00:00:00.000Z"],
      [randomUUID(), bouncedUser, "GRANTED", "2026-08-11T00:00:00.000Z"],
    ] as const;
    for (const [decisionId, userId, decision, decidedAt] of decisions) {
      await runtime.client`
        insert into consent_decisions (
          id, user_id, consent_type, policy_version, decision, decided_at
        ) values (
          ${decisionId}, ${userId}, 'SERVICE_EMAIL_UPDATES', 'wp14-test',
          ${decision}, ${decidedAt}::timestamptz
        )
      `;
    }
    for (const [userId, state] of [
      [ampUser, "ENABLED"],
      [revokedUser, "ENABLED"],
      [disabledUser, "DISABLED"],
      [bouncedUser, "ENABLED"],
    ] as const) {
      await runtime.client`
        insert into notification_preferences (user_id, channel, state)
        values (${userId}, 'EMAIL', ${state})
      `;
    }

    await expect(
      getOperationalKpiSnapshot(runtime.executor, asOf),
    ).resolves.toEqual({
      asOf: asOf.toISOString(),
      activeMonitoringParents: 1,
      activeUsers: 5,
      usersWithActiveFollow: 4,
      totalActiveFollows: 5,
      averageActiveFollowsPerAmp: 2,
      emailReadyFollowUsers: 3,
      newUsers30d: 5,
      newFollows30d: 4,
    });
  });
});
