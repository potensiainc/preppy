import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArticleProse } from "@/app/_components/article-prose";
import { AdminArticleListView } from "@/app/admin/(protected)/articles/page";
import { AdminArticlePreviewView } from "@/app/admin/(protected)/articles/[articleId]/preview/page";
import type { AdminArticleDetailDTO } from "@/src/modules/admin/read-model/contracts";

const article: AdminArticleDetailDTO = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  slug: "safe-guide",
  title: "Safe guide",
  type: "GUIDE",
  category: "ADMISSIONS_GENERAL",
  status: "DRAFT",
  publishedAt: null,
  institutionRelationCount: 0,
  opportunityRelationCount: 0,
  excerpt: "요약",
  sanitizedContentHtml: "<p>Sanitized body</p>",
  seoTitle: null,
  seoDescription: null,
  canonicalUrl: null,
  robotsIndex: false,
  robotsFollow: true,
  featuredImageUrl: null,
  featuredImageAlt: null,
  institutionIds: [],
  opportunityIds: [],
  updatedAt: "2026-08-25T07:00:00.000Z",
};

describe("WP-13 Admin Article pages", () => {
  it("links list titles to protected detail and exposes an explicit new-Article action", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminArticleListView, {
        data: {
          items: [article],
          pagination: { page: 1, pageSize: 20, total: 1, hasNext: false },
        },
      }),
    );
    expect(markup).toContain(`/admin/articles/${article.id}`);
    expect(markup).toContain("/admin/articles/new");
  });

  it("renders only sanitizedContentHtml in detail and preview through ArticleProse", () => {
    const prose = renderToStaticMarkup(
      createElement(ArticleProse, {
        sanitizedContentHtml: article.sanitizedContentHtml,
      }),
    );
    const preview = renderToStaticMarkup(
      createElement(AdminArticlePreviewView, { data: article }),
    );
    for (const markup of [prose, preview]) {
      expect(markup).toContain("Sanitized body");
      expect(markup).not.toMatch(/onclick|javascript:|<script/i);
    }
    expect(preview).toContain("미리보기");
  });
});
