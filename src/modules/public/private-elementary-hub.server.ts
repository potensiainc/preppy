import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { articles, institutions } from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

/** Per-school 2027 admission article slug: `<institution-slug>-2027-admission`. */
export function privateElementaryArticleSlug(institutionSlug: string): string {
  return `${institutionSlug}-2027-admission`;
}

export type PeHubSchool = Readonly<{
  name: string;
  district: string | null;
  href: string;
  hasArticle: boolean;
}>;

const SEOUL_REGION_VALUES = ["서울특별시", "KR-11"];

export async function listSeoulPrivateElementaryHubSchools(
  executor: DatabaseExecutor,
): Promise<readonly PeHubSchool[]> {
  const rows = await executor.drizzle
    .select({
      slug: institutions.slug,
      name: institutions.displayName,
      district: institutions.district,
    })
    .from(institutions)
    .where(
      and(
        eq(institutions.category, "PRIVATE_ELEMENTARY"),
        eq(institutions.publicationState, "PUBLISHED"),
        inArray(institutions.regionCode, SEOUL_REGION_VALUES),
      ),
    )
    .orderBy(asc(institutions.district), asc(institutions.displayName));
  if (rows.length === 0) return [];

  const published = await executor.drizzle
    .select({ slug: articles.slug })
    .from(articles)
    .where(
      and(
        eq(articles.status, "PUBLISHED"),
        inArray(
          articles.slug,
          rows.map((row) => privateElementaryArticleSlug(row.slug)),
        ),
      ),
    );
  const withArticle = new Set(published.map((row) => row.slug));

  return rows.map((row) => {
    const articleSlug = privateElementaryArticleSlug(row.slug);
    const hasArticle = withArticle.has(articleSlug);
    return {
      name: row.name,
      district: row.district,
      href: hasArticle
        ? `/articles/${articleSlug}`
        : `/institutions/${row.slug}`,
      hasArticle,
    };
  });
}
