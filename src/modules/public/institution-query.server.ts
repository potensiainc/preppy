import "server-only";

import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { NotFoundError } from "@/src/application/errors";
import {
  admissionEvents,
  admissionEventVersions,
  institutionFactVersions,
  institutionFacts,
  institutionSchoolLinks,
  institutions,
  opportunities,
  opportunityAdmissionEventLinks,
  opportunityVersions,
  sourceBindings,
  sources,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type {
  InstitutionCardDTO,
  InstitutionDetailDTO,
  InstitutionFactDTO,
  InstitutionListDTO,
  InstitutionListQuery,
  OfficialSourceDTO,
  OpportunityCardDTO,
  OpportunityKeyDatesDTO,
} from "./dto";
import { parseInstitutionListQuery } from "./input";
import { getIndexability } from "./indexability";
import { getRelatedArticles } from "./opportunity-query.server";

const DETAIL_OPPORTUNITY_LIMIT = 12;
const HOME_OPPORTUNITY_LIMIT = 12;
const MAX_OPPORTUNITY_CARD_BATCH = 50;
const LEGACY_SOURCE_LIMIT = 24;
const officialSourceTypes = [
  "OFFICIAL_ADMISSION_PAGE",
  "OFFICIAL_NOTICE_BOARD",
  "OFFICIAL_DOCUMENT",
  "OFFICIAL_APPLICATION_PORTAL",
  "OFFICIAL_SCHOOL_PAGE",
  "OFFICIAL_SOCIAL",
] as const;
const officialAuthorities = ["PRIMARY", "SECONDARY_OFFICIAL"] as const;

type OpportunityTruth = {
  id: string;
  institutionId: string;
  slug: string;
  kind: OpportunityCardDTO["kind"];
  title: string;
  businessState: OpportunityCardDTO["businessState"];
  keyDates: OpportunityKeyDatesDTO;
  summary: string | null;
  targetAudience: string | null;
  actionUrl: string | null;
  lastVerifiedAt: string;
  evidenceVersionId: string;
  evidenceMode: "NATIVE" | "LEGACY";
  hasOfficialEvidence: boolean;
};

type InstitutionRow = {
  id: string;
  slug: string;
  name: string;
  category: InstitutionCardDTO["category"];
  region: string | null;
  shortDescription: string | null;
};

function toIso(value: Date): string {
  return value.toISOString();
}

function rawIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function legacyDateTime(
  date: string | null,
  time: string | null,
  timezone: string | null,
): string | null {
  if (date === null) return null;
  if (time === null) return date;
  if (timezone === "Asia/Seoul") return `${date}T${time}+09:00`;
  if (timezone === "UTC" || timezone === "Etc/UTC") return `${date}T${time}Z`;

  // Legacy date/time are local fields. Unknown timezones must not acquire an
  // invented offset merely to make the mixed-mode ranking projection uniform.
  return `${date}T${time}`;
}

function opportunityKeyDate(keyDates: OpportunityKeyDatesDTO): string | null {
  return (
    keyDates.applicationClosesAt ??
    keyDates.applicationOpensAt ??
    keyDates.eventStartsAt ??
    keyDates.eventEndsAt
  );
}

function hasActionableContent(opportunity: OpportunityTruth): boolean {
  return (
    Boolean(opportunity.summary?.trim()) ||
    Boolean(opportunity.targetAudience?.trim()) ||
    Boolean(opportunity.actionUrl?.trim()) ||
    Object.values(opportunity.keyDates).some((value) => value !== null)
  );
}

function sourceDto(source: {
  sourceName: string;
  canonicalUrl: string;
  authorityLevel: string;
}): OfficialSourceDTO {
  return {
    name: source.sourceName,
    url: source.canonicalUrl,
    authorityLevel:
      source.authorityLevel === "PRIMARY" ? "PRIMARY" : "SECONDARY_OFFICIAL",
  };
}

function opportunityRank(value: OpportunityCardDTO["businessState"]): number {
  switch (value) {
    case "OPEN":
      return 0;
    case "UPCOMING":
      return 1;
    case "CLOSED":
      return 2;
    case "COMPLETED":
      return 3;
    case "CANCELLED":
      return 4;
    default:
      return 5;
  }
}

function compareOpportunities(
  left: OpportunityTruth,
  right: OpportunityTruth,
): number {
  const rank =
    opportunityRank(left.businessState) - opportunityRank(right.businessState);
  if (rank !== 0) return rank;
  const leftDate =
    opportunityKeyDate(left.keyDates) ?? "9999-12-31T23:59:59.999Z";
  const rightDate =
    opportunityKeyDate(right.keyDates) ?? "9999-12-31T23:59:59.999Z";
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  if (left.title !== right.title) return left.title.localeCompare(right.title);
  return left.id.localeCompare(right.id);
}

async function getOfficialOpportunitySources(
  executor: DatabaseExecutor,
  nativeVersionIds: string[],
  legacyVersionIds: string[],
): Promise<Map<string, OfficialSourceDTO>> {
  const result = new Map<string, OfficialSourceDTO>();
  if (nativeVersionIds.length > 0) {
    const rows = (await executor.raw(sql`
      select distinct on (eve.opportunity_version_id)
        eve.opportunity_version_id as "versionId", s.source_name as "sourceName",
        s.canonical_url as "canonicalUrl", s.authority_level as "authorityLevel"
      from opportunity_version_evidence eve join sources s on s.id = eve.source_id
      where eve.opportunity_version_id in (${sql.join(
        nativeVersionIds.map((id) => sql`${id}`),
        sql`, `,
      )})
        and s.source_type in ('OFFICIAL_ADMISSION_PAGE','OFFICIAL_NOTICE_BOARD','OFFICIAL_DOCUMENT','OFFICIAL_APPLICATION_PORTAL','OFFICIAL_SCHOOL_PAGE','OFFICIAL_SOCIAL')
        and s.authority_level in ('PRIMARY','SECONDARY_OFFICIAL')
      order by eve.opportunity_version_id, case when lower(eve.evidence_role) = 'primary' then 0 else 1 end,
        case when s.authority_level = 'PRIMARY' then 0 else 1 end, s.canonical_url, s.id
    `)) as unknown as Array<{
      versionId: string;
      sourceName: string;
      canonicalUrl: string;
      authorityLevel: string;
    }>;
    for (const row of rows) {
      if (!result.has(row.versionId)) result.set(row.versionId, sourceDto(row));
    }
  }
  if (legacyVersionIds.length > 0) {
    const rows = (await executor.raw(sql`
      select distinct on (eve.event_version_id)
        eve.event_version_id as "versionId", s.source_name as "sourceName",
        s.canonical_url as "canonicalUrl", s.authority_level as "authorityLevel"
      from event_version_evidence eve join sources s on s.id = eve.source_id
      where eve.event_version_id in (${sql.join(
        legacyVersionIds.map((id) => sql`${id}`),
        sql`, `,
      )})
        and s.source_type in ('OFFICIAL_ADMISSION_PAGE','OFFICIAL_NOTICE_BOARD','OFFICIAL_DOCUMENT','OFFICIAL_APPLICATION_PORTAL','OFFICIAL_SCHOOL_PAGE','OFFICIAL_SOCIAL')
        and s.authority_level in ('PRIMARY','SECONDARY_OFFICIAL')
      order by eve.event_version_id, case when eve.is_primary then 0 else 1 end,
        case when s.authority_level = 'PRIMARY' then 0 else 1 end, s.canonical_url, s.id
    `)) as unknown as Array<{
      versionId: string;
      sourceName: string;
      canonicalUrl: string;
      authorityLevel: string;
    }>;
    for (const row of rows) {
      if (!result.has(row.versionId)) result.set(row.versionId, sourceDto(row));
    }
  }
  return result;
}

/** One normalized SQL UNION is ranked before any DTO/evidence materialization. */
async function getOpportunityTruths(
  executor: DatabaseExecutor,
  target:
    | { institutionIds: readonly string[] }
    | { opportunityIds: readonly string[] }
    | { home: true },
  projection: "CARD" | "DETAIL" | "HOME",
): Promise<OpportunityTruth[]> {
  if ("institutionIds" in target && target.institutionIds.length === 0)
    return [];
  if ("opportunityIds" in target && target.opportunityIds.length === 0)
    return [];
  if (
    ("institutionIds" in target &&
      target.institutionIds.length > MAX_OPPORTUNITY_CARD_BATCH) ||
    ("opportunityIds" in target &&
      target.opportunityIds.length > MAX_OPPORTUNITY_CARD_BATCH)
  ) {
    throw new Error("Public opportunity target batch exceeds the query limit.");
  }
  const ids =
    "institutionIds" in target
      ? sql.join(
          target.institutionIds.map((id) => sql`${id}`),
          sql`, `,
        )
      : "opportunityIds" in target
        ? sql.join(
            target.opportunityIds.map((id) => sql`${id}`),
            sql`, `,
          )
        : undefined;
  const targetCondition =
    "institutionIds" in target
      ? sql`o.institution_id in (${ids})`
      : "opportunityIds" in target
        ? sql`o.id in (${ids})`
        : sql`true`;
  const section =
    projection === "DETAIL"
      ? sql`case state when 'OPEN' then 'CURRENT' when 'UPCOMING' then 'UPCOMING' when 'CLOSED' then 'RECENT' when 'COMPLETED' then 'RECENT' when 'CANCELLED' then 'RECENT' else null end`
      : projection === "HOME"
        ? sql`case when state in ('OPEN', 'UPCOMING') then 'HOME' else null end`
        : sql`case when state='UNKNOWN' then null else 'CARD' end`;
  const limit =
    projection === "DETAIL"
      ? DETAIL_OPPORTUNITY_LIMIT
      : projection === "HOME"
        ? HOME_OPPORTUNITY_LIMIT
        : 1;
  const partition =
    projection === "HOME"
      ? sql`section`
      : "opportunityIds" in target
        ? sql`id, section`
        : sql`"institutionId", section`;
  const rows = (await executor.raw(sql`
    with candidates as (
      select o.id, o.institution_id as "institutionId", o.slug, o.kind, v.id as "versionId", 'NATIVE' as mode, v.title, v.business_state as state, v.summary, v.target_audience as "targetAudience", v.action_url as "actionUrl", v.verified_at as "verifiedAt",
        case when v.application_close_at is not null then 'APPLICATION_CLOSE' when v.application_open_at is not null then 'APPLICATION_OPEN' when v.event_start_at is not null then 'EVENT_START' when v.event_end_at is not null then 'EVENT_END' else null end as "keyDateKind",
        coalesce(v.application_close_at,v.application_open_at,v.event_start_at,v.event_end_at) as "nativeKeyAt",
        null::date as "legacyKeyDate", null::time as "legacyKeyTime", null::text as "legacyTimezone",
        coalesce(v.application_close_at,v.application_open_at,v.event_start_at,v.event_end_at)::text as "sortKey"
      from opportunities o join institutions i on i.id=o.institution_id and i.publication_state='PUBLISHED' join opportunity_versions v on v.opportunity_id=o.id and v.is_current=true and v.verification_state='VERIFIED'
      where ${targetCondition} and o.publication_state='PUBLISHED' and o.truth_mode='NATIVE' and v.verified_at is not null
      union all
      select o.id, o.institution_id, o.slug, o.kind, v.id, 'LEGACY', v.display_title, case v.event_status when 'ACTIVE' then 'OPEN' when 'SCHEDULED' then 'UPCOMING' when 'CLOSED' then 'CLOSED' when 'COMPLETED' then 'COMPLETED' when 'CANCELLED' then 'CANCELLED' else 'UNKNOWN' end, v.official_notes, e.audience_summary, v.action_url, v.verified_at,
        case when v.registration_close_date is not null then 'APPLICATION_CLOSE' when v.registration_open_date is not null then 'APPLICATION_OPEN' when v.event_start_date is not null then 'EVENT_START' when v.event_end_date is not null then 'EVENT_END' else null end,
        null::timestamptz,
        case when v.registration_close_date is not null then v.registration_close_date when v.registration_open_date is not null then v.registration_open_date when v.event_start_date is not null then v.event_start_date when v.event_end_date is not null then v.event_end_date else null end,
        case when v.registration_close_date is not null then v.registration_close_time when v.registration_open_date is not null then v.registration_open_time when v.event_start_date is not null then v.event_start_time when v.event_end_date is not null then v.event_end_time else null end,
        v.timezone,
        coalesce(v.registration_close_date::text || coalesce('T' || v.registration_close_time::text, ''), v.registration_open_date::text || coalesce('T' || v.registration_open_time::text, ''), v.event_start_date::text || coalesce('T' || v.event_start_time::text, ''), v.event_end_date::text || coalesce('T' || v.event_end_time::text, ''))
      from opportunities o join institutions i on i.id=o.institution_id and i.publication_state='PUBLISHED' join opportunity_admission_event_links l on l.opportunity_id=o.id join admission_events e on e.id=l.admission_event_id and e.is_public=true join admission_event_versions v on v.admission_event_id=e.id and v.is_current=true and v.verification_status='VERIFIED'
      where ${targetCondition} and o.publication_state='PUBLISHED' and o.truth_mode='LEGACY_BACKED' and v.verified_at is not null
    ), sectioned as (select *, ${section} as section from candidates), ranked as (select *, row_number() over (partition by ${partition} order by case state when 'OPEN' then 0 when 'UPCOMING' then 1 when 'CLOSED' then 2 when 'COMPLETED' then 3 when 'CANCELLED' then 4 else 5 end, "sortKey", title, id) rn from sectioned)
    select * from ranked where section is not null and rn <= ${limit} order by case state when 'OPEN' then 0 when 'UPCOMING' then 1 when 'CLOSED' then 2 when 'COMPLETED' then 3 when 'CANCELLED' then 4 else 5 end, "sortKey", title, id
  `)) as unknown as Array<{
    id: string;
    institutionId: string;
    slug: string;
    kind: OpportunityCardDTO["kind"];
    versionId: string;
    mode: "NATIVE" | "LEGACY";
    title: string;
    state: OpportunityCardDTO["businessState"];
    summary: string | null;
    targetAudience: string | null;
    actionUrl: string | null;
    verifiedAt: Date | string;
    keyDateKind:
      | "APPLICATION_CLOSE"
      | "APPLICATION_OPEN"
      | "EVENT_START"
      | "EVENT_END"
      | null;
    nativeKeyAt: Date | string | null;
    legacyKeyDate: string | null;
    legacyKeyTime: string | null;
    legacyTimezone: string | null;
  }>;
  const truths = rows.map((row): OpportunityTruth => {
    const keyDate =
      row.mode === "NATIVE"
        ? row.nativeKeyAt === null
          ? null
          : rawIso(row.nativeKeyAt)
        : legacyDateTime(
            row.legacyKeyDate,
            row.legacyKeyTime,
            row.legacyTimezone,
          );
    const keyDates: OpportunityKeyDatesDTO = {
      eventStartsAt: null,
      eventEndsAt: null,
      applicationOpensAt: null,
      applicationClosesAt: null,
    };
    if (row.keyDateKind === "APPLICATION_CLOSE")
      keyDates.applicationClosesAt = keyDate;
    if (row.keyDateKind === "APPLICATION_OPEN")
      keyDates.applicationOpensAt = keyDate;
    if (row.keyDateKind === "EVENT_START") keyDates.eventStartsAt = keyDate;
    if (row.keyDateKind === "EVENT_END") keyDates.eventEndsAt = keyDate;
    return {
      id: row.id,
      institutionId: row.institutionId,
      slug: row.slug,
      kind: row.kind,
      title: row.title,
      businessState: row.state,
      summary: row.summary,
      targetAudience: row.targetAudience,
      actionUrl: row.actionUrl,
      lastVerifiedAt: rawIso(row.verifiedAt),
      evidenceVersionId: row.versionId,
      evidenceMode: row.mode,
      hasOfficialEvidence: false,
      keyDates,
    };
  });
  const sourcesByVersion = await getOfficialOpportunitySources(
    executor,
    truths
      .filter((item) => item.evidenceMode === "NATIVE")
      .map((item) => item.evidenceVersionId),
    truths
      .filter((item) => item.evidenceMode === "LEGACY")
      .map((item) => item.evidenceVersionId),
  );
  return truths.map((item) => ({
    ...item,
    hasOfficialEvidence: sourcesByVersion.has(item.evidenceVersionId),
  }));
}

async function getInstitutionsByIds(
  executor: DatabaseExecutor,
  ids: readonly string[],
): Promise<Map<string, InstitutionRow>> {
  if (ids.length === 0) return new Map();
  const rows = await executor.drizzle
    .select({
      id: institutions.id,
      slug: institutions.slug,
      name: institutions.displayName,
      category: institutions.category,
      region: institutions.regionCode,
      shortDescription: institutions.shortDescription,
    })
    .from(institutions)
    .where(
      and(
        inArray(institutions.id, [...ids]),
        eq(institutions.publicationState, "PUBLISHED"),
      ),
    );
  return new Map(rows.map((row) => [row.id, row]));
}

/** Bounded set-based canonical cards for Article relation projections. */
export async function getPublicOpportunityCardsByIds(
  executor: DatabaseExecutor,
  opportunityIds: readonly string[],
): Promise<OpportunityCardDTO[]> {
  if (opportunityIds.length > MAX_OPPORTUNITY_CARD_BATCH) {
    throw new Error("Opportunity card batch exceeds the public query limit.");
  }
  const truths = await getOpportunityTruths(
    executor,
    { opportunityIds },
    "CARD",
  );
  const institutionsById = await getInstitutionsByIds(executor, [
    ...new Set(truths.map((truth) => truth.institutionId)),
  ]);
  return truths.flatMap((truth) => {
    const institution = institutionsById.get(truth.institutionId);
    return institution === undefined
      ? []
      : [opportunityCard(truth, institution)];
  });
}

/** Bounded set-based canonical Institution cards for Article relation projections. */
export async function getPublicInstitutionCardsByIds(
  executor: DatabaseExecutor,
  institutionIds: readonly string[],
): Promise<InstitutionCardDTO[]> {
  if (institutionIds.length > MAX_OPPORTUNITY_CARD_BATCH) {
    throw new Error("Institution card batch exceeds the public query limit.");
  }
  const institutionsById = await getInstitutionsByIds(executor, institutionIds);
  const rows = [...institutionsById.values()];
  const truths = await getOpportunityTruths(
    executor,
    { institutionIds: rows.map((row) => row.id) },
    "CARD",
  );
  const truthsByInstitution = new Map<string, OpportunityTruth[]>();
  for (const truth of truths)
    truthsByInstitution.set(truth.institutionId, [truth]);
  return rows.map((institution) =>
    cardFromInstitution(
      institution,
      truthsByInstitution.get(institution.id) ?? [],
    ),
  );
}

/** Globally ordered, bounded Home section using the same canonical truth union. */
export async function getHomeCurrentOpportunityCards(
  executor: DatabaseExecutor,
): Promise<OpportunityCardDTO[]> {
  const truths = await getOpportunityTruths(executor, { home: true }, "HOME");
  const institutionsById = await getInstitutionsByIds(executor, [
    ...new Set(truths.map((truth) => truth.institutionId)),
  ]);
  return truths.flatMap((truth) => {
    const institution = institutionsById.get(truth.institutionId);
    return institution === undefined
      ? []
      : [opportunityCard(truth, institution)];
  });
}

function opportunityCard(
  truth: OpportunityTruth,
  institution: InstitutionRow,
): OpportunityCardDTO {
  return {
    id: truth.id,
    slug: truth.slug,
    title: truth.title,
    kind: truth.kind,
    businessState: truth.businessState,
    keyDate: opportunityKeyDate(truth.keyDates),
    institution: {
      id: institution.id,
      slug: institution.slug,
      name: institution.name,
      category: institution.category,
      region: institution.region,
    },
    lastVerifiedAt: truth.lastVerifiedAt,
    indexability: getIndexability({
      entity: "OPPORTUNITY",
      publicationState: "PUBLISHED",
      title: truth.title,
      businessState: truth.businessState,
      hasVerifiedCurrentTruth: true,
      hasOfficialEvidence: truth.hasOfficialEvidence,
      hasUniqueActionableContent: hasActionableContent(truth),
    }),
  };
}

function cardFromInstitution(
  institution: InstitutionRow,
  truths: OpportunityTruth[],
): InstitutionCardDTO {
  const selected = [...truths].sort(compareOpportunities)[0];
  return {
    id: institution.id,
    slug: institution.slug,
    name: institution.name,
    category: institution.category,
    region: institution.region,
    currentAdmissionsState: selected?.businessState ?? null,
    currentOpportunity:
      selected === undefined
        ? null
        : {
            id: selected.id,
            slug: selected.slug,
            title: selected.title,
            kind: selected.kind,
            state: selected.businessState,
            keyDate: opportunityKeyDate(selected.keyDates),
          },
    lastVerifiedAt: selected?.lastVerifiedAt ?? null,
  };
}

function recruitmentExists(state: InstitutionListQuery["recruitmentState"]) {
  if (state === undefined) return undefined;
  const legacyState =
    state === "OPEN" ? "ACTIVE" : state === "UPCOMING" ? "SCHEDULED" : state;
  return or(
    sql`exists (${executorSelectNative(state)})`,
    sql`exists (${executorSelectLegacy(legacyState)})`,
  );
}

function executorSelectNative(
  state: NonNullable<InstitutionListQuery["recruitmentState"]>,
) {
  return sql`select 1 from ${opportunities} join ${opportunityVersions} on ${opportunityVersions.opportunityId} = ${opportunities.id} where ${opportunities.institutionId} = ${institutions.id} and ${opportunities.publicationState} = 'PUBLISHED' and ${opportunities.truthMode} = 'NATIVE' and ${opportunityVersions.isCurrent} = true and ${opportunityVersions.verificationState} = 'VERIFIED' and ${opportunityVersions.businessState} = ${state}`;
}

function executorSelectLegacy(state: string) {
  return sql`select 1 from ${opportunities} join ${opportunityAdmissionEventLinks} on ${opportunityAdmissionEventLinks.opportunityId} = ${opportunities.id} join ${admissionEvents} on ${admissionEvents.id} = ${opportunityAdmissionEventLinks.admissionEventId} join ${admissionEventVersions} on ${admissionEventVersions.admissionEventId} = ${admissionEvents.id} where ${opportunities.institutionId} = ${institutions.id} and ${opportunities.publicationState} = 'PUBLISHED' and ${opportunities.truthMode} = 'LEGACY_BACKED' and ${admissionEvents.isPublic} = true and ${admissionEventVersions.isCurrent} = true and ${admissionEventVersions.verificationStatus} = 'VERIFIED' and ${admissionEventVersions.verifiedAt} is not null and ${admissionEventVersions.eventStatus} = ${state}`;
}

function listConditions(query: InstitutionListQuery) {
  return and(
    eq(institutions.publicationState, "PUBLISHED"),
    query.category === undefined
      ? undefined
      : eq(institutions.category, query.category),
    query.region === undefined
      ? undefined
      : eq(institutions.regionCode, query.region),
    query.query === undefined
      ? undefined
      : ilike(institutions.displayName, `%${query.query}%`),
    recruitmentExists(query.recruitmentState),
  );
}

export async function listInstitutions(
  executor: DatabaseExecutor,
  input: unknown,
): Promise<InstitutionListDTO> {
  const query = parseInstitutionListQuery(input);
  const where = listConditions(query);
  const [countRow, rows] = await Promise.all([
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(institutions)
      .where(where),
    executor.drizzle
      .select({
        id: institutions.id,
        slug: institutions.slug,
        name: institutions.displayName,
        category: institutions.category,
        region: institutions.regionCode,
        shortDescription: institutions.shortDescription,
      })
      .from(institutions)
      .where(where)
      .orderBy(asc(institutions.displayName), asc(institutions.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
  ]);
  const items: InstitutionRow[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    region: row.region,
    shortDescription: row.shortDescription,
  }));
  const truths = await getOpportunityTruths(
    executor,
    { institutionIds: items.map((row) => row.id) },
    "CARD",
  );
  const byInstitution = new Map<string, OpportunityTruth[]>();
  for (const truth of truths)
    byInstitution.set(truth.institutionId, [
      ...(byInstitution.get(truth.institutionId) ?? []),
      truth,
    ]);
  const total = countRow[0]?.total ?? 0;
  return {
    items: items.map((row) =>
      cardFromInstitution(row, byInstitution.get(row.id) ?? []),
    ),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasNext: query.page * query.pageSize < total,
    },
  };
}

