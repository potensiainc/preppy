import "server-only";

import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import {
  coverageMessage,
  englishKindergartenSectionValues,
  type CoverageStatus,
  type EnglishKindergartenSection,
} from "@/src/modules/english-kindergarten/coverage";
import {
  englishKindergartenFactTypeValues,
  parseEnglishKindergartenFactValue,
  type EnglishKindergartenFactType,
} from "@/src/modules/english-kindergarten/fact-values";
import { parseReviewInsightValue } from "@/src/modules/english-kindergarten/review-insight";
import type {
  EnglishKindergartenCardSummaryDTO,
  EnglishKindergartenDetailDTO,
  EnglishKindergartenFactDTO,
  EnglishKindergartenInformationSessionDTO,
  EnglishKindergartenReviewInsightDTO,
  EnglishKindergartenSectionDTO,
  EnglishKindergartenSourceDTO,
  OfficialSourceDTO,
} from "@/src/modules/public/dto";

const MAX_PUBLIC_BATCH = 50;
const factTypes = new Set<string>(englishKindergartenFactTypeValues);

function rawIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function sourceDto(row: {
  sourceName: string;
  canonicalUrl: string;
  sourceType: string;
  authorityLevel: string;
}): EnglishKindergartenSourceDTO {
  return {
    name: row.sourceName,
    url: row.canonicalUrl,
    sourceType: row.sourceType,
    authorityLevel:
      row.authorityLevel === "PRIMARY"
        ? "PRIMARY"
        : row.authorityLevel === "SECONDARY_OFFICIAL"
          ? "SECONDARY_OFFICIAL"
          : "DISCOVERY_ONLY",
  };
}

function officialSourceDto(row: {
  sourceName: string;
  canonicalUrl: string;
  authorityLevel: string;
}): OfficialSourceDTO {
  return {
    name: row.sourceName,
    url: row.canonicalUrl,
    authorityLevel:
      row.authorityLevel === "PRIMARY" ? "PRIMARY" : "SECONDARY_OFFICIAL",
  };
}

function targetIds(ids: readonly string[]) {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}

