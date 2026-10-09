import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArticleDetailView } from "@/app/_components/opportunity-article-pages";
import { toPublicArticleDTO } from "@/app/_lib/public-article";
import type { UnsafeStoredArticleDetailDTO } from "@/src/modules/public/article-detail.server";

const unsafe: UnsafeStoredArticleDetailDTO = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  slug: "safe-article",
  title: "Safe Article",
  excerpt: "Summary",
  articleType: "GUIDE",
  category: "ADMISSIONS_GENERAL",
  publishedAt: "2026-08-25T00:00:00.000Z",
  featuredImageUrl: null,
  featuredImageAlt: null,
  indexability: "NOINDEX",
  updatedAt: "2026-08-25T01:00:00.000Z",
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  robotsIndex: false,
  robotsFollow: true,
  relatedInstitutions: [],
  relatedOpportunities: [],
  unsafeStoredContentHtml:
    '<h2>Allowed</h2><p onclick="bad()">Body <a href="javascript:bad()">link</a></p><iframe src="https://evil.example"></iframe><svg><script>bad()</script></svg>',
};

describe("WP-13 public Article boundary", () => {
  it("converts the server-only unsafe projection to exactly one sanitized body field", () => {
    const article = toPublicArticleDTO(unsafe, "https://preppy.example");
    expect(article.sanitizedContentHtml).toBe(
      "<h2>Allowed</h2><p>Body link</p>",
    );
    expect(Object.hasOwn(article, "unsafeStoredContentHtml")).toBe(false);
    expect(Object.hasOwn(article, "contentHtml")).toBe(false);
    expect(Object.hasOwn(article, "authorDisplayName")).toBe(false);
    expect(Object.hasOwn(article, "authorAdminId")).toBe(false);
  });

  it("renders allowed prose and no unsafe element/attribute/scheme or public author", () => {
    const markup = renderToStaticMarkup(
      createElement(ArticleDetailView, {
        article: toPublicArticleDTO(unsafe, "https://preppy.example"),
      }),
    );
    expect(markup).toContain("Allowed");
    expect(markup).toContain("Body link");
    expect(markup).not.toMatch(
      /onclick|javascript:|iframe|svg|math|<script|author/i,
    );
    expect(markup).not.toContain("공개 준비 중");
  });
});
