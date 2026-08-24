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
import { ResendEmailSender } from "@/src/modules/notification/resend-email-sender.server";
import { resolveOpportunityChangeEvent } from "@/src/modules/notification/resolver.server";
import { processEmailDelivery } from "@/src/modules/notification/send-delivery.server";
import { claimOutboxBatch } from "@/src/modules/outbox/transitions.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
import { Wp12aFixtures } from "@/tests/support/wp12a-fixtures";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const client = postgres(databaseUrl, { max: 5 });
const database = drizzle(client, { schema }) as RuntimeDrizzleDatabase;
const transactions = new TransactionManager(database);
const sql = postgres(databaseUrl, { max: 3 });
const lockClient = postgres(databaseUrl, { max: 1 });
const fixtures = new Wp12aFixtures(sql);

async function queuedDelivery(email: string) {
  const signal = await fixtures.createSignal({ workerId: "wp12b-resolver" });
  const follower = await fixtures.createFollow({
    institutionId: signal.institutionId,
    activatedAt: new Date(signal.signalTime.getTime() - 1),
  });
  await fixtures.enableEmail(follower.userId, { email });
  const resolved = await resolveOpportunityChangeEvent(transactions, {
    eventId: signal.outboxId,
    opportunityChangeId: signal.changeId,
    workerId: "wp12b-resolver",
    now: new Date("2026-08-24T02:00:00.000Z"),
  });
  await fixtures.discoverGeneratedIds(signal.changeId);
  const [delivery] = await sql<{ id: string }[]>`
    select id from notification_deliveries
    where notification_id=${resolved.notificationId}`;
  const [event] = await claimOutboxBatch(transactions, {
    eventTypes: ["DELIVERY_EMAIL_SEND"],
    limit: 1,
    workerId: "wp12b-send",
    now: new Date("2026-08-24T02:01:00.000Z"),
  });
  if (!delivery || !event) throw new Error("WP-12B send fixture missing");
  return { deliveryId: delivery.id, eventId: event.id };
}

describe("WP-12B durable Resend request identity", () => {
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

  it("commits non-PII key/payload/recipient identity before the provider call", async () => {
    const rawRecipient = "Recipient.Case@Example.Test";
    const fixture = await queuedDelivery(rawRecipient);
    let durableBeforeCall: Record<string, unknown> | undefined;
    const sender = new ResendEmailSender(
      {
        apiKey: "re_test_durable_identity",
        from: "PREPPY <notice@preppy.test>",
      },
      {
        fetchImplementation: async (_input, init) => {
          const [row] = await sql<
            {
              recipient_hash: string | null;
              payload: unknown;
              attempt_status: string;
            }[]
          >`
            select delivery.recipient_hash, event.payload, attempt.attempt_status
            from notification_deliveries delivery
            join outbox_events event on event.id=${fixture.eventId}
            join notification_delivery_attempts attempt
              on attempt.notification_delivery_id=delivery.id
            where delivery.id=${fixture.deliveryId}`;
          durableBeforeCall = row;
          expect(init?.body).not.toContain(rawRecipient);
          expect(init?.body).toContain(rawRecipient.toLowerCase());
          return new Response('{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}', {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      },
    );

    await expect(
      processEmailDelivery(
        transactions,
        {
          eventId: fixture.eventId,
          deliveryId: fixture.deliveryId,
          workerId: "wp12b-send",
          now: new Date("2026-08-24T02:02:00.000Z"),
        },
        { sender, tracker: new TestAnalyticsTracker() },
      ),
    ).resolves.toEqual({ kind: "ACCEPTED" });

    expect(durableBeforeCall).toMatchObject({
      recipient_hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      attempt_status: "STARTED",
      payload: {
        deliveryId: fixture.deliveryId,
        providerRequest: {
          provider: "RESEND",
          version: 1,
          idempotencyKey: `preppy-delivery/${fixture.deliveryId}/v1`,
          payloadHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        },
      },
    });
    expect(JSON.stringify(durableBeforeCall)).not.toContain(rawRecipient);
    expect(JSON.stringify(durableBeforeCall)).not.toContain(
      rawRecipient.toLowerCase(),
    );
    expect(JSON.stringify(durableBeforeCall)).not.toContain(
      "re_test_durable_identity",
    );
  });
});
