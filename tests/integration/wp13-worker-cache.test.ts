import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { NoopAnalyticsTracker } from "@/src/analytics/tracker";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { runWorkerOnce } from "@/src/modules/worker/run-once.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const lock = postgres(databaseUrl, { max: 1 });
const prefix = `wp13-worker-${randomUUID()}`;
const adminIds = new Set<string>();

async function seed() {
  const adminId = randomUUID(),
    articleId = randomUUID(),
    eventId = randomUUID();
  adminIds.add(adminId);
  await runtime.client`insert into admin_users(id, external_auth_subject, email, display_name, status) values (${adminId}, ${`${prefix}-${adminId}`}, ${`${adminId}@example.test`}, 'Worker Admin', 'ACTIVE')`;
  await runtime.client`insert into articles(id, slug, type, category, status, title, content_html, robots_index, robots_follow, author_admin_id) values (${articleId}, ${`${prefix}-article`}, 'GUIDE', 'ADMISSIONS_GENERAL', 'DRAFT', 'Worker Article', '', false, true, ${adminId})`;
  const payload = {
    version: 1,
    articleId,
    reason: "ARTICLE_PUBLISHED",
    currentCanonicalPath: `/${"articles"}/${prefix}-article`,
    relatedInstitutionIds: [],
    relatedOpportunityIds: [],
  };
  await runtime.client`insert into outbox_events(id, event_type, aggregate_type, aggregate_id, payload, dedupe_key, status, available_at, max_attempts) values (${eventId}, 'CACHE_REVALIDATION_REQUESTED', 'ARTICLE', ${articleId}, ${JSON.stringify(payload)}::jsonb, ${`${prefix}-${eventId}`}, 'PENDING', '2026-08-25T12:00:00.000Z', 3)`;
  return { articleId, eventId };
}

async function cleanup() {
  await runtime.client`delete from outbox_events where dedupe_key like ${`${prefix}%`}`;
  await runtime.client`delete from articles where slug like ${`${prefix}%`}`;
  if (adminIds.size)
    await runtime.client`delete from admin_users where id in ${runtime.client([...adminIds])}`;
  adminIds.clear();
}
beforeAll(async () => {
  await lock`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
  await migrateDatabase(databaseUrl);
});
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await lock`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
  await lock.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("WP-13 Worker cache lifecycle", () => {
  it("commits claim, performs network outside a transaction, then commits settlement", async () => {
    const fixture = await seed();
    let active = false;
    const transactionManager = {
      run: async <T>(
        operation: Parameters<typeof runtime.transactionManager.run<T>>[0],
      ) => {
        expect(active).toBe(false);
        active = true;
        try {
          return await runtime.transactionManager.run(operation);
        } finally {
          active = false;
        }
      },
    };
    const cacheRevalidator = {
      revalidate: async () => {
        expect(active).toBe(false);
        return { kind: "SUCCEEDED" as const };
      },
    };
    const result = await runWorkerOnce(
      {
        enabled: true,
        emailSendEnabled: false,
        cacheRevalidationEnabled: true,
        workerId: "worker-cache",
        batchSize: 10,
        leaseDurationMs: 300_000,
        now: new Date("2026-08-25T12:00:00.000Z"),
      },
      {
        transactionManager,
        sender: {
          provider: "FAKE",
          send: async () => {
            throw new Error("email forbidden");
          },
        },
        tracker: new NoopAnalyticsTracker(),
        cacheRevalidator,
      },
    );
    expect(result).toMatchObject({ claimed: 1, processed: 1, failed: 0 });
    const [row] = await runtime.client<
      { status: string }[]
    >`select status from outbox_events where id=${fixture.eventId}`;
    expect(row?.status).toBe("PROCESSED");
  });

  it("leaves cache events untouched when the cache capability is disabled", async () => {
    const fixture = await seed();
    let cacheCalls = 0;
    const result = await runWorkerOnce(
      {
        enabled: true,
        emailSendEnabled: false,
        cacheRevalidationEnabled: false,
        workerId: "worker-cache-disabled",
        batchSize: 10,
        leaseDurationMs: 300_000,
        now: new Date("2026-08-25T12:00:00.000Z"),
      },
      {
        transactionManager: runtime.transactionManager,
        sender: {
          provider: "FAKE",
          send: async () => {
            throw new Error("email forbidden");
          },
        },
        tracker: new NoopAnalyticsTracker(),
        cacheRevalidator: {
          revalidate: async () => {
            cacheCalls += 1;
            return { kind: "SUCCEEDED" as const };
          },
        },
      },
    );
    expect(result).toMatchObject({ claimed: 0, processed: 0, failed: 0 });
    expect(cacheCalls).toBe(0);
    const [row] = await runtime.client<
      { status: string; attemptCount: number }[]
    >`select status, attempt_count as "attemptCount" from outbox_events where id=${fixture.eventId}`;
    expect(row).toEqual({ status: "PENDING", attemptCount: 0 });
  });
});
