import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/postgres-js";
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

import type { AdminCommandContext } from "@/src/application/context";
import { migrateDatabase } from "@/src/db/migrate";
import * as schema from "@/src/db/schema";
import {
  TransactionManager,
  type DatabaseExecutor,
  type RuntimeDrizzleDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { listAdminOutbox } from "@/src/modules/admin/read-model/operations-query.server";
import { resolveOpportunityChangeEvent } from "@/src/modules/notification/resolver.server";
import {
  cancelAdminOutboxEvent,
  retryAdminOutboxEvent,
} from "@/src/modules/outbox/admin-commands.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
import { Wp12aFixtures } from "@/tests/support/wp12a-fixtures";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const client = postgres(databaseUrl, { max: 5 });
const database = drizzle(client, { schema }) as RuntimeDrizzleDatabase;
const transactions = new TransactionManager(database);
const executor = {
  scope: "runtime",
  drizzle: database,
  raw: database.execute.bind(database),
} as unknown as DatabaseExecutor;
const sql = postgres(databaseUrl, { max: 3 });
const lockClient = postgres(databaseUrl, { max: 1 });
const fixtures = new Wp12aFixtures(sql);
const adminUserId = randomUUID();
const touchedEvents = new Set<string>();

function context(reason: string): AdminCommandContext {
  return {
    adminUserId,
    correlationId: randomUUID(),
    occurredAt: new Date("2026-08-24T04:00:00.000Z"),
    reason,
  };
}

async function ambiguousEmailEvent() {
  const signal = await fixtures.createSignal();
  const follower = await fixtures.createFollow({
    institutionId: signal.institutionId,
    activatedAt: new Date(signal.signalTime.getTime() - 1),
  });
  await fixtures.enableEmail(follower.userId);
  const resolved = await resolveOpportunityChangeEvent(transactions, {
    eventId: signal.outboxId,
    opportunityChangeId: signal.changeId,
    workerId: "worker-resolver",
    now: new Date("2026-08-24T02:00:00Z"),
  });
  await fixtures.discoverGeneratedIds(signal.changeId);
  const [row] = await sql<{ deliveryId: string; eventId: string }[]>`
    select delivery.id as "deliveryId", event.id as "eventId"
    from notification_deliveries delivery
    join outbox_events event
      on event.aggregate_id=delivery.id
      and event.event_type='DELIVERY_EMAIL_SEND'
    where delivery.notification_id=${resolved.notificationId}`;
  if (!row) throw new Error("WP-12B ambiguous fixture missing");
  await sql.begin(async (transaction) => {
    await transaction`
      update outbox_events
      set status='FAILED', last_error_code='PROVIDER_RESULT_UNKNOWN',
        last_error_at='2026-08-24T02:01:00Z'
      where id=${row.eventId}`;
    await transaction`
      insert into notification_delivery_attempts(
        notification_delivery_id, attempt_number, provider, attempt_status,
        error_code, attempted_at
      ) values (
        ${row.deliveryId}, 1, 'RESEND', 'STARTED',
        'PROVIDER_RESULT_UNKNOWN', '2026-08-24T02:01:00Z'
      )`;
  });
  touchedEvents.add(row.eventId);
  return row;
}

describe("WP-12B Admin Outbox application commands", () => {
  beforeAll(async () => {
    await lockClient`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
    await sql`
      insert into admin_users(id, external_auth_subject, email, display_name, status)
      values (${adminUserId}, ${`wp12b-admin-${adminUserId}`},
        'wp12b-admin@example.test', 'WP12B Admin', 'ACTIVE')`;
  });

  afterEach(async () => {
    if (touchedEvents.size > 0) {
      await sql`delete from audit_logs where entity_type='OUTBOX_EVENT'
        and entity_id in ${sql([...touchedEvents])}`;
    }
    touchedEvents.clear();
    await fixtures.cleanup();
  });

  afterAll(async () => {
    await sql`delete from audit_logs where admin_user_id=${adminUserId}`;
    await sql`delete from admin_users where id=${adminUserId}`;
    await lockClient`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await lockClient.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
    await client.end({ timeout: 5 });
  });

  it("retries a failed DB-only resolver with stale-write guards and Audit", async () => {
    const signal = await fixtures.createSignal({ outboxStatus: "PENDING" });
    touchedEvents.add(signal.outboxId);
    await sql`
      update outbox_events
      set status='FAILED', last_error_code='RESOLVER_RETRYABLE',
        last_error_at='2026-08-24T03:00:00Z'
      where id=${signal.outboxId}`;

    await expect(
      retryAdminOutboxEvent(
        context("ADMIN_RETRY_OUTBOX"),
        {
          eventId: signal.outboxId,
          expectedStatus: "FAILED",
          expectedAttemptCount: 1,
        },
        { transactionManager: transactions },
      ),
    ).resolves.toEqual({ kind: "RETRIED", eventId: signal.outboxId });

    const [event] = await sql`
      select status, available_at, last_error_code, locked_at, locked_by
      from outbox_events where id=${signal.outboxId}`;
    expect(event).toMatchObject({
      status: "PENDING",
      available_at: new Date("2026-08-24T04:00:00.000Z"),
      last_error_code: null,
      locked_at: null,
      locked_by: null,
    });
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int count from audit_logs
      where admin_user_id=${adminUserId} and entity_id=${signal.outboxId}
        and action_type='WP12B_RETRY_OUTBOX'`;
    expect(count).toBe(1);
  });

  it("blocks generic retry and cancel for an ambiguous Resend attempt", async () => {
    const fixture = await ambiguousEmailEvent();
    await expect(
      retryAdminOutboxEvent(
        context("ADMIN_RETRY_OUTBOX"),
        {
          eventId: fixture.eventId,
          expectedStatus: "FAILED",
          expectedAttemptCount: 0,
        },
        { transactionManager: transactions },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      cancelAdminOutboxEvent(
        context("ADMIN_CANCEL_OUTBOX"),
        {
          eventId: fixture.eventId,
          expectedStatus: "FAILED",
          expectedAttemptCount: 0,
        },
        { transactionManager: transactions },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("projects only explicit reconciliation for an eligible ambiguous result", async () => {
    const fixture = await ambiguousEmailEvent();
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-08-24T03:00:00.000Z").getTime());
    const projection = await listAdminOutbox(executor, {
      eventType: "DELIVERY_EMAIL_SEND",
      page: 1,
      pageSize: 50,
    }).finally(() => now.mockRestore());
    const item = projection.items.find(
      (candidate) => candidate.id === fixture.eventId,
    );
    expect(item).toMatchObject({
      deliveryId: fixture.deliveryId,
      latestAttempt: {
        provider: "RESEND",
        providerMessageId: null,
        status: "STARTED",
        errorCode: "PROVIDER_RESULT_UNKNOWN",
      },
      actions: {
        canRetry: false,
        canCancel: false,
        canReconcileResend: true,
      },
    });
  });

  it("cancels a pending safe resolver and generates Audit", async () => {
    const signal = await fixtures.createSignal({ outboxStatus: "PENDING" });
    touchedEvents.add(signal.outboxId);
    await expect(
      cancelAdminOutboxEvent(
        context("ADMIN_CANCEL_OUTBOX"),
        {
          eventId: signal.outboxId,
          expectedStatus: "PENDING",
          expectedAttemptCount: 1,
        },
        { transactionManager: transactions },
      ),
    ).resolves.toEqual({ kind: "CANCELLED", eventId: signal.outboxId });
    const [event] = await sql`
      select status, processed_at, locked_at, locked_by
      from outbox_events where id=${signal.outboxId}`;
    expect(event).toMatchObject({
      status: "CANCELLED",
      processed_at: new Date("2026-08-24T04:00:00.000Z"),
      locked_at: null,
      locked_by: null,
    });
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int count from audit_logs
      where entity_id=${signal.outboxId} and action_type='WP12B_CANCEL_OUTBOX'`;
    expect(count).toBe(1);
  });

  it.each([
    ["PROCESSED", "retry"],
    ["PROCESSING", "cancel"],
  ] as const)("keeps %s events immutable for %s", async (status, action) => {
    const signal = await fixtures.createSignal({
      outboxStatus: status === "PROCESSING" ? "PROCESSING" : "PENDING",
    });
    touchedEvents.add(signal.outboxId);
    if (status === "PROCESSED") {
      await sql`
        update outbox_events set status='PROCESSED', processed_at=now()
        where id=${signal.outboxId}`;
    }
    const command =
      action === "retry" ? retryAdminOutboxEvent : cancelAdminOutboxEvent;
    await expect(
      command(
        context(
          action === "retry" ? "ADMIN_RETRY_OUTBOX" : "ADMIN_CANCEL_OUTBOX",
        ),
        {
          eventId: signal.outboxId,
          expectedStatus: status,
          expectedAttemptCount: 1,
        },
        { transactionManager: transactions },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
