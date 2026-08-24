import "server-only";

import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";

import { NotFoundError } from "@/src/application/errors";
import {
  institutionSourceBindings,
  institutions,
  opportunities,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type {
  AdminInstitutionDTO,
  AdminOpportunitySummaryDTO,
  AdminPageDTO,
} from "./contracts";
import { parseAdminDetailInput, parseInstitutionAdminListInput } from "./input";

const LIST_OPPORTUNITY_LIMIT = 3;
const DETAIL_OPPORTUNITY_LIMIT = 10;

type InstitutionBase = Omit<
  AdminInstitutionDTO,
  "activeSourceBindingCount" | "opportunitySummary"
>;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

async function loadOpportunitySummaries(
  executor: DatabaseExecutor,
  targetIds: readonly string[],
  limit: number,
): Promise<Map<string, AdminOpportunitySummaryDTO[]>> {
  const result = new Map<string, AdminOpportunitySummaryDTO[]>();
  if (targetIds.length === 0) return result;

  const rows = (await executor.raw(sql`
    with truth as (
      select o.id, o.institution_id as "institutionId", o.slug, o.kind,
        o.truth_mode as "truthMode", o.publication_state as "publicationState",
        v.title, v.business_state as "businessState", v.verified_at as "verifiedAt",
        o.updated_at as "rootUpdatedAt"
      from opportunities o
      left join opportunity_versions v
        on v.opportunity_id = o.id and v.is_current = true
      where o.institution_id in (${sql.join(
        targetIds.map((id) => sql`${id}`),
        sql`, `,
      )}) and o.truth_mode = 'NATIVE'
      union all
      select o.id, o.institution_id, o.slug, o.kind, o.truth_mode,
        o.publication_state, v.display_title,
        case v.event_status
          when 'SCHEDULED' then 'UPCOMING'
          when 'ACTIVE' then 'OPEN'
          when 'CLOSED' then 'CLOSED'
          when 'COMPLETED' then 'COMPLETED'
          when 'CANCELLED' then 'CANCELLED'
          else 'UNKNOWN'
        end, v.verified_at, o.updated_at
      from opportunities o
      join opportunity_admission_event_links l on l.opportunity_id = o.id
      left join admission_event_versions v
        on v.admission_event_id = l.admission_event_id and v.is_current = true
      where o.institution_id in (${sql.join(
        targetIds.map((id) => sql`${id}`),
        sql`, `,
      )}) and o.truth_mode = 'LEGACY_BACKED'
    ), ranked as (
      select id, "institutionId", slug, kind, "truthMode", "publicationState",
        title, "businessState", "verifiedAt", "rootUpdatedAt",
        row_number() over (
        partition by "institutionId"
        order by "rootUpdatedAt" desc, id desc
      ) as position
      from truth
    )
    select id, "institutionId", slug, kind, "truthMode", "publicationState",
      title, "businessState", "verifiedAt"
    from ranked where position <= ${limit}
    order by "institutionId", position
  `)) as unknown as Array<{
    id: string;
    institutionId: string;
    slug: string;
    kind: AdminOpportunitySummaryDTO["kind"];
    truthMode: AdminOpportunitySummaryDTO["truthMode"];
    publicationState: AdminOpportunitySummaryDTO["publicationState"];
    title: string | null;
    businessState: AdminOpportunitySummaryDTO["businessState"];
    verifiedAt: Date | string | null;
  }>;

  for (const row of rows) {
    const items = result.get(row.institutionId) ?? [];
    items.push({
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      truthMode: row.truthMode,
      publicationState: row.publicationState,
      title: row.title,
      businessState: row.businessState,
      verifiedAt: iso(row.verifiedAt),
    });
    result.set(row.institutionId, items);
  }
  return result;
}

function projectInstitution(
  row: InstitutionBase,
  summaries: ReadonlyMap<string, readonly AdminOpportunitySummaryDTO[]>,
  bindingCounts: ReadonlyMap<string, number>,
  opportunityCounts: ReadonlyMap<string, number>,
): AdminInstitutionDTO {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    category: row.category,
    operationalState: row.operationalState,
    publicationState: row.publicationState,
    activeSourceBindingCount: bindingCounts.get(row.id) ?? 0,
    opportunitySummary: {
      total: opportunityCounts.get(row.id) ?? 0,
      items: summaries.get(row.id) ?? [],
    },
  };
}

