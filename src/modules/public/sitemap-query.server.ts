import "server-only";

import { and, asc, eq, gt, inArray } from "drizzle-orm";

import { NotFoundError } from "@/src/application/errors";
import {
  articles,
  institutions,
  opportunities,
  urlRedirects,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { sanitizeArticleHtmlV1 } from "@/src/modules/editorial/sanitizer.server";
import { getIndexability } from "@/src/modules/public/indexability";
import { getInstitutionBySlug } from "@/src/modules/public/institution-query.server";
import { internationalSchoolPublicEligibilitySql } from "@/src/modules/public/international-school-publication-policy";
import { getOpportunityBySlug } from "@/src/modules/public/opportunity-query.server";

const BATCH_SIZE = 50;
const MAX_ENTITY_ENTRIES = 10_000;
// Detail DTO checks run several queries each; bounded parallelism keeps one
// sitemap request from monopolizing the shared runtime pool.
const DETAIL_CONCURRENCY = 4;

export type PublicSitemapEntryDTO = Readonly<{
  url: string;
  lastModified?: string;
}>;

function baseOrigin(appBaseUrl: string): string {
  const url = new URL(appBaseUrl);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new TypeError("APP_BASE_URL must be a credential-free HTTP(S) URL");
  }
  return url.origin;
}

async function findRedirectSources(
  executor: DatabaseExecutor,
  paths: readonly string[],
): Promise<ReadonlySet<string>> {
  if (paths.length === 0) return new Set();
  const rows = await executor.drizzle
    .select({ sourcePath: urlRedirects.sourcePath })
    .from(urlRedirects)
    .where(inArray(urlRedirects.sourcePath, [...paths]));
  return new Set(rows.map((row) => row.sourcePath));
}

