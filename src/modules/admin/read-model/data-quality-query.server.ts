import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { ValidationError } from "@/src/application/errors";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import {
  compareMonitoringQueueRows,
  iterateMonitoringQueueBatches,
} from "@/src/modules/monitoring/queue-query.server";
import type { MonitoringQueueRow } from "@/src/modules/monitoring/contracts";

import type {
  AdminDataQualityDTO,
  AdminDataQualityDetailDTO,
  AdminDataQualityWarningDTO,
} from "./contracts";

const inputSchema = z
  .object({
    now: z.date(),
    detailLimit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

type RawDetail = Readonly<{
  target_type: AdminDataQualityDetailDTO["targetType"];
  target_id: string;
  related_id: string | null;
  observed_count: number;
  total_count: number;
}>;

function parseInput(value: unknown): { now: Date; detailLimit: number } {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return { now: parsed.data.now, detailLimit: parsed.data.detailLimit ?? 20 };
}

function detail(row: RawDetail): AdminDataQualityDetailDTO {
  return {
    targetType: row.target_type,
    targetId: row.target_id,
    relatedId: row.related_id,
    observedCount: row.observed_count,
  };
}

function warning(
  code: AdminDataQualityWarningDTO["code"],
  rows: readonly RawDetail[],
): AdminDataQualityWarningDTO {
  return {
    code,
    severity: "CRITICAL",
    evaluationStatus: "AVAILABLE",
    errorCategory: null,
    count: rows[0]?.total_count ?? 0,
    details: rows.map(detail),
  };
}

async function multipleCurrentVersions(
  executor: DatabaseExecutor,
  limit: number,
): Promise<AdminDataQualityWarningDTO> {
  const rows = (await executor.raw(sql`
    with anomalies as (
      select
        'OPPORTUNITY'::text as target_type,
        opportunity_id::text as target_id,
        null::text as related_id,
        count(*)::int as observed_count
      from opportunity_versions
      where is_current = true
      group by opportunity_id
      having count(*) > 1
      union all
      select
        'INSTITUTION_FACT'::text as target_type,
        institution_fact_id::text as target_id,
        null::text as related_id,
        count(*)::int as observed_count
      from institution_fact_versions
      where is_current = true
      group by institution_fact_id
      having count(*) > 1
    )
    select
      target_type,
      target_id,
      related_id,
      observed_count,
      count(*) over ()::int as total_count
    from anomalies
    order by target_type, target_id
    limit ${limit}
  `)) as unknown as RawDetail[];
  return warning("MULTIPLE_CURRENT_VERSIONS", rows);
}

async function activePrimaryMultiplicity(
  executor: DatabaseExecutor,
  limit: number,
): Promise<AdminDataQualityWarningDTO> {
  const rows = (await executor.raw(sql`
    with anomalies as (
      select
        'INSTITUTION'::text as target_type,
        institution_id::text as target_id,
        null::text as related_id,
        count(*)::int as observed_count
      from institution_source_bindings
      where is_active = true and is_primary = true
      group by institution_id, role
      having count(*) > 1
      union all
      select
        'OPPORTUNITY'::text as target_type,
        opportunity_id::text as target_id,
        null::text as related_id,
        count(*)::int as observed_count
      from opportunity_source_bindings
      where is_active = true and is_primary = true
      group by opportunity_id, role
      having count(*) > 1
    )
    select
      target_type,
      target_id,
      related_id,
      observed_count,
      count(*) over ()::int as total_count
    from anomalies
    order by target_type, target_id
    limit ${limit}
  `)) as unknown as RawDetail[];
  return warning("ACTIVE_PRIMARY_MULTIPLICITY", rows);
}

async function orphanedCanonicalLinks(
  executor: DatabaseExecutor,
  limit: number,
): Promise<AdminDataQualityWarningDTO> {
  const rows = (await executor.raw(sql`
    with anomalies as (
      select
        'INSTITUTION_SOURCE_BINDING'::text as target_type,
        binding.institution_id::text as target_id,
        binding.source_id::text as related_id,
        1::int as observed_count
      from institution_source_bindings binding
      left join institutions institution on institution.id = binding.institution_id
      left join sources source_record on source_record.id = binding.source_id
      where institution.id is null or source_record.id is null
      union all
      select
        'OPPORTUNITY_SOURCE_BINDING'::text as target_type,
        binding.opportunity_id::text as target_id,
        binding.source_id::text as related_id,
        1::int as observed_count
      from opportunity_source_bindings binding
      left join opportunities opportunity on opportunity.id = binding.opportunity_id
      left join sources source_record on source_record.id = binding.source_id
      where opportunity.id is null or source_record.id is null
    )
    select
      target_type,
      target_id,
      related_id,
      observed_count,
      count(*) over ()::int as total_count
    from anomalies
    order by target_type, target_id, related_id
    limit ${limit}
  `)) as unknown as RawDetail[];
  return warning("ORPHANED_CANONICAL_LINKS", rows);
}

type RankedMonitoringDetail = Readonly<{
  row: MonitoringQueueRow;
  detail: AdminDataQualityDetailDTO;
}>;

function insertBoundedMonitoringDetail(
  details: RankedMonitoringDetail[],
  candidate: RankedMonitoringDetail,
  limit: number,
): void {
  let low = 0;
  let high = details.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareMonitoringQueueRows(candidate.row, details[middle]!.row) < 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  if (details.length < limit) {
    details.splice(low, 0, candidate);
    return;
  }
  if (low >= limit) return;
  details.splice(low, 0, candidate);
  details.length = limit;
}

async function overdueCriticalMonitoring(
  executor: DatabaseExecutor,
  now: Date,
  limit: number,
): Promise<AdminDataQualityWarningDTO> {
  let count = 0;
  const details: RankedMonitoringDetail[] = [];
  for await (const batch of iterateMonitoringQueueBatches({ executor, now })) {
    for (const row of batch) {
      if (row.dueState !== "OVERDUE" || row.priority !== "P0_ACTIVE") continue;
      count += 1;
      insertBoundedMonitoringDetail(
        details,
        {
          row,
          detail: {
            targetType: row.targetType,
            targetId: row.targetId,
            relatedId: row.source.id,
            observedCount: 1,
          },
        },
        limit,
      );
    }
  }
  return {
    code: "OVERDUE_CRITICAL_MONITORING",
    severity: "CRITICAL",
    evaluationStatus: "AVAILABLE",
    errorCategory: null,
    count,
    details: details.map((candidate) => candidate.detail),
  };
}

export async function getAdminDataQuality(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminDataQualityDTO> {
  const input = parseInput(rawInput);
  const evaluators = [
    {
      code: "MULTIPLE_CURRENT_VERSIONS" as const,
      evaluate: () => multipleCurrentVersions(executor, input.detailLimit),
    },
    {
      code: "ACTIVE_PRIMARY_MULTIPLICITY" as const,
      evaluate: () => activePrimaryMultiplicity(executor, input.detailLimit),
    },
    {
      code: "ORPHANED_CANONICAL_LINKS" as const,
      evaluate: () => orphanedCanonicalLinks(executor, input.detailLimit),
    },
    {
      code: "OVERDUE_CRITICAL_MONITORING" as const,
      evaluate: () =>
        overdueCriticalMonitoring(executor, input.now, input.detailLimit),
    },
  ];
  const warnings = await Promise.all(
    evaluators.map(async ({ code, evaluate }) => {
      try {
        return await evaluate();
      } catch {
        return {
          code,
          severity: "CRITICAL" as const,
          evaluationStatus: "UNAVAILABLE" as const,
          errorCategory: "EVALUATION_FAILED" as const,
          count: null,
          details: [],
        };
      }
    }),
  );
  const unavailableCount = warnings.filter(
    (candidate) => candidate.evaluationStatus === "UNAVAILABLE",
  ).length;
  return {
    status:
      unavailableCount === 0
        ? "AVAILABLE"
        : unavailableCount === warnings.length
          ? "UNAVAILABLE"
          : "PARTIAL",
    checkedAt: input.now.toISOString(),
    warnings,
  };
}
