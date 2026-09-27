import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { articles } from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type { ArticleCardDTO } from "./dto";
import { getIndexability } from "./indexability";

export const ARTICLE_LIST_PAGE_SIZE = 12;
/** Tag hubs with fewer Articles stay crawlable but are not indexed (thin). */
export const ARTICLE_TAG_INDEX_MIN_ARTICLES = 2;
const MAX_TAGS = 200;

export type PublicArticleListDTO = Readonly<{
  items: ArticleCardDTO[];
  page: number;
  pageCount: number;
  total: number;
}>;

export type PublicArticleTagDTO = Readonly<{ tag: string; count: number }>;

function tagFilter(tag: string | undefined) {
  return tag === undefined ? undefined : sql`${tag} = any(${articles.tags})`;
}

export async function listPublishedArticles(
  executor: DatabaseExecutor,
  input: Readonly<{ page: number; tag?: string; pageSize?: number }>,
): Promise<PublicArticleListDTO> {
  const pageSize = input.pageSize ?? ARTICLE_LIST_PAGE_SIZE;
  const page = Math.max(1, Math.floor(input.page));
  const where = and(eq(articles.status, "PUBLISHED"), tagFilter(input.tag));
  const [rows, totals] = await Promise.all([
    executor.drizzle
      .select({
        id: articles.id,
        slug: articles.slug,
        title: articles.title,
        excerpt: articles.excerpt,
        seoDescription: articles.seoDescription,
        articleType: articles.type,
        category: articles.category,
        publishedAt: articles.publishedAt,
        featuredImageUrl: articles.featuredImageUrl,
        featuredImageAlt: articles.featuredImageAlt,
        robotsIndex: articles.robotsIndex,
      })
      .from(articles)
      .where(where)
      .orderBy(desc(articles.publishedAt), asc(articles.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(articles)
      .where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map((article) => ({
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
        hasDescription:
          ((article.seoDescription ?? article.excerpt)?.trim().length ?? 0) > 0,
      }),
    })),
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
}

/** Tags used by published, index-allowed Articles, most used first. */
export async function listPublishedArticleTags(
  executor: DatabaseExecutor,
): Promise<PublicArticleTagDTO[]> {
  const rows = (await executor.raw(sql`
    select tag, count(*)::int as count
    from ${articles}, unnest(${articles.tags}) as tag
    where ${articles.status} = 'PUBLISHED' and ${articles.robotsIndex} = true
    group by tag
    order by count(*) desc, tag asc
    limit ${MAX_TAGS}
  `)) as unknown as Array<{ tag: string; count: number }>;
  return rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
}
