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

  it("moves the repeated review line below the article while preserving dates, source and application conditions", () => {
    const article = toPublicArticleDTO(
      {
        ...unsafe,
        unsafeStoredContentHtml:
          "<p>2027학년도 서울 사립초 5곳의 설명회 날짜를 모았어요. 설명회 신청과 입학원서 접수는 별개예요.</p>" +
          "<p>자료 수집: 2026년 10월 4일 · 내용 확인: 2026년 10월 4일(한국 시간). 신청 상태는 확인한 시점의 정보예요. 정원과 취소석에 따라 달라질 수 있으니 신청 전 학교 안내를 다시 확인해 주세요.</p>" +
          "<h2>설명회 일정</h2><p>10월 8일 오후 4시까지 신청해야 해요. 취소석은 학교에 확인해 주세요.</p>" +
          '<h2>출처</h2><p><a href="https://school.example/notice">학교 공식 안내</a></p>',
      },
      "https://preppy.example",
    );
    const markup = renderToStaticMarkup(
      createElement(ArticleDetailView, { article }),
    );

    expect(markup).not.toContain("신청 상태는 확인한 시점의 정보예요");
    expect(markup).not.toContain("정원과 취소석에 따라 달라질 수 있으니");
    expect(markup).toContain("2027학년도 서울 사립초 5곳");
    expect(markup).toContain("10월 8일 오후 4시까지 신청해야 해요");
    expect(markup).toContain("취소석은 학교에 확인해 주세요");
    expect(markup).toContain('href="https://school.example/notice"');
    expect(markup.indexOf("학교 공식 안내")).toBeLessThan(
      markup.indexOf("자료 수집"),
    );
    expect(markup).toContain("2026년 10월 4일");
    expect(markup).toContain("2026년 10월 4일(한국 시간)");
  });

  it("keeps unrecognized or mixed review paragraphs unchanged", () => {
    const article = toPublicArticleDTO(
      {
        ...unsafe,
        unsafeStoredContentHtml:
          "<p>자료 수집: 2026년 10월 4일 · 내용 확인: 2026년 10월 4일(한국 시간). 신청 정원은 20명이에요.</p>" +
          "<p>원본 서류만 제출해야 해요. PDF 안내에서 자격을 확인해 주세요.</p>" +
          '<p>자료 수집: 2026년 10월 4일 · 내용 확인: 2026년 10월 4일(한국 시간). <a href="https://school.example/notice">학교 안내</a>에서 접수 마감을 확인해 주세요.</p>',
      },
      "https://preppy.example",
    );
    const markup = renderToStaticMarkup(
      createElement(ArticleDetailView, { article }),
    );

    expect(markup).toContain("신청 정원은 20명이에요");
    expect(markup).toContain("원본 서류만 제출해야 해요");
    expect(markup).toContain("PDF 안내에서 자격을 확인해 주세요");
    expect(markup).toContain("학교 안내");
    expect(markup).toContain("접수 마감을 확인해 주세요");
  });
});
