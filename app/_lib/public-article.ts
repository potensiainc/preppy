import "server-only";

import type { UnsafeStoredArticleDetailDTO } from "@/src/modules/public/article-detail.server";
import type { PublicArticleDTO } from "@/src/modules/public/dto";
import { sanitizeArticleHtmlV1 } from "@/src/modules/editorial/sanitizer.server";
import { getIndexability } from "@/src/modules/public/indexability";

/** Drops opaque stored markup before an Article reaches a renderable public DTO. */
export function toPublicArticleDTO(
  article: UnsafeStoredArticleDetailDTO,
  appBaseUrl: string,
): PublicArticleDTO {
  const sanitized = sanitizeArticleHtmlV1(article.unsafeStoredContentHtml, {
    appBaseUrl,
  });
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    articleType: article.articleType,
    category: article.category,
    publishedAt: article.publishedAt,
    featuredImageUrl: article.featuredImageUrl,
    featuredImageAlt: article.featuredImageAlt,
    indexability: getIndexability({
      entity: "ARTICLE",
      status: "PUBLISHED",
      slug: article.slug,
      robotsIndex: article.robotsIndex,
      hasMeaningfulSanitizedBody: sanitized.nonWhitespaceCodePoints >= 40,
      hasDescription:
        (article.seoDescription ?? article.excerpt)?.trim().length !== 0 &&
        (article.seoDescription ?? article.excerpt) !== null,
    }),
    updatedAt: article.updatedAt,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    canonicalUrl: article.canonicalUrl,
    robotsIndex: article.robotsIndex,
    robotsFollow: article.robotsFollow,
    relatedInstitutions: article.relatedInstitutions,
    relatedOpportunities: article.relatedOpportunities,
    sanitizedContentHtml: sanitized.html,
  };
}

export function getPublicArticleAppBaseUrl(
  environment: Record<string, string | undefined> = process.env,
): string {
  const value = environment.APP_BASE_URL;
  if (!value) throw new Error("APP_BASE_URL is required");
  const url = new URL(value);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("APP_BASE_URL must be a credential-free HTTP(S) URL");
  }
  return url.origin;
}
