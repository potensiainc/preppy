import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { getOperationalSnapshot } from "@/src/modules/production-safety/operational-snapshot.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const lock = postgres(databaseUrl, { max: 1 });
const prefix = `wp16a-observe-${randomUUID()}`;
const ids = new Set<string>();

function id() {
  const value = randomUUID();
  ids.add(value);
  return value;
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`delete from email_provider_events where provider_event_id like ${`${prefix}%`}`;
    await transaction`delete from notification_delivery_attempts where notification_delivery_id in (select id from notification_deliveries where notification_id in (select id from notifications where dedupe_key like ${`${prefix}%`}))`;
    await transaction`delete from notification_deliveries where notification_id in (select id from notifications where dedupe_key like ${`${prefix}%`})`;
    await transaction`delete from notifications where dedupe_key like ${`${prefix}%`}`;
    await transaction`delete from outbox_events where aggregate_type='WP16A_FIXTURE'`;
    await transaction`delete from source_observations where source_id in (select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`})`;
    await transaction`delete from source_monitor_configs where source_id in (select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`})`;
    await transaction`delete from institution_source_bindings where source_id in (select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`})`;
    await transaction`delete from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}`;
    await transaction`delete from opportunities where slug like ${`${prefix}%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}%`}`;
    if (ids.size > 0) {
      await transaction`delete from users where id in ${transaction([...ids])}`;
    }
  });
  ids.clear();
}

describe("WP-16A operational snapshot", () => {
  beforeAll(async () => {
    await lock`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });
  afterEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await lock`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await lock.end({ timeout: 5 });
    await closeRuntimeDatabase();
  });

  it("counts queue, provider, monitoring, and cache failure states without mutation", async () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const nowIso = now.toISOString();
    const baseline = await getOperationalSnapshot(runtime.executor, { now });
    const institutionId = id();
    const opportunityId = id();
    const activeSourceId = id();
    const unavailableSourceId = id();
    const notificationId = id();
    const failedUserId = id();
    const unknownUserId = id();
    const failedDeliveryId = id();
    const unknownDeliveryId = id();

    await runtime.client.begin(async (transaction) => {
      await transaction`
        insert into institutions (
          id, slug, display_name, category, operational_state, publication_state
        ) values (
          ${institutionId}, ${`${prefix}-institution`}, 'WP16A Fixture',
          'ENGLISH_KINDERGARTEN', 'ACTIVE', 'PUBLISHED'
        )
      `;
      await transaction`
        insert into opportunities (
          id, institution_id, slug, kind, truth_mode, publication_state,
          published_at
        ) values (
          ${opportunityId}, ${institutionId}, ${`${prefix}-opportunity`},
          'APPLICATION', 'NATIVE', 'DRAFT', null
        )
      `;
      await transaction`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name
        ) values
          (${activeSourceId}, ${`https://official.example.test/${prefix}/active`},
            'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Active Source'),
          (${unavailableSourceId}, ${`https://official.example.test/${prefix}/inactive`},
            'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'PAUSED', 'Inactive Source')
      `;
      await transaction`
        insert into source_monitor_configs (
          source_id, collection_strategy, monitoring_profile, is_enabled
        ) values (${activeSourceId}, 'HTTP', 'LOW_CHANGE', true)
      `;
      await transaction`
        insert into institution_source_bindings (
          institution_id, source_id, role, is_primary, is_active
        ) values (${institutionId}, ${activeSourceId}, 'OFFICIAL_MAIN', true, true)
      `;
      await transaction`
        insert into source_observations (source_id, observed_at, outcome)
        values (${activeSourceId},
          '2026-08-01T00:00:00.000Z', 'UNCHANGED')
      `;
      await transaction`
        insert into users (id, status) values
          (${failedUserId}, 'ACTIVE'), (${unknownUserId}, 'ACTIVE')
      `;
      await transaction`
        insert into notifications (
          id, opportunity_id, signal_type, policy_version, status,
          signal_published_at, title_snapshot, body_context_json,
          deep_link_path, dedupe_key
        ) values (
          ${notificationId}, ${opportunityId}, 'OPPORTUNITY_PUBLISHED',
          'wp16a-v1', 'READY', ${nowIso}, 'Safe fixture', '{}'::jsonb,
          '/opportunities/fixture', ${`${prefix}-notification`}
        )
      `;
      await transaction`
        insert into notification_deliveries (
          id, notification_id, user_id, channel, status, failed_at, queued_at
        ) values
          (${failedDeliveryId}, ${notificationId}, ${failedUserId}, 'EMAIL',
            'FAILED', ${nowIso}, ${nowIso}),
          (${unknownDeliveryId}, ${notificationId}, ${unknownUserId}, 'EMAIL',
            'QUEUED', null, ${nowIso})
      `;
      await transaction`
        insert into notification_delivery_attempts (
          id, notification_delivery_id, attempt_number, provider,
          attempt_status, error_code, attempted_at
        ) values (
          ${id()}, ${unknownDeliveryId}, 1, 'RESEND', 'STARTED',
          'PROVIDER_RESULT_UNKNOWN', ${nowIso}
        )
      `;
      await transaction`
        insert into email_provider_events (
          id, provider, provider_event_id, provider_message_id, event_type,
          processing_status, processed_at, payload_hash, safe_error_code
        ) values (
          ${id()}, 'RESEND', ${`${prefix}-provider-event`},
          ${`${prefix}-orphan-message`}, 'email.failed', 'FAILED', ${nowIso},
          ${`sha256:${"a".repeat(64)}`}, 'FIXTURE_FAILURE'
        )
      `;

      const outboxRows = [
        [
          "OPPORTUNITY_CHANGE_PUBLISHED",
          "PENDING",
          "2026-08-25T11:50:00.000Z",
          null,
        ],
        [
          "OPPORTUNITY_CHANGE_PUBLISHED",
          "FAILED",
          "2026-08-25T11:00:00.000Z",
          null,
        ],
        [
          "OPPORTUNITY_CHANGE_PUBLISHED",
          "DEAD_LETTER",
          "2026-08-25T11:00:00.000Z",
          null,
        ],
        [
          "OPPORTUNITY_CHANGE_PUBLISHED",
          "PROCESSING",
          "2026-08-25T11:00:00.000Z",
          "2026-08-25T11:40:00.000Z",
        ],
        [
          "CACHE_REVALIDATION_REQUESTED",
          "FAILED",
          "2026-08-25T11:00:00.000Z",
          null,
        ],
        [
          "CACHE_REVALIDATION_REQUESTED",
          "DEAD_LETTER",
          "2026-08-25T11:00:00.000Z",
          null,
        ],
        [
          "CACHE_REVALIDATION_REQUESTED",
          "PROCESSING",
          "2026-08-25T11:00:00.000Z",
          "2026-08-25T11:40:00.000Z",
        ],
      ] as const;
      for (const [eventType, status, availableAt, lockedAt] of outboxRows) {
        const eventId = id();
        await transaction`
          insert into outbox_events (
            id, event_type, aggregate_type, aggregate_id, payload, status,
            available_at, locked_at, locked_by, last_error_code,
            last_error_at, dead_lettered_at
          ) values (
            ${eventId}, ${eventType}, 'WP16A_FIXTURE', ${opportunityId},
            '{}'::jsonb, ${status}, ${availableAt}, ${lockedAt},
            ${lockedAt === null ? null : "wp16a-worker"},
            ${status === "FAILED" || status === "DEAD_LETTER" ? "FIXTURE_FAILURE" : null},
            ${status === "FAILED" || status === "DEAD_LETTER" ? nowIso : null},
            ${status === "DEAD_LETTER" ? nowIso : null}
          )
        `;
      }
    });

    const snapshot = await getOperationalSnapshot(runtime.executor, { now });
    expect(snapshot.migration).toEqual({
      status: "MATCH",
      latest: "0012_loving_trauma",
    });
    expect(snapshot.outbox).toMatchObject({
      pending: baseline.outbox.pending + 1,
      failed: baseline.outbox.failed + 2,
      deadLetter: baseline.outbox.deadLetter + 2,
      staleProcessing: baseline.outbox.staleProcessing + 2,
    });
    expect(snapshot.outbox.workerLagSeconds).toBeGreaterThanOrEqual(600);
    expect(
      snapshot.outbox.oldestStaleProcessingAgeSeconds,
    ).toBeGreaterThanOrEqual(1_200);
    expect(snapshot.notification.failedDeliveries).toBe(
      baseline.notification.failedDeliveries + 1,
    );
    expect(snapshot.notification.resultUnknown).toBe(
      baseline.notification.resultUnknown + 1,
    );
    expect(snapshot.providerEvents).toEqual({
      failed: baseline.providerEvents.failed + 1,
      orphan: baseline.providerEvents.orphan + 1,
    });
    expect(snapshot.monitoring.sourceUnavailable).toBe(
      baseline.monitoring.sourceUnavailable + 1,
    );
    expect(snapshot.monitoring.overdue).toBeGreaterThanOrEqual(
      baseline.monitoring.overdue + 1,
    );
    expect(snapshot.cacheRevalidation).toEqual({
      failed: baseline.cacheRevalidation.failed + 1,
      deadLetter: baseline.cacheRevalidation.deadLetter + 1,
      staleProcessing: baseline.cacheRevalidation.staleProcessing + 1,
    });
    expect(snapshot.analytics).toEqual({
      telemetry: "NOT_PERSISTED",
      transportFailureCount: null,
      readinessImpact: "BEST_EFFORT",
    });
    expect(snapshot.alerts).toEqual(
      expect.arrayContaining([
        {
          code: "DELIVERY_RESULT_UNKNOWN",
          severity: "CRITICAL",
          count: baseline.notification.resultUnknown + 1,
        },
        expect.objectContaining({ code: "CACHE_REVALIDATION_DEAD_LETTER" }),
      ]),
    );
  });
});