async function loadInstitutionCounts(
  executor: DatabaseExecutor,
  ids: readonly string[],
): Promise<{
  bindingCounts: Map<string, number>;
  opportunityCounts: Map<string, number>;
}> {
  if (ids.length === 0) {
    return { bindingCounts: new Map(), opportunityCounts: new Map() };
  }
  const [bindingRows, opportunityRows] = await Promise.all([
    executor.drizzle
      .select({
        institutionId: institutionSourceBindings.institutionId,
        count: sql<number>`count(*)::int`,
      })
      .from(institutionSourceBindings)
      .where(
        and(
          inArray(institutionSourceBindings.institutionId, ids),
          eq(institutionSourceBindings.isActive, true),
        ),
      )
      .groupBy(institutionSourceBindings.institutionId),
    executor.drizzle
      .select({
        institutionId: opportunities.institutionId,
        count: sql<number>`count(*)::int`,
      })
      .from(opportunities)
      .where(inArray(opportunities.institutionId, ids))
      .groupBy(opportunities.institutionId),
  ]);
  return {
    bindingCounts: new Map(
      bindingRows.map((row) => [row.institutionId, row.count]),
    ),
    opportunityCounts: new Map(
      opportunityRows.map((row) => [row.institutionId, row.count]),
    ),
  };
}

export async function listAdminInstitutions(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<AdminInstitutionDTO>> {
  const input = parseInstitutionAdminListInput(rawInput);
  const conditions = [
    input.category === undefined
      ? undefined
      : eq(institutions.category, input.category),
    input.publicationState === undefined
      ? undefined
      : eq(institutions.publicationState, input.publicationState),
    input.operationalState === undefined
      ? undefined
      : eq(institutions.operationalState, input.operationalState),
    input.query === undefined
      ? undefined
      : ilike(institutions.displayName, `%${input.query}%`),
  ].filter((condition) => condition !== undefined);
  const where = conditions.length === 0 ? undefined : and(...conditions);

  const rowsQuery = executor.drizzle
    .select({
      id: institutions.id,
      slug: institutions.slug,
      displayName: institutions.displayName,
      category: institutions.category,
      operationalState: institutions.operationalState,
      publicationState: institutions.publicationState,
    })
    .from(institutions)
    .where(where)
    .orderBy(asc(institutions.displayName), asc(institutions.id))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);
  const [rows, totals] = await Promise.all([
    rowsQuery,
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(institutions)
      .where(where),
  ]);
  const summaries = await loadOpportunitySummaries(
    executor,
    rows.map((row) => row.id),
    LIST_OPPORTUNITY_LIMIT,
  );
  const counts = await loadInstitutionCounts(
    executor,
    rows.map((row) => row.id),
  );
  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map((row) =>
      projectInstitution(
        row,
        summaries,
        counts.bindingCounts,
        counts.opportunityCounts,
      ),
    ),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      hasNext: input.page * input.pageSize < total,
    },
  };
}

export async function getAdminInstitution(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminInstitutionDTO> {
  const input = parseAdminDetailInput(rawInput);
  const rows = await executor.drizzle
    .select({
      id: institutions.id,
      slug: institutions.slug,
      displayName: institutions.displayName,
      category: institutions.category,
      operationalState: institutions.operationalState,
      publicationState: institutions.publicationState,
    })
    .from(institutions)
    .where(eq(institutions.id, input.id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError();
  const summaries = await loadOpportunitySummaries(
    executor,
    [row.id],
    DETAIL_OPPORTUNITY_LIMIT,
  );
  const counts = await loadInstitutionCounts(executor, [row.id]);
  return projectInstitution(
    row,
    summaries,
    counts.bindingCounts,
    counts.opportunityCounts,
  );
}