async function getFactProjection(
  executor: DatabaseExecutor,
  institutionId: string,
): Promise<{ facts: InstitutionFactDTO[]; sources: OfficialSourceDTO[] }> {
  const rows = await executor.drizzle
    .select({
      factType: institutionFacts.factType,
      versionId: institutionFactVersions.id,
      value: institutionFactVersions.valueJson,
      displayValue: institutionFactVersions.displayText,
      verifiedAt: institutionFactVersions.verifiedAt,
    })
    .from(institutionFacts)
    .innerJoin(
      institutionFactVersions,
      and(
        eq(institutionFactVersions.institutionFactId, institutionFacts.id),
        eq(institutionFactVersions.isCurrent, true),
        eq(institutionFactVersions.verificationState, "VERIFIED"),
      ),
    )
    .where(eq(institutionFacts.institutionId, institutionId))
    .orderBy(asc(institutionFacts.factType), asc(institutionFactVersions.id));
  const versionIds = rows.map((row) => row.versionId);
  const evidence =
    versionIds.length === 0
      ? []
      : ((await executor.raw(sql`
    select distinct on (e.institution_fact_version_id) e.institution_fact_version_id as "versionId",
      s.source_name as "sourceName", s.canonical_url as "canonicalUrl", s.authority_level as "authorityLevel"
    from institution_fact_version_evidence e join sources s on s.id=e.source_id
    where e.institution_fact_version_id in (${sql.join(
      versionIds.map((id) => sql`${id}`),
      sql`, `,
    )})
      and s.source_type in ('OFFICIAL_ADMISSION_PAGE','OFFICIAL_NOTICE_BOARD','OFFICIAL_DOCUMENT','OFFICIAL_APPLICATION_PORTAL','OFFICIAL_SCHOOL_PAGE','OFFICIAL_SOCIAL')
      and s.authority_level in ('PRIMARY','SECONDARY_OFFICIAL')
    order by e.institution_fact_version_id, case when lower(e.evidence_role)='primary' then 0 else 1 end,
      case when s.authority_level='PRIMARY' then 0 else 1 end, s.canonical_url, s.id
  `)) as unknown as Array<{
          versionId: string;
          sourceName: string;
          canonicalUrl: string;
          authorityLevel: string;
        }>);
  const sourceByVersion = new Map<string, OfficialSourceDTO>();
  for (const row of evidence)
    if (!sourceByVersion.has(row.versionId))
      sourceByVersion.set(row.versionId, sourceDto(row));
  const facts = rows
    .filter((row) => row.verifiedAt !== null)
    .map((row) => ({
      factType: row.factType,
      value: row.value,
      displayValue: row.displayValue,
      verifiedAt: toIso(row.verifiedAt as Date),
      officialSource: sourceByVersion.get(row.versionId) ?? null,
    }));
  return { facts, sources: [...sourceByVersion.values()] };
}

