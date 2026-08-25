import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ConflictError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import * as schema from "@/src/db/schema";
import {
  TransactionManager,
  type RuntimeDrizzleDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  claimOutboxBatch,
  completeOutboxEvent,
  deadLetterOutboxEvent,
  failOutboxEvent,
  recoverStaleOutboxLeases,
  rescheduleOutboxEvent,
} from "@/src/modules/outbox/transitions.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const client = postgres(databaseUrl, { max: 6 });
const database = drizzle(client, { schema }) as RuntimeDrizzleDatabase;
const transactions = new TransactionManager(database);
const lockClient = postgres(databaseUrl, { max: 1 });
const sql = postgres(databaseUrl, { max: 4 });
const prefix = `wp12a-outbox-${randomUUID()}-`;
const fixtureIds = {
  institutions: new Set<string>(),
  opportunities: new Set<string>(),
  notifications: new Set<string>(),
  users: new Set<string>(),
  deliveries: new Set<string>(),
};

async function insertDeliveryForAttempt() {
  const institutionId = randomUUID();
  const opportunityId = randomUUID();
  const notificationId = randomUUID();
  const userId = randomUUID();
  const deliveryId = randomUUID();
  await sql`insert into institutions(id, slug, display_name, category)
    values (${institutionId}, ${`${prefix}${institutionId}`}, 'WP12A Outbox', 'ENGLISH_KINDERGARTEN')`;
  await sql`insert into opportunities(id, institution_id, slug, kind, truth_mode)
    values (${opportunityId}, ${institutionId}, ${`${prefix}${opportunityId}`}, 'APPLICATION', 'NATIVE')`;
  await sql`insert into notifications(
      id, opportunity_id, signal_type, policy_version, status,
      signal_published_at, title_snapshot, body_context_json, deep_link_path,
      dedupe_key
    ) values (
      ${notificationId}, ${opportunityId}, 'OPPORTUNITY_PUBLISHED',
      ${`${prefix}policy-${notificationId}`}, 'PENDING', now(), 'WP12A',
      '{}'::jsonb, '/opportunities/wp12a', ${`${prefix}notification-${notificationId}`}
    )`;
  await sql`insert into users(id, status) values (${userId}, 'ACTIVE')`;
  await sql`insert into notification_deliveries(
      id, notification_id, user_id, channel, status
    ) values (${deliveryId}, ${notificationId}, ${userId}, 'EMAIL', 'QUEUED')`;
  fixtureIds.institutions.add(institutionId);
  fixtureIds.opportunities.add(opportunityId);
  fixtureIds.notifications.add(notificationId);
  fixtureIds.users.add(userId);
  fixtureIds.deliveries.add(deliveryId);
  return deliveryId;
}

async function insertEvent(input: {
  eventType?: "OPPORTUNITY_CHANGE_PUBLISHED" | "DELIVERY_EMAIL_SEND";
  aggregateId?: string;
  status?: string;
  availableAt?: Date;
  createdAt?: Date;
  attemptCount?: number;
  maxAttempts?: number;
  lockedAt?: Date | null;
  lockedBy?: string | null;
}) {
  const id = randomUUID();
  const aggregateId = input.aggregateId ?? randomUUID();
  const eventType = input.eventType ?? "OPPORTUNITY_CHANGE_PUBLISHED";
  const status = input.status ?? "PENDING";
  await sql`
    insert into outbox_events (
      id, event_type, aggregate_type, aggregate_id, payload, status,
      available_at, created_at, attempt_count, max_attempts, dedupe_key,
      locked_at, locked_by
    ) values (
      ${id}, ${eventType},
      ${eventType === "DELIVERY_EMAIL_SEND" ? "NOTIFICATION_DELIVERY" : "OPPORTUNITY_CHANGE"},
      ${aggregateId},
      ${sql.json(eventType === "DELIVERY_EMAIL_SEND" ? { deliveryId: aggregateId } : { opportunityChangeId: aggregateId })},
      ${status}, ${input.availableAt ?? new Date("2026-08-24T00:00:00.000Z")},
      ${input.createdAt ?? new Date("2026-08-24T00:00:00.000Z")},
      ${input.attemptCount ?? 0}, ${input.maxAttempts ?? 3}, ${`${prefix}${id}`},
      ${input.lockedAt ?? null}, ${input.lockedBy ?? null}
    )
  `;
  return { id, aggregateId };
}

