import "server-only";

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { NotFoundError } from "@/src/application/errors";
import {
  institutionSourceBindings,
  opportunitySourceBindings,
  sourceMonitorConfigs,
  sources,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type {
  AdminPageDTO,
  AdminSourceDTO,
  AdminSourceObservationDTO,
} from "./contracts";
import {
  parseAdminDetailInput,
  parseSourceAdminListInput,
  type SourceAdminListInput,
} from "./input";

type SourceRow = Readonly<{
  id: string;
  sourceName: string;
  canonicalUrl: string;
  sourceType: string;
  authorityLevel: string;
  lifecycleStatus: string;
  collectionStrategy: string | null;
  monitoringProfile: string | null;
  customIntervalMinutes: number | null;
  seasonalEnabled: boolean | null;
  browserRequired: boolean | null;
  maxAttempts: number | null;
  isEnabled: boolean | null;
}>;

export function safeAbsoluteHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function listConditions(input: SourceAdminListInput) {
  return [
    input.sourceType === undefined
      ? undefined
      : eq(sources.sourceType, input.sourceType),
    input.authorityLevel === undefined
      ? undefined
      : eq(sources.authorityLevel, input.authorityLevel),
    input.lifecycleStatus === undefined
      ? undefined
      : eq(sources.lifecycleStatus, input.lifecycleStatus),
    input.query === undefined
      ? undefined
      : or(
          ilike(sources.sourceName, `%${input.query}%`),
          ilike(sources.canonicalUrl, `%${input.query}%`),
        ),
  ].filter((condition) => condition !== undefined);
}

function sourceRows(executor: DatabaseExecutor) {
  return executor.drizzle
    .select({
      id: sources.id,
      sourceName: sources.sourceName,
      canonicalUrl: sources.canonicalUrl,
      sourceType: sources.sourceType,
      authorityLevel: sources.authorityLevel,
      lifecycleStatus: sources.lifecycleStatus,
      collectionStrategy: sourceMonitorConfigs.collectionStrategy,
      monitoringProfile: sourceMonitorConfigs.monitoringProfile,
      customIntervalMinutes: sourceMonitorConfigs.customIntervalMinutes,
      seasonalEnabled: sourceMonitorConfigs.seasonalEnabled,
      browserRequired: sourceMonitorConfigs.browserRequired,
      maxAttempts: sourceMonitorConfigs.maxAttempts,
      isEnabled: sourceMonitorConfigs.isEnabled,
    })
    .from(sources)
    .leftJoin(
      sourceMonitorConfigs,
      eq(sourceMonitorConfigs.sourceId, sources.id),
    );
}

async function loadBindingCounts(
  executor: DatabaseExecutor,
  sourceIds: readonly string[],
): Promise<{
  institution: Map<string, number>;
  opportunity: Map<string, number>;
}> {
  if (sourceIds.length === 0) {
    return { institution: new Map(), opportunity: new Map() };
  }
  const [institutionRows, opportunityRows] = await Promise.all([
    executor.drizzle
      .select({
        sourceId: institutionSourceBindings.sourceId,
        count: sql<number>`count(*)::int`,
      })
      .from(institutionSourceBindings)
      .where(
        and(
          inArray(institutionSourceBindings.sourceId, sourceIds),
          eq(institutionSourceBindings.isActive, true),
        ),
      )
      .groupBy(institutionSourceBindings.sourceId),
    executor.drizzle
      .select({
        sourceId: opportunitySourceBindings.sourceId,
        count: sql<number>`count(*)::int`,
      })
      .from(opportunitySourceBindings)
      .where(
        and(
          inArray(opportunitySourceBindings.sourceId, sourceIds),
          eq(opportunitySourceBindings.isActive, true),
        ),
      )
      .groupBy(opportunitySourceBindings.sourceId),
  ]);
  return {
    institution: new Map(
      institutionRows.map((row) => [row.sourceId, row.count]),
    ),
    opportunity: new Map(
      opportunityRows.map((row) => [row.sourceId, row.count]),
    ),
  };
}

async function loadLatestObservations(
  executor: DatabaseExecutor,
  sourceIds: readonly string[],
): Promise<Map<string, AdminSourceObservationDTO>> {
  const result = new Map<string, AdminSourceObservationDTO>();
  if (sourceIds.length === 0) return result;
  const rows = (await executor.raw(sql`
    select distinct on (source_id)
      source_id as "sourceId", id::text as id, observed_at as "observedAt",
      outcome, http_status as "httpStatus", duration_ms as "durationMs",
      error_code as "errorCode"
    from source_observations
    where source_id in (${sql.join(
      sourceIds.map((id) => sql`${id}`),
      sql`, `,
    )})
    order by source_id, observed_at desc, id desc
  `)) as unknown as Array<{
    sourceId: string;
    id: string;
    observedAt: Date | string;
    outcome: string;
    httpStatus: number | null;
    durationMs: number | null;
    errorCode: string | null;
  }>;
  for (const row of rows) {
    result.set(row.sourceId, {
      id: row.id,
      observedAt: iso(row.observedAt),
      outcome: row.outcome,
      httpStatus: row.httpStatus,
      durationMs: row.durationMs,
      errorCode: row.errorCode,
    });
  }
  return result;
}

function projectSource(
  row: SourceRow,
  counts: Awaited<ReturnType<typeof loadBindingCounts>>,
  observations: ReadonlyMap<string, AdminSourceObservationDTO>,
): AdminSourceDTO {
  const monitorConfig =
    row.collectionStrategy === null ||
    row.monitoringProfile === null ||
    row.seasonalEnabled === null ||
    row.browserRequired === null ||
    row.maxAttempts === null ||
    row.isEnabled === null
      ? null
      : {
          collectionStrategy: row.collectionStrategy,
          monitoringProfile: row.monitoringProfile,
          customIntervalMinutes: row.customIntervalMinutes,
          seasonalEnabled: row.seasonalEnabled,
          browserRequired: row.browserRequired,
          maxAttempts: row.maxAttempts,
          isEnabled: row.isEnabled,
        };
  return {
    id: row.id,
    sourceName: row.sourceName,
    canonicalUrl: row.canonicalUrl,
    safeUrl: safeAbsoluteHttpUrl(row.canonicalUrl),
    sourceType: row.sourceType,
    authorityLevel: row.authorityLevel,
    lifecycleStatus: row.lifecycleStatus,
    monitorConfig,
    activeInstitutionBindingCount: counts.institution.get(row.id) ?? 0,
    activeOpportunityBindingCount: counts.opportunity.get(row.id) ?? 0,
    latestObservation: observations.get(row.id) ?? null,
  };
}

async function enrichRows(
  executor: DatabaseExecutor,
  rows: readonly SourceRow[],
): Promise<AdminSourceDTO[]> {
  const ids = rows.map((row) => row.id);
  const [counts, observations] = await Promise.all([
    loadBindingCounts(executor, ids),
    loadLatestObservations(executor, ids),
  ]);
  return rows.map((row) => projectSource(row, counts, observations));
}

export async function listAdminSources(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<AdminSourceDTO>> {
  const input = parseSourceAdminListInput(rawInput);
  const conditions = listConditions(input);
  const where = conditions.length === 0 ? undefined : and(...conditions);
  const [rows, totals] = await Promise.all([
    sourceRows(executor)
      .where(where)
      .orderBy(desc(sources.updatedAt), desc(sources.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(sources)
      .where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  return {
    items: await enrichRows(executor, rows),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      hasNext: input.page * input.pageSize < total,
    },
  };
}

export async function getAdminSource(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminSourceDTO> {
  const input = parseAdminDetailInput(rawInput);
  const rows = await sourceRows(executor)
    .where(eq(sources.id, input.id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError();
  return (await enrichRows(executor, [row]))[0]!;
}
