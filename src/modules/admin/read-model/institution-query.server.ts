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
  AdminEnglishKindergartenCoverageDTO,
  AdminEnglishKindergartenDTO,
  AdminInstitutionDTO,
  AdminOpportunitySummaryDTO,
  AdminPageDTO,
  AdminReviewInsightSummaryDTO,
} from "./contracts";
import { parseAdminDetailInput, parseInstitutionAdminListInput } from "./input";
import { safeAbsoluteHttpUrl } from "./source-query.server";
import {
  englishKindergartenSectionValues,
  type CoverageStatus,
  type EnglishKindergartenSection,
} from "@/src/modules/english-kindergarten/coverage";
import type { ReviewInsightValue } from "@/src/modules/english-kindergarten/review-insight";

const LIST_OPPORTUNITY_LIMIT = 3;
const DETAIL_OPPORTUNITY_LIMIT = 10;

type InstitutionBase = Omit<
  AdminInstitutionDTO,
  "activeSourceBindingCount" | "opportunitySummary" | "englishKindergarten"
>;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function calendarDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return value;
  }
  return (value instanceof Date ? value : new Date(value))
    .toISOString()
    .slice(0, 10);
}

async function loadEnglishKindergartenCoverage(
  executor: DatabaseExecutor,
  institutionId: string,
): Promise<AdminEnglishKindergartenCoverageDTO[]> {
  const rows = (await executor.raw(sql`
    select c.section, c.status, c.source_id as "sourceId",
      s.source_name as "sourceName", s.canonical_url as "sourceUrl",
      c.source_snapshot_id as "sourceSnapshotId",
      c.academic_year_label as "academicYearLabel",
      c.public_note as "publicNote", c.internal_note as "internalNote",
      c.last_collected_at as "lastCollectedAt",
      c.last_checked_at as "lastCheckedAt"
    from institution_section_coverages c
    left join sources s on s.id = c.source_id
    where c.institution_id = ${institutionId}
    order by c.section
  `)) as unknown as Array<{
    section: EnglishKindergartenSection;
    status: CoverageStatus;
    sourceId: string | null;
    sourceName: string | null;
    sourceUrl: string | null;
    sourceSnapshotId: string | null;
    academicYearLabel: string | null;
    publicNote: string | null;
    internalNote: string | null;
    lastCollectedAt: Date | string | null;
    lastCheckedAt: Date | string;
  }>;
  const bySection = new Map(rows.map((row) => [row.section, row]));
  return englishKindergartenSectionValues.map((section) => {
    const row = bySection.get(section);
    if (!row) {
      return {
        section,
        status: "NOT_RESEARCHED",
        sourceId: null,
        sourceName: null,
        sourceUrl: null,
        safeSourceUrl: null,
        sourceSnapshotId: null,
        academicYearLabel: null,
        publicNote: null,
        internalNote: null,
        lastCollectedAt: null,
        lastCheckedAt: null,
      };
    }
    return {
      section,
      status: row.status,
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      safeSourceUrl:
        row.sourceUrl === null ? null : safeAbsoluteHttpUrl(row.sourceUrl),
      sourceSnapshotId: row.sourceSnapshotId,
      academicYearLabel: row.academicYearLabel,
      publicNote: row.publicNote,
      internalNote: row.internalNote,
      lastCollectedAt: iso(row.lastCollectedAt),
      lastCheckedAt: iso(row.lastCheckedAt),
    };
  });
}

async function loadEnglishKindergartenReviewInsight(
  executor: DatabaseExecutor,
  institutionId: string,
): Promise<AdminReviewInsightSummaryDTO | null> {
  const rows = (await executor.raw(sql`
    select v.id as "versionId", v.version_number as "versionNumber",
      v.verification_state as "verificationState", v.period_start as "periodStart",
      v.period_end as "periodEnd", v.sample_size as "sampleSize",
      v.themes, v.limitations, v.verified_at as "verifiedAt"
    from institution_review_insights r
    join institution_review_insight_versions v
      on v.institution_review_insight_id = r.id
    where r.institution_id = ${institutionId}
    order by v.version_number desc, v.id desc
    limit 1
  `)) as unknown as Array<{
    versionId: string;
    versionNumber: number;
    verificationState: AdminReviewInsightSummaryDTO["verificationState"];
    periodStart: Date | string | null;
    periodEnd: Date | string | null;
    sampleSize: number;
    themes: ReviewInsightValue["themes"];
    limitations: string | null;
    verifiedAt: Date | string | null;
  }>;
  const row = rows[0];
  if (!row) return null;
  const evidence = (await executor.raw(sql`
    select e.source_id as "sourceId", s.source_name as "sourceName",
      s.canonical_url as "sourceUrl",
      e.source_snapshot_id as "sourceSnapshotId",
      e.evidence_role as "evidenceRole"
    from institution_review_insight_version_evidence e
    join sources s on s.id = e.source_id
    where e.institution_review_insight_version_id = ${row.versionId}
    order by e.evidence_role, e.id
  `)) as unknown as Array<{
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    sourceSnapshotId: string | null;
    evidenceRole: string;
  }>;
  return {
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    verificationState: row.verificationState,
    periodStart: calendarDate(row.periodStart),
    periodEnd: calendarDate(row.periodEnd),
    sampleSize: row.sampleSize,
    themes: row.themes,
    limitations: row.limitations,
    verifiedAt: iso(row.verifiedAt),
    evidence: evidence.map((item) => ({
      ...item,
      safeSourceUrl: safeAbsoluteHttpUrl(item.sourceUrl),
    })),
  };
}

async function loadEnglishKindergartenAdmin(
  executor: DatabaseExecutor,
  institutionId: string,
): Promise<AdminEnglishKindergartenDTO> {
  const [coverages, reviewInsight] = await Promise.all([
    loadEnglishKindergartenCoverage(executor, institutionId),
    loadEnglishKindergartenReviewInsight(executor, institutionId),
  ]);
  return { coverages, reviewInsight };
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
  englishKindergarten: AdminEnglishKindergartenDTO | null = null,
): AdminInstitutionDTO {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    category: row.category,
    operationalState: row.operationalState,
    publicationState: row.publicationState,
    englishKindergarten,
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
  const englishKindergarten =
    row.category === "ENGLISH_KINDERGARTEN"
      ? await loadEnglishKindergartenAdmin(executor, row.id)
      : null;
  return projectInstitution(
    row,
    summaries,
    counts.bindingCounts,
    counts.opportunityCounts,
    englishKindergarten,
  );
}
