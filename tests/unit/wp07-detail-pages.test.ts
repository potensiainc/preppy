import { readFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  PublicArticleDTO,
  PublicOpportunityDTO,
} from "@/src/modules/public/dto";
import type { UnsafeStoredArticleDetailDTO } from "@/src/modules/public/article-detail.server";

import {
  ArticleDetailView,
  OpportunityDetailView,
} from "@/app/_components/opportunity-article-pages";
import { toPublicArticleDTO } from "@/app/_lib/public-article";

const relatedArticle = {
  id: "article-related-1",
  slug: "admissions-visit-checklist",
  title: "입학설명회 전 확인할 체크리스트",
  excerpt: "방문 전에 확인할 내용을 정리했습니다.",
  articleType: "GUIDE" as const,
  category: "ADMISSIONS_GENERAL" as const,
  publishedAt: "2026-08-20T03:30:00.000Z",
  featuredImageUrl: null,
  featuredImageAlt: null,
  indexability: "INDEX" as const,
};

const opportunity: PublicOpportunityDTO = {
  id: "opportunity-1",
  slug: "2027-seoul-international-admissions",
  title: "2027학년도 신입생 모집",
  kind: "RECRUITMENT",
  businessState: "OPEN",
  keyDate: "2026-10-30T09:00:00.000Z",
  keyDates: {
    eventStartsAt: "2026-09-15T10:00:00.000Z",
    eventEndsAt: "2026-09-16T12:00:00.000Z",
    applicationOpensAt: "2026-09-01T09:00:00.000Z",
    applicationClosesAt: "2026-10-30T09:00:00.000Z",
  },
  institution: {
    id: "institution-1",
    slug: "seoul-international-school",
    name: "서울국제학교",
    category: "INTERNATIONAL_SCHOOL",
    region: "서울",
    followable: true,
  },
  targetAudience: "2027학년도 초등 입학을 준비하는 가정",
  summary: "공식 모집 안내를 바탕으로 주요 일정을 정리했습니다.",
  actionUrl: "https://apply.example.test/2027",
  officialSource: {
    name: "서울국제학교 입학처",
    url: "https://admissions.example.test/2027",
    authorityLevel: "PRIMARY",
  },
  lastVerifiedAt: "2026-08-23T03:30:00.000Z",
  recentMeaningfulChanges: [
    {
      occurredAt: "2026-08-22T03:30:00.000Z",
      summary: "원서 접수 마감 시간이 반영되었습니다.",
    },
  ],
  relatedArticles: [relatedArticle],
  indexability: "INDEX",
};

const unsafeSentinel = "UNSAFE_ARTICLE_BODY_SENTINEL_9fa3";
const unsafeArticle: UnsafeStoredArticleDetailDTO = {
  id: "article-1",
  slug: "international-school-admissions-guide",
  title: "국제학교 입학 준비 가이드",
  excerpt: "지원 전 확인할 공개 정보를 정리했습니다.",
  articleType: "GUIDE",
  category: "INTERNATIONAL_SCHOOL",
  publishedAt: "2026-08-21T03:30:00.000Z",
  featuredImageUrl: "https://images.example.test/guide.jpg",
  featuredImageAlt: "국제학교 입학 준비 자료",
  indexability: "NOINDEX",
  updatedAt: "2026-08-22T03:30:00.000Z",
  seoTitle: "국제학교 입학 준비 가이드",
  seoDescription: "국제학교 입학을 준비하는 가정을 위한 안내입니다.",
  canonicalUrl:
    "https://preppy.example.test/articles/international-school-admissions-guide",
  robotsIndex: false,
  robotsFollow: true,
  authorDisplayName: "PREPPY 편집팀",
  relatedInstitutions: [
    {
      id: "institution-1",
      slug: "seoul-international-school",
      name: "서울국제학교",
      category: "INTERNATIONAL_SCHOOL",
      region: "서울",
      followable: true,
      currentAdmissionsState: "OPEN",
      currentOpportunity: {
        id: opportunity.id,
        slug: opportunity.slug,
        title: opportunity.title,
        kind: opportunity.kind,
        state: opportunity.businessState,
        keyDate: opportunity.keyDate,
      },
      lastVerifiedAt: opportunity.lastVerifiedAt,
    },
  ],
  relatedOpportunities: [opportunity],
  unsafeStoredContentHtml: `<p>${unsafeSentinel}</p><script>alert("unsafe")</script>`,
};

