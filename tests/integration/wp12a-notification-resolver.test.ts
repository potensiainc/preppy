import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import * as schema from "@/src/db/schema";
import {
  TransactionManager,
  type RuntimeDrizzleDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { resolveOpportunityChangeEvent } from "@/src/modules/notification/resolver.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
import { Wp12aFixtures } from "@/tests/support/wp12a-fixtures";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const client = postgres(databaseUrl, { max: 5 });
const database = drizzle(client, { schema }) as RuntimeDrizzleDatabase;
const transactions = new TransactionManager(database);
const sql = postgres(databaseUrl, { max: 4 });
const lockClient = postgres(databaseUrl, { max: 1 });
const fixtures = new Wp12aFixtures(sql);

describe("WP-12A OpportunityChange notification resolver", () => {
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

  it("uses inclusive activation and exclusive deactivation at signal time without retroactive recipients", async () => {
    const signal = await fixtures.createSignal();
    const before = await fixtures.createFollow({
      institutionId: signal.institutionId,
      activatedAt: new Date(signal.signalTime.getTime() - 10),
    });
    const exactly = await fixtures.createFollow({
      institutionId: signal.institutionId,
      activatedAt: signal.signalTime,
    });
    await fixtures.createFollow({
      institutionId: signal.institutionId,
      activatedAt: new Date(signal.signalTime.getTime() + 1),
    });
    await fixtures.createFollow({
      institutionId: signal.institutionId,
      activatedAt: new Date(signal.signalTime.getTime() - 10),
      deactivatedAt: signal.signalTime,
    });

    const result = await resolveOpportunityChangeEvent(transactions, {
      eventId: signal.outboxId,
      opportunityChangeId: signal.changeId,
      workerId: "worker-resolver",
      now: new Date("2026-08-24T02:00:00.000Z"),
    });
    await fixtures.discoverGeneratedIds(signal.changeId);

    expect(result).toMatchObject({ createdNotification: true, deliveries: 2 });
    const deliveries = await sql<{ user_id: string; status: string }[]>`
      select user_id, status from notification_deliveries
      where notification_id=${result.notificationId} order by user_id`;
    expect(deliveries.map((delivery) => delivery.user_id).sort()).toEqual(
      [before.userId, exactly.userId].sort(),
    );
    expect(deliveries.every((delivery) => delivery.status === "QUEUED")).toBe(
      true,
    );
    const [source] = await sql<{ status: string; processed_at: Date | null }[]>`
      select status, processed_at from outbox_events where id=${signal.outboxId}`;
    expect(source).toMatchObject({ status: "PROCESSED" });
    expect(source!.processed_at).not.toBeNull();
  });

  it("dedupes Notification, Delivery, and send Outbox across a resolver retry", async () => {
    const signal = await fixtures.createSignal();
    await fixtures.createFollow({
      institutionId: signal.institutionId,
      activatedAt: new Date(signal.signalTime.getTime() - 1),
    });
    const first = await resolveOpportunityChangeEvent(transactions, {
      eventId: signal.outboxId,
      opportunityChangeId: signal.changeId,
      workerId: "worker-resolver",
      now: new Date("2026-08-24T02:00:00.000Z"),
    });
    await fixtures.discoverGeneratedIds(signal.changeId);
    await sql`update outbox_events set status='PROCESSING', processed_at=null,
      locked_at=${new Date("2026-08-24T02:01:00.000Z")},
      locked_by='worker-resolver' where id=${signal.outboxId}`;
    const second = await resolveOpportunityChangeEvent(transactions, {
      eventId: signal.outboxId,
      opportunityChangeId: signal.changeId,
      workerId: "worker-resolver",
      now: new Date("2026-08-24T02:02:00.000Z"),
    });

    expect(second).toMatchObject({
      notificationId: first.notificationId,
      createdNotification: false,
      deliveries: 1,
    });
    const [counts] = await sql<
      { notifications: number; deliveries: number; send_work: number }[]
    >`
      select
        (select count(*)::int from notifications where opportunity_change_id=${signal.changeId}) notifications,
        (select count(*)::int from notification_deliveries where notification_id=${first.notificationId}) deliveries,
        (select count(*)::int from outbox_events where event_type='DELIVERY_EMAIL_SEND'
          and aggregate_id in (select id from notification_deliveries where notification_id=${first.notificationId})) send_work`;
    expect(counts).toEqual({ notifications: 1, deliveries: 1, send_work: 1 });
  });

  it("rolls back materialization and source completion when resolver work fails", async () => {
    const signal = await fixtures.createSignal();
    await fixtures.createFollow({
      institutionId: signal.institutionId,
      activatedAt: new Date(signal.signalTime.getTime() - 1),
    });
    await expect(
      resolveOpportunityChangeEvent(
        transactions,
        {
          eventId: signal.outboxId,
          opportunityChangeId: signal.changeId,
          workerId: "worker-resolver",
          now: new Date("2026-08-24T02:00:00.000Z"),
        },
        { beforeComplete: () => Promise.reject(new Error("injected")) },
      ),
    ).rejects.toThrow("injected");

    const [counts] = await sql<
      {
        notifications: number;
        deliveries: number;
        send_work: number;
        source_status: string;
      }[]
    >`
      select
        (select count(*)::int from notifications where opportunity_change_id=${signal.changeId}) notifications,
        (select count(*)::int from notification_deliveries delivery
          join notifications notification on notification.id=delivery.notification_id
          where notification.opportunity_change_id=${signal.changeId}) deliveries,
        (select count(*)::int from outbox_events where event_type='DELIVERY_EMAIL_SEND'
          and payload->>'deliveryId' in (select delivery.id::text from notification_deliveries delivery
            join notifications notification on notification.id=delivery.notification_id
            where notification.opportunity_change_id=${signal.changeId})) send_work,
        (select status from outbox_events where id=${signal.outboxId}) source_status`;
    expect(counts).toEqual({
      notifications: 0,
      deliveries: 0,
      send_work: 0,
      source_status: "PROCESSING",
    });
  });

  it("persists no raw email outside UserEmail during resolution", async () => {
    const signal = await fixtures.createSignal();
    const follower = await fixtures.createFollow({
      institutionId: signal.institutionId,
      activatedAt: new Date(signal.signalTime.getTime() - 1),
    });
    const rawEmail = await fixtures.enableEmail(follower.userId);
    const result = await resolveOpportunityChangeEvent(transactions, {
      eventId: signal.outboxId,
      opportunityChangeId: signal.changeId,
      workerId: "worker-resolver",
      now: new Date("2026-08-24T02:00:00.000Z"),
    });
    await fixtures.discoverGeneratedIds(signal.changeId);
    const [serialized] = await sql<{ data: string }[]>`
      select concat_ws('|', notification::text, delivery::text, event::text) data
      from notifications notification
      join notification_deliveries delivery on delivery.notification_id=notification.id
      join outbox_events event on event.aggregate_id=delivery.id
      where notification.id=${result.notificationId}`;
    expect(serialized!.data).not.toContain(rawEmail);
  });
});