async function row(id: string) {
  const [value] = await sql<
    {
      status: string;
      attempt_count: number;
      available_at: Date;
      processed_at: Date | null;
      locked_at: Date | null;
      locked_by: string | null;
      last_error_code: string | null;
      last_error_at: Date | null;
      dead_lettered_at: Date | null;
    }[]
  >`
    select status, attempt_count, available_at, processed_at, locked_at,
      locked_by, last_error_code, last_error_at, dead_lettered_at
    from outbox_events where id=${id}
  `;
  return value!;
}

async function cleanup() {
  await sql`delete from notification_delivery_attempts where provider like ${`${prefix}%`}`;
  await sql`delete from outbox_events where dedupe_key like ${`${prefix}%`}`;
  if (fixtureIds.deliveries.size > 0) {
    await sql`delete from notification_deliveries where id in ${sql([...fixtureIds.deliveries])}`;
  }
  if (fixtureIds.notifications.size > 0) {
    await sql`delete from notifications where id in ${sql([...fixtureIds.notifications])}`;
  }
  if (fixtureIds.users.size > 0) {
    await sql`delete from users where id in ${sql([...fixtureIds.users])}`;
  }
  if (fixtureIds.opportunities.size > 0) {
    await sql`delete from opportunities where id in ${sql([...fixtureIds.opportunities])}`;
  }
  if (fixtureIds.institutions.size > 0) {
    await sql`delete from institutions where id in ${sql([...fixtureIds.institutions])}`;
  }
  for (const ids of Object.values(fixtureIds)) ids.clear();
}