async function publishedEnglishKindergartenIds(
  executor: DatabaseExecutor,
  institutionIds: readonly string[],
): Promise<string[]> {
  if (institutionIds.length === 0) return [];
  if (institutionIds.length > MAX_PUBLIC_BATCH) {
    throw new Error(
      "English-kindergarten public batch exceeds the query limit.",
    );
  }
  const rows = (await executor.raw(sql`
    select id
    from institutions
    where id in (${targetIds(institutionIds)})
      and category = 'ENGLISH_KINDERGARTEN'
      and publication_state = 'PUBLISHED'
    order by id
  `)) as unknown as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

async function loadCoverage(
  executor: DatabaseExecutor,
  institutionIds: readonly string[],
): Promise<Map<string, EnglishKindergartenSectionDTO[]>> {
  const result = new Map<string, EnglishKindergartenSectionDTO[]>();
  if (institutionIds.length === 0) return result;
  const rows = (await executor.raw(sql`
    select c.institution_id as "institutionId", c.section, c.status,
      c.academic_year_label as "academicYearLabel",
      c.public_note as "publicNote",
      c.last_collected_at as "lastCollectedAt",
      c.last_checked_at as "lastCheckedAt",
      s.source_name as "sourceName", s.canonical_url as "canonicalUrl",
      s.source_type as "sourceType", s.authority_level as "authorityLevel"
    from institution_section_coverages c
    join institutions i on i.id = c.institution_id
      and i.category = 'ENGLISH_KINDERGARTEN'
      and i.publication_state = 'PUBLISHED'
    left join sources s on s.id = c.source_id
    where c.institution_id in (${targetIds(institutionIds)})
    order by c.institution_id, c.section
  `)) as unknown as Array<{
    institutionId: string;
    section: EnglishKindergartenSection;
    status: CoverageStatus;
    academicYearLabel: string | null;
    publicNote: string | null;
    lastCollectedAt: Date | string | null;
    lastCheckedAt: Date | string;
    sourceName: string | null;
    canonicalUrl: string | null;
    sourceType: string | null;
    authorityLevel: string | null;
  }>;
  for (const institutionId of institutionIds) {
    const bySection = new Map(
      rows
        .filter((row) => row.institutionId === institutionId)
        .map((row) => [row.section, row]),
    );
    result.set(
      institutionId,
      englishKindergartenSectionValues.map((section) => {
        const row = bySection.get(section);
        if (row === undefined) {
          return {
            section,
            status: "NOT_RESEARCHED",
            message: coverageMessage(section, "NOT_RESEARCHED"),
            academicYearLabel: null,
            publicNote: null,
            lastCollectedAt: null,
            lastCheckedAt: null,
            source: null,
          };
        }
        return {
          section,
          status: row.status,
          message: row.publicNote ?? coverageMessage(section, row.status),
          academicYearLabel: row.academicYearLabel,
          publicNote: row.publicNote,
          lastCollectedAt:
            row.lastCollectedAt === null ? null : rawIso(row.lastCollectedAt),
          lastCheckedAt: rawIso(row.lastCheckedAt),
          source:
            row.sourceName === null ||
            row.canonicalUrl === null ||
            row.sourceType === null ||
            row.authorityLevel === null
              ? null
              : sourceDto({
                  sourceName: row.sourceName,
                  canonicalUrl: row.canonicalUrl,
                  sourceType: row.sourceType,
                  authorityLevel: row.authorityLevel,
                }),
        };
      }),
    );
  }
  return result;
}

async function loadFacts(
  executor: DatabaseExecutor,
  institutionIds: readonly string[],
): Promise<Map<string, EnglishKindergartenFactDTO[]>> {
  const result = new Map<string, EnglishKindergartenFactDTO[]>();
  if (institutionIds.length === 0) return result;
  const rows = (await executor.raw(sql`
    select f.institution_id as "institutionId", f.fact_type as "factType",
      v.id as "versionId", v.value_json as value,
      v.display_text as "displayText", v.verified_at as "verifiedAt",
      s.source_name as "sourceName", s.canonical_url as "canonicalUrl",
      s.authority_level as "authorityLevel", ss.captured_at as "capturedAt"
    from institution_facts f
    join institutions i on i.id = f.institution_id
      and i.category = 'ENGLISH_KINDERGARTEN'
      and i.publication_state = 'PUBLISHED'
    join institution_fact_versions v on v.institution_fact_id = f.id
      and v.is_current = true and v.verification_state = 'VERIFIED'
      and v.verified_at is not null
    join institution_fact_version_evidence e
      on e.institution_fact_version_id = v.id
    join sources s on s.id = e.source_id
      and s.source_type in (
        'OFFICIAL_ADMISSION_PAGE', 'OFFICIAL_NOTICE_BOARD',
        'OFFICIAL_DOCUMENT', 'OFFICIAL_APPLICATION_PORTAL',
        'OFFICIAL_SCHOOL_PAGE', 'OFFICIAL_SOCIAL'
      )
      and s.authority_level in ('PRIMARY', 'SECONDARY_OFFICIAL')
    left join source_snapshots ss on ss.id = e.source_snapshot_id
      and ss.source_id = e.source_id
    where f.institution_id in (${targetIds(institutionIds)})
    order by f.institution_id, f.fact_type, v.id,
      case when lower(e.evidence_role) = 'primary' then 0 else 1 end,
      case when s.authority_level = 'PRIMARY' then 0 else 1 end,
      s.canonical_url, s.id
  `)) as unknown as Array<{
    institutionId: string;
    factType: string;
    versionId: string;
    value: unknown;
    displayText: string | null;
    verifiedAt: Date | string;
    sourceName: string;
    canonicalUrl: string;
    authorityLevel: string;
    capturedAt: Date | string | null;
  }>;
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.institutionId}:${row.versionId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  for (const evidenceRows of grouped.values()) {
    const row = evidenceRows[0]!;
    if (!factTypes.has(row.factType)) continue;
    try {
      const value = parseEnglishKindergartenFactValue(
        row.factType as EnglishKindergartenFactType,
        row.value,
      );
      const fact: EnglishKindergartenFactDTO = {
        factType: row.factType as EnglishKindergartenFactType,
        value,
        displayText: row.displayText,
        lastCollectedAt:
          evidenceRows
            .flatMap((item) =>
              item.capturedAt === null ? [] : [rawIso(item.capturedAt)],
            )
            .sort()
            .at(-1) ?? null,
        verifiedAt: rawIso(row.verifiedAt),
        officialSources: evidenceRows
          .map(officialSourceDto)
          .filter(
            (source, index, values) =>
              values.findIndex((candidate) => candidate.url === source.url) ===
              index,
          ),
      };
      result.set(row.institutionId, [
        ...(result.get(row.institutionId) ?? []),
        fact,
      ]);
    } catch {
      // Invalid historical JSON must not become public comparison data.
    }
  }
  return result;
}

async function loadInformationSessions(
  executor: DatabaseExecutor,
  institutionIds: readonly string[],
): Promise<Map<string, EnglishKindergartenInformationSessionDTO>> {
  const result = new Map<string, EnglishKindergartenInformationSessionDTO>();
  if (institutionIds.length === 0) return result;
  const rows = (await executor.raw(sql`
    select distinct on (o.institution_id)
      o.institution_id as "institutionId", o.id, o.slug, v.title,
      v.business_state as "businessState", v.event_start_at as "eventStartsAt",
      v.application_close_at as "applicationClosesAt",
      v.action_url as "actionUrl", v.verified_at as "verifiedAt",
      ss.captured_at as "capturedAt", s.source_name as "sourceName",
      s.canonical_url as "canonicalUrl", s.authority_level as "authorityLevel"
    from opportunities o
    join institutions i on i.id = o.institution_id
      and i.category = 'ENGLISH_KINDERGARTEN'
      and i.publication_state = 'PUBLISHED'
    join opportunity_versions v on v.opportunity_id = o.id
      and v.is_current = true and v.verification_state = 'VERIFIED'
      and v.verified_at is not null
    join opportunity_version_evidence e on e.opportunity_version_id = v.id
    join sources s on s.id = e.source_id
      and s.source_type in (
        'OFFICIAL_ADMISSION_PAGE', 'OFFICIAL_NOTICE_BOARD',
        'OFFICIAL_DOCUMENT', 'OFFICIAL_APPLICATION_PORTAL',
        'OFFICIAL_SCHOOL_PAGE', 'OFFICIAL_SOCIAL'
      )
      and s.authority_level in ('PRIMARY', 'SECONDARY_OFFICIAL')
    left join source_snapshots ss on ss.id = e.source_snapshot_id
      and ss.source_id = e.source_id
    where o.institution_id in (${targetIds(institutionIds)})
      and o.publication_state = 'PUBLISHED'
      and o.truth_mode = 'NATIVE'
      and o.kind = 'INFORMATION_SESSION'
      and v.business_state <> 'CANCELLED'
      and v.event_start_at is not null
      and v.event_start_at >= now()
    order by o.institution_id, v.event_start_at,
      case when lower(e.evidence_role) = 'primary' then 0 else 1 end,
      case when s.authority_level = 'PRIMARY' then 0 else 1 end,
      s.canonical_url, s.id
  `)) as unknown as Array<{
    institutionId: string;
    id: string;
    slug: string;
    title: string;
    businessState: EnglishKindergartenInformationSessionDTO["businessState"];
    eventStartsAt: Date | string;
    applicationClosesAt: Date | string | null;
    actionUrl: string | null;
    verifiedAt: Date | string;
    capturedAt: Date | string | null;
    sourceName: string;
    canonicalUrl: string;
    authorityLevel: string;
  }>;
  for (const row of rows) {
    result.set(row.institutionId, {
      id: row.id,
      slug: row.slug,
      title: row.title,
      businessState: row.businessState,
      eventStartsAt: rawIso(row.eventStartsAt),
      applicationClosesAt:
        row.applicationClosesAt === null
          ? null
          : rawIso(row.applicationClosesAt),
      actionUrl: row.actionUrl,
      lastCollectedAt: row.capturedAt === null ? null : rawIso(row.capturedAt),
      verifiedAt: rawIso(row.verifiedAt),
      officialSource: officialSourceDto(row),
    });
  }
  return result;
}

function latest(values: Array<string | null | undefined>): string | null {
  return (
    values
      .flatMap((value) => (value ? [value] : []))
      .sort()
      .at(-1) ?? null
  );
}

function cardSummary(
  facts: EnglishKindergartenFactDTO[],
  coverage: EnglishKindergartenSectionDTO[],
  nextInformationSession: EnglishKindergartenInformationSessionDTO | null,
): EnglishKindergartenCardSummaryDTO {
  const tuition = facts.find((fact) => fact.factType === "TUITION");
  const age = facts.find((fact) => fact.factType === "TARGET_AGE_GRADE");
  const transport = facts.find((fact) => fact.factType === "TRANSPORT");
  return {
    tuition:
      tuition?.value.factType === "TUITION"
        ? {
            academicYearLabel: tuition.value.academicYearLabel,
            billingCadence: tuition.value.billingCadence,
            amountMin: tuition.value.amountMin,
            amountMax: tuition.value.amountMax,
            displayText: tuition.displayText,
            verifiedAt: tuition.verifiedAt,
          }
        : null,
    ageRange:
      age?.value.factType === "TARGET_AGE_GRADE"
        ? {
            min: age.value.minAge,
            max: age.value.maxAge,
            basis: age.value.ageBasis,
            academicYearLabel: age.value.academicYearLabel,
            displayText: age.displayText,
            verifiedAt: age.verifiedAt,
          }
        : null,
    transport:
      transport?.value.factType === "TRANSPORT"
        ? {
            state: transport.value.isAvailable ? "AVAILABLE" : "NOT_AVAILABLE",
            serviceAreas: transport.value.serviceAreas,
            inquiryRequired: transport.value.inquiryRequired,
            displayText: transport.displayText,
            verifiedAt: transport.verifiedAt,
          }
        : {
            state: "UNKNOWN",
            serviceAreas: [],
            inquiryRequired: false,
            displayText: null,
            verifiedAt: null,
          },
    nextInformationSession,
    coverage,
    lastContentCheckedAt: latest([
      ...coverage.map((item) => item.lastCheckedAt),
      ...facts.map((item) => item.verifiedAt),
      nextInformationSession?.verifiedAt,
    ]),
  };
}

export async function loadEnglishKindergartenCardSummaries(
  executor: DatabaseExecutor,
  institutionIds: readonly string[],
): Promise<Map<string, EnglishKindergartenCardSummaryDTO>> {
  const publicIds = await publishedEnglishKindergartenIds(
    executor,
    institutionIds,
  );
  const [factsByInstitution, coverageByInstitution, sessionsByInstitution] =
    await Promise.all([
      loadFacts(executor, publicIds),
      loadCoverage(executor, publicIds),
      loadInformationSessions(executor, publicIds),
    ]);
  return new Map(
    publicIds.map((institutionId) => [
      institutionId,
      cardSummary(
        factsByInstitution.get(institutionId) ?? [],
        coverageByInstitution.get(institutionId) ?? [],
        sessionsByInstitution.get(institutionId) ?? null,
      ),
    ]),
  );
}

async function loadReviewInsight(
  executor: DatabaseExecutor,
  institutionId: string,
): Promise<EnglishKindergartenReviewInsightDTO | null> {
  const rows = (await executor.raw(sql`
    select v.id as "versionId", v.period_start as "periodStart",
      v.period_end as "periodEnd", v.sample_size as "sampleSize",
      v.themes, v.limitations, v.verified_at as "verifiedAt",
      s.source_name as "sourceName", s.canonical_url as "canonicalUrl",
      s.source_type as "sourceType", s.authority_level as "authorityLevel",
      ss.captured_at as "capturedAt"
    from institution_review_insights r
    join institutions i on i.id = r.institution_id
      and i.category = 'ENGLISH_KINDERGARTEN'
      and i.publication_state = 'PUBLISHED'
    join institution_review_insight_versions v
      on v.institution_review_insight_id = r.id
      and v.is_current = true and v.verification_state = 'VERIFIED'
      and v.verified_at is not null
    join institution_review_insight_version_evidence e
      on e.institution_review_insight_version_id = v.id
    join sources s on s.id = e.source_id
    left join source_snapshots ss on ss.id = e.source_snapshot_id
      and ss.source_id = e.source_id
    where r.institution_id = ${institutionId}
    order by s.canonical_url, s.id
  `)) as unknown as Array<{
    versionId: string;
    periodStart: string | null;
    periodEnd: string | null;
    sampleSize: number;
    themes: unknown;
    limitations: string | null;
    verifiedAt: Date | string;
    sourceName: string;
    canonicalUrl: string;
    sourceType: string;
    authorityLevel: string;
    capturedAt: Date | string | null;
  }>;
  const row = rows[0];
  if (row === undefined) return null;
  try {
    const parsed = parseReviewInsightValue({
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      reviewCount: row.sampleSize,
      themes: row.themes,
      limitations: row.limitations,
    });
    return {
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      sampleSize: parsed.reviewCount,
      themes: parsed.themes,
      limitations: parsed.limitations,
      lastCollectedAt:
        rows
          .flatMap((item) =>
            item.capturedAt === null ? [] : [rawIso(item.capturedAt)],
          )
          .sort()
          .at(-1) ?? null,
      verifiedAt: rawIso(row.verifiedAt),
      sources: rows
        .map(sourceDto)
        .filter(
          (source, index, values) =>
            values.findIndex((candidate) => candidate.url === source.url) ===
            index,
        ),
    };
  } catch {
    return null;
  }
}

export async function loadEnglishKindergartenDetail(
  executor: DatabaseExecutor,
  institutionId: string,
): Promise<EnglishKindergartenDetailDTO | null> {
  const publicIds = await publishedEnglishKindergartenIds(executor, [
    institutionId,
  ]);
  if (publicIds.length === 0) return null;
  const [
    factsByInstitution,
    coverageByInstitution,
    sessionsByInstitution,
    review,
  ] = await Promise.all([
    loadFacts(executor, publicIds),
    loadCoverage(executor, publicIds),
    loadInformationSessions(executor, publicIds),
    loadReviewInsight(executor, institutionId),
  ]);
  const facts = factsByInstitution.get(institutionId) ?? [];
  const sections = coverageByInstitution.get(institutionId) ?? [];
  return {
    ...cardSummary(
      facts,
      sections,
      sessionsByInstitution.get(institutionId) ?? null,
    ),
    sections,
    facts,
    reviewInsight: review,
  };
}
