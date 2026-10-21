import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { TestAnalyticsTracker } from "@/src/analytics/tracker";
import { migrateDatabase } from "@/src/db/migrate";
import * as schema from "@/src/db/schema";
import {
  TransactionManager,
  type RuntimeDrizzleDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { FakeEmailSender } from "@/src/modules/notification/fake-email-sender.server";
import { runWorkerOnce } from "@/src/modules/worker/run-once.server";
import {
  readWorkerRunHealth,
  workerExitDecision,
} from "@/src/modules/worker/run-summary.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
import { Wp12aFixtures } from "@/tests/support/wp12a-fixtures";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const client = postgres(databaseUrl, { max: 4 });
const database = drizzle(client, { schema }) as RuntimeDrizzleDatabase;
const transactions = new TransactionManager(database);
const sql = postgres(databaseUrl, { max: 2 });
const lockClient = postgres(databaseUrl, { max: 1 });
const fixtures = new Wp12aFixtures(sql);
const cacheRevalidator = {
  revalidate: async () => ({ kind: "SUCCEEDED" as const }),
};

function config(emailSendEnabled: boolean, now: Date) {
  return {
    enabled: true,
    emailSendEnabled,
    cacheRevalidationEnabled: false,
    workerId: "worker-email-hold",
    batchSize: 10,
    leaseDurationMs: 300_000,
    now,
  } as const;
}

async function sendWork(changeId: string) {
  return sql<
    {
      eventStatus: string;
      attemptCount: number;
      deliveryStatus: string;
      attempts: number;
    }[]
  >`
    select event.status as "eventStatus", event.attempt_count as "attemptCount",
      delivery.status as "deliveryStatus",
      (select count(*)::int from notification_delivery_attempts
        where notification_delivery_id=delivery.id) as attempts
    from notification_deliveries delivery
    join notifications notification on notification.id=delivery.notification_id
    join outbox_events event on event.event_type='DELIVERY_EMAIL_SEND'
      and event.aggregate_id=delivery.id
    where notification.opportunity_change_id=${changeId}
    order by delivery.id`;
}

async function followedSignal(followers: number) {
  const signal = await fixtures.createSignal({
    outboxStatus: "PENDING",
    attemptCount: 0,
  });
  for (let index = 0; index < followers; index += 1) {
    const follower = await fixtures.createFollow({
      institutionId: signal.institutionId,
      activatedAt: new Date(signal.signalTime.getTime() - 1),
    });
    await fixtures.enableEmail(follower.userId);
  }
  return signal;
}

describe("worker email hold while sending is disabled", () => {
  beforeAll(async () => {
    await lockClient`select pg_advisory_lock(hashtext('preppy-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });
  afterEach(() => fixtures.cleanup());
  afterAll(async () => {
    await lockClient`select pg_advisory_unlock(hashtext('preppy-schema-tests'))`;
    await lockClient.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
    await client.end({ timeout: 5 });
  });

  it("resolves notifications but keeps email work pending, then sends it once enabled", async () => {
    const signal = await followedSignal(2);
    const sender = new FakeEmailSender([
      { kind: "ACCEPTED", provider: "FAKE", providerMessageId: "hold-1" },
      { kind: "ACCEPTED", provider: "FAKE", providerMessageId: "hold-2" },
    ]);
    const dependencies = {
      transactionManager: transactions,
      sender,
      tracker: new TestAnalyticsTracker(),
      cacheRevalidator,
    };

    const resolveRun = await runWorkerOnce(
      config(false, new Date("2026-08-24T02:00:00.000Z")),
      dependencies,
    );
    await fixtures.discoverGeneratedIds(signal.changeId);
    expect(resolveRun).toMatchObject({ claimed: 1, processed: 1, failed: 0 });

    const heldRun = await runWorkerOnce(
      config(false, new Date("2026-08-24T02:05:00.000Z")),
      dependencies,
    );
    expect(heldRun).toMatchObject({ claimed: 0, processed: 0, failed: 0 });
    expect(sender.snapshot()).toHaveLength(0);
    expect(await sendWork(signal.changeId)).toEqual([
      {
        eventStatus: "PENDING",
        attemptCount: 0,
        deliveryStatus: "QUEUED",
        attempts: 0,
      },
      {
        eventStatus: "PENDING",
        attemptCount: 0,
        deliveryStatus: "QUEUED",
        attempts: 0,
      },
    ]);
    const held = await readWorkerRunHealth(transactions, {
      runStartedAt: new Date("2026-08-24T02:05:00.000Z"),
      emailSendEnabled: false,
      cacheRevalidationEnabled: false,
    });
    expect(held.held.emailDelivery).toBeGreaterThanOrEqual(2);

    const sendRun = await runWorkerOnce(
      config(true, new Date("2026-08-24T02:10:00.000Z")),
      dependencies,
    );
    expect(sendRun).toMatchObject({ claimed: 2, processed: 2, failed: 0 });
    expect(sender.snapshot()).toHaveLength(2);
    expect(
      (await sendWork(signal.changeId)).map(
        ({ eventStatus, deliveryStatus, attempts }) => ({
          eventStatus,
          deliveryStatus,
          attempts,
        }),
      ),
    ).toEqual([
      { eventStatus: "PROCESSED", deliveryStatus: "SENT", attempts: 1 },
      { eventStatus: "PROCESSED", deliveryStatus: "SENT", attempts: 1 },
    ]);
    const health = await readWorkerRunHealth(transactions, {
      runStartedAt: new Date("2026-08-24T02:10:00.000Z"),
      emailSendEnabled: true,
      cacheRevalidationEnabled: false,
    });
    expect(workerExitDecision(sendRun, health)).toEqual({
      exitCode: 0,
      exitReason: "OK",
    });
  });

  it("exits non-zero when a run dead-letters email work", async () => {
    const signal = await followedSignal(1);
    const sender = new FakeEmailSender([
      {
        kind: "TERMINAL_FAILURE",
        provider: "FAKE",
        errorCode: "PROVIDER_REJECTED",
      },
    ]);
    const dependencies = {
      transactionManager: transactions,
      sender,
      tracker: new TestAnalyticsTracker(),
      cacheRevalidator,
    };
    await runWorkerOnce(
      config(true, new Date("2026-08-24T02:00:00.000Z")),
      dependencies,
    );
    await fixtures.discoverGeneratedIds(signal.changeId);
    const runStartedAt = new Date("2026-08-24T02:01:00.000Z");
    const result = await runWorkerOnce(
      config(true, runStartedAt),
      dependencies,
    );
    const health = await readWorkerRunHealth(transactions, {
      runStartedAt,
      emailSendEnabled: true,
      cacheRevalidationEnabled: false,
    });
    expect(result).toMatchObject({ failed: 0 });
    expect(health.deadLettered).toBeGreaterThanOrEqual(1);
    expect(workerExitDecision(result, health)).toEqual({
      exitCode: 3,
      exitReason: "DEAD_LETTERED",
    });
  });
});
