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
  lastVerifiedAt: string;
  officialSource: OfficialSourceDTO | null;
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

async function getNativeOfficialSource(
  executor: DatabaseExecutor,
  versionId: string,
): Promise<OfficialSourceDTO | null> {
  const [source] = await executor.drizzle
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
    )
    .limit(1);

  return source === undefined ? null : toOfficialSource(source);
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
    lastVerifiedAt: toIso(version.verifiedAt),
    officialSource: await getNativeOfficialSource(executor, version.id),
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
    lastVerifiedAt: toIso(version.verifiedAt),
    officialSource: await getLegacyOfficialSource(
      executor,
      version.eventVersionId,
    ),
  };
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
    lastVerifiedAt: truth.lastVerifiedAt,
    recentMeaningfulChanges: await getRecentMeaningfulChanges(
      executor,
      root.id,
    ),
    relatedArticles: await getRelatedArticles(executor, {
      opportunityId: root.id,
    }),
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
