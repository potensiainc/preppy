import "server-only";

import { and, asc, eq, or, sql } from "drizzle-orm";

import { NotFoundError } from "@/src/application/errors";
import {
  articleInstitutions,
  articleOpportunities,
  articles,
  admissionEventVersions,
  admissionEvents,
  institutions,
  opportunities,
  opportunityAdmissionEventLinks,
  opportunityVersions,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type { InstitutionCardDTO, OpportunityCardDTO } from "./dto";
import {
  getPublicInstitutionCardsByIds,
  getPublicOpportunityCardsByIds,
} from "./institution-query.server";
import type { UnsafeStoredArticleDetailDTO } from "./article-detail.server";

const RELATED_TARGET_LIMIT = 12;

type RelatedTarget = { id: string; sortOrder: number | null };

function orderRelated<T extends { id: string }>(
  targets: RelatedTarget[],
  cards: T[],
): T[] {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  return targets
    .map((target) => ({ target, card: cardById.get(target.id) }))
    .filter(
      (item): item is { target: RelatedTarget; card: T } =>
        item.card !== undefined,
    )
    .sort(
      (left, right) =>
        (left.target.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.target.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.card.id.localeCompare(right.card.id),
    )
    .map((item) => item.card);
}

/** Published canonical Institution cards related to one Article, relation-order first. */
export async function getRelatedInstitutions(
  executor: DatabaseExecutor,
  articleId: string,
): Promise<InstitutionCardDTO[]> {
  const targets = await executor.drizzle
    .select({
      id: articleInstitutions.institutionId,
      sortOrder: articleInstitutions.sortOrder,
    })
    .from(articleInstitutions)
    .innerJoin(
      institutions,
      and(
        eq(institutions.id, articleInstitutions.institutionId),
        eq(institutions.publicationState, "PUBLISHED"),
      ),
    )
    .where(eq(articleInstitutions.articleId, articleId))
    .orderBy(
      asc(articleInstitutions.sortOrder),
      asc(articleInstitutions.institutionId),
    )
    .limit(RELATED_TARGET_LIMIT);
  return orderRelated(
    targets,
    await getPublicInstitutionCardsByIds(
      executor,
      targets.map((target) => target.id),
    ),
  );
}

/** Published canonical Opportunity cards related to one Article, relation-order first. */
export async function getRelatedOpportunities(
  executor: DatabaseExecutor,
  articleId: string,
): Promise<OpportunityCardDTO[]> {
  const targets = await executor.drizzle
    .select({
      id: articleOpportunities.opportunityId,
      sortOrder: articleOpportunities.sortOrder,
    })
    .from(articleOpportunities)
    .innerJoin(
      opportunities,
      and(
        eq(opportunities.id, articleOpportunities.opportunityId),
        eq(opportunities.publicationState, "PUBLISHED"),
      ),
    )
    .innerJoin(
      institutions,
      and(
        eq(institutions.id, opportunities.institutionId),
        eq(institutions.publicationState, "PUBLISHED"),
      ),
    )
    .where(
      and(
        eq(articleOpportunities.articleId, articleId),
        or(
          and(
            eq(opportunities.truthMode, "NATIVE"),
            sql`exists (select 1 from ${opportunityVersions} where ${opportunityVersions.opportunityId} = ${opportunities.id} and ${opportunityVersions.isCurrent} = true and ${opportunityVersions.verificationState} = 'VERIFIED' and ${opportunityVersions.verifiedAt} is not null and ${opportunityVersions.businessState} <> 'UNKNOWN')`,
          ),
          and(
            eq(opportunities.truthMode, "LEGACY_BACKED"),
            sql`exists (select 1 from ${opportunityAdmissionEventLinks} join ${admissionEvents} on ${admissionEvents.id} = ${opportunityAdmissionEventLinks.admissionEventId} and ${admissionEvents.isPublic} = true join ${admissionEventVersions} on ${admissionEventVersions.admissionEventId} = ${admissionEvents.id} and ${admissionEventVersions.isCurrent} = true and ${admissionEventVersions.verificationStatus} = 'VERIFIED' and ${admissionEventVersions.verifiedAt} is not null and ${admissionEventVersions.eventStatus} in ('ACTIVE', 'SCHEDULED', 'CLOSED', 'COMPLETED', 'CANCELLED') where ${opportunityAdmissionEventLinks.opportunityId} = ${opportunities.id})`,
          ),
        ),
      ),
    )
    .orderBy(
      asc(articleOpportunities.sortOrder),
      asc(articleOpportunities.opportunityId),
    )
    .limit(RELATED_TARGET_LIMIT);
  return orderRelated(
    targets,
    await getPublicOpportunityCardsByIds(
      executor,
      targets.map((target) => target.id),
    ),
  );
}

/** Server-only public Article detail; stored HTML remains explicitly unsafe. */
export async function getArticleBySlug(
  executor: DatabaseExecutor,
  slug: string,
): Promise<UnsafeStoredArticleDetailDTO> {
  const [article] = await executor.drizzle
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
      updatedAt: articles.updatedAt,
      seoTitle: articles.seoTitle,
      seoDescription: articles.seoDescription,
      canonicalUrl: articles.canonicalUrl,
      robotsIndex: articles.robotsIndex,
      robotsFollow: articles.robotsFollow,
      unsafeStoredContentHtml: articles.contentHtml,
    })
    .from(articles)
    .where(and(eq(articles.slug, slug), eq(articles.status, "PUBLISHED")))
    .limit(1);
  if (article === undefined) throw new NotFoundError();
  const [relatedInstitutions, relatedOpportunities] = await Promise.all([
    getRelatedInstitutions(executor, article.id),
    getRelatedOpportunities(executor, article.id),
  ]);
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    articleType: article.articleType,
    category: article.category,
    publishedAt: article.publishedAt?.toISOString() ?? null,
    featuredImageUrl: article.featuredImageUrl,
    featuredImageAlt: article.featuredImageAlt,
    indexability: "NOINDEX",
    updatedAt: article.updatedAt.toISOString(),
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    canonicalUrl: article.canonicalUrl,
    robotsIndex: article.robotsIndex,
    robotsFollow: article.robotsFollow,
    relatedInstitutions,
    relatedOpportunities,
    unsafeStoredContentHtml: article.unsafeStoredContentHtml,
  };
}
