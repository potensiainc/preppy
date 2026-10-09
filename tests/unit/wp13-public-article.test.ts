import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ArticleDetailView } from "@/app/_components/opportunity-article-pages";
import { toPublicArticleDTO } from "@/app/_lib/public-article";
import type { UnsafeStoredArticleDetailDTO } from "@/src/modules/public/article-detail.server";
import {
  alignArticleAdmissions,
  explicitAcademicYear,
} from "@/src/modules/public/article-academic-year";
import type { OpportunityCardDTO } from "@/src/modules/public/dto";
import { load } from "cheerio";

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
  it("supplements only matching institution/year/kind and retains historical editorial links", () => {
    const base: OpportunityCardDTO = {
      id: "old",
      slug: "old",
      title: "2026학년도 모집",
      kind: "RECRUITMENT",
      businessState: "CLOSED",
      keyDate: null,
      lastVerifiedAt: null,
      indexability: "NOINDEX",
      institution: {
        id: "school",
        slug: "school",
        name: "학교",
        category: "PRIVATE_ELEMENTARY",
        region: null,
        followable: false,
      },
    };
    const next = { ...base, id: "new", slug: "new", title: "2027학년도 모집" };
    const result = alignArticleAdmissions(
      [],
      [base],
      [
        next,
        next,
        { ...next, id: "wrong-year", title: "2028학년도 모집" },
        { ...next, id: "wrong-kind", kind: "INFORMATION_SESSION" },
        {
          ...next,
          id: "wrong-school",
          institution: { ...next.institution, id: "other" },
        },
      ],
      2027,
    );
    expect(result.relatedOpportunities.map((item) => item.id)).toEqual([
      "old",
      "new",
    ]);
    const institution = {
      ...base.institution,
      district: null,
      currentAdmissionsState: base.businessState,
      lastVerifiedAt: null,
      currentOpportunity: {
        id: base.id,
        slug: base.slug,
        title: base.title,
        kind: base.kind,
        state: base.businessState,
        keyDate: null,
      },
    };
    expect(
      alignArticleAdmissions([institution], [], [next], 2027)
        .relatedInstitutions[0]!.currentOpportunity!.id,
    ).toBe("new");
    expect(institution.currentOpportunity.id).toBe("old");
  });
  it("separates older admissions without removing links or guessing the year from dates", () => {
    const article = toPublicArticleDTO(unsafe, "https://preppy.example");
    article.title = "2027학년도 입학 안내";
    article.relatedOpportunities = [
      "2026학년도 모집",
      "2027학년도 설명회",
      "2026년 10월 설명회",
    ].map((title, index) => ({
      id: String(index),
      slug: `admission-${index}`,
      title,
      kind: "RECRUITMENT",
      businessState: "CLOSED",
      keyDate: null,
      institution: {
        id: "school",
        slug: "school",
        name: "학교",
        category: "PRIVATE_ELEMENTARY",
        region: null,
        followable: false,
      },
      lastVerifiedAt: null,
      indexability: "NOINDEX",
    }));
    const $ = load(
      renderToStaticMarkup(createElement(ArticleDetailView, { article })),
    );
    expect($('[aria-label="이전 학년도 자료"]').text()).toContain(
      "2026학년도 모집",
    );
    expect($('[aria-label="관련 모집·입학정보"]').text()).not.toContain(
      "2026학년도 모집",
    );
    expect($('[aria-label="관련 모집·입학정보"]').text()).toContain(
      "2026년 10월 설명회",
    );
    expect($('a[href="/opportunities/admission-0"]')).toHaveLength(1);
    expect($('a[href="/opportunities/admission-1"]')).toHaveLength(1);
  });
  it("does not infer academic years from publication dates or ambiguous comparisons", () => {
    expect(explicitAcademicYear("2026년 10월 안내")).toBeNull();
    expect(explicitAcademicYear("2026학년도와 2027학년도 비교")).toBeNull();
    expect(explicitAcademicYear("2027학년도 입학 · 2027학년도 설명회")).toBe(
      2027,
    );
  });
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
