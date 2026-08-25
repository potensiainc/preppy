import "server-only";

import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { getOperationalSnapshot } from "@/src/modules/production-safety/operational-snapshot.server";

import type {
  AdminDataQualityDTO,
  AdminDataQualityWarningCode,
  AdminHealthBundleDTO,
  AdminHealthDTO,
} from "./contracts";
import { getAdminDataQuality } from "./data-quality-query.server";

export type AdminHealthDependencies = Readonly<{ now: Date }>;

type StatusCount = Readonly<{ status: string; count: number }>;

const warningCodes: readonly AdminDataQualityWarningCode[] = [
  "MULTIPLE_CURRENT_VERSIONS",
  "ACTIVE_PRIMARY_MULTIPLICITY",
  "ORPHANED_CANONICAL_LINKS",
  "OVERDUE_CRITICAL_MONITORING",
];

function unavailableDataQuality(now: Date): AdminDataQualityDTO {
  return {
    status: "UNAVAILABLE",
    checkedAt: now.toISOString(),
    warnings: warningCodes.map((code) => ({
      code,
      severity: "CRITICAL",
      evaluationStatus: "UNAVAILABLE",
      errorCategory: "EVALUATION_FAILED",
      count: null,
      details: [],
    })),
  };
}

function healthDataQualitySummary(dataQuality: AdminDataQualityDTO) {
  const availableWarnings = dataQuality.warnings.filter(
    (warning) => warning.evaluationStatus === "AVAILABLE",
  );
  return {
    status: dataQuality.status,
    warningCount: availableWarnings.filter(
      (warning) => warning.count !== null && warning.count > 0,
    ).length,
    affectedRecordCount: availableWarnings.reduce(
      (total, warning) => total + (warning.count ?? 0),
      0,
    ),
    unavailableCheckCount:
      dataQuality.warnings.length - availableWarnings.length,
  } as const;
}

function unavailableHealth(
  now: Date,
  databaseStatus: "AVAILABLE" | "UNAVAILABLE",
  dataQuality: AdminDataQualityDTO,
): AdminHealthDTO {
  return {
    status: "UNAVAILABLE",
    checkedAt: now.toISOString(),
    database: { status: databaseStatus },
    outbox: {
      status: "UNAVAILABLE",
      pending: null,
      processing: null,
      failed: null,
      deadLetter: null,
    },
    dataQuality: healthDataQualitySummary(dataQuality),
  };
}

export async function getAdminHealthBundle(
  executor: DatabaseExecutor,
  dependencies: AdminHealthDependencies,
): Promise<AdminHealthBundleDTO> {
  try {
    await executor.raw(sql`select 1::int as connectivity`);
  } catch {
    const dataQuality = unavailableDataQuality(dependencies.now);
    return {
      health: unavailableHealth(dependencies.now, "UNAVAILABLE", dataQuality),
      dataQuality,
      operational: null,
    };
  }

  const [outboxResult, dataQualityResult, operationalResult] =
    await Promise.allSettled([
      executor.raw(sql`
      select status, count(*)::int as count
      from outbox_events
      where status in ('PENDING', 'PROCESSING', 'FAILED', 'DEAD_LETTER')
      group by status
      order by status
    `) as unknown as Promise<StatusCount[]>,
      getAdminDataQuality(executor, {
        now: dependencies.now,
        detailLimit: 20,
      }),
      getOperationalSnapshot(executor, { now: dependencies.now }),
    ]);
  const dataQuality =
    dataQualityResult.status === "fulfilled"
      ? dataQualityResult.value
      : unavailableDataQuality(dependencies.now);
  if (outboxResult.status === "rejected") {
    return {
      health: unavailableHealth(dependencies.now, "AVAILABLE", dataQuality),
      dataQuality,
      operational:
        operationalResult.status === "fulfilled"
          ? operationalResult.value
          : null,
    };
  }

  const counts = new Map(
    outboxResult.value.map((row) => [row.status, row.count]),
  );
  const outbox = {
    status: "AVAILABLE" as const,
    pending: counts.get("PENDING") ?? 0,
    processing: counts.get("PROCESSING") ?? 0,
    failed: counts.get("FAILED") ?? 0,
    deadLetter: counts.get("DEAD_LETTER") ?? 0,
  };
  const dataQualitySummary = healthDataQualitySummary(dataQuality);
  const unavailable = dataQuality.status === "UNAVAILABLE";
  const operational =
    operationalResult.status === "fulfilled" ? operationalResult.value : null;
  const attention =
    dataQuality.status === "PARTIAL" ||
    dataQualitySummary.warningCount > 0 ||
    outbox.failed > 0 ||
    outbox.deadLetter > 0 ||
    (operational?.alerts.length ?? 0) > 0;
  return {
    health: {
      status: unavailable ? "UNAVAILABLE" : attention ? "ATTENTION" : "HEALTHY",
      checkedAt: dependencies.now.toISOString(),
      database: { status: "AVAILABLE" },
      outbox,
      dataQuality: dataQualitySummary,
    },
    dataQuality,
    operational,
  };
}

export async function getAdminHealth(
  executor: DatabaseExecutor,
  dependencies: AdminHealthDependencies,
): Promise<AdminHealthDTO> {
  return (await getAdminHealthBundle(executor, dependencies)).health;
}
