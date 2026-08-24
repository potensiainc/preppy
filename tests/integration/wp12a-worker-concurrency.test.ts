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
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
import { Wp12aFixtures } from "@/tests/support/wp12a-fixtures";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const client = postgres(databaseUrl, { max: 8 });
const database = drizzle(client, { schema }) as RuntimeDrizzleDatabase;
const transactions = new TransactionManager(database);
const sql = postgres(databaseUrl, { max: 4 });
const lockClient = postgres(databaseUrl, { max: 1 });
const fixtures = new Wp12aFixtures(sql);
const cacheRevalidator = {
  revalidate: async () => ({ kind: "SUCCEEDED" as const }),
};

function config(workerId: string, now: Date) {
  return {
    enabled: true,
    emailSendEnabled: true,
    workerId,
    batchSize: 1,
    leaseDurationMs: 300_000,
    now,
  } as const;
}

describe("WP-12A worker concurrency", () => {
  beforeAll(async () => {
    await lockClient`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });
  afterEach(() => fixtures.cleanup());
  afterAll(async () => {
    await lockClient`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await lockClient.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
    await client.end({ timeout: 5 });
  });

  it("allows exactly one of two workers to resolve a single signal", async () => {
    const signal = await fixtures.createSignal({
      outboxStatus: "PENDING",
      attemptCount: 0,
    });
    const follower = await fixtures.createFollow({
      institutionId: signal.institutionId,
      activatedAt: new Date(signal.signalTime.getTime() - 1),
    });
    await fixtures.enableEmail(follower.userId);
    const now = new Date("2026-08-24T02:00:00.000Z");
    const sender = new FakeEmailSender([]);
    const dependencies = {
      transactionManager: transactions,
      sender,
      tracker: new TestAnalyticsTracker(),
      cacheRevalidator,
    };

    const results = await Promise.all([
      runWorkerOnce(config("worker-a", now), dependencies),
      runWorkerOnce(config("worker-b", now), dependencies),
    ]);
    await fixtures.discoverGeneratedIds(signal.changeId);
    expect(results.reduce((sum, result) => sum + result.claimed, 0)).toBe(1);
    const [counts] = await sql<
      { notifications: number; deliveries: number; send_work: number }[]
    >`
      select
        (select count(*)::int from notifications where opportunity_change_id=${signal.changeId}) notifications,
        (select count(*)::int from notification_deliveries delivery
          join notifications notification on notification.id=delivery.notification_id
          where notification.opportunity_change_id=${signal.changeId}) deliveries,
        (select count(*)::int from outbox_events where event_type='DELIVERY_EMAIL_SEND'
          and aggregate_id in (select delivery.id from notification_deliveries delivery
            join notifications notification on notification.id=delivery.notification_id
            where notification.opportunity_change_id=${signal.changeId})) send_work`;
    expect(counts).toEqual({ notifications: 1, deliveries: 1, send_work: 1 });
  });

  it("allows exactly one provider call when two workers race one send event", async () => {
    const signal = await fixtures.createSignal({
      outboxStatus: "PENDING",
      attemptCount: 0,
    });
    const follower = await fixtures.createFollow({
      institutionId: signal.institutionId,
      activatedAt: new Date(signal.signalTime.getTime() - 1),
    });
    await fixtures.enableEmail(follower.userId);
    const resolverSender = new FakeEmailSender([]);
    await runWorkerOnce(
      config("worker-resolver", new Date("2026-08-24T02:00:00.000Z")),
      {
        transactionManager: transactions,
        sender: resolverSender,
        tracker: new TestAnalyticsTracker(),
        cacheRevalidator,
      },
    );
    await fixtures.discoverGeneratedIds(signal.changeId);
    const sender = new FakeEmailSender([
      { kind: "ACCEPTED", provider: "FAKE", providerMessageId: "one-call" },
    ]);
    const now = new Date("2026-08-24T02:01:00.000Z");
    const dependencies = {
      transactionManager: transactions,
      sender,
      tracker: new TestAnalyticsTracker(),
      cacheRevalidator,
    };
    const results = await Promise.all([
      runWorkerOnce(config("worker-send-a", now), dependencies),
      runWorkerOnce(config("worker-send-b", now), dependencies),
    ]);

    expect(results.reduce((sum, result) => sum + result.claimed, 0)).toBe(1);
    expect(sender.snapshot()).toHaveLength(1);
    const [state] = await sql<{ deliveries: number; attempts: number }[]>`
      select
        (select count(*)::int from notification_deliveries delivery
          join notifications notification on notification.id=delivery.notification_id
          where notification.opportunity_change_id=${signal.changeId}
            and delivery.status='SENT') deliveries,
        (select count(*)::int from notification_delivery_attempts attempt
          join notification_deliveries delivery on delivery.id=attempt.notification_delivery_id
          join notifications notification on notification.id=delivery.notification_id
          where notification.opportunity_change_id=${signal.changeId}) attempts`;
    expect(state).toEqual({ deliveries: 1, attempts: 1 });
  });
});
