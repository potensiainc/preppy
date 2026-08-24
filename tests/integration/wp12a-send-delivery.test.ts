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
import type { SendEmailResult } from "@/src/modules/notification/email-sender";
import { FakeEmailSender } from "@/src/modules/notification/fake-email-sender.server";
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

async function queuedDelivery() {
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
    now: new Date("2026-08-24T02:00:00.000Z"),
  });
  await fixtures.discoverGeneratedIds(signal.changeId);
  const [delivery] = await sql<{ id: string }[]>`
    select id from notification_deliveries
    where notification_id=${resolved.notificationId}`;
  const [sendEvent] = await claimOutboxBatch(transactions, {
    eventTypes: ["DELIVERY_EMAIL_SEND"],
    limit: 1,
    workerId: "worker-send",
    now: new Date("2026-08-24T02:01:00.000Z"),
  });
  if (!delivery || !sendEvent) throw new Error("fixture send work missing");
  return { signal, follower, deliveryId: delivery.id, sendEvent };
}

async function persisted(deliveryId: string, eventId: string) {
  const [row] = await sql<
    {
      delivery_status: string;
      suppress_reason: string | null;
      sent_at: Date | null;
      failed_at: Date | null;
      event_status: string;
      event_error: string | null;
      available_at: Date;
      attempt_status: string | null;
      attempt_error: string | null;
      completed_at: Date | null;
      provider_message_id: string | null;
    }[]
  >`
    select delivery.status delivery_status,
      delivery.suppress_reason, delivery.sent_at, delivery.failed_at,
      event.status event_status, event.last_error_code event_error,
      event.available_at,
      attempt.attempt_status, attempt.error_code attempt_error,
      attempt.completed_at, attempt.provider_message_id
    from notification_deliveries delivery
    join outbox_events event on event.id=${eventId}
    left join lateral (
      select * from notification_delivery_attempts
      where notification_delivery_id=delivery.id
      order by attempt_number desc limit 1
    ) attempt on true
    where delivery.id=${deliveryId}`;
  return row!;
}

