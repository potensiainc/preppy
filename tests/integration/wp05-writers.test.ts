import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  AuditWriter,
  type AuditSafeMetadata,
} from "@/src/application/audit-writer.server";
import { OutboxWriter } from "@/src/application/outbox-writer.server";
import { ConflictError, ValidationError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  adminUsers,
  auditLogs,
  institutions,
  outboxEvents,
} from "@/src/db/schema";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = "WP_05_WRITER_TEST";
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const adminUserIds = new Set<string>();
const institutionIds = new Set<string>();

function newAdminUserId(): string {
  const id = randomUUID();
  adminUserIds.add(id);
  return id;
}

function newInstitutionId(): string {
  const id = randomUUID();
  institutionIds.add(id);
  return id;
}

async function insertFixtureAdminUser(id = newAdminUserId()) {
  const [adminUser] = await runtime.executor.drizzle
    .insert(adminUsers)
    .values({
      id,
      externalAuthSubject: `wp-05-writer-admin-${id}`,
      email: `wp-05-writer-${id}@example.test`,
      displayName: "WP-05 Writer Admin",
      status: "ACTIVE",
    })
    .returning();

  return adminUser!;
}

async function insertFixtureInstitution(
  executor = runtime.executor,
  id = newInstitutionId(),
) {
  const [institution] = await executor.drizzle
    .insert(institutions)
    .values({
      id,
      slug: `wp-05-writer-${id}`,
      displayName: "WP-05 Writer Fixture",
      category: "ENGLISH_KINDERGARTEN",
    })
    .returning();

  return institution!;
}

async function countRows(
  tableName: "audit_logs" | "outbox_events",
): Promise<number> {
  const rows =
    tableName === "audit_logs"
      ? await runtime.client<{ count: number }[]>`
          select count(*)::int as count from audit_logs where action_type = ${prefix}
        `
      : await runtime.client<{ count: number }[]>`
          select count(*)::int as count from outbox_events where event_type = ${prefix}
        `;
  const [row] = rows;
  return row?.count ?? 0;
}

async function clearFixtures() {
  try {
    await runtime.client.begin(async (transaction) => {
      await transaction`delete from audit_logs where action_type = ${prefix}`;
      await transaction`delete from outbox_events where event_type = ${prefix}`;
      if (adminUserIds.size > 0) {
        await transaction`delete from audit_logs
          where admin_user_id in ${transaction([...adminUserIds])}`;
        await transaction`delete from admin_users where id in ${transaction([...adminUserIds])}`;
      }
      if (institutionIds.size > 0) {
        await transaction`delete from institutions where id in ${transaction([...institutionIds])}`;
      }
    });
  } finally {
    adminUserIds.clear();
    institutionIds.clear();
  }
}

