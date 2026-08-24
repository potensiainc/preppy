import { createHash, randomUUID } from "node:crypto";

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
import { processResendProviderEvent } from "@/src/modules/notification/process-resend-provider-event.server";
import { resolveOpportunityChangeEvent } from "@/src/modules/notification/resolver.server";
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

function recipientHash(email: string) {
  return `sha256:${createHash("sha256").update(email).digest("hex")}`;
}

function eventId() {
  return `wp12b-event-${randomUUID()}`;
}

async function acceptedDelivery(email = "webhook-recipient@example.test") {
  const signal = await fixtures.createSignal();
  const follower = await fixtures.createFollow({
    institutionId: signal.institutionId,
    activatedAt: new Date(signal.signalTime.getTime() - 1),
  });
  await fixtures.enableEmail(follower.userId, { email });
  const resolved = await resolveOpportunityChangeEvent(transactions, {
    eventId: signal.outboxId,
    opportunityChangeId: signal.changeId,
    workerId: "worker-resolver",
    now: new Date("2026-08-24T02:00:00.000Z"),
  });
  await fixtures.discoverGeneratedIds(signal.changeId);
  const [delivery] = await sql<{ id: string }[]>`
    select id from notification_deliveries
    where notification_id=${resolved.notificationId}`;
  if (!delivery) throw new Error("WP-12B webhook fixture missing delivery");
  const providerMessageId = `resend-message-${randomUUID()}`;
  await sql.begin(async (transaction) => {
    await transaction`
      update notification_deliveries
      set status='SENT', sent_at='2026-08-24T02:01:00Z',
        recipient_hash=${recipientHash(email.toLowerCase())}
      where id=${delivery.id}`;
    await transaction`
      insert into notification_delivery_attempts(
        notification_delivery_id, attempt_number, provider,
        provider_message_id, attempt_status, attempted_at, completed_at
      ) values (
        ${delivery.id}, 1, 'RESEND', ${providerMessageId}, 'ACCEPTED',
        '2026-08-24T02:01:00Z', '2026-08-24T02:01:00Z'
      )`;
  });
  return {
    deliveryId: delivery.id,
    userId: follower.userId,
    providerMessageId,
  };
}

function applyEvent(
  input: {
    providerEventId?: string;
    providerMessageId?: string;
    type: string;
    providerCreatedAt?: Date;
    bounceType?: "PERMANENT" | "TRANSIENT" | "UNDETERMINED";
    supported?: boolean;
  },
  tracker = new TestAnalyticsTracker(),
) {
  return processResendProviderEvent(
    transactions,
    {
      providerEventId: input.providerEventId ?? eventId(),
      payloadHash: `sha256:${"c".repeat(64)}`,
      receivedAt: new Date("2026-08-24T03:00:00.000Z"),
      event: {
        type: input.type,
        providerCreatedAt:
          input.providerCreatedAt ?? new Date("2026-08-24T02:30:00.000Z"),
        ...(input.providerMessageId
          ? { providerMessageId: input.providerMessageId }
          : {}),
        ...(input.bounceType ? { bounceType: input.bounceType } : {}),
        supported: input.supported ?? true,
      },
    },
    { tracker },
  );
}

async function state(deliveryId: string, userId: string) {
  const [row] = await sql<
    {
      status: string;
      delivered_at: Date | null;
      opened_at: Date | null;
      clicked_at: Date | null;
      failed_at: Date | null;
      suppress_reason: string | null;
      delivery_state: string;
    }[]
  >`
    select delivery.status, delivery.delivered_at, delivery.opened_at,
      delivery.clicked_at, delivery.failed_at, delivery.suppress_reason,
      email.delivery_state
    from notification_deliveries delivery
    join user_emails email on email.user_id=delivery.user_id
    where delivery.id=${deliveryId} and email.user_id=${userId}`;
  return row!;
}