describe("WP-12A crash-safe email delivery", () => {
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

  it.each([
    [
      "USER_INACTIVE",
      async ({ follower }: Awaited<ReturnType<typeof queuedDelivery>>) => {
        await sql`update users set status='DELETED', deleted_at=now() where id=${follower.userId}`;
      },
    ],
    [
      "FOLLOW_INACTIVE",
      async ({ follower }: Awaited<ReturnType<typeof queuedDelivery>>) => {
        await sql`update follows set status='INACTIVE', deactivated_at=now()
        where id=${follower.followId}`;
      },
    ],
    [
      "CONSENT_REVOKED",
      async ({ follower }: Awaited<ReturnType<typeof queuedDelivery>>) => {
        await sql`insert into consent_decisions(
        user_id, consent_type, policy_version, decision, source, decided_at
      ) values (${follower.userId}, 'SERVICE_EMAIL_UPDATES', 'wp12a-v2',
        'REVOKED', 'WP12A_TEST', '2026-08-24T02:02:00.000Z')`;
      },
    ],
    [
      "PREFERENCE_DISABLED",
      async ({ follower }: Awaited<ReturnType<typeof queuedDelivery>>) => {
        await sql`update notification_preferences set state='DISABLED'
        where user_id=${follower.userId} and channel='EMAIL'`;
      },
    ],
    [
      "EMAIL_SUPPRESSED",
      async ({ follower }: Awaited<ReturnType<typeof queuedDelivery>>) => {
        await sql`update user_emails set delivery_state='BOUNCED'
        where user_id=${follower.userId}`;
      },
    ],
    [
      "EMAIL_UNAVAILABLE",
      async ({ follower }: Awaited<ReturnType<typeof queuedDelivery>>) => {
        await sql`update user_emails set delivery_state='REMOVED', removed_at=now()
        where user_id=${follower.userId}`;
      },
    ],
  ] as const)(
    "suppresses %s with zero sender calls",
    async (reason, mutate) => {
      const fixture = await queuedDelivery();
      await mutate(fixture);
      const sender = new FakeEmailSender([]);
      const result = await processEmailDelivery(
        transactions,
        {
          eventId: fixture.sendEvent.id,
          deliveryId: fixture.deliveryId,
          workerId: "worker-send",
          now: new Date("2026-08-24T02:03:00.000Z"),
        },
        { sender, tracker: new TestAnalyticsTracker() },
      );
      expect(result).toEqual({ kind: "SUPPRESSED", reason });
      expect(sender.snapshot()).toHaveLength(0);
      expect(
        await persisted(fixture.deliveryId, fixture.sendEvent.id),
      ).toMatchObject({
        delivery_status: "SUPPRESSED",
        suppress_reason: reason,
        event_status: "PROCESSED",
        attempt_status: null,
      });
    },
  );

  it("suppresses the delivery kill switch before provider or Attempt work", async () => {
    const fixture = await queuedDelivery();
    const sender = new FakeEmailSender([]);
    const result = await processEmailDelivery(
      transactions,
      {
        eventId: fixture.sendEvent.id,
        deliveryId: fixture.deliveryId,
        workerId: "worker-send",
        now: new Date("2026-08-24T02:03:00.000Z"),
      },
      {
        sender,
        tracker: new TestAnalyticsTracker(),
        sendEnabled: false,
      },
    );
    expect(result).toEqual({ kind: "SUPPRESSED", reason: "OTHER" });
    expect(sender.snapshot()).toHaveLength(0);
    expect(
      await persisted(fixture.deliveryId, fixture.sendEvent.id),
    ).toMatchObject({
      delivery_status: "SUPPRESSED",
      suppress_reason: "OTHER",
      event_status: "PROCESSED",
      attempt_status: null,
    });
  });

  it("orders tied latest consent decisions by decided_at then id", async () => {
    const fixture = await queuedDelivery();
    const decidedAt = new Date("2026-08-24T02:02:00.000Z");
    await sql`insert into consent_decisions(
        id, user_id, consent_type, policy_version, decision, source, decided_at
      ) values
        ('00000000-0000-4000-8000-000000000001', ${fixture.follower.userId},
          'SERVICE_EMAIL_UPDATES', 'wp12a-tie-a', 'GRANTED', 'WP12A_TEST', ${decidedAt}),
        ('ffffffff-ffff-4fff-bfff-ffffffffffff', ${fixture.follower.userId},
          'SERVICE_EMAIL_UPDATES', 'wp12a-tie-b', 'REVOKED', 'WP12A_TEST', ${decidedAt})`;
    const sender = new FakeEmailSender([]);
    await expect(
      processEmailDelivery(
        transactions,
        {
          eventId: fixture.sendEvent.id,
          deliveryId: fixture.deliveryId,
          workerId: "worker-send",
          now: new Date("2026-08-24T02:03:00.000Z"),
        },
        { sender, tracker: new TestAnalyticsTracker() },
      ),
    ).resolves.toEqual({ kind: "SUPPRESSED", reason: "CONSENT_REVOKED" });
    expect(sender.snapshot()).toHaveLength(0);
  });

  it.each<SendEmailResult>([
    { kind: "ACCEPTED", provider: "FAKE", providerMessageId: "accepted-1" },
    { kind: "RETRYABLE_FAILURE", provider: "FAKE", errorCode: "FAKE_RETRY" },
    { kind: "TERMINAL_FAILURE", provider: "FAKE", errorCode: "FAKE_TERMINAL" },
    {
      kind: "RESULT_UNKNOWN",
      provider: "FAKE",
      errorCode: "PROVIDER_RESULT_UNKNOWN",
    },
  ])("persists the $kind lifecycle", async (outcome) => {
    const fixture = await queuedDelivery();
    const sender = new FakeEmailSender([outcome]);
    const tracker = new TestAnalyticsTracker();
    const now = new Date("2026-08-24T02:03:00.000Z");
    const result = await processEmailDelivery(
      transactions,
      {
        eventId: fixture.sendEvent.id,
        deliveryId: fixture.deliveryId,
        workerId: "worker-send",
        now,
      },
      { sender, tracker },
    );
    expect(result.kind).toBe(outcome.kind);
    expect(sender.snapshot()).toHaveLength(1);
    const state = await persisted(fixture.deliveryId, fixture.sendEvent.id);
    if (outcome.kind === "ACCEPTED") {
      expect(state).toMatchObject({
        delivery_status: "SENT",
        event_status: "PROCESSED",
        attempt_status: "ACCEPTED",
        provider_message_id: "accepted-1",
      });
      expect(state.completed_at).not.toBeNull();
      expect(tracker.snapshot()).toEqual([
        {
          name: "notification_sent",
          properties: {
            notificationId: expect.any(String),
            opportunityId: fixture.signal.opportunityId,
          },
        },
      ]);
    } else if (outcome.kind === "RETRYABLE_FAILURE") {
      expect(state).toMatchObject({
        delivery_status: "QUEUED",
        event_status: "PENDING",
        event_error: "FAKE_RETRY",
        attempt_status: "FAILED_RETRYABLE",
      });
      expect(state.available_at).toEqual(new Date(now.getTime() + 60_000));
    } else if (outcome.kind === "TERMINAL_FAILURE") {
      expect(state).toMatchObject({
        delivery_status: "FAILED",
        event_status: "DEAD_LETTER",
        event_error: "FAKE_TERMINAL",
        attempt_status: "FAILED_TERMINAL",
      });
    } else {
      expect(state).toMatchObject({
        delivery_status: "QUEUED",
        event_status: "FAILED",
        event_error: "PROVIDER_RESULT_UNKNOWN",
        attempt_status: "STARTED",
        attempt_error: "PROVIDER_RESULT_UNKNOWN",
        completed_at: null,
      });
      await expect(
        processEmailDelivery(
          transactions,
          {
            eventId: fixture.sendEvent.id,
            deliveryId: fixture.deliveryId,
            workerId: "worker-send",
            now: new Date(now.getTime() + 60_000),
          },
          { sender, tracker },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(sender.snapshot()).toHaveLength(1);
    }
  });

  it("commits STARTED before the call and fails closed after a crash window", async () => {
    const fixture = await queuedDelivery();
    const sender = new FakeEmailSender([
      { kind: "ACCEPTED", provider: "FAKE", providerMessageId: "never-called" },
    ]);
    await expect(
      processEmailDelivery(
        transactions,
        {
          eventId: fixture.sendEvent.id,
          deliveryId: fixture.deliveryId,
          workerId: "worker-send",
          now: new Date("2026-08-24T02:03:00.000Z"),
        },
        {
          sender,
          tracker: new TestAnalyticsTracker(),
          afterAttemptStarted: () => Promise.reject(new Error("crash")),
        },
      ),
    ).rejects.toThrow("crash");
    expect(sender.snapshot()).toHaveLength(0);
    expect(
      await persisted(fixture.deliveryId, fixture.sendEvent.id),
    ).toMatchObject({
      delivery_status: "QUEUED",
      event_status: "PROCESSING",
      attempt_status: "STARTED",
      completed_at: null,
    });

    const retrySender = new FakeEmailSender([
      {
        kind: "ACCEPTED",
        provider: "FAKE",
        providerMessageId: "must-not-send",
      },
    ]);
    const result = await processEmailDelivery(
      transactions,
      {
        eventId: fixture.sendEvent.id,
        deliveryId: fixture.deliveryId,
        workerId: "worker-send",
        now: new Date("2026-08-24T02:04:00.000Z"),
      },
      { sender: retrySender, tracker: new TestAnalyticsTracker() },
    );
    expect(result).toEqual({ kind: "QUARANTINED" });
    expect(retrySender.snapshot()).toHaveLength(0);
    expect(
      await persisted(fixture.deliveryId, fixture.sendEvent.id),
    ).toMatchObject({
      event_status: "FAILED",
      event_error: "UNRESOLVED_DELIVERY_ATTEMPT",
    });
  });

  it("dead-letters a definitive retryable failure when max attempts are exhausted", async () => {
    const fixture = await queuedDelivery();
    await sql`update outbox_events set attempt_count=max_attempts
      where id=${fixture.sendEvent.id}`;
    const sender = new FakeEmailSender([
      { kind: "RETRYABLE_FAILURE", provider: "FAKE", errorCode: "FAKE_RETRY" },
    ]);
    const result = await processEmailDelivery(
      transactions,
      {
        eventId: fixture.sendEvent.id,
        deliveryId: fixture.deliveryId,
        workerId: "worker-send",
        now: new Date("2026-08-24T02:03:00.000Z"),
      },
      { sender, tracker: new TestAnalyticsTracker() },
    );
    expect(result).toEqual({ kind: "RETRYABLE_FAILURE" });
    expect(
      await persisted(fixture.deliveryId, fixture.sendEvent.id),
    ).toMatchObject({
      delivery_status: "FAILED",
      event_status: "DEAD_LETTER",
      event_error: "EMAIL_RETRY_EXHAUSTED",
      attempt_status: "FAILED_RETRYABLE",
    });
  });

  it("does not resend after provider acceptance if DB settlement crashes", async () => {
    const fixture = await queuedDelivery();
    const sender = new FakeEmailSender([
      {
        kind: "ACCEPTED",
        provider: "FAKE",
        providerMessageId: "accepted-before-crash",
      },
    ]);
    await expect(
      processEmailDelivery(
        transactions,
        {
          eventId: fixture.sendEvent.id,
          deliveryId: fixture.deliveryId,
          workerId: "worker-send",
          now: new Date("2026-08-24T02:03:00.000Z"),
        },
        {
          sender,
          tracker: new TestAnalyticsTracker(),
          afterProviderCall: () =>
            Promise.reject(new Error("settlement crash")),
        },
      ),
    ).rejects.toThrow("settlement crash");
    expect(sender.snapshot()).toHaveLength(1);
    expect(
      await persisted(fixture.deliveryId, fixture.sendEvent.id),
    ).toMatchObject({
      delivery_status: "QUEUED",
      event_status: "PROCESSING",
      attempt_status: "STARTED",
      completed_at: null,
    });

    const retrySender = new FakeEmailSender([
      { kind: "ACCEPTED", provider: "FAKE", providerMessageId: "duplicate" },
    ]);
    await expect(
      processEmailDelivery(
        transactions,
        {
          eventId: fixture.sendEvent.id,
          deliveryId: fixture.deliveryId,
          workerId: "worker-send",
          now: new Date("2026-08-24T02:04:00.000Z"),
        },
        { sender: retrySender, tracker: new TestAnalyticsTracker() },
      ),
    ).resolves.toEqual({ kind: "QUARANTINED" });
    expect(retrySender.snapshot()).toHaveLength(0);
  });
});
