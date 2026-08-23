import "server-only";

import type { UnsafeStoredArticleDetailDTO } from "@/src/modules/public/article-detail.server";
import type { PublicArticleDTO } from "@/src/modules/public/dto";

/** Drops opaque stored markup before an Article reaches a renderable public DTO. */
export function toPublicArticleDTO(
  article: UnsafeStoredArticleDetailDTO,
): PublicArticleDTO {
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
    indexability: article.indexability,
    updatedAt: article.updatedAt,
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    canonicalUrl: article.canonicalUrl,
    robotsIndex: article.robotsIndex,
    robotsFollow: article.robotsFollow,
    authorDisplayName: article.authorDisplayName,
    relatedInstitutions: article.relatedInstitutions,
    relatedOpportunities: article.relatedOpportunities,
  };
}