describe("WP-12B Resend webhook reconciliation", () => {
  beforeAll(async () => {
    await lockClient`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(async () => {
    await sql`delete from email_provider_events where provider_event_id like 'wp12b-event-%'`;
    await fixtures.cleanup();
  });

  afterAll(async () => {
    await lockClient`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await lockClient.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
    await client.end({ timeout: 5 });
  });

  it("deduplicates the receipt before applying a delivered transition", async () => {
    const fixture = await acceptedDelivery();
    const providerEventId = eventId();
    await expect(
      applyEvent({
        providerEventId,
        providerMessageId: fixture.providerMessageId,
        type: "email.delivered",
      }),
    ).resolves.toEqual({ kind: "PROCESSED", deliveryId: fixture.deliveryId });
    await expect(
      applyEvent({
        providerEventId,
        providerMessageId: fixture.providerMessageId,
        type: "email.delivered",
      }),
    ).resolves.toEqual({ kind: "DUPLICATE" });

    expect(await state(fixture.deliveryId, fixture.userId)).toMatchObject({
      status: "DELIVERED",
      delivered_at: new Date("2026-08-24T02:30:00.000Z"),
      delivery_state: "USABLE",
    });
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int count from email_provider_events
      where provider='RESEND' and provider_event_id=${providerEventId}`;
    expect(count).toBe(1);
  });

  it("applies monotonic engagement and emits analytics only after each new receipt", async () => {
    const fixture = await acceptedDelivery();
    const tracker = new TestAnalyticsTracker();
    const clickedEventId = eventId();
    await applyEvent(
      {
        providerMessageId: fixture.providerMessageId,
        type: "email.opened",
        providerCreatedAt: new Date("2026-08-24T02:20:00Z"),
      },
      tracker,
    );
    await applyEvent(
      {
        providerMessageId: fixture.providerMessageId,
        type: "email.delivered",
        providerCreatedAt: new Date("2026-08-24T02:10:00Z"),
      },
      tracker,
    );
    await applyEvent(
      {
        providerEventId: clickedEventId,
        providerMessageId: fixture.providerMessageId,
        type: "email.clicked",
        providerCreatedAt: new Date("2026-08-24T02:25:00Z"),
      },
      tracker,
    );
    await applyEvent(
      {
        providerEventId: clickedEventId,
        providerMessageId: fixture.providerMessageId,
        type: "email.clicked",
        providerCreatedAt: new Date("2026-08-24T02:25:00Z"),
      },
      tracker,
    );

    expect(await state(fixture.deliveryId, fixture.userId)).toMatchObject({
      status: "CLICKED",
      delivered_at: new Date("2026-08-24T02:10:00.000Z"),
      opened_at: new Date("2026-08-24T02:20:00.000Z"),
      clicked_at: new Date("2026-08-24T02:25:00.000Z"),
    });
    expect(tracker.snapshot()).toEqual([
      {
        name: "notification_open",
        properties: { deliveryId: fixture.deliveryId },
      },
      {
        name: "notification_click",
        properties: { deliveryId: fixture.deliveryId },
      },
    ]);
  });

  it("ignores an older permanent bounce after a newer successful state", async () => {
    const fixture = await acceptedDelivery();
    await applyEvent({
      providerMessageId: fixture.providerMessageId,
      type: "email.delivered",
      providerCreatedAt: new Date("2026-08-24T02:40:00Z"),
    });
    await applyEvent({
      providerMessageId: fixture.providerMessageId,
      type: "email.bounced",
      providerCreatedAt: new Date("2026-08-24T02:30:00Z"),
      bounceType: "PERMANENT",
    });

    expect(await state(fixture.deliveryId, fixture.userId)).toMatchObject({
      status: "DELIVERED",
      failed_at: null,
      delivery_state: "USABLE",
    });
  });

  it("marks a current recipient BOUNCED only for a newer permanent bounce", async () => {
    const fixture = await acceptedDelivery();
    await applyEvent({
      providerMessageId: fixture.providerMessageId,
      type: "email.bounced",
      bounceType: "PERMANENT",
    });
    expect(await state(fixture.deliveryId, fixture.userId)).toMatchObject({
      status: "FAILED",
      failed_at: new Date("2026-08-24T02:30:00.000Z"),
      delivery_state: "BOUNCED",
    });
  });

  it.each([
    ["email.failed", undefined],
    ["email.bounced", "TRANSIENT" as const],
  ])(
    "fails the Delivery without poisoning UserEmail on %s",
    async (type, bounceType) => {
      const fixture = await acceptedDelivery();
      await applyEvent({
        providerMessageId: fixture.providerMessageId,
        type,
        ...(bounceType === undefined ? {} : { bounceType }),
      });
      expect(await state(fixture.deliveryId, fixture.userId)).toMatchObject({
        status: "FAILED",
        delivery_state: "USABLE",
      });
    },
  );

  it.each(["email.complained", "email.suppressed"])(
    "applies the strong %s suppression signal even after engagement",
    async (type) => {
      const fixture = await acceptedDelivery();
      await applyEvent({
        providerMessageId: fixture.providerMessageId,
        type: "email.clicked",
        providerCreatedAt: new Date("2026-08-24T02:20:00Z"),
      });
      await applyEvent({
        providerMessageId: fixture.providerMessageId,
        type,
        providerCreatedAt: new Date("2026-08-24T02:30:00Z"),
      });
      expect(await state(fixture.deliveryId, fixture.userId)).toMatchObject({
        status: "SUPPRESSED",
        suppress_reason: "EMAIL_SUPPRESSED",
        delivery_state: "SUPPRESSED",
      });
    },
  );

  it("does not mutate a replacement email whose recipient hash differs", async () => {
    const fixture = await acceptedDelivery("old-recipient@example.test");
    await sql`
      update user_emails
      set email='new-recipient@example.test',
        email_normalized='new-recipient@example.test'
      where user_id=${fixture.userId}`;
    await applyEvent({
      providerMessageId: fixture.providerMessageId,
      type: "email.complained",
    });
    expect(await state(fixture.deliveryId, fixture.userId)).toMatchObject({
      status: "SUPPRESSED",
      suppress_reason: "EMAIL_SUPPRESSED",
      delivery_state: "USABLE",
    });
  });

  it("durably ignores signed unknown and unmatched events without customer mutation", async () => {
    const fixture = await acceptedDelivery();
    await expect(
      applyEvent({ type: "domain.created", supported: false }),
    ).resolves.toEqual({ kind: "IGNORED", reason: "UNSUPPORTED_EVENT_TYPE" });
    await expect(
      applyEvent({
        type: "email.sent",
        providerMessageId: "not-correlated",
      }),
    ).resolves.toEqual({
      kind: "IGNORED",
      reason: "UNMATCHED_PROVIDER_MESSAGE",
    });
    expect(await state(fixture.deliveryId, fixture.userId)).toMatchObject({
      status: "SENT",
      delivery_state: "USABLE",
    });
  });
});