describe("WP-12A safe Outbox transitions", () => {
  beforeAll(async () => {
    await lockClient`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(cleanup);

  afterAll(async () => {
    await lockClient`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await lockClient.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
    await client.end({ timeout: 5 });
  });

  it("claims only due PENDING work in deterministic order and increments attempts", async () => {
    const now = new Date("2026-08-24T00:10:00.000Z");
    const first = await insertEvent({
      availableAt: new Date("2026-08-24T00:00:00.000Z"),
      createdAt: new Date("2026-08-24T00:02:00.000Z"),
    });
    const second = await insertEvent({
      availableAt: new Date("2026-08-24T00:01:00.000Z"),
      createdAt: new Date("2026-08-24T00:02:00.000Z"),
    });
    await insertEvent({ availableAt: new Date("2026-08-24T00:11:00.000Z") });
    await insertEvent({ status: "FAILED" });

    const claimed = await claimOutboxBatch(transactions, {
      eventTypes: ["OPPORTUNITY_CHANGE_PUBLISHED"],
      limit: 2,
      workerId: "worker-a",
      now,
    });

    expect(claimed.map((event) => event.id)).toEqual([first.id, second.id]);
    expect(claimed.map((event) => event.attemptCount)).toEqual([1, 1]);
    expect(await row(first.id)).toMatchObject({
      status: "PROCESSING",
      attempt_count: 1,
      locked_by: "worker-a",
      locked_at: now,
    });
  });

  it("uses SKIP LOCKED so two claimers never receive the same row", async () => {
    const now = new Date("2026-08-24T00:10:00.000Z");
    const first = await insertEvent({
      availableAt: new Date("2026-08-24T00:00:00.000Z"),
    });
    const second = await insertEvent({
      availableAt: new Date("2026-08-24T00:01:00.000Z"),
    });
    const blocker = postgres(databaseUrl, { max: 1 });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => (locked = resolve));
    try {
      const blockingTransaction = blocker.begin(async (transaction) => {
        await transaction`select id from outbox_events where id=${first.id} for update`;
        locked();
        await held;
      });
      await ready;
      const claimed = await claimOutboxBatch(transactions, {
        eventTypes: ["OPPORTUNITY_CHANGE_PUBLISHED"],
        limit: 2,
        workerId: "worker-b",
        now,
      });
      expect(claimed.map((event) => event.id)).toEqual([second.id]);
      release();
      await blockingTransaction;
    } finally {
      release();
      await blocker.end({ timeout: 5 });
    }
  });

  it("applies owner-aware complete, reschedule, fail, and dead-letter transitions", async () => {
    const now = new Date("2026-08-24T00:10:00.000Z");
    const retryAt = new Date("2026-08-24T00:15:00.000Z");
    const complete = await insertEvent({
      status: "PROCESSING",
      lockedAt: now,
      lockedBy: "worker-a",
    });
    const retry = await insertEvent({
      status: "PROCESSING",
      lockedAt: now,
      lockedBy: "worker-a",
    });
    const fail = await insertEvent({
      status: "PROCESSING",
      lockedAt: now,
      lockedBy: "worker-a",
    });
    const dead = await insertEvent({
      status: "PROCESSING",
      lockedAt: now,
      lockedBy: "worker-a",
    });

    await transactions.run((executor) =>
      completeOutboxEvent(executor, {
        eventId: complete.id,
        workerId: "worker-a",
        now,
      }),
    );
    await transactions.run((executor) =>
      rescheduleOutboxEvent(executor, {
        eventId: retry.id,
        workerId: "worker-a",
        now,
        availableAt: retryAt,
        errorCode: "TEMPORARY_FAILURE",
      }),
    );
    await transactions.run((executor) =>
      failOutboxEvent(executor, {
        eventId: fail.id,
        workerId: "worker-a",
        now,
        errorCode: "PROVIDER_RESULT_UNKNOWN",
      }),
    );
    await transactions.run((executor) =>
      deadLetterOutboxEvent(executor, {
        eventId: dead.id,
        workerId: "worker-a",
        now,
        errorCode: "TERMINAL_FAILURE",
      }),
    );

    expect(await row(complete.id)).toMatchObject({
      status: "PROCESSED",
      processed_at: now,
      locked_at: null,
      locked_by: null,
    });
    expect(await row(retry.id)).toMatchObject({
      status: "PENDING",
      available_at: retryAt,
      last_error_code: "TEMPORARY_FAILURE",
      last_error_at: now,
      locked_at: null,
    });
    expect(await row(fail.id)).toMatchObject({
      status: "FAILED",
      last_error_code: "PROVIDER_RESULT_UNKNOWN",
      locked_at: null,
    });
    expect(await row(dead.id)).toMatchObject({
      status: "DEAD_LETTER",
      dead_lettered_at: now,
      last_error_code: "TERMINAL_FAILURE",
      locked_at: null,
    });

    await expect(
      transactions.run((executor) =>
        completeOutboxEvent(executor, {
          eventId: retry.id,
          workerId: "wrong-worker",
          now,
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("recovers stale DB work but quarantines stale send work with unresolved STARTED attempts", async () => {
    const now = new Date("2026-08-24T00:10:00.000Z");
    const cutoff = new Date("2026-08-24T00:05:00.000Z");
    const resolver = await insertEvent({
      status: "PROCESSING",
      attemptCount: 1,
      lockedAt: new Date("2026-08-24T00:00:00.000Z"),
      lockedBy: "lost-worker",
    });
    const deliveryId = await insertDeliveryForAttempt();
    const send = await insertEvent({
      eventType: "DELIVERY_EMAIL_SEND",
      aggregateId: deliveryId,
      status: "PROCESSING",
      attemptCount: 1,
      lockedAt: new Date("2026-08-24T00:00:00.000Z"),
      lockedBy: "lost-worker",
    });
    await sql`
      insert into notification_delivery_attempts (
        notification_delivery_id, attempt_number, provider, attempt_status,
        error_code, attempted_at
      ) values (
        ${deliveryId}, 1, ${`${prefix}fake`}, 'STARTED',
        'PROVIDER_RESULT_UNKNOWN', ${new Date("2026-08-24T00:01:00.000Z")}
      )
    `;

    const recovered = await recoverStaleOutboxLeases(transactions, {
      eventTypes: [
        "OPPORTUNITY_CHANGE_PUBLISHED",
        "DELIVERY_EMAIL_SEND",
        "CACHE_REVALIDATION_REQUESTED",
      ],
      cutoff,
      now,
      limit: 10,
    });

    expect(recovered).toEqual({ pending: 1, failed: 1, deadLettered: 0 });
    expect(await row(resolver.id)).toMatchObject({
      status: "PENDING",
      last_error_code: "WORKER_LEASE_EXPIRED",
      locked_at: null,
    });
    expect(await row(send.id)).toMatchObject({
      status: "FAILED",
      last_error_code: "UNRESOLVED_DELIVERY_ATTEMPT",
      locked_at: null,
    });

    const claimed = await claimOutboxBatch(transactions, {
      eventTypes: ["DELIVERY_EMAIL_SEND"],
      limit: 10,
      workerId: "worker-next",
      now,
    });
    expect(claimed).toEqual([]);
  });
});
