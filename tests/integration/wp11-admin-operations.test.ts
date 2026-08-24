import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type DatabaseExecutor,
} from "@/src/infrastructure/db/runtime.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const unique = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
const actionType = `WP11_OPERATIONS_${unique}`;
const eventType = `WP11_EVENT_${unique}`;
const now = new Date("2099-08-24T12:00:00.000Z");
const nowIso = now.toISOString();

async function importOperations() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/operations-query.server")
    >("@/src/modules/admin/read-model/operations-query.server");
  } catch {
    return null;
  }
}

async function importDataQuality() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/data-quality-query.server")
    >("@/src/modules/admin/read-model/data-quality-query.server");
  } catch {
    return null;
  }
}

async function importHealth() {
  try {
    return await vi.importActual<
      typeof import("@/src/modules/admin/read-model/health-query.server")
    >("@/src/modules/admin/read-model/health-query.server");
  } catch {
    return null;
  }
}

async function inRolledBackTransaction<T>(
  operation: (executor: DatabaseExecutor) => Promise<T>,
): Promise<T> {
  const rollback = new Error("WP-11 Operations test rollback");
  let result: T | undefined;
  let completed = false;
  try {
    await runtime.transactionManager.run(async (executor) => {
      result = await operation(executor);
      completed = true;
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  if (!completed) throw new Error("WP-11 Operations test did not complete");
  return result as T;
}

async function operationsFingerprint(executor: DatabaseExecutor) {
  const rows = (await executor.raw(sql`
    select concat_ws('|',
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from outbox_events item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from notifications item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from notification_deliveries item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from notification_delivery_attempts item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from audit_logs item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from admin_users item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from institutions item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from opportunities item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from opportunity_versions item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from institution_fact_versions item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from institution_source_bindings item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from opportunity_source_bindings item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from sources item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from source_monitor_configs item),
      (select md5(coalesce(string_agg(to_jsonb(item)::text, E'\n' order by to_jsonb(item)::text), '')) from source_observations item)
    ) as fingerprint
  `)) as unknown as Array<{ fingerprint: string }>;
  return rows[0]!.fingerprint;
}

async function seedOperationsFixture(executor: DatabaseExecutor) {
  const adminUserId = randomUUID();
  const institutionId = randomUUID();
  const opportunityId = randomUUID();
  const versionId = randomUUID();
  const sourceId = randomUUID();
  const userId = randomUUID();
  const notificationId = randomUUID();
  const deliveryId = randomUUID();
  const attemptId = randomUUID();
  const pendingOutboxId = randomUUID();
  const deadLetterOutboxId = randomUUID();
  const correlationId = randomUUID();

  await executor.raw(sql`
    insert into admin_users (
      id, display_name, email, external_auth_subject, status, created_at, updated_at
    ) values (
      ${adminUserId}, 'WP11 Operator', ${`operator-${unique}@example.test`},
      ${`wp11-operations-${unique}`}, 'ACTIVE',
      ${nowIso}, ${nowIso}
    )
  `);
  await executor.raw(sql`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${institutionId}, ${`wp11-operations-${unique.toLowerCase()}`},
      'WP11 Operations Institution', 'INTERNATIONAL_SCHOOL', 'ACTIVE', 'PUBLISHED'
    )
  `);
  await executor.raw(sql`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode, publication_state
    ) values (
      ${opportunityId}, ${institutionId},
      ${`wp11-operations-opportunity-${unique.toLowerCase()}`},
      'APPLICATION', 'NATIVE', 'PUBLISHED'
    )
  `);
  await executor.raw(sql`
    insert into opportunity_versions (
      id, opportunity_id, version_number, verification_state, business_state,
      is_current, title, verified_at, application_open_at
    ) values (
      ${versionId}, ${opportunityId}, 1, 'VERIFIED', 'OPEN', true,
      'WP11 Operations Admissions', ${nowIso}, '2099-08-01T00:00:00.000Z'
    )
  `);
  await executor.raw(sql`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status, source_name
    ) values (
      ${sourceId}, ${`https://official.example.test/${unique.toLowerCase()}`},
      'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP11 Operations Source'
    )
  `);
  await executor.raw(sql`
    insert into source_monitor_configs (
      source_id, collection_strategy, monitoring_profile,
      custom_interval_minutes, is_enabled
    ) values (${sourceId}, 'HTTP', 'CRITICAL_SEASONAL', 60, true)
  `);
  await executor.raw(sql`
    insert into opportunity_source_bindings (
      opportunity_id, source_id, role, is_primary, is_active
    ) values (${opportunityId}, ${sourceId}, 'PRIMARY_NOTICE', true, true)
  `);
  await executor.raw(sql`
    insert into source_observations (
      source_id, observed_at, outcome, http_status, error_message
    ) values (
      ${sourceId}, '1900-01-01T00:00:00.000Z', 'UNCHANGED', 200,
      'PII trap ops-observation@example.test stack SQL SELECT secret'
    )
  `);
  await executor.raw(sql`
    insert into users (id, status, created_at, updated_at)
    values (${userId}, 'ACTIVE', ${nowIso}, ${nowIso})
  `);
  await executor.raw(sql`
    insert into notifications (
      id, opportunity_id, signal_type, policy_version, status,
      signal_published_at, title_snapshot, body_context_json,
      deep_link_path, dedupe_key, created_at, ready_at
    ) values (
      ${notificationId}, ${opportunityId}, 'OPPORTUNITY_PUBLISHED',
      ${`wp11-${unique}`}, 'READY', ${nowIso}, 'WP11 signal',
      ${JSON.stringify({ email: "recipient@example.test", secret: "hidden" })}::jsonb,
      '/opportunities/wp11', ${`wp11-notification-${unique}`}, ${nowIso}, ${nowIso}
    )
  `);
  await executor.raw(sql`
    insert into notification_deliveries (
      id, notification_id, user_id, channel, status, recipient_hash,
      created_at, failed_at
    ) values (
      ${deliveryId}, ${notificationId}, ${userId}, 'EMAIL', 'FAILED',
      'recipient-hash-pii-trap', ${nowIso}, ${nowIso}
    )
  `);
  await executor.raw(sql`
    insert into notification_delivery_attempts (
      id, notification_delivery_id, attempt_number, provider,
      provider_message_id, attempt_status, error_code, error_message_safe,
      attempted_at, completed_at, created_at
    ) values (
      ${attemptId}, ${deliveryId}, 1, 'secret-provider',
      'provider-message-pii-trap', 'FAILED_RETRYABLE', 'recipient@example.test',
      'recipient@example.test SQL SELECT stack secret', ${nowIso}, ${nowIso}, ${nowIso}
    )
  `);
  await executor.raw(sql`
    insert into outbox_events (
      id, event_type, aggregate_type, aggregate_id, payload, status,
      available_at, attempt_count, max_attempts, created_at
    ) values (
      ${pendingOutboxId}, ${eventType}, 'OPPORTUNITY', ${opportunityId},
      ${JSON.stringify({ email: "recipient@example.test", body: "secret payload" })}::jsonb,
      'PENDING', ${nowIso}, 0, 3, ${nowIso}
    )
  `);
  await executor.raw(sql`
    insert into outbox_events (
      id, event_type, aggregate_type, aggregate_id, payload, status,
      available_at, attempt_count, max_attempts, last_error_code,
      last_error_at, dead_lettered_at, created_at
    ) values (
      ${deadLetterOutboxId}, ${eventType}, 'recipient@example.test', ${opportunityId},
      ${JSON.stringify({ token: "hidden", sql: "SELECT secret" })}::jsonb,
      'DEAD_LETTER', ${nowIso}, 3, 3, 'PROVIDER.TIMEOUT', ${nowIso}, ${nowIso}, ${nowIso}
    )
  `);
  await executor.raw(sql`
    insert into audit_logs (
      admin_user_id, action_type, entity_type, entity_id,
      before_data, after_data, created_at
    ) values (
      ${adminUserId}, ${actionType}, 'recipient@example.test', ${sourceId},
      ${JSON.stringify({ email: "recipient@example.test", secret: "hidden", stack: "trace" })}::jsonb,
      ${JSON.stringify({
        correlationId,
        reason: "SOURCE_URL_CORRECTION_CONFIRMED",
        email: "recipient@example.test",
        sql: "SELECT secret",
        stack: "trace",
        metadata: {
          sourceId,
          targetId: opportunityId,
          changedFields: ["CANONICAL_URL"],
          secret: "hidden",
          providerMessageId: "provider-message-pii-trap",
        },
      })}::jsonb,
      ${nowIso}
    )
  `);

  return {
    adminUserId,
    institutionId,
    opportunityId,
    sourceId,
    userId,
    notificationId,
    deliveryId,
    attemptId,
    deadLetterOutboxId,
    correlationId,
  };
}

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(77411012)`;
  try {
    await migrateDatabase(databaseUrl);
  } finally {
    await schemaLockSql`select pg_advisory_unlock(77411012)`;
  }
});

afterAll(async () => {
  await closeRuntimeDatabase();
  await schemaLockSql.end();
});

describe("WP-11 Admin Operations projections", () => {
  it("returns exact PII-safe Outbox, Delivery attempt, and Audit DTOs without writes", async () => {
    const operations = await importOperations();
    expect(operations).not.toBeNull();
    if (!operations) return;

    await inRolledBackTransaction(async (executor) => {
      const fixture = await seedOperationsFixture(executor);
      const before = await operationsFingerprint(executor);
      const [outbox, deliveries, audit] = await Promise.all([
        operations.listAdminOutbox(executor, {
          status: "DEAD_LETTER",
          eventType,
          pageSize: 1,
        }),
        operations.listAdminDeliveries(executor, {
          notificationId: fixture.notificationId,
          pageSize: 1,
        }),
        operations.listAdminAudit(executor, {
          actionType,
          pageSize: 1,
        }),
      ]);

      expect(outbox.items).toHaveLength(1);
      expect(outbox.items[0]).toEqual({
        id: fixture.deadLetterOutboxId,
        eventType,
        aggregateType: "INVALID_IDENTIFIER",
        aggregateId: fixture.opportunityId,
        status: "DEAD_LETTER",
        availableAt: now.toISOString(),
        processedAt: null,
        attemptCount: 3,
        maxAttempts: 3,
        errorCode: "PROVIDER.TIMEOUT",
        lastErrorAt: now.toISOString(),
        deadLetteredAt: now.toISOString(),
        createdAt: now.toISOString(),
        deliveryId: null,
        latestAttempt: null,
        actions: {
          canRetry: false,
          canCancel: false,
          canReconcileResend: false,
        },
      });
      expect(Object.keys(deliveries.items[0]!).sort()).toEqual(
        [
          "attemptCount",
          "channel",
          "createdAt",
          "deliveryId",
          "latestAttempt",
          "notificationId",
          "status",
          "suppressReason",
          "terminalAt",
        ].sort(),
      );
      expect(deliveries.items[0]).toMatchObject({
        deliveryId: fixture.deliveryId,
        notificationId: fixture.notificationId,
        status: "FAILED",
        attemptCount: 1,
        latestAttempt: {
          id: fixture.attemptId,
          attemptNumber: 1,
          status: "FAILED_RETRYABLE",
          errorCategory: "RETRYABLE",
          errorCode: null,
        },
      });
      expect(audit.items).toEqual([
        {
          id: expect.stringMatching(/^\d+$/),
          actor: { adminUserId: fixture.adminUserId },
          action: actionType,
          entityType: "INVALID_IDENTIFIER",
          entityId: fixture.sourceId,
          reason: "SOURCE_URL_CORRECTION_CONFIRMED",
          correlationId: fixture.correlationId,
          metadata: {
            sourceId: fixture.sourceId,
            targetId: fixture.opportunityId,
            changedFields: ["CANONICAL_URL"],
          },
          createdAt: now.toISOString(),
        },
      ]);

      const serialized = JSON.stringify({ outbox, deliveries, audit });
      for (const forbidden of [
        "recipient@example.test",
        "recipient-hash-pii-trap",
        "provider-message-pii-trap",
        "secret-provider",
        "secret payload",
        "SELECT secret",
        "stack",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(await operationsFingerprint(executor)).toBe(before);
    });
  });

  it("uses strict bounded filters and stable pages", async () => {
    const operations = await importOperations();
    expect(operations).not.toBeNull();
    if (!operations) return;

    expect(
      operations.parseAdminOutboxInput({
        status: "PENDING",
        eventType: "OPPORTUNITY_CHANGED",
        page: "2",
        pageSize: "50",
      }),
    ).toEqual({
      status: "PENDING",
      eventType: "OPPORTUNITY_CHANGED",
      page: 2,
      pageSize: 50,
    });
    expect(
      operations.parseAdminDeliveryInput({
        status: "FAILED",
        notificationId: "127f567d-f823-4bcc-bdf2-43557d583592",
      }),
    ).toEqual({
      status: "FAILED",
      notificationId: "127f567d-f823-4bcc-bdf2-43557d583592",
      page: 1,
      pageSize: 20,
    });
    expect(
      operations.parseAdminAuditInput({
        actionType: "WP10B_SOURCE_URL_CORRECTED",
        entityType: "SOURCE",
      }),
    ).toEqual({
      actionType: "WP10B_SOURCE_URL_CORRECTED",
      entityType: "SOURCE",
      page: 1,
      pageSize: 20,
    });
    for (const invalid of [
      { status: "RETRY_NOW" },
      { pageSize: "51" },
      { eventType: "not canonical" },
      { unexpected: "field" },
      { notificationId: [randomUUID()] },
    ]) {
      expect(() => operations.parseAdminOutboxInput(invalid)).toThrowError(
        expect.objectContaining({ code: "VALIDATION_ERROR" }),
      );
    }
    expect(() =>
      operations.parseAdminDeliveryInput({ status: "SEND_NOW" }),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
    expect(() =>
      operations.parseAdminAuditInput({ actionType: "unsafe action" }),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });

  it("uses stable SQL pagination, exact filters, and grouped latest attempts", async () => {
    const operations = await importOperations();
    expect(operations).not.toBeNull();
    if (!operations) return;

    await inRolledBackTransaction(async (executor) => {
      const fixture = await seedOperationsFixture(executor);
      const pageEventType = `WP11_PAGE_${unique}`;
      const outboxIds = [
        "10000000-0000-4000-8000-000000000001",
        "10000000-0000-4000-8000-000000000002",
        "10000000-0000-4000-8000-000000000003",
      ] as const;
      await executor.raw(sql`
        insert into outbox_events (
          id, event_type, aggregate_type, aggregate_id, payload, status,
          available_at, attempt_count, max_attempts, dead_lettered_at, created_at
        ) values
          (${outboxIds[0]}, ${pageEventType}, 'OPPORTUNITY', ${fixture.opportunityId}, '{}'::jsonb, 'PENDING', ${nowIso}, 0, 3, null, ${nowIso}),
          (${outboxIds[1]}, ${pageEventType}, 'SOURCE', ${fixture.sourceId}, '{}'::jsonb, 'DEAD_LETTER', ${nowIso}, 3, 3, ${nowIso}, ${nowIso}),
          (${outboxIds[2]}, ${pageEventType}, 'SOURCE', ${fixture.sourceId}, '{}'::jsonb, 'PENDING', ${nowIso}, 0, 3, null, ${nowIso})
      `);
      const pendingPageOne = await operations.listAdminOutbox(executor, {
        eventType: pageEventType,
        status: "PENDING",
        page: 1,
        pageSize: 1,
      });
      const pendingPageTwo = await operations.listAdminOutbox(executor, {
        eventType: pageEventType,
        status: "PENDING",
        page: 2,
        pageSize: 1,
      });
      expect(pendingPageOne.items.map((item) => item.id)).toEqual([
        outboxIds[2],
      ]);
      expect(pendingPageOne.pagination).toMatchObject({
        total: 2,
        hasNext: true,
      });
      expect(pendingPageTwo.items.map((item) => item.id)).toEqual([
        outboxIds[0],
      ]);
      expect(pendingPageTwo.pagination.hasNext).toBe(false);
      const sourceDeadLetter = await operations.listAdminOutbox(executor, {
        eventType: pageEventType,
        aggregateType: "SOURCE",
        status: "DEAD_LETTER",
      });
      expect(sourceDeadLetter.items.map((item) => item.id)).toEqual([
        outboxIds[1],
      ]);

      const secondUserId = randomUUID();
      const secondDeliveryId = "20000000-0000-4000-8000-000000000002";
      const attemptIds = [
        "30000000-0000-4000-8000-000000000001",
        "30000000-0000-4000-8000-000000000002",
      ] as const;
      await executor.raw(sql`
        insert into users (id, status, created_at, updated_at)
        values (${secondUserId}, 'ACTIVE', ${nowIso}, ${nowIso})
      `);
      await executor.raw(sql`
        insert into notification_deliveries (
          id, notification_id, user_id, channel, status, recipient_hash,
          created_at, delivered_at
        ) values (
          ${secondDeliveryId}, ${fixture.notificationId}, ${secondUserId},
          'EMAIL', 'DELIVERED', 'second-recipient-hash-trap', ${nowIso}, ${nowIso}
        )
      `);
      await executor.raw(sql`
        insert into notification_delivery_attempts (
          id, notification_delivery_id, attempt_number, provider,
          provider_message_id, attempt_status, error_code, error_message_safe,
          attempted_at, completed_at, created_at
        ) values
          (${attemptIds[0]}, ${secondDeliveryId}, 1, 'provider-secret-one', 'provider-message-one', 'ACCEPTED', null, null, ${nowIso}, ${nowIso}, ${nowIso}),
          (${attemptIds[1]}, ${secondDeliveryId}, 2, 'provider-secret-two', 'provider-message-two', 'FAILED_TERMINAL', 'TERMINAL.BOUNCE', 'recipient@example.test stack', ${nowIso}, ${nowIso}, ${nowIso})
      `);
      const deliveryPage = await operations.listAdminDeliveries(executor, {
        notificationId: fixture.notificationId,
        pageSize: 50,
      });
      expect(deliveryPage.pagination.total).toBe(2);
      const deliveryOrder = [fixture.deliveryId, secondDeliveryId]
        .sort()
        .reverse();
      expect(deliveryPage.items.map((item) => item.deliveryId)).toEqual(
        deliveryOrder,
      );
      const deliveryPageOne = await operations.listAdminDeliveries(executor, {
        notificationId: fixture.notificationId,
        page: 1,
        pageSize: 1,
      });
      const deliveryPageTwo = await operations.listAdminDeliveries(executor, {
        notificationId: fixture.notificationId,
        page: 2,
        pageSize: 1,
      });
      expect(deliveryPageOne.items[0]!.deliveryId).toBe(deliveryOrder[0]);
      expect(deliveryPageOne.pagination.hasNext).toBe(true);
      expect(deliveryPageTwo.items[0]!.deliveryId).toBe(deliveryOrder[1]);
      expect(deliveryPageTwo.pagination.hasNext).toBe(false);
      expect(
        deliveryPage.items.find(
          (item) => item.deliveryId === fixture.deliveryId,
        ),
      ).toMatchObject({
        attemptCount: 1,
        latestAttempt: { id: fixture.attemptId, attemptNumber: 1 },
      });
      const secondDelivery = deliveryPage.items.find(
        (item) => item.deliveryId === secondDeliveryId,
      )!;
      expect(secondDelivery).toMatchObject({
        status: "DELIVERED",
        attemptCount: 2,
        latestAttempt: {
          id: attemptIds[1],
          attemptNumber: 2,
          status: "FAILED_TERMINAL",
          errorCategory: "TERMINAL",
          errorCode: "TERMINAL.BOUNCE",
        },
      });
      const deliveredOnly = await operations.listAdminDeliveries(executor, {
        notificationId: fixture.notificationId,
        status: "DELIVERED",
      });
      expect(deliveredOnly.items.map((item) => item.deliveryId)).toEqual([
        secondDeliveryId,
      ]);
      expect(JSON.stringify(deliveryPage)).not.toMatch(
        /second-recipient|provider-secret|provider-message|recipient@example/i,
      );

      const auditAction = `WP11_PAGE_AUDIT_${unique}`;
      const auditRowsOne = (await executor.raw(sql`
        insert into audit_logs (
          admin_user_id, action_type, entity_type, entity_id, after_data, created_at
        ) values (
          ${fixture.adminUserId}, ${auditAction}, 'SOURCE', ${fixture.sourceId},
          ${JSON.stringify({ correlationId: randomUUID() })}::jsonb, ${nowIso}
        ) returning id::text as id
      `)) as unknown as Array<{ id: string }>;
      const auditRowsTwo = (await executor.raw(sql`
        insert into audit_logs (
          admin_user_id, action_type, entity_type, entity_id, after_data, created_at
        ) values (
          ${fixture.adminUserId}, ${auditAction}, 'SOURCE', ${fixture.sourceId},
          ${JSON.stringify({ correlationId: randomUUID() })}::jsonb, ${nowIso}
        ) returning id::text as id
      `)) as unknown as Array<{ id: string }>;
      const auditPageOne = await operations.listAdminAudit(executor, {
        actionType: auditAction,
        entityType: "SOURCE",
        adminUserId: fixture.adminUserId,
        page: 1,
        pageSize: 1,
      });
      const auditPageTwo = await operations.listAdminAudit(executor, {
        actionType: auditAction,
        entityType: "SOURCE",
        adminUserId: fixture.adminUserId,
        page: 2,
        pageSize: 1,
      });
      expect(auditPageOne.items.map((item) => item.id)).toEqual([
        auditRowsTwo[0]!.id,
      ]);
      expect(auditPageOne.pagination).toMatchObject({
        total: 2,
        hasNext: true,
      });
      expect(auditPageTwo.items.map((item) => item.id)).toEqual([
        auditRowsOne[0]!.id,
      ]);

      const malformedAction = `WP11_MALFORMED_${unique}`;
      await executor.raw(sql`
        insert into audit_logs (
          admin_user_id, action_type, entity_type, entity_id, after_data, created_at
        ) values (
          ${fixture.adminUserId}, ${malformedAction}, 'recipient@example.test',
          ${fixture.sourceId},
          ${JSON.stringify({
            correlationId: "recipient@example.test",
            reason: "unsafe reason with spaces",
            metadata: {
              expectedVersion: "999999999999999999999",
              sourceId: "recipient@example.test",
              changedFields: { secret: "not-an-array" },
              outcomeCode: "unsafe code",
            },
          })}::jsonb,
          ${nowIso}
        )
      `);
      const malformed = await operations.listAdminAudit(executor, {
        actionType: malformedAction,
      });
      expect(malformed.items).toEqual([
        expect.objectContaining({
          action: malformedAction,
          entityType: "INVALID_IDENTIFIER",
          reason: null,
          correlationId: null,
          metadata: {},
        }),
      ]);
    });
  });

  it("reports exact bounded integrity warnings and safe real health without repair", async () => {
    const dataQuality = await importDataQuality();
    const health = await importHealth();
    expect(dataQuality).not.toBeNull();
    expect(health).not.toBeNull();
    if (!dataQuality || !health) return;

    await inRolledBackTransaction(async (executor) => {
      const baseline = await dataQuality.getAdminDataQuality(executor, {
        now,
        detailLimit: 20,
      });
      const fixture = await seedOperationsFixture(executor);
      const before = await operationsFingerprint(executor);
      const quality = await dataQuality.getAdminDataQuality(executor, {
        now,
        detailLimit: 20,
      });
      const warningCodes = quality.warnings.map((warning) => warning.code);
      expect(warningCodes).toEqual([
        "MULTIPLE_CURRENT_VERSIONS",
        "ACTIVE_PRIMARY_MULTIPLICITY",
        "ORPHANED_CANONICAL_LINKS",
        "OVERDUE_CRITICAL_MONITORING",
      ]);
      const baselineOverdue = baseline.warnings.find(
        (warning) => warning.code === "OVERDUE_CRITICAL_MONITORING",
      )!;
      const overdue = quality.warnings.find(
        (warning) => warning.code === "OVERDUE_CRITICAL_MONITORING",
      )!;
      expect(overdue.evaluationStatus).toBe("AVAILABLE");
      expect(baselineOverdue.evaluationStatus).toBe("AVAILABLE");
      expect(overdue.count).toBe((baselineOverdue.count ?? 0) + 1);
      expect(overdue.details).toContainEqual(
        expect.objectContaining({
          targetType: "OPPORTUNITY",
          targetId: fixture.opportunityId,
          relatedId: fixture.sourceId,
        }),
      );
      expect(
        quality.warnings.every((warning) => warning.details.length <= 20),
      ).toBe(true);

      const status = await health.getAdminHealth(executor, { now });
      expect(status.database).toEqual({ status: "AVAILABLE" });
      expect(status.outbox.status).toBe("AVAILABLE");
      expect(status.outbox.pending ?? 0).toBeGreaterThanOrEqual(1);
      expect(status.outbox.deadLetter ?? 0).toBeGreaterThanOrEqual(1);
      expect(status.dataQuality.warningCount).toBeGreaterThanOrEqual(1);
      expect(status.checkedAt).toBe(now.toISOString());
      expect(JSON.stringify(status)).not.toMatch(
        /kill.?switch|recipient|payload|provider|sql|stack|secret/i,
      );
      expect(await operationsFingerprint(executor)).toBe(before);
    });
  });

  it("isolates real corruption checks and preserves successful exact warnings", async () => {
    const dataQuality = await importDataQuality();
    const health = await importHealth();
    expect(dataQuality).not.toBeNull();
    expect(health).not.toBeNull();
    if (!dataQuality || !health) return;

    await inRolledBackTransaction(async (executor) => {
      const baseline = await dataQuality.getAdminDataQuality(executor, {
        now,
        detailLimit: 50,
      });
      const fixture = await seedOperationsFixture(executor);
      const secondVersionId = randomUUID();
      const primarySourceOne = randomUUID();
      const primarySourceTwo = randomUUID();
      const orphanSourceId = randomUUID();

      await executor.raw(
        sql`drop index opportunity_versions_one_current_per_opportunity`,
      );
      await executor.raw(sql`
        insert into opportunity_versions (
          id, opportunity_id, version_number, verification_state, business_state,
          is_current, title, verified_at, application_open_at
        ) values (
          ${secondVersionId}, ${fixture.opportunityId}, 2, 'VERIFIED', 'OPEN',
          true, 'Corrupted second current version', ${nowIso},
          '2099-08-01T00:00:00.000Z'
        )
      `);
      await executor.raw(sql`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name
        ) values
          (${primarySourceOne}, ${`https://official.example.test/${unique.toLowerCase()}/tuition-1`}, 'OFFICIAL_SCHOOL_PAGE', 'PRIMARY', 'ACTIVE', 'Tuition one'),
          (${primarySourceTwo}, ${`https://official.example.test/${unique.toLowerCase()}/tuition-2`}, 'OFFICIAL_SCHOOL_PAGE', 'PRIMARY', 'ACTIVE', 'Tuition two')
      `);
      await executor.raw(sql`
        insert into institution_source_bindings (
          institution_id, source_id, role, is_primary, is_active
        ) values
          (${fixture.institutionId}, ${primarySourceOne}, 'TUITION', true, true),
          (${fixture.institutionId}, ${primarySourceTwo}, 'TUITION', true, true)
      `);
      await executor.raw(sql`
        alter table institution_source_bindings
        drop constraint institution_source_bindings_source_id_sources_id_fk
      `);
      await executor.raw(sql`
        insert into institution_source_bindings (
          institution_id, source_id, role, is_primary, is_active
        ) values (${fixture.institutionId}, ${orphanSourceId}, 'OTHER', false, true)
      `);

      const quality = await dataQuality.getAdminDataQuality(executor, {
        now,
        detailLimit: 50,
      });
      const byCode = new Map(
        quality.warnings.map((warning) => [warning.code, warning]),
      );
      const baselineByCode = new Map(
        baseline.warnings.map((warning) => [warning.code, warning]),
      );
      const multiple = byCode.get("MULTIPLE_CURRENT_VERSIONS")!;
      const primary = byCode.get("ACTIVE_PRIMARY_MULTIPLICITY")!;
      const orphan = byCode.get("ORPHANED_CANONICAL_LINKS")!;
      const monitoring = byCode.get("OVERDUE_CRITICAL_MONITORING")!;

      expect(quality.status).toBe("PARTIAL");
      for (const warning of [multiple, primary, orphan]) {
        expect(warning.evaluationStatus).toBe("AVAILABLE");
        expect(warning.errorCategory).toBeNull();
      }
      expect(multiple.count).toBe(
        (baselineByCode.get("MULTIPLE_CURRENT_VERSIONS")!.count ?? 0) + 1,
      );
      expect(multiple.details).toContainEqual(
        expect.objectContaining({
          targetType: "OPPORTUNITY",
          targetId: fixture.opportunityId,
          observedCount: 2,
        }),
      );
      expect(primary.count).toBe(
        (baselineByCode.get("ACTIVE_PRIMARY_MULTIPLICITY")!.count ?? 0) + 1,
      );
      expect(primary.details).toContainEqual(
        expect.objectContaining({
          targetType: "INSTITUTION",
          targetId: fixture.institutionId,
          observedCount: 2,
        }),
      );
      expect(orphan.count).toBe(
        (baselineByCode.get("ORPHANED_CANONICAL_LINKS")!.count ?? 0) + 1,
      );
      expect(orphan.details).toContainEqual({
        targetType: "INSTITUTION_SOURCE_BINDING",
        targetId: fixture.institutionId,
        relatedId: orphanSourceId,
        observedCount: 1,
      });
      expect(monitoring).toMatchObject({
        evaluationStatus: "UNAVAILABLE",
        errorCategory: "EVALUATION_FAILED",
        count: null,
        details: [],
      });

      const bundle = await health.getAdminHealthBundle(executor, { now });
      expect(bundle.health.status).toBe("ATTENTION");
      expect(bundle.health.database.status).toBe("AVAILABLE");
      expect(bundle.health.dataQuality).toMatchObject({
        status: "PARTIAL",
        unavailableCheckCount: 1,
      });
      expect(bundle.dataQuality.warnings).toContainEqual(
        expect.objectContaining({
          code: "MULTIPLE_CURRENT_VERSIONS",
          evaluationStatus: "AVAILABLE",
        }),
      );
    });
  });

  it("returns one fail-safe unavailable health bundle on connectivity failure", async () => {
    const health = await importHealth();
    expect(health).not.toBeNull();
    if (!health) return;
    const failingExecutor = {
      scope: "runtime",
      raw: async () => {
        throw new Error("database unavailable: secret SQL stack");
      },
      drizzle: {},
    } as unknown as DatabaseExecutor;

    const bundle = await health.getAdminHealthBundle(failingExecutor, { now });
    expect(bundle.health).toEqual({
      status: "UNAVAILABLE",
      checkedAt: nowIso,
      database: { status: "UNAVAILABLE" },
      outbox: {
        status: "UNAVAILABLE",
        pending: null,
        processing: null,
        failed: null,
        deadLetter: null,
      },
      dataQuality: {
        status: "UNAVAILABLE",
        warningCount: 0,
        affectedRecordCount: 0,
        unavailableCheckCount: 4,
      },
    });
    expect(bundle.dataQuality.status).toBe("UNAVAILABLE");
    expect(
      bundle.dataQuality.warnings.every(
        (warning) =>
          warning.evaluationStatus === "UNAVAILABLE" &&
          warning.count === null &&
          warning.details.length === 0,
      ),
    ).toBe(true);
    expect(JSON.stringify(bundle)).not.toMatch(/secret|sql|stack/i);
  });
});
