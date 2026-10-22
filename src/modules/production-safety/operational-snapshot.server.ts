import "server-only";

import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { isAccountDeletionSchemaReady } from "@/src/modules/account-deletion/readiness.server";
import { countMonitoringDueStates } from "@/src/modules/monitoring/queue-query.server";
import {
  EXPECTED_REPOSITORY_MIGRATIONS,
  withoutKnownHistoricalLedgerRows,
} from "@/src/modules/production-safety/migration-manifest";
import { DEFAULT_WORKER_LEASE_DURATION_MS } from "@/src/modules/worker/cli";

export type OperationalAlert = Readonly<{
  code: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  count: number;
}>;

export type OperationalSnapshot = Readonly<{
  checkedAt: string;
  consistency: "POINT_IN_TIME_PER_QUERY";
  database: "AVAILABLE";
  migration: Readonly<{
    status: "MATCH" | "MISMATCH";
    latest: string | null;
  }>;
  outbox: Readonly<{
    pending: number;
    failed: number;
    deadLetter: number;
    staleProcessing: number;
    oldestStaleProcessingAgeSeconds: number | null;
    workerLagSeconds: number | null;
    heldEmailDelivery: number;
    heldCacheRevalidation: number;
  }>;
  notification: Readonly<{
    failedDeliveries: number;
    resultUnknown: number;
  }>;
  providerEvents: Readonly<{ failed: number; orphan: number }>;
  monitoring: Readonly<{
    due: number;
    overdue: number;
    sourceUnavailable: number;
  }>;
  cacheRevalidation: Readonly<{
    failed: number;
    deadLetter: number;
    staleProcessing: number;
  }>;
  analytics: Readonly<{
    telemetry: "NOT_PERSISTED";
    transportFailureCount: null;
    readinessImpact: "BEST_EFFORT";
  }>;
  alerts: readonly OperationalAlert[];
}>;

type AggregateRow = {
  outboxPending: number;
  outboxFailed: number;
  outboxDeadLetter: number;
  outboxStaleProcessing: number;
  oldestStaleProcessingAgeSeconds: number | null;
  workerLagSeconds: number | null;
  heldEmailDelivery: number;
  heldCacheRevalidation: number;
  failedDeliveries: number;
  resultUnknown: number;
  providerEventFailed: number;
  providerEventOrphan: number;
  sourceUnavailable: number;
  cacheFailed: number;
  cacheDeadLetter: number;
  cacheStaleProcessing: number;
};

// The worker cron runs every five minutes; three missed runs is a stall.
export const WORKER_LAG_ALERT_SECONDS = 900;

export type HeldOutboxEventType =
  "DELIVERY_EMAIL_SEND" | "CACHE_REVALIDATION_REQUESTED";

// Event types whose capability flag is off are held on purpose. They are
// counted separately and kept out of the worker-lag alert.
export function heldOutboxEventTypes(
  flags: Readonly<{
    EMAIL_SEND_ENABLED: boolean;
    CACHE_REVALIDATION_ENABLED: boolean;
  }>,
): HeldOutboxEventType[] {
  return [
    ...(flags.EMAIL_SEND_ENABLED ? [] : ["DELIVERY_EMAIL_SEND" as const]),
    ...(flags.CACHE_REVALIDATION_ENABLED
      ? []
      : ["CACHE_REVALIDATION_REQUESTED" as const]),
  ];
}

