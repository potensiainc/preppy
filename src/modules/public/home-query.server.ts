import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { articles, institutions } from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type { ArticleCardDTO, HomePageDTO, InstitutionCardDTO } from "./dto";
import { getIndexability } from "./indexability";
import {
  getHomeCurrentOpportunityCards,
  getPublicInstitutionCardsByIds,
} from "./institution-query.server";
import { internationalSchoolPublicEligibilitySql } from "./international-school-publication-policy";

const HOME_SECTION_LIMIT = 12;
const HOME_INSTITUTIONS_PER_CATEGORY = 4;

const categories: HomePageDTO["categories"] = [
  {
    category: "ENGLISH_KINDERGARTEN",
    label: "English Kindergartens",
    href: "/institutions?category=ENGLISH_KINDERGARTEN",
  },
  {
    category: "PRIVATE_ELEMENTARY",
    label: "Private Elementary Schools",
    href: "/institutions?category=PRIVATE_ELEMENTARY",
  },
  {
    category: "INTERNATIONAL_SCHOOL",
    label: "International Schools",
    href: "/institutions?category=INTERNATIONAL_SCHOOL",
  },
];

async function getFeaturedInstitutions(
  executor: DatabaseExecutor,
): Promise<InstitutionCardDTO[]> {
  // Cap each category before hydrating one bounded batch of public cards.
  const categoryRows = await Promise.all(
    categories.map(({ category }) =>
      executor.drizzle
        .select({ id: institutions.id })
        .from(institutions)
        .where(
          and(
            eq(institutions.publicationState, "PUBLISHED"),
            internationalSchoolPublicEligibilitySql(),
            eq(institutions.category, category),
          ),
        )
        .orderBy(asc(institutions.displayName), asc(institutions.id))
        .limit(HOME_INSTITUTIONS_PER_CATEGORY),
    ),
  );
  const rows = categoryRows.flat();
  const cards = await getPublicInstitutionCardsByIds(
    executor,
    rows.map((row) => row.id),
  );
  const cardById = new Map(cards.map((card) => [card.id, card]));
  return rows.flatMap((row) => {
    const card = cardById.get(row.id);
    return card === undefined ? [] : [card];
  });
}

async function getLatestArticles(
  executor: DatabaseExecutor,
): Promise<ArticleCardDTO[]> {
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
    })
    .from(articles)
    .where(eq(articles.status, "PUBLISHED"))
    .orderBy(desc(articles.publishedAt), asc(articles.id))
    .limit(HOME_SECTION_LIMIT);
  return rows.map((article) => ({
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    articleType: article.articleType,
    category: article.category,
    publishedAt: article.publishedAt?.toISOString() ?? null,
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

/** Deterministic, user-independent public Home projection. */
export async function getHomePage(
  executor: DatabaseExecutor,
): Promise<HomePageDTO> {
  const [currentOpportunities, featuredInstitutions, latestArticles] =
    await Promise.all([
      getHomeCurrentOpportunityCards(executor),
      getFeaturedInstitutions(executor),
      getLatestArticles(executor),
    ]);
  return {
    currentOpportunities,
    featuredInstitutions,
    latestArticles,
    categories,
  };
}
