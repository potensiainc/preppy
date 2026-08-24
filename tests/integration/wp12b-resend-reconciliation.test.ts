import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { TestAnalyticsTracker } from "@/src/analytics/tracker";
import { createAdminCommandContext } from "@/src/application/context";
import { migrateDatabase } from "@/src/db/migrate";
import * as schema from "@/src/db/schema";
import {
  TransactionManager,
  type RuntimeDrizzleDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { ResendEmailSender } from "@/src/modules/notification/resend-email-sender.server";
import { reconcileUnknownResendAttempt } from "@/src/modules/notification/reconcile-resend.server";
import { resolveOpportunityChangeEvent } from "@/src/modules/notification/resolver.server";
import { processEmailDelivery } from "@/src/modules/notification/send-delivery.server";
import { claimOutboxBatch } from "@/src/modules/outbox/transitions.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
import { Wp12aFixtures } from "@/tests/support/wp12a-fixtures";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const client = postgres(databaseUrl, { max: 6 });
const database = drizzle(client, { schema }) as RuntimeDrizzleDatabase;
const transactions = new TransactionManager(database);
const sql = postgres(databaseUrl, { max: 4 });
const lockClient = postgres(databaseUrl, { max: 1 });
const fixtures = new Wp12aFixtures(sql);
const adminIds = new Set<string>();

async function unknownResendDelivery(attemptedAt: Date) {
  const signal = await fixtures.createSignal({
    workerId: "wp12b-reconcile-resolver",
  });
  const follower = await fixtures.createFollow({
    institutionId: signal.institutionId,
    activatedAt: new Date(signal.signalTime.getTime() - 1),
  });
  await fixtures.enableEmail(follower.userId, { email: "stable@example.test" });
  const resolved = await resolveOpportunityChangeEvent(transactions, {
    eventId: signal.outboxId,
    opportunityChangeId: signal.changeId,
    workerId: "wp12b-reconcile-resolver",
    now: new Date("2026-08-24T02:00:00.000Z"),
  });
  await fixtures.discoverGeneratedIds(signal.changeId);
  const [delivery] = await sql<{ id: string }[]>`
    select id from notification_deliveries where notification_id=${resolved.notificationId}`;
  const [event] = await claimOutboxBatch(transactions, {
    eventTypes: ["DELIVERY_EMAIL_SEND"],
    limit: 1,
    workerId: "wp12b-reconcile-send",
    now: attemptedAt,
  });
  if (!delivery || !event) throw new Error("reconciliation fixture missing");
  const sender = new ResendEmailSender(
    { apiKey: "re_test_reconcile", from: "PREPPY <notice@preppy.test>" },
    {
      fetchImplementation: async () =>
        Promise.reject(new Error("response lost")),
    },
  );
  await expect(
    processEmailDelivery(
      transactions,
      {
        eventId: event.id,
        deliveryId: delivery.id,
        workerId: "wp12b-reconcile-send",
        now: attemptedAt,
      },
      {
        sender,
        tracker: new TestAnalyticsTracker(),
        appBaseUrl: "https://preppy.test",
      },
    ),
  ).resolves.toEqual({ kind: "RESULT_UNKNOWN" });
  const [attempt] = await sql<{ id: string }[]>`
    select id from notification_delivery_attempts
    where notification_delivery_id=${delivery.id}`;
  if (!attempt) throw new Error("unknown attempt missing");
  return { deliveryId: delivery.id, eventId: event.id, attemptId: attempt.id };
}

async function adminContext(occurredAt: Date) {
  const adminUserId = randomUUID();
  adminIds.add(adminUserId);
  await sql`insert into admin_users(id, external_auth_subject, email, display_name, status)
    values (${adminUserId}, ${`wp12b-${adminUserId}`}, 'admin@example.test', 'WP12B Admin', 'ACTIVE')`;
  return createAdminCommandContext({
    adminUserId,
    occurredAt,
    clientCorrelationId: randomUUID(),
    reason: "RESEND_RESULT_RECONCILIATION",
  });
}

describe("WP-12B explicit ambiguous Resend reconciliation", () => {
  beforeAll(async () => {
    await lockClient`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });
  afterEach(async () => {
    if (adminIds.size > 0) {
      await sql`delete from audit_logs where admin_user_id in ${sql([...adminIds])}`;
      await sql`delete from admin_users where id in ${sql([...adminIds])}`;
      adminIds.clear();
    }
    await fixtures.cleanup();
  });
  afterAll(async () => {
    await lockClient`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await lockClient.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
    await client.end({ timeout: 5 });
  });

  it("reissues the exact same request/key within 24 hours and settles once", async () => {
    const attemptedAt = new Date("2026-08-24T02:02:00.000Z");
    const fixture = await unknownResendDelivery(attemptedAt);
    const sentBodies: Array<{ key: string; body: string }> = [];
    const sender = new ResendEmailSender(
      { apiKey: "re_test_reconcile", from: "PREPPY <notice@preppy.test>" },
      {
        fetchImplementation: async (_input, init) => {
          sentBodies.push({
            key: new Headers(init?.headers).get("idempotency-key") ?? "",
            body: String(init?.body),
          });
          return new Response('{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}', {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    );
    const tracker = new TestAnalyticsTracker();
    const context = await adminContext(new Date("2026-08-25T01:59:59.000Z"));

    await expect(
      reconcileUnknownResendAttempt(
        context,
        {
          deliveryId: fixture.deliveryId,
          expectedAttemptId: fixture.attemptId,
        },
        {
          transactionManager: transactions,
          sender,
          tracker,
          appBaseUrl: "https://preppy.test",
        },
      ),
    ).resolves.toEqual({
      kind: "RECONCILED",
      deliveryId: fixture.deliveryId,
      attemptId: fixture.attemptId,
      providerMessageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794",
    });
    expect(sentBodies).toHaveLength(1);
    expect(sentBodies[0]?.key).toBe(`preppy-delivery/${fixture.deliveryId}/v1`);

    const [state] = await sql<
      {
        attempt_status: string;
        provider_message_id: string | null;
        delivery_status: string;
        event_status: string;
        attempt_count: number;
      }[]
    >`
      select attempt.attempt_status, attempt.provider_message_id,
        delivery.status delivery_status, event.status event_status,
        (select count(*)::int from notification_delivery_attempts where notification_delivery_id=delivery.id) attempt_count
      from notification_delivery_attempts attempt
      join notification_deliveries delivery on delivery.id=attempt.notification_delivery_id
      join outbox_events event on event.id=${fixture.eventId}
      where attempt.id=${fixture.attemptId}`;
    expect(state).toEqual({
      attempt_status: "ACCEPTED",
      provider_message_id: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794",
      delivery_status: "SENT",
      event_status: "PROCESSED",
      attempt_count: 1,
    });
    expect(tracker.snapshot()).toHaveLength(1);
    await expect(
      reconcileUnknownResendAttempt(
        context,
        {
          deliveryId: fixture.deliveryId,
          expectedAttemptId: fixture.attemptId,
        },
        {
          transactionManager: transactions,
          sender,
          tracker,
          appBaseUrl: "https://preppy.test",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(sentBodies).toHaveLength(1);
  });

  it("blocks reconciliation at the 24-hour boundary without a provider call", async () => {
    const attemptedAt = new Date("2026-08-24T02:02:00.000Z");
    const fixture = await unknownResendDelivery(attemptedAt);
    let calls = 0;
    const sender = new ResendEmailSender(
      { apiKey: "re_test_reconcile", from: "PREPPY <notice@preppy.test>" },
      {
        fetchImplementation: async () => {
          calls += 1;
          return new Response('{"id":"forbidden"}');
        },
      },
    );
    const context = await adminContext(new Date("2026-08-25T02:02:00.000Z"));
    await expect(
      reconcileUnknownResendAttempt(
        context,
        {
          deliveryId: fixture.deliveryId,
          expectedAttemptId: fixture.attemptId,
        },
        {
          transactionManager: transactions,
          sender,
          tracker: new TestAnalyticsTracker(),
          appBaseUrl: "https://preppy.test",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(calls).toBe(0);
  });

  it("blocks a changed current address rather than resending to it", async () => {
    const fixture = await unknownResendDelivery(
      new Date("2026-08-24T02:02:00.000Z"),
    );
    await sql`update user_emails set email='new@example.test', email_normalized='new@example.test'`;
    let calls = 0;
    const sender = new ResendEmailSender(
      { apiKey: "re_test_reconcile", from: "PREPPY <notice@preppy.test>" },
      {
        fetchImplementation: async () => {
          calls += 1;
          return new Response('{"id":"forbidden"}');
        },
      },
    );
    const context = await adminContext(new Date("2026-08-24T03:02:00.000Z"));
    await expect(
      reconcileUnknownResendAttempt(
        context,
        {
          deliveryId: fixture.deliveryId,
          expectedAttemptId: fixture.attemptId,
        },
        {
          transactionManager: transactions,
          sender,
          tracker: new TestAnalyticsTracker(),
          appBaseUrl: "https://preppy.test",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(calls).toBe(0);
  });
});