function alertsFor(
  row: AggregateRow,
  migrationStatus: "MATCH" | "MISMATCH",
  monitoringOverdue: number,
): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  if (migrationStatus === "MISMATCH") {
    alerts.push({ code: "MIGRATION_MISMATCH", severity: "CRITICAL", count: 1 });
  }
  if (row.resultUnknown > 0) {
    alerts.push({
      code: "DELIVERY_RESULT_UNKNOWN",
      severity: "CRITICAL",
      count: row.resultUnknown,
    });
  }
  if ((row.workerLagSeconds ?? 0) > WORKER_LAG_ALERT_SECONDS) {
    alerts.push({ code: "OUTBOX_WORKER_LAG", severity: "WARNING", count: 1 });
  }
  for (const [count, code] of [
    [row.outboxDeadLetter, "OUTBOX_DEAD_LETTER"],
    [row.outboxStaleProcessing, "OUTBOX_STALE_PROCESSING"],
    [row.failedDeliveries, "NOTIFICATION_DELIVERY_FAILED"],
    [row.providerEventFailed, "PROVIDER_EVENT_FAILED"],
    [row.providerEventOrphan, "PROVIDER_EVENT_ORPHAN"],
    [row.cacheDeadLetter, "CACHE_REVALIDATION_DEAD_LETTER"],
    [monitoringOverdue, "MONITORING_OVERDUE"],
  ] as const) {
    if (count > 0) alerts.push({ code, severity: "WARNING", count });
  }
  return alerts;
}

