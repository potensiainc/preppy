import { describe, expect, it } from "vitest";

import type { PublicArticleDTO } from "@/src/modules/public/dto";
import {
  buildArticleBreadcrumbJsonLd,
  buildArticleJsonLd,
  serializeJsonLd,
} from "@/src/modules/public/seo";

const article: PublicArticleDTO = {
  id: "article",
  slug: "complete-guide",
  title: "Complete <guide>",
  excerpt: "Description",
  articleType: "GUIDE",
  category: "ADMISSIONS_GENERAL",
  publishedAt: "2026-08-25T00:00:00.000Z",
  featuredImageUrl: null,
  featuredImageAlt: null,
  indexability: "INDEX",
  updatedAt: "2026-08-25T01:00:00.000Z",
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  robotsIndex: true,
  robotsFollow: true,
  relatedInstitutions: [],
  relatedOpportunities: [],
  sanitizedContentHtml:
    "<p>Meaningful sanitized Article body with enough useful detail.</p>",
};

describe("WP-13 omission-first structured data", () => {
  it("maps exact Article/Breadcrumb fields and never emits internal author or invented /articles crumb", () => {
    const jsonLd = buildArticleJsonLd(article, "https://preppy.example");
    expect(jsonLd).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      mainEntityOfPage: "https://preppy.example/articles/complete-guide",
      datePublished: article.publishedAt,
      dateModified: article.updatedAt,
    });
    expect(jsonLd).not.toHaveProperty("author");
    const breadcrumb = buildArticleBreadcrumbJsonLd(
      article,
      "https://preppy.example",
    );
    expect(breadcrumb?.itemListElement).toHaveLength(2);
    expect(breadcrumb?.itemListElement.map((item) => item.item)).toEqual([
      "https://preppy.example/",
      "https://preppy.example/articles/complete-guide",
    ]);
  });

  it("omits uncertain Article structured data", () => {
    for (const incomplete of [
      { ...article, indexability: "NOINDEX" as const },
      { ...article, excerpt: null, seoDescription: null },
      { ...article, publishedAt: null },
      { ...article, slug: "Bad Slug" },
      { ...article, sanitizedContentHtml: "<p>thin</p>" },
    ])
      expect(
        buildArticleJsonLd(incomplete, "https://preppy.example"),
      ).toBeNull();
  });

  it("serializes JSON-LD without raw less-than characters", () => {
    const value = buildArticleJsonLd(article, "https://preppy.example");
    expect(value).not.toBeNull();
    const serialized = serializeJsonLd(value!);
    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003cguide>");
    expect(serialized).not.toContain(article.sanitizedContentHtml);
  });
});