describe("WP-05 transaction-aware writers", () => {
  beforeAll(async () => {
    await schemaLockSql`
      select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
    `;
    await migrateDatabase(databaseUrl);
  });

  afterEach(clearFixtures);

  afterAll(async () => {
    await schemaLockSql`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
    await schemaLockSql.end({ timeout: 5 });
    await closeRuntimeDatabase();
  });

  it("persists a valid Audit entry with exactly the safe afterData convention", async () => {
    const adminUser = await insertFixtureAdminUser();
    const entity = await insertFixtureInstitution();
    const occurredAt = new Date("2026-08-23T01:02:03.000Z");
    const correlationId = randomUUID();
    const metadata: AuditSafeMetadata = {
      expectedVersion: 2,
      actualVersion: 3,
      sourceId: randomUUID(),
      observationId: randomUUID(),
      changedFields: ["STATUS", "TITLE"],
      outcomeCode: "APPLIED",
    };

    const entry = await AuditWriter.write(
      {
        adminUserId: adminUser.id,
        actionType: prefix,
        entityType: "INSTITUTION",
        entityId: entity.id,
        correlationId,
        reason: "MATERIALITY_OVERRIDE",
        occurredAt,
        metadata,
      },
      runtime.executor,
    );

    expect(entry).toMatchObject({
      adminUserId: adminUser.id,
      actionType: prefix,
      entityType: "INSTITUTION",
      entityId: entity.id,
      beforeData: null,
      afterData: {
        correlationId,
        reason: "MATERIALITY_OVERRIDE",
        metadata,
      },
      createdAt: occurredAt,
    });
    const [persisted] = await runtime.executor.drizzle
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, entry.id));
    expect(persisted).toEqual(entry);
  });

  it("commits a fixture mutation and Audit entry through one provided transaction", async () => {
    const entityId = newInstitutionId();
    const correlationId = randomUUID();

    await runtime.transactionManager.run(async (executor) => {
      const entity = await insertFixtureInstitution(executor, entityId);
      await AuditWriter.write(
        {
          actionType: prefix,
          entityType: "INSTITUTION",
          entityId: entity.id,
          correlationId,
          occurredAt: new Date("2026-08-23T02:00:00.000Z"),
        },
        executor,
      );
    });

    await expect(
      runtime.executor.drizzle
        .select()
        .from(institutions)
        .where(eq(institutions.id, entityId)),
    ).resolves.toHaveLength(1);
    expect(await countRows("audit_logs")).toBe(1);
  });

  it("rolls back both a fixture mutation and Audit entry after a transaction failure", async () => {
    const entityId = newInstitutionId();

    await expect(
      runtime.transactionManager.run(async (executor) => {
        const entity = await insertFixtureInstitution(executor, entityId);
        await AuditWriter.write(
          {
            actionType: prefix,
            entityType: "INSTITUTION",
            entityId: entity.id,
            correlationId: randomUUID(),
            occurredAt: new Date("2026-08-23T03:00:00.000Z"),
          },
          executor,
        );
        throw new Error("WP_05_AUDIT_ROLLBACK");
      }),
    ).rejects.toThrow("WP_05_AUDIT_ROLLBACK");

    await expect(
      runtime.executor.drizzle
        .select()
        .from(institutions)
        .where(eq(institutions.id, entityId)),
    ).resolves.toHaveLength(0);
    expect(await countRows("audit_logs")).toBe(0);
  });

  it("rejects malformed and arbitrary Audit data before it can insert", async () => {
    const valid = {
      actionType: prefix,
      entityType: "INSTITUTION",
      correlationId: randomUUID(),
      occurredAt: new Date("2026-08-23T04:00:00.000Z"),
    };

    await expect(
      AuditWriter.write(
        { ...valid, correlationId: "not-a-uuid" },
        runtime.executor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      AuditWriter.write(
        { ...valid, actionType: "not canonical" },
        runtime.executor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      AuditWriter.write(
        {
          ...valid,
          reason: " ",
        },
        runtime.executor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    for (const reason of [
      "Contact person@example.test",
      "+82 10 1234 5678",
      "oauth_code=secret",
    ]) {
      await expect(
        AuditWriter.write({ ...valid, reason }, runtime.executor),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(
      AuditWriter.write(
        {
          ...valid,
          metadata: {
            changedFields: ["TITLE"],
            requestBody: { email: "unsafe@example.test" },
          } as unknown as AuditSafeMetadata,
        },
        runtime.executor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      AuditWriter.write(
        {
          ...valid,
          metadata: { sourceId: "not-a-uuid" },
        },
        runtime.executor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      AuditWriter.write(
        { ...valid, beforeData: {} } as never,
        runtime.executor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    if (false) {
      void AuditWriter.write(
        {
          ...valid,
          // @ts-expect-error AuditWriter deliberately has no raw before/after or request-body input.
          beforeData: {},
        },
        runtime.executor,
      );
    }

    expect(await countRows("audit_logs")).toBe(0);
  });

  it("rejects hidden Audit serialization hooks and accessor-backed entry fields", async () => {
    const valid = {
      actionType: prefix,
      entityType: "INSTITUTION",
      correlationId: randomUUID(),
      occurredAt: new Date("2026-08-23T04:30:00.000Z"),
    };
    const metadataWithToJson: Record<string, unknown> = {};
    Object.defineProperty(metadataWithToJson, "toJSON", {
      enumerable: false,
      value: () => ({ email: "hidden@example.test" }),
    });
    const changedFieldsWithToJson = ["TITLE"];
    Object.defineProperty(changedFieldsWithToJson, "toJSON", {
      enumerable: false,
      value: () => ["RAW_REQUEST_BODY"],
    });
    const accessorEntry = { ...valid };
    Object.defineProperty(accessorEntry, "reason", {
      enumerable: true,
      get: () => "SUPPORT_REQUEST",
    });
    const nonEnumerableEntry = { ...valid };
    Object.defineProperty(nonEnumerableEntry, "reason", {
      enumerable: false,
      value: "SUPPORT_REQUEST",
    });
    const symbolEntry = { ...valid, [Symbol("unsafe")]: "value" };

    await expect(
      AuditWriter.write(
        { ...valid, metadata: metadataWithToJson as AuditSafeMetadata },
        runtime.executor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      AuditWriter.write(
        {
          ...valid,
          metadata: { changedFields: changedFieldsWithToJson },
        },
        runtime.executor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      AuditWriter.write(accessorEntry as never, runtime.executor),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      AuditWriter.write(nonEnumerableEntry as never, runtime.executor),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      AuditWriter.write(symbolEntry as never, runtime.executor),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await countRows("audit_logs")).toBe(0);
  });

  it("persists a canonical Outbox event with hardened defaults and exact safe payload", async () => {
    const aggregateId = randomUUID();
    const availableAt = new Date("2026-08-23T05:00:00.000Z");
    const payloadSafe = {
      institutionId: aggregateId,
      change: { kind: "STATUS", values: ["UPCOMING", "OPEN"] },
      visible: true,
    };

    const event = await OutboxWriter.enqueue(
      {
        eventType: prefix,
        aggregateType: "INSTITUTION",
        aggregateId,
        payloadSafe,
        dedupeKey: `${prefix}_${randomUUID()}`,
        availableAt,
      },
      runtime.executor,
    );

    expect(event).toMatchObject({
      eventType: prefix,
      aggregateType: "INSTITUTION",
      aggregateId,
      payload: payloadSafe,
      dedupeKey: expect.stringMatching(/^WP_05_WRITER_TEST_/),
      availableAt,
      status: "PENDING",
      attemptCount: 0,
      maxAttempts: 3,
      lockedAt: null,
      lockedBy: null,
      processedAt: null,
      deadLetteredAt: null,
    });
  });

  it("commits and rolls back fixture mutations with Outbox enqueue in the provided transaction", async () => {
    const committedId = newInstitutionId();
    const rolledBackId = newInstitutionId();
    const committedKey = `${prefix}_${randomUUID()}`;
    const rolledBackKey = `${prefix}_${randomUUID()}`;

    await runtime.transactionManager.run(async (executor) => {
      const institution = await insertFixtureInstitution(executor, committedId);
      await OutboxWriter.enqueue(
        {
          eventType: prefix,
          aggregateType: "INSTITUTION",
          aggregateId: institution.id,
          payloadSafe: { operation: "COMMITTED" },
          dedupeKey: committedKey,
        },
        executor,
      );
    });
    await expect(
      runtime.transactionManager.run(async (executor) => {
        const institution = await insertFixtureInstitution(
          executor,
          rolledBackId,
        );
        await OutboxWriter.enqueue(
          {
            eventType: prefix,
            aggregateType: "INSTITUTION",
            aggregateId: institution.id,
            payloadSafe: { operation: "ROLLED_BACK" },
            dedupeKey: rolledBackKey,
          },
          executor,
        );
        throw new Error("WP_05_OUTBOX_ROLLBACK");
      }),
    ).rejects.toThrow("WP_05_OUTBOX_ROLLBACK");

    await expect(
      runtime.executor.drizzle
        .select()
        .from(institutions)
        .where(eq(institutions.id, committedId)),
    ).resolves.toHaveLength(1);
    await expect(
      runtime.executor.drizzle
        .select()
        .from(institutions)
        .where(eq(institutions.id, rolledBackId)),
    ).resolves.toHaveLength(0);
    const [committed] = await runtime.executor.drizzle
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.dedupeKey, committedKey));
    expect(committed).toMatchObject({ status: "PENDING", attemptCount: 0 });
    await expect(
      runtime.executor.drizzle
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.dedupeKey, rolledBackKey)),
    ).resolves.toHaveLength(0);
  });

  it("rejects blank dedupe keys and maps duplicate canonical keys to ConflictError", async () => {
    const base = {
      eventType: prefix,
      aggregateType: "INSTITUTION",
      aggregateId: randomUUID(),
      payloadSafe: { kind: "DEDUPLICATION" },
    };
    await expect(
      OutboxWriter.enqueue({ ...base, dedupeKey: " \t " }, runtime.executor),
    ).rejects.toBeInstanceOf(ValidationError);

    const dedupeKey = `${prefix}_${randomUUID()}`;
    await OutboxWriter.enqueue({ ...base, dedupeKey }, runtime.executor);
    await expect(
      OutboxWriter.enqueue({ ...base, dedupeKey }, runtime.executor),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message: "The requested state conflicts with existing data.",
    } satisfies Partial<ConflictError>);
  });

  it("rejects unsafe Outbox payload shapes without inserting", async () => {
    const unsafePayloads: unknown[] = [
      new Error("unsafe"),
      new Date(),
      { nested: undefined },
      { number: Number.NaN },
      { function: () => undefined },
      { symbol: Symbol("unsafe") },
      { bigint: 1n },
      Object.create({ inherited: "unsafe" }),
    ];
    const circular: { self?: unknown } = {};
    circular.self = circular;
    unsafePayloads.push(circular);
    unsafePayloads.push({
      a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } },
    });
    const accessorPayload: Record<string, unknown> = {};
    Object.defineProperty(accessorPayload, "unsafe", {
      enumerable: true,
      get() {
        throw new Error("payload accessor must not run");
      },
    });
    unsafePayloads.push(accessorPayload);

    for (const payloadSafe of unsafePayloads) {
      await expect(
        OutboxWriter.enqueue(
          {
            eventType: prefix,
            aggregateType: "INSTITUTION",
            aggregateId: randomUUID(),
            payloadSafe: payloadSafe as never,
            dedupeKey: `${prefix}_${randomUUID()}`,
          },
          runtime.executor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    }

    expect(await countRows("outbox_events")).toBe(0);
  });

  it("rejects hidden Outbox serialization hooks without inserting", async () => {
    const payloadWithToJson: Record<string, unknown> = {};
    Object.defineProperty(payloadWithToJson, "toJSON", {
      enumerable: false,
      value: () => ({ email: "hidden@example.test" }),
    });
    const arrayWithToJson = ["SAFE"];
    Object.defineProperty(arrayWithToJson, "toJSON", {
      enumerable: false,
      value: () => ["RAW_REQUEST_BODY"],
    });
    const payloadWithSymbol = { safe: true, [Symbol("unsafe")]: "value" };

    for (const payloadSafe of [
      payloadWithToJson,
      { changedFields: arrayWithToJson },
      payloadWithSymbol,
    ]) {
      await expect(
        OutboxWriter.enqueue(
          {
            eventType: prefix,
            aggregateType: "INSTITUTION",
            aggregateId: randomUUID(),
            payloadSafe: payloadSafe as never,
            dedupeKey: `${prefix}_${randomUUID()}`,
          },
          runtime.executor,
        ),
      ).rejects.toBeInstanceOf(ValidationError);
    }

    expect(await countRows("outbox_events")).toBe(0);
  });

  it("preserves a raw legacy NULL dedupe row without mutating or claiming it", async () => {
    const legacyAggregateId = randomUUID();
    const [legacy] = await runtime.client<{ id: string }[]>`
      insert into outbox_events (event_type, aggregate_type, aggregate_id, payload)
      values (${prefix}, 'INSTITUTION', ${legacyAggregateId}, '{}'::jsonb)
      returning id
    `;
    const event = await OutboxWriter.enqueue(
      {
        eventType: prefix,
        aggregateType: "INSTITUTION",
        aggregateId: randomUUID(),
        payloadSafe: { kind: "CANONICAL" },
        dedupeKey: `${prefix}_${randomUUID()}`,
      },
      runtime.executor,
    );
    const [preserved] = await runtime.client<
      {
        dedupe_key: string | null;
        status: string;
        attempt_count: number;
        locked_at: Date | null;
        processed_at: Date | null;
      }[]
    >`
      select dedupe_key, status, attempt_count, locked_at, processed_at
      from outbox_events where id = ${legacy!.id}
    `;

    expect(event.id).not.toBe(legacy!.id);
    expect(preserved).toEqual({
      dedupe_key: null,
      status: "PENDING",
      attempt_count: 0,
      locked_at: null,
      processed_at: null,
    });
  });

  it("does not create delivery work or mutate Outbox processing fields", async () => {
    const before = await runtime.client<
      { notifications: number; deliveries: number; attempts: number }[]
    >`
      select
        (select count(*)::int from notifications) as notifications,
        (select count(*)::int from notification_deliveries) as deliveries,
        (select count(*)::int from notification_delivery_attempts) as attempts
    `;
    const event = await OutboxWriter.enqueue(
      {
        eventType: prefix,
        aggregateType: "INSTITUTION",
        aggregateId: randomUUID(),
        payloadSafe: { kind: "NO_SIDE_EFFECT" },
        dedupeKey: `${prefix}_${randomUUID()}`,
        maxAttempts: 7,
      },
      runtime.executor,
    );
    const after = await runtime.client<
      { notifications: number; deliveries: number; attempts: number }[]
    >`
      select
        (select count(*)::int from notifications) as notifications,
        (select count(*)::int from notification_deliveries) as deliveries,
        (select count(*)::int from notification_delivery_attempts) as attempts
    `;
    const [persisted] = await runtime.executor.drizzle
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, event.id));

    expect(after).toEqual(before);
    expect(persisted).toMatchObject({
      maxAttempts: 7,
      status: "PENDING",
      attemptCount: 0,
      lockedAt: null,
      lockedBy: null,
      processedAt: null,
      deadLetteredAt: null,
    });
  });
});