export async function getOperationalSnapshot(
  executor: DatabaseExecutor,
  options: Readonly<{
    now: Date;
    leaseDurationMs?: number;
    countMonitoring?: typeof countMonitoringDueStates;
    heldEventTypes?: readonly HeldOutboxEventType[];
    accountDeletionEnabled?: boolean;
  }>,
): Promise<OperationalSnapshot> {
  if (!Number.isFinite(options.now.getTime())) {
    throw new Error("Invalid operational snapshot time.");
  }
  const leaseDurationMs =
    options.leaseDurationMs ?? DEFAULT_WORKER_LEASE_DURATION_MS;
  if (
    !Number.isSafeInteger(leaseDurationMs) ||
    leaseDurationMs < 1_000 ||
    leaseDurationMs > 3_600_000
  ) {
    throw new Error("Invalid operational lease threshold.");
  }
  const nowIso = options.now.toISOString();
  const staleBeforeIso = new Date(
    options.now.getTime() - leaseDurationMs,
  ).toISOString();
  const repository = EXPECTED_REPOSITORY_MIGRATIONS;
  const held = [...(options.heldEventTypes ?? [])];
  const heldArray = `{${held.join(",")}}`;
  const monitoringCounter = options.countMonitoring ?? countMonitoringDueStates;
  const [rows, ledgerRows, monitoring] = await Promise.all([
    executor.raw(sql`
      select
        count(*) filter (where e.status='PENDING')::int as "outboxPending",
        count(*) filter (where e.status='FAILED')::int as "outboxFailed",
        count(*) filter (where e.status='DEAD_LETTER')::int as "outboxDeadLetter",
        count(*) filter (
          where e.status='PROCESSING'
            and e.locked_at < ${staleBeforeIso}::timestamptz
        )::int as "outboxStaleProcessing",
        -- Ages are clamped to the int range so one very old row cannot make
        -- the whole health snapshot fail with "integer out of range".
        least(extract(epoch from (${nowIso}::timestamptz - min(e.locked_at) filter (
          where e.status='PROCESSING'
            and e.locked_at < ${staleBeforeIso}::timestamptz
        ))), 2147483647)::int as "oldestStaleProcessingAgeSeconds",
        least(extract(epoch from (${nowIso}::timestamptz - min(e.available_at) filter (
          where e.status='PENDING' and e.available_at <= ${nowIso}::timestamptz
            and not (e.event_type = any(${heldArray}::text[]))
        ))), 2147483647)::int as "workerLagSeconds",
        count(*) filter (
          where e.status='PENDING' and e.event_type='DELIVERY_EMAIL_SEND'
            and e.event_type = any(${heldArray}::text[])
        )::int as "heldEmailDelivery",
        count(*) filter (
          where e.status='PENDING' and e.event_type='CACHE_REVALIDATION_REQUESTED'
            and e.event_type = any(${heldArray}::text[])
        )::int as "heldCacheRevalidation",
        (select count(*)::int from notification_deliveries where status='FAILED')
          as "failedDeliveries",
        (select count(*)::int from notification_delivery_attempts
          where attempt_status='STARTED' and error_code='PROVIDER_RESULT_UNKNOWN')
          as "resultUnknown",
        (select count(*)::int from email_provider_events
          where processing_status='FAILED') as "providerEventFailed",
        (select count(*)::int from email_provider_events provider_event
          where provider_event.provider_message_id is not null
            and not exists (
              select 1 from notification_delivery_attempts attempt
              where attempt.provider=provider_event.provider
                and attempt.provider_message_id=provider_event.provider_message_id
            )) as "providerEventOrphan",
        (select count(*)::int from sources where lifecycle_status <> 'ACTIVE')
          as "sourceUnavailable",
        count(*) filter (
          where e.event_type='CACHE_REVALIDATION_REQUESTED' and e.status='FAILED'
        )::int as "cacheFailed",
        count(*) filter (
          where e.event_type='CACHE_REVALIDATION_REQUESTED' and e.status='DEAD_LETTER'
        )::int as "cacheDeadLetter",
        count(*) filter (
          where e.event_type='CACHE_REVALIDATION_REQUESTED'
            and e.status='PROCESSING'
            and e.locked_at < ${staleBeforeIso}::timestamptz
        )::int as "cacheStaleProcessing"
      from outbox_events e
    `) as unknown as Promise<AggregateRow[]>,
    executor.raw(sql`
      select hash, created_at as "createdAt"
      from drizzle.__drizzle_migrations order by created_at, id
    `) as unknown as Promise<Array<{ hash: string; createdAt: string }>>,
    monitoringCounter({ executor, now: options.now }),
  ]);
  const row = rows[0];
  if (!row) throw new Error("Operational snapshot aggregate is unavailable.");
  const migrationRows = withoutKnownHistoricalLedgerRows(ledgerRows);
  const migrationStatus =
    migrationRows.length === repository.length &&
    migrationRows.every(
      (migration, index) => migration.hash === repository[index]?.hash,
    )
      ? "MATCH"
      : "MISMATCH";
  const latest =
    migrationRows.length === 0
      ? null
      : (repository[migrationRows.length - 1]?.identifier ?? null);
  return {
    checkedAt: nowIso,
    consistency: "POINT_IN_TIME_PER_QUERY",
    database: "AVAILABLE",
    migration: { status: migrationStatus, latest },
    outbox: {
      pending: row.outboxPending,
      failed: row.outboxFailed,
      deadLetter: row.outboxDeadLetter,
      staleProcessing: row.outboxStaleProcessing,
      oldestStaleProcessingAgeSeconds: row.oldestStaleProcessingAgeSeconds,
      workerLagSeconds: row.workerLagSeconds,
      heldEmailDelivery: row.heldEmailDelivery,
      heldCacheRevalidation: row.heldCacheRevalidation,
    },
    notification: {
      failedDeliveries: row.failedDeliveries,
      resultUnknown: row.resultUnknown,
    },
    providerEvents: {
      failed: row.providerEventFailed,
      orphan: row.providerEventOrphan,
    },
    monitoring: { ...monitoring, sourceUnavailable: row.sourceUnavailable },
    cacheRevalidation: {
      failed: row.cacheFailed,
      deadLetter: row.cacheDeadLetter,
      staleProcessing: row.cacheStaleProcessing,
    },
    analytics: {
      telemetry: "NOT_PERSISTED",
      transportFailureCount: null,
      readinessImpact: "BEST_EFFORT",
    },
    alerts: [
      ...alertsFor(row, migrationStatus, monitoring.overdue),
      ...(options.accountDeletionEnabled &&
      !(await isAccountDeletionSchemaReady(executor))
        ? [
            {
              code: "ACCOUNT_DELETION_SCHEMA_MISSING",
              severity: "CRITICAL",
              count: 1,
            } as const,
          ]
        : []),
    ],
  };
}