async function getLegacyInstitutionSources(
  executor: DatabaseExecutor,
  institutionId: string,
): Promise<OfficialSourceDTO[]> {
  const rows = await executor.drizzle
    .select({
      sourceName: sources.sourceName,
      canonicalUrl: sources.canonicalUrl,
      authorityLevel: sources.authorityLevel,
    })
    .from(institutionSchoolLinks)
    .innerJoin(
      sourceBindings,
      and(
        eq(sourceBindings.schoolId, institutionSchoolLinks.schoolId),
        eq(sourceBindings.isActive, true),
      ),
    )
    .innerJoin(sources, eq(sources.id, sourceBindings.sourceId))
    .where(
      and(
        eq(institutionSchoolLinks.institutionId, institutionId),
        inArray(sources.sourceType, officialSourceTypes),
        inArray(sources.authorityLevel, officialAuthorities),
      ),
    )
    .orderBy(
      asc(sourceBindings.priority),
      asc(
        sql`case when ${sources.authorityLevel} = 'PRIMARY' then 0 else 1 end`,
      ),
      asc(sources.canonicalUrl),
      asc(sources.id),
    )
    .limit(LEGACY_SOURCE_LIMIT);
  return rows.map(sourceDto);
}

export async function getInstitutionBySlug(
  executor: DatabaseExecutor,
  slug: string,
): Promise<InstitutionDetailDTO> {
  const [row] = await executor.drizzle
    .select({
      id: institutions.id,
      slug: institutions.slug,
      name: institutions.displayName,
      category: institutions.category,
      region: institutions.regionCode,
      shortDescription: institutions.shortDescription,
    })
    .from(institutions)
    .where(
      and(
        eq(institutions.slug, slug),
        eq(institutions.publicationState, "PUBLISHED"),
      ),
    )
    .limit(1);
  if (row === undefined) throw new NotFoundError();
  const institution: InstitutionRow = row;
  const [truths, factsResult, legacySources, relatedArticles] =
    await Promise.all([
      getOpportunityTruths(
        executor,
        { institutionIds: [institution.id] },
        "DETAIL",
      ),
      getFactProjection(executor, institution.id),
      getLegacyInstitutionSources(executor, institution.id),
      getRelatedArticles(executor, { institutionId: institution.id }),
    ]);
  const cardsFor = (states: OpportunityCardDTO["businessState"][]) =>
    truths
      .filter((truth) => states.includes(truth.businessState))
      .sort(compareOpportunities)
      .map((truth) => opportunityCard(truth, institution));
  const currentOpportunities = cardsFor(["OPEN"]);
  const upcomingOpportunities = cardsFor(["UPCOMING"]);
  const recentOpportunities = cardsFor(["CLOSED", "COMPLETED", "CANCELLED"]);
  const officialSources = [...factsResult.sources, ...legacySources].filter(
    (source, index, values) =>
      values.findIndex((candidate) => candidate.url === source.url) === index,
  );
  const selected = cardFromInstitution(institution, truths);
  const meaningful =
    Boolean(institution.shortDescription?.trim()) ||
    factsResult.facts.length > 0 ||
    truths.length > 0;
  return {
    institution: selected,
    currentOpportunities,
    upcomingOpportunities,
    recentOpportunities,
    verifiedFacts: factsResult.facts,
    officialSources,
    relatedArticles,
    indexability: getIndexability({
      entity: "INSTITUTION",
      publicationState: "PUBLISHED",
      slug: institution.slug,
      name: institution.name,
      category: institution.category,
      region: institution.region,
      hasOfficialSource: officialSources.length > 0,
      hasMeaningfulContent: meaningful,
    }),
  };
}