async function mapInOrder<T, R>(
  items: readonly T[],
  map: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(DETAIL_CONCURRENCY, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await map(items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function appendInstitutions(
  executor: DatabaseExecutor,
  origin: string,
  output: PublicSitemapEntryDTO[],
): Promise<void> {
  let cursor: string | undefined;
  let examined = 0;
  while (examined < MAX_ENTITY_ENTRIES) {
    const rows = await executor.drizzle
      .select({ id: institutions.id, slug: institutions.slug })
      .from(institutions)
      .where(
        and(
          eq(institutions.publicationState, "PUBLISHED"),
          internationalSchoolPublicEligibilitySql(),
          cursor === undefined ? undefined : gt(institutions.id, cursor),
        ),
      )
      .orderBy(asc(institutions.id))
      .limit(BATCH_SIZE);
    if (rows.length === 0) break;
    examined += rows.length;
    const redirects = await findRedirectSources(
      executor,
      rows.map((row) => `/institutions/${row.slug}`),
    );
    const entries = await mapInOrder(rows, async (row) => {
      const path = `/institutions/${row.slug}`;
      if (redirects.has(path)) return null;
      try {
        const dto = await getInstitutionBySlug(executor, row.slug);
        if (dto.indexability !== "INDEX") return null;
        return {
          url: `${origin}${path}`,
          ...(dto.institution.lastVerifiedAt === null ||
          dto.institution.lastVerifiedAt === undefined
            ? {}
            : { lastModified: dto.institution.lastVerifiedAt }),
        };
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        return null;
      }
    });
    for (const entry of entries) if (entry !== null) output.push(entry);
    cursor = rows.at(-1)!.id;
    if (rows.length < BATCH_SIZE) break;
  }
}

async function appendOpportunities(
  executor: DatabaseExecutor,
  origin: string,
  output: PublicSitemapEntryDTO[],
): Promise<void> {
  let cursor: string | undefined;
  let examined = 0;
  while (examined < MAX_ENTITY_ENTRIES) {
    const rows = await executor.drizzle
      .select({ id: opportunities.id, slug: opportunities.slug })
      .from(opportunities)
      .innerJoin(institutions, eq(institutions.id, opportunities.institutionId))
      .where(
        and(
          eq(opportunities.publicationState, "PUBLISHED"),
          eq(institutions.publicationState, "PUBLISHED"),
          internationalSchoolPublicEligibilitySql(),
          cursor === undefined ? undefined : gt(opportunities.id, cursor),
        ),
      )
      .orderBy(asc(opportunities.id))
      .limit(BATCH_SIZE);
    if (rows.length === 0) break;
    examined += rows.length;
    const redirects = await findRedirectSources(
      executor,
      rows.map((row) => `/opportunities/${row.slug}`),
    );
    const entries = await mapInOrder(rows, async (row) => {
      const path = `/opportunities/${row.slug}`;
      if (redirects.has(path)) return null;
      try {
        const dto = await getOpportunityBySlug(executor, row.slug);
        if (dto.indexability !== "INDEX") return null;
        return {
          url: `${origin}${path}`,
          ...(dto.lastVerifiedAt === null
            ? {}
            : { lastModified: dto.lastVerifiedAt }),
        };
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        return null;
      }
    });
    for (const entry of entries) if (entry !== null) output.push(entry);
    cursor = rows.at(-1)!.id;
    if (rows.length < BATCH_SIZE) break;
  }
}

async function appendArticles(
  executor: DatabaseExecutor,
  origin: string,
  output: PublicSitemapEntryDTO[],
): Promise<void> {
  let cursor: string | undefined;
  let examined = 0;
  while (examined < MAX_ENTITY_ENTRIES) {
    const rows = await executor.drizzle
      .select({
        id: articles.id,
        slug: articles.slug,
        robotsIndex: articles.robotsIndex,
        excerpt: articles.excerpt,
        seoDescription: articles.seoDescription,
        unsafeStoredContentHtml: articles.contentHtml,
        updatedAt: articles.updatedAt,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, "PUBLISHED"),
          cursor === undefined ? undefined : gt(articles.id, cursor),
        ),
      )
      .orderBy(asc(articles.id))
      .limit(BATCH_SIZE);
    if (rows.length === 0) break;
    const redirects = await findRedirectSources(
      executor,
      rows.map((row) => `/articles/${row.slug}`),
    );
    for (const row of rows) {
      examined += 1;
      const sanitized = sanitizeArticleHtmlV1(row.unsafeStoredContentHtml, {
        appBaseUrl: origin,
      });
      const indexability = getIndexability({
        entity: "ARTICLE",
        status: "PUBLISHED",
        slug: row.slug,
        robotsIndex: row.robotsIndex,
        hasMeaningfulSanitizedBody: sanitized.nonWhitespaceCodePoints >= 40,
        hasDescription:
          (row.seoDescription ?? row.excerpt)?.trim().length !== 0 &&
          (row.seoDescription ?? row.excerpt) !== null,
      });
      const path = `/articles/${row.slug}`;
      if (indexability !== "INDEX" || redirects.has(path)) {
        continue;
      }
      output.push({
        url: `${origin}${path}`,
        lastModified: row.updatedAt.toISOString(),
      });
    }
    cursor = rows.at(-1)!.id;
    if (rows.length < BATCH_SIZE) break;
  }
}

export async function listPublicSitemapEntries(
  executor: DatabaseExecutor,
  appBaseUrl: string,
): Promise<readonly PublicSitemapEntryDTO[]> {
  const origin = baseOrigin(appBaseUrl);
  const output: PublicSitemapEntryDTO[] = [
    { url: `${origin}/` },
    { url: `${origin}/institutions` },
    { url: `${origin}/articles` },
    { url: `${origin}/opportunities` },
    { url: `${origin}/guides/english-kindergarten-checklist` },
    { url: `${origin}/compare/english-kindergarten/yangcheon` },
  ];
  await appendInstitutions(executor, origin, output);
  await appendOpportunities(executor, origin, output);
  await appendArticles(executor, origin, output);
  return output;
}
