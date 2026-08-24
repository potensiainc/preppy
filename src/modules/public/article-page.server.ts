import "server-only";

import { NotFoundError } from "@/src/application/errors";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { resolveHistoricalArticleRedirect } from "@/src/modules/editorial/redirects.server";
import { parseCanonicalArticlePath } from "@/src/modules/editorial/redirects.server";
import { toPublicArticleDTO } from "@/app/_lib/public-article";

import type { PublicArticleDTO } from "./dto";
import { getArticleBySlug } from "./article-query.server";

export type ArticlePageResolution =
  | Readonly<{ kind: "ARTICLE"; article: PublicArticleDTO }>
  | Readonly<{ kind: "REDIRECT"; targetPath: `/articles/${string}` }>
  | Readonly<{ kind: "NOT_FOUND" }>;

export async function resolvePublicArticlePage(
  executor: DatabaseExecutor,
  slug: string,
  appBaseUrl: string,
): Promise<ArticlePageResolution> {
  if (parseCanonicalArticlePath(`/articles/${slug}`) !== slug) {
    return { kind: "NOT_FOUND" };
  }
  try {
    const stored = await getArticleBySlug(executor, slug);
    return {
      kind: "ARTICLE",
      article: toPublicArticleDTO(stored, appBaseUrl),
    };
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
  }
  return resolveHistoricalArticleRedirect(executor, `/articles/${slug}`);
}
