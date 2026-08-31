import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { NotFoundError } from "@/src/application/errors";
import {
  admissionEventVersions,
  admissionEvents,
  articleInstitutions,
  articleOpportunities,
  articles,
  eventVersionEvidence,
  institutions,
  opportunities,
  opportunityAdmissionEventLinks,
  opportunityChanges,
  opportunityVersionEvidence,
  opportunityVersions,
  sourceObservations,
  sources,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import {
  hasMonitorableSourceCoverage,
  isInstitutionFollowable,
} from "@/src/modules/follow/followability-policy.server";

import type {
  ArticleCardDTO,
  OfficialSourceDTO,
  OpportunityKeyDatesDTO,
  PublicOpportunityDTO,
} from "./dto";
import { getIndexability } from "./indexability";

const RELATED_ARTICLE_LIMIT = 6;
const RECENT_CHANGE_LIMIT = 5;

const officialSourceTypes = [
  "OFFICIAL_ADMISSION_PAGE",
  "OFFICIAL_NOTICE_BOARD",
  "OFFICIAL_DOCUMENT",
  "OFFICIAL_APPLICATION_PORTAL",
  "OFFICIAL_SCHOOL_PAGE",
  "OFFICIAL_SOCIAL",
] as const;

type RelatedArticlesTarget =
  | { opportunityId: string; limit?: number }
  | { institutionId: string; limit?: number };

type OpportunityRoot = {
  id: string;
  slug: string;
  kind: PublicOpportunityDTO["kind"];
  truthMode: "NATIVE" | "LEGACY_BACKED";
  publicationState: "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
  institution: PublicOpportunityDTO["institution"];
};

type Truth = {
  title: string;
  businessState: PublicOpportunityDTO["businessState"];
  keyDates: OpportunityKeyDatesDTO;
  targetAudience: string | null;
  summary: string | null;
  actionUrl: string | null;
  lastCollectedAt: string | null;
  lastVerifiedAt: string;
  officialSource: OfficialSourceDTO | null;
  officialSources?: OfficialSourceDTO[];
};

function toIso(value: Date): string {
  return value.toISOString();
}

function toOptionalIso(value: Date | null): string | null {
  return value === null ? null : toIso(value);
}

function hasText(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}

function hasActionableContent(truth: Truth): boolean {
  return (
    hasText(truth.summary) ||
    hasText(truth.targetAudience) ||
    hasText(truth.actionUrl) ||
    Object.values(truth.keyDates).some((value) => value !== null)
  );
}

function keyDate(keyDates: OpportunityKeyDatesDTO): string | null {
  return (
    keyDates.applicationClosesAt ??
    keyDates.applicationOpensAt ??
    keyDates.eventStartsAt ??
    keyDates.eventEndsAt
  );
}

function legacyDateTime(
  date: string | null,
  time: string | null,
  timezone: string,
): string | null {
  if (date === null) return null;
  if (time === null) return date;

  if (timezone === "Asia/Seoul") return `${date}T${time}+09:00`;
  if (timezone === "UTC" || timezone === "Etc/UTC") return `${date}T${time}Z`;

  // The legacy table stores local date/time separately. Preserve it without
  // inventing an offset when its IANA timezone cannot be safely normalized.
  return `${date}T${time}`;
}

function mapLegacyBusinessState(
  eventStatus: string,
): PublicOpportunityDTO["businessState"] | null {
  switch (eventStatus) {
    case "SCHEDULED":
      return "UPCOMING";
    case "ACTIVE":
      return "OPEN";
    case "CLOSED":
      return "CLOSED";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return null;
  }
}

function toOfficialSource(source: {
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

async function getRootBySlug(
  executor: DatabaseExecutor,
  slug: string,
): Promise<OpportunityRoot> {
  const [root] = await executor.drizzle
    .select({
      id: opportunities.id,
      slug: opportunities.slug,
      kind: opportunities.kind,
      truthMode: opportunities.truthMode,
      publicationState: opportunities.publicationState,
      institutionId: institutions.id,
      institutionSlug: institutions.slug,
      institutionName: institutions.displayName,
      institutionCategory: institutions.category,
      institutionRegion: institutions.regionCode,
      institutionPublicationState: institutions.publicationState,
      institutionOperationalState: institutions.operationalState,
    })
    .from(opportunities)
    .innerJoin(institutions, eq(institutions.id, opportunities.institutionId))
    .where(eq(opportunities.slug, slug))
    .limit(1);

  if (
    root === undefined ||
    root.publicationState !== "PUBLISHED" ||
    root.institutionPublicationState !== "PUBLISHED"
  ) {
    throw new NotFoundError();
  }
  const monitorable = await hasMonitorableSourceCoverage(
    executor,
    root.institutionId,
  );

  return {
    id: root.id,
    slug: root.slug,
    kind: root.kind,
    truthMode: root.truthMode,
    publicationState: root.publicationState,
    institution: {
      id: root.institutionId,
      slug: root.institutionSlug,
      name: root.institutionName,
      category: root.institutionCategory,
      region: root.institutionRegion,
      followable: isInstitutionFollowable(
        {
          publicationState: root.institutionPublicationState,
          operationalState: root.institutionOperationalState,
        },
        monitorable,
      ),
    },
  };
}

async function getNativeOfficialSources(
  executor: DatabaseExecutor,
  versionId: string,
): Promise<OfficialSourceDTO[]> {
  const sourceRows = await executor.drizzle
    .select({
      sourceName: sources.sourceName,
      canonicalUrl: sources.canonicalUrl,
      authorityLevel: sources.authorityLevel,
    })
    .from(opportunityVersionEvidence)
    .innerJoin(sources, eq(sources.id, opportunityVersionEvidence.sourceId))
    .where(
      and(
        eq(opportunityVersionEvidence.opportunityVersionId, versionId),
        inArray(sources.sourceType, officialSourceTypes),
        inArray(sources.authorityLevel, ["PRIMARY", "SECONDARY_OFFICIAL"]),
      ),
    )
    .orderBy(
      desc(
        sql`case when lower(${opportunityVersionEvidence.evidenceRole}) = 'primary' then 1 else 0 end`,
      ),
      asc(
        sql`case when ${sources.authorityLevel} = 'PRIMARY' then 0 else 1 end`,
      ),
      asc(sources.canonicalUrl),
      asc(sources.id),
    );

  return [
    ...new Map(
      sourceRows.map((source) => [
        source.canonicalUrl,
        toOfficialSource(source),
      ]),
    ).values(),
  ];
}

async function getNativeLastCollectedAt(
  executor: DatabaseExecutor,
  versionId: string,
): Promise<string | null> {
  const [observation] = await executor.drizzle
    .select({ observedAt: sourceObservations.observedAt })
    .from(opportunityVersionEvidence)
    .innerJoin(
      sourceObservations,
      and(
        eq(
          sourceObservations.id,
          opportunityVersionEvidence.sourceObservationId,
        ),
        eq(sourceObservations.sourceId, opportunityVersionEvidence.sourceId),
      ),
    )
    .where(eq(opportunityVersionEvidence.opportunityVersionId, versionId))
    .orderBy(desc(sourceObservations.observedAt))
    .limit(1);

  return observation === undefined ? null : toIso(observation.observedAt);
}

async function getLegacyOfficialSource(
  executor: DatabaseExecutor,
  eventVersionId: string,
): Promise<OfficialSourceDTO | null> {
  const [source] = await executor.drizzle
    .select({
      sourceName: sources.sourceName,
      canonicalUrl: sources.canonicalUrl,
      authorityLevel: sources.authorityLevel,
    })
    .from(eventVersionEvidence)
    .innerJoin(sources, eq(sources.id, eventVersionEvidence.sourceId))
    .where(
      and(
        eq(eventVersionEvidence.eventVersionId, eventVersionId),
        inArray(sources.sourceType, officialSourceTypes),
        inArray(sources.authorityLevel, ["PRIMARY", "SECONDARY_OFFICIAL"]),
      ),
    )
    .orderBy(
      desc(eventVersionEvidence.isPrimary),
      asc(
        sql`case when ${sources.authorityLevel} = 'PRIMARY' then 0 else 1 end`,
      ),
      asc(sources.canonicalUrl),
      asc(sources.id),
    )
    .limit(1);

  return source === undefined ? null : toOfficialSource(source);
}

async function getLegacyLastCollectedAt(
  executor: DatabaseExecutor,
  eventVersionId: string,
): Promise<string | null> {
  const [observation] = await executor.drizzle
    .select({ observedAt: sourceObservations.observedAt })
    .from(eventVersionEvidence)
    .innerJoin(
      sourceObservations,
      and(
        eq(sourceObservations.id, eventVersionEvidence.sourceObservationId),
        eq(sourceObservations.sourceId, eventVersionEvidence.sourceId),
      ),
    )
    .where(eq(eventVersionEvidence.eventVersionId, eventVersionId))
    .orderBy(desc(sourceObservations.observedAt))
    .limit(1);

  return observation === undefined ? null : toIso(observation.observedAt);
}

async function getNativeTruth(
  executor: DatabaseExecutor,
  opportunityId: string,
): Promise<Truth> {
  const [version] = await executor.drizzle
    .select({
      id: opportunityVersions.id,
      title: opportunityVersions.title,
      businessState: opportunityVersions.businessState,
      summary: opportunityVersions.summary,
      targetAudience: opportunityVersions.targetAudience,
      eventStartAt: opportunityVersions.eventStartAt,
      eventEndAt: opportunityVersions.eventEndAt,
      applicationOpenAt: opportunityVersions.applicationOpenAt,
      applicationCloseAt: opportunityVersions.applicationCloseAt,
      actionUrl: opportunityVersions.actionUrl,
      verifiedAt: opportunityVersions.verifiedAt,
    })
    .from(opportunityVersions)
    .where(
      and(
        eq(opportunityVersions.opportunityId, opportunityId),
        eq(opportunityVersions.isCurrent, true),
        eq(opportunityVersions.verificationState, "VERIFIED"),
      ),
    )
    .limit(1);

  if (version === undefined || version.verifiedAt === null) {
    throw new NotFoundError();
  }

  const [officialSources, lastCollectedAt] = await Promise.all([
    getNativeOfficialSources(executor, version.id),
    getNativeLastCollectedAt(executor, version.id),
  ]);
  return {
    title: version.title,
    businessState: version.businessState,
    keyDates: {
      eventStartsAt: toOptionalIso(version.eventStartAt),
      eventEndsAt: toOptionalIso(version.eventEndAt),
      applicationOpensAt: toOptionalIso(version.applicationOpenAt),
      applicationClosesAt: toOptionalIso(version.applicationCloseAt),
    },
    targetAudience: version.targetAudience,
    summary: version.summary,
    actionUrl: version.actionUrl,
    lastCollectedAt,
    lastVerifiedAt: toIso(version.verifiedAt),
    officialSource: officialSources[0] ?? null,
    officialSources,
  };
}

async function getLegacyTruth(
  executor: DatabaseExecutor,
  opportunityId: string,
): Promise<Truth> {
  const [version] = await executor.drizzle
    .select({
      eventVersionId: admissionEventVersions.id,
      title: admissionEventVersions.displayTitle,
      eventStatus: admissionEventVersions.eventStatus,
      eventStartDate: admissionEventVersions.eventStartDate,
      eventStartTime: admissionEventVersions.eventStartTime,
      eventEndDate: admissionEventVersions.eventEndDate,
      eventEndTime: admissionEventVersions.eventEndTime,
      registrationOpenDate: admissionEventVersions.registrationOpenDate,
      registrationOpenTime: admissionEventVersions.registrationOpenTime,
      registrationCloseDate: admissionEventVersions.registrationCloseDate,
      registrationCloseTime: admissionEventVersions.registrationCloseTime,
      timezone: admissionEventVersions.timezone,
      actionUrl: admissionEventVersions.actionUrl,
      summary: admissionEventVersions.officialNotes,
      targetAudience: admissionEvents.audienceSummary,
      verifiedAt: admissionEventVersions.verifiedAt,
    })
    .from(opportunityAdmissionEventLinks)
    .innerJoin(
      admissionEvents,
      and(
        eq(admissionEvents.id, opportunityAdmissionEventLinks.admissionEventId),
        eq(admissionEvents.isPublic, true),
      ),
    )
    .innerJoin(
      admissionEventVersions,
      and(
        eq(admissionEventVersions.admissionEventId, admissionEvents.id),
        eq(admissionEventVersions.isCurrent, true),
        eq(admissionEventVersions.verificationStatus, "VERIFIED"),
      ),
    )
    .where(eq(opportunityAdmissionEventLinks.opportunityId, opportunityId))
    .limit(1);

  if (version === undefined || version.verifiedAt === null) {
    throw new NotFoundError();
  }

  const businessState = mapLegacyBusinessState(version.eventStatus);
  if (businessState === null) {
    throw new NotFoundError();
  }

  const [officialSource, lastCollectedAt] = await Promise.all([
    getLegacyOfficialSource(executor, version.eventVersionId),
    getLegacyLastCollectedAt(executor, version.eventVersionId),
  ]);

  return {
    title: version.title,
    businessState,
    keyDates: {
      eventStartsAt: legacyDateTime(
        version.eventStartDate,
        version.eventStartTime,
        version.timezone,
      ),
      eventEndsAt: legacyDateTime(
        version.eventEndDate,
        version.eventEndTime,
        version.timezone,
      ),
      applicationOpensAt: legacyDateTime(
        version.registrationOpenDate,
        version.registrationOpenTime,
        version.timezone,
      ),
      applicationClosesAt: legacyDateTime(
        version.registrationCloseDate,
        version.registrationCloseTime,
        version.timezone,
      ),
    },
    targetAudience: version.targetAudience,
    summary: version.summary,
    actionUrl: version.actionUrl,
    lastCollectedAt,
    lastVerifiedAt: toIso(version.verifiedAt),
    officialSource,
  };
}

async function getSameCycleAdmissionGuide(
  executor: DatabaseExecutor,
  root: OpportunityRoot,
): Promise<PublicOpportunityDTO["admissionGuide"]> {
  const childMatch =
    /^live-admissions-([0-9a-f-]{36})-(20\d{2}|current)-event-([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(
      root.slug,
    );
  if (
    root.truthMode !== "NATIVE" ||
    childMatch === null ||
    childMatch[1] !== root.institution.id
  ) {
    return null;
  }

  const mainSlug = `live-admissions-${childMatch[1]}-${childMatch[2]}`;
  const [guide] = await executor.drizzle
    .select({
      id: opportunities.id,
      slug: opportunities.slug,
      versionId: opportunityVersions.id,
      title: opportunityVersions.title,
      summary: opportunityVersions.summary,
      verifiedAt: opportunityVersions.verifiedAt,
    })
    .from(opportunities)
    .innerJoin(
      opportunityVersions,
      and(
        eq(opportunityVersions.opportunityId, opportunities.id),
        eq(opportunityVersions.isCurrent, true),
        eq(opportunityVersions.verificationState, "VERIFIED"),
      ),
    )
    .where(
      and(
        eq(opportunities.institutionId, root.institution.id),
        eq(opportunities.slug, mainSlug),
        eq(opportunities.truthMode, "NATIVE"),
        inArray(opportunities.kind, ["RECRUITMENT", "LOTTERY"]),
        eq(opportunities.publicationState, "PUBLISHED"),
      ),
    )
    .limit(1);
  if (guide === undefined) return null;

  const [officialSources, lastCollectedAt] = await Promise.all([
    getNativeOfficialSources(executor, guide.versionId),
    getNativeLastCollectedAt(executor, guide.versionId),
  ]);
  if (officialSources.length === 0 || guide.verifiedAt === null) return null;
  return {
    title: guide.title,
    slug: guide.slug,
    summary: guide.summary,
    officialSources,
    lastCollectedAt,
    lastVerifiedAt: toIso(guide.verifiedAt),
  };
}

function canonicalAdmissionCycle(root: OpportunityRoot): string | null {
  const match =
    /^live-admissions-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-(20\d{2}|current)(?:-event-[a-z0-9]+(?:-[a-z0-9]+)*)?$/u.exec(
      root.slug,
    );
  return root.truthMode === "NATIVE" && match?.[1] === root.institution.id
    ? match[2]!
    : null;
}

async function getSameCycleAdmissions(
  executor: DatabaseExecutor,
  root: OpportunityRoot,
): Promise<NonNullable<PublicOpportunityDTO["relatedAdmissions"]>> {
  const cycle = canonicalAdmissionCycle(root);
  if (cycle === null) return [];
  const eventPattern = `^live-admissions-${root.institution.id}-${cycle}-event-[a-z0-9]+(-[a-z0-9]+)*$`;
  const rows = await executor.drizzle
    .select({
      versionId: opportunityVersions.id,
      slug: opportunities.slug,
      kind: opportunities.kind,
      title: opportunityVersions.title,
      businessState: opportunityVersions.businessState,
      eventStartAt: opportunityVersions.eventStartAt,
      eventEndAt: opportunityVersions.eventEndAt,
      applicationOpenAt: opportunityVersions.applicationOpenAt,
      applicationCloseAt: opportunityVersions.applicationCloseAt,
      summary: opportunityVersions.summary,
      targetAudience: opportunityVersions.targetAudience,
      actionUrl: opportunityVersions.actionUrl,
      verifiedAt: opportunityVersions.verifiedAt,
    })
    .from(opportunities)
    .innerJoin(
      opportunityVersions,
      and(
        eq(opportunityVersions.opportunityId, opportunities.id),
        eq(opportunityVersions.isCurrent, true),
        eq(opportunityVersions.verificationState, "VERIFIED"),
        sql`${opportunityVersions.verifiedAt} is not null`,
      ),
    )
    .where(
      and(
        eq(opportunities.institutionId, root.institution.id),
        eq(opportunities.truthMode, "NATIVE"),
        eq(opportunities.publicationState, "PUBLISHED"),
        sql`${opportunities.slug} ~ ${eventPattern}`,
        sql`exists (
      select 1 from ${opportunityVersionEvidence}
      join ${sources} on ${sources.id} = ${opportunityVersionEvidence.sourceId}
      where ${opportunityVersionEvidence.opportunityVersionId} = ${opportunityVersions.id}
      and ${inArray(sources.sourceType, officialSourceTypes)}
      and ${inArray(sources.authorityLevel, ["PRIMARY", "SECONDARY_OFFICIAL"])}
    )`,
      ),
    )
    .orderBy(asc(opportunityVersions.eventStartAt), asc(opportunities.slug))
    .limit(24);
  return Promise.all(
    rows.map(async (row) => ({
      slug: row.slug,
      title: row.title,
      kind: row.kind,
      businessState: row.businessState,
      summary: row.summary,
      targetAudience: row.targetAudience,
      actionUrl: row.actionUrl,
      officialSources: await getNativeOfficialSources(executor, row.versionId),
      lastCollectedAt: await getNativeLastCollectedAt(executor, row.versionId),
      lastVerifiedAt: toOptionalIso(row.verifiedAt),
      keyDates: {
        eventStartsAt: toOptionalIso(row.eventStartAt),
        eventEndsAt: toOptionalIso(row.eventEndAt),
        applicationOpensAt: toOptionalIso(row.applicationOpenAt),
        applicationClosesAt: toOptionalIso(row.applicationCloseAt),
      },
    })),
  );
}

export async function getRelatedArticles(
  executor: DatabaseExecutor,
  target: RelatedArticlesTarget,
): Promise<ArticleCardDTO[]> {
  const limit = Math.min(
    Math.max(target.limit ?? RELATED_ARTICLE_LIMIT, 1),
    12,
  );
  const relation =
    "opportunityId" in target ? articleOpportunities : articleInstitutions;
  const targetColumn =
    "opportunityId" in target
      ? articleOpportunities.opportunityId
      : articleInstitutions.institutionId;
  const targetId =
    "opportunityId" in target ? target.opportunityId : target.institutionId;

  const rows = await executor.drizzle
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      articleType: articles.type,
      category: articles.category,
      publishedAt: articles.publishedAt,
      featuredImageUrl: articles.featuredImageUrl,
      featuredImageAlt: articles.featuredImageAlt,
      robotsIndex: articles.robotsIndex,
      sortOrder: relation.sortOrder,
    })
    .from(relation)
    .innerJoin(articles, eq(articles.id, relation.articleId))
    .where(and(eq(targetColumn, targetId), eq(articles.status, "PUBLISHED")))
    .orderBy(
      asc(relation.sortOrder),
      desc(articles.publishedAt),
      asc(articles.id),
    )
    .limit(limit);

  return rows.map((article) => ({
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    articleType: article.articleType,
    category: article.category,
    publishedAt: toOptionalIso(article.publishedAt),
    featuredImageUrl: article.featuredImageUrl,
    featuredImageAlt: article.featuredImageAlt,
    indexability: getIndexability({
      entity: "ARTICLE",
      status: "PUBLISHED",
      slug: article.slug,
      robotsIndex: article.robotsIndex,
      hasMeaningfulSanitizedBody: false,
      hasDescription: (article.excerpt?.trim().length ?? 0) > 0,
    }),
  }));
}

async function getRecentMeaningfulChanges(
  executor: DatabaseExecutor,
  opportunityId: string,
): Promise<PublicOpportunityDTO["recentMeaningfulChanges"]> {
  const changes = await executor.drizzle
    .select({
      occurredAt: opportunityChanges.publishedAt,
      summary: opportunityChanges.summary,
    })
    .from(opportunityChanges)
    .where(eq(opportunityChanges.opportunityId, opportunityId))
    .orderBy(desc(opportunityChanges.publishedAt), desc(opportunityChanges.id))
    .limit(RECENT_CHANGE_LIMIT);

  return changes.map((change) => ({
    occurredAt: toIso(change.occurredAt),
    summary: change.summary,
  }));
}

/**
 * Canonical, globally cache-safe Opportunity detail projection. The selected
 * root's persistence mode stays private; only the current verified truth is
 * mapped into the shared DTO.
 */
export async function getOpportunityBySlug(
  executor: DatabaseExecutor,
  slug: string,
): Promise<PublicOpportunityDTO> {
  const root = await getRootBySlug(executor, slug);
  const truth =
    root.truthMode === "NATIVE"
      ? await getNativeTruth(executor, root.id)
      : await getLegacyTruth(executor, root.id);

  const [
    recentMeaningfulChanges,
    relatedArticles,
    admissionGuide,
    relatedAdmissions,
  ] = await Promise.all([
    getRecentMeaningfulChanges(executor, root.id),
    getRelatedArticles(executor, { opportunityId: root.id }),
    getSameCycleAdmissionGuide(executor, root),
    getSameCycleAdmissions(executor, root),
  ]);

  return {
    id: root.id,
    slug: root.slug,
    title: truth.title,
    kind: root.kind,
    businessState: truth.businessState,
    keyDate: keyDate(truth.keyDates),
    keyDates: truth.keyDates,
    institution: root.institution,
    targetAudience: truth.targetAudience,
    summary: truth.summary,
    actionUrl: truth.actionUrl,
    officialSource: truth.officialSource,
    officialSources:
      truth.officialSources ??
      (truth.officialSource ? [truth.officialSource] : []),
    admissionGuide,
    academicYearLabel: /^20\d{2}$/u.test(canonicalAdmissionCycle(root) ?? "")
      ? `${canonicalAdmissionCycle(root)}학년도`
      : null,
    relatedAdmissions,
    lastCollectedAt: truth.lastCollectedAt,
    lastVerifiedAt: truth.lastVerifiedAt,
    recentMeaningfulChanges,
    relatedArticles,
    indexability: getIndexability({
      entity: "OPPORTUNITY",
      publicationState: root.publicationState,
      title: truth.title,
      businessState: truth.businessState,
      hasVerifiedCurrentTruth: true,
      hasOfficialEvidence: truth.officialSource !== null,
      hasUniqueActionableContent: hasActionableContent(truth),
    }),
  };
}