describe("WP-07 Opportunity and Article detail pages", () => {
  it("renders every supported opportunity-detail value with truthful freshness and safe official links", () => {
    // Mutation caught: dropping public dates, using updatedAt as verification, or weakening external-link safety.
    const markup = renderToStaticMarkup(
      createElement(OpportunityDetailView, { opportunity }),
    );

    expect(markup).toContain("서울국제학교");
    expect(markup).toContain("2027학년도 신입생 모집");
    expect(markup).toContain("모집 중");
    expect(markup).toContain("모집");
    expect(markup).toContain("2026년 9월 15일");
    expect(markup).toContain("2026년 9월 16일");
    expect(markup).toContain("2026년 9월 1일");
    expect(markup).toContain("2026년 10월 30일");
    expect(markup).toContain("2027학년도 초등 입학을 준비하는 가정");
    expect(markup).toContain(
      "공식 모집 안내를 바탕으로 주요 일정을 정리했습니다.",
    );
    expect(markup).toContain("Last Verified");
    expect(markup).toContain("2026년 8월 23일");
    expect(markup).toContain("지원 페이지 확인");
    expect(markup).toContain('href="https://apply.example.test/2027"');
    expect(markup).toContain("공식 안내 확인");
    expect(markup).toContain('href="https://admissions.example.test/2027"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("최근 변경 사항");
    expect(markup).toContain("원서 접수 마감 시간이 반영되었습니다.");
    expect(markup).toContain("입학설명회 전 확인할 체크리스트");
    expect(markup).toContain('href="/articles/admissions-visit-checklist"');
    expect(markup).toContain("관심기관 상태 확인 중");
    expect(markup).toContain(
      "현재 관심기관 상태를 안전하게 확인하고 있습니다.",
    );
    expect(markup).not.toContain("INDEX");
  });

  it("projects the route-level stored Article fixture to a safe view DTO and renders no stored HTML", () => {
    // Mutation caught: forwarding unsafeStoredContentHtml, rendering raw HTML/text, or surfacing indexability/updated-at badges.
    const article = toPublicArticleDTO(unsafeArticle);
    const markup = renderToStaticMarkup(
      createElement(ArticleDetailView, { article }),
    );

    expectTypeOf<typeof article>().toEqualTypeOf<PublicArticleDTO>();
    expectTypeOf<Parameters<typeof ArticleDetailView>[0]>().not.toHaveProperty(
      "unsafeStoredContentHtml",
    );
    expect(article).not.toHaveProperty("unsafeStoredContentHtml");
    expect(markup).toContain("국제학교 입학 준비 가이드");
    expect(markup).toContain("지원 전 확인할 공개 정보를 정리했습니다.");
    expect(markup).toContain("가이드");
    expect(markup).toContain("국제학교");
    expect(markup).toContain("2026년 8월 21일");
    expect(markup).toContain("PREPPY 편집팀");
    expect(markup).toContain("이 아티클의 본문은 현재 공개 준비 중입니다.");
    expect(markup).toContain("서울국제학교");
    expect(markup).toContain("2027학년도 신입생 모집");
    expect(markup).toContain('href="/institutions/seoul-international-school"');
    expect(markup).toContain(
      'href="/opportunities/2027-seoul-international-admissions"',
    );
    expect(markup).toContain("관심기관 상태 확인 중");
    expect(markup).not.toContain(unsafeSentinel);
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain('alert("unsafe")');
    expect(markup).not.toContain("NOINDEX");
    expect(markup).not.toContain("2026년 8월 22일");
  });

  it("omits opportunity fields that the DTO does not provide", () => {
    // Mutation caught: fabricating freshness from a nullable value or rendering absent sections as empty claims.
    const markup = renderToStaticMarkup(
      createElement(OpportunityDetailView, {
        opportunity: {
          ...opportunity,
          lastVerifiedAt: null,
          targetAudience: null,
          summary: null,
          actionUrl: null,
          officialSource: null,
          recentMeaningfulChanges: [],
        },
      }),
    );

    expect(markup).not.toContain("Last Verified");
    expect(markup).not.toContain("모집 안내");
    expect(markup).not.toContain("공식 안내");
    expect(markup).not.toContain("최근 변경 사항");
  });

  it("omits unsafe opportunity action and official destinations while retaining source identity", () => {
    // Mutation caught: rendering data, script, mail, relative, or malformed destinations behind trusted labels.
    const markup = renderToStaticMarkup(
      createElement(OpportunityDetailView, {
        opportunity: {
          ...opportunity,
          actionUrl: "data:text/html,unsafe-action",
          officialSource: {
            ...opportunity.officialSource!,
            name: "검증할 수 없는 공식 출처",
            url: "javascript:alert(1)",
          },
        },
      }),
    );

    expect(markup).toContain("검증할 수 없는 공식 출처");
    expect(markup).not.toContain("지원 페이지 확인");
    expect(markup).not.toContain('href="data:text/html,unsafe-action"');
    expect(markup).not.toContain('href="javascript:alert(1)"');
  });

  it("uses async canonical Server Component routes and keeps unsafe Article HTML out of the view module", async () => {
    // Mutation caught: raw DB/REST/client access, bypassing canonical not-found handling, or reading unsafe HTML in the renderer.
    const [opportunityRoute, articleRoute, viewSource] = await Promise.all([
      readFile(
        new URL(
          "../../app/(public)/opportunities/[slug]/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../../app/(public)/articles/[slug]/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../app/_components/opportunity-article-pages.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

    expect(opportunityRoute).toContain(
      'import { getOpportunityBySlug } from "@/src/modules/public/opportunity-query.server"',
    );
    expect(opportunityRoute).toMatch(
      /await loadPublicPage\(\(\) =>\s*getOpportunityBySlug\(getPublicExecutor\(\), slug\),?\s*\)/,
    );
    expect(articleRoute).toContain(
      'import { getArticleBySlug } from "@/src/modules/public/article-query.server"',
    );
    expect(articleRoute).toContain("toPublicArticleDTO");
    expect(articleRoute).toMatch(
      /await loadPublicPage\(\(\) =>\s*getArticleBySlug\(getPublicExecutor\(\), slug\),?\s*\)/,
    );
    for (const source of [opportunityRoute, articleRoute]) {
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).toMatch(/params: Promise/);
      expect(source).not.toContain('"use client"');
      expect(source).not.toMatch(/fetch\(|\/api\/|\.drizzle|\.raw/);
    }
    expect(viewSource).not.toContain("unsafeStoredContentHtml");
    expect(viewSource).not.toContain("dangerouslySetInnerHTML");
  });
});
