import { readFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  InstitutionDetailDTO,
  InstitutionListDTO,
} from "@/src/modules/public/dto";

import {
  InstitutionDetailView,
  InstitutionListView,
} from "@/app/_components/institution-pages";
import { toInstitutionListInput } from "@/app/_lib/institution-search";

const institution = {
  id: "institution-1",
  slug: "seoul-international-school",
  name: "서울국제학교",
  category: "INTERNATIONAL_SCHOOL" as const,
  region: "서울",
  followable: true,
  currentAdmissionsState: "OPEN" as const,
  currentOpportunity: {
    id: "opportunity-1",
    slug: "2027-admissions",
    title: "2027학년도 입학 전형",
    kind: "RECRUITMENT" as const,
    state: "OPEN" as const,
    keyDate: "2026-09-01T00:00:00.000Z",
  },
  lastVerifiedAt: "2026-08-23T03:30:00.000Z",
};

const opportunity = {
  id: "opportunity-1",
  slug: "2027-admissions",
  title: "2027학년도 입학 전형",
  kind: "RECRUITMENT" as const,
  businessState: "OPEN" as const,
  keyDate: "2026-09-01T00:00:00.000Z",
  institution: {
    id: institution.id,
    slug: institution.slug,
    name: institution.name,
    category: institution.category,
    region: institution.region,
    followable: institution.followable,
  },
  lastVerifiedAt: "2026-08-23T03:30:00.000Z",
  indexability: "INDEX" as const,
};

const list: InstitutionListDTO = {
  items: [institution],
  pagination: { page: 2, pageSize: 12, total: 36, hasNext: true },
};

const detail: InstitutionDetailDTO = {
  institution,
  currentOpportunities: [opportunity],
  upcomingOpportunities: [
    { ...opportunity, id: "opportunity-2", businessState: "UPCOMING" },
  ],
  recentOpportunities: [
    { ...opportunity, id: "opportunity-3", businessState: "CLOSED" },
  ],
  verifiedFacts: [
    {
      factType: "TUITION",
      value: { currency: "KRW" },
      displayValue: "연간 1,000만 원",
      verifiedAt: "2026-08-22T03:30:00.000Z",
      officialSource: {
        name: "학교 공식 입학처",
        url: "https://admissions.example.test/tuition",
        authorityLevel: "PRIMARY",
      },
    },
  ],
  officialSources: [
    {
      name: "학교 공식 홈페이지",
      url: "https://school.example.test",
      authorityLevel: "PRIMARY",
    },
  ],
  relatedArticles: [
    {
      id: "article-1",
      slug: "school-visit-guide",
      title: "국제학교 방문 전 확인할 점",
      excerpt: "방문 전 확인할 핵심 정보를 정리했습니다.",
      articleType: "GUIDE",
      category: "INTERNATIONAL_SCHOOL",
      publishedAt: "2026-08-23T03:30:00.000Z",
      featuredImageUrl: null,
      featuredImageAlt: null,
      indexability: "INDEX",
    },
  ],
  indexability: "INDEX",
};

describe("WP-07 Institution pages", () => {
  it("normalizes only scalar allowlisted GET filters and fixes public page size", () => {
    // Mutation caught: forwarding Next's array/unknown values, accepting invalid filters, or exposing a caller-controlled page size.
    const input = toInstitutionListInput({
      category: "INTERNATIONAL_SCHOOL",
      region: ["서울", "부산"],
      recruitmentState: "OPEN",
      query: "  Seoul   Academy  ",
      page: "2",
      pageSize: "50",
      untrusted: "discard me",
    });

    expect(input).toEqual({
      category: "INTERNATIONAL_SCHOOL",
      recruitmentState: "OPEN",
      query: "Seoul Academy",
      page: 2,
      pageSize: 12,
    });
    expect(
      toInstitutionListInput({ category: "not-a-category", page: "0" }),
    ).toEqual({
      page: 1,
      pageSize: 12,
    });
  });

  it("renders a semantic GET discovery form, query-preserving pagination, and an intentional empty state", () => {
    // Mutation caught: replacing URL navigation with client fetches, dropping filters between pages, or hiding an empty public list.
    const markup = renderToStaticMarkup(
      createElement(InstitutionListView, {
        data: list,
        filters: {
          category: "INTERNATIONAL_SCHOOL",
          region: "서울",
          recruitmentState: "OPEN",
          query: "Seoul Academy",
          page: 2,
          pageSize: 12,
        },
      }),
    );

    expect(markup).toMatch(
      /<form[^>]*action="\/institutions"[^>]*method="get"/,
    );
    expect(markup).toContain("기관 유형");
    expect(markup).toContain("지역");
    expect(markup).toContain("모집 상태");
    expect(markup).toContain("기관명 검색");
    expect(markup).toContain('name="query" value="Seoul Academy"');
    expect(markup).toContain('value="INTERNATIONAL_SCHOOL" selected=""');
    expect(markup).toContain('value="OPEN" selected=""');
    expect(markup).toContain('aria-label="공개 기관"');
    expect(markup).not.toContain('aria-labelledby="institution-list-title"');
    expect(markup).toContain(
      'href="/institutions?category=INTERNATIONAL_SCHOOL&amp;region=%EC%84%9C%EC%9A%B8&amp;recruitmentState=OPEN&amp;query=Seoul+Academy&amp;page=3"',
    );
    expect(markup).toContain("서울국제학교");
    expect(markup).toContain("모집 중");

    const emptyMarkup = renderToStaticMarkup(
      createElement(InstitutionListView, {
        data: {
          ...list,
          items: [],
          pagination: { ...list.pagination, total: 0, hasNext: false },
        },
        filters: { page: 1, pageSize: 12 },
      }),
    );
    expect(emptyMarkup).toContain("표시할 기관이 없습니다.");
  });

  it("renders only DTO-backed institution hero, grouped records, fact-level trust, sources, articles, and the local Follow CTA", () => {
    // Mutation caught: inventing page-wide freshness, flattening opportunity sections, losing fact provenance, or claiming persisted Follow behavior.
    const markup = renderToStaticMarkup(
      createElement(InstitutionDetailView, { data: detail }),
    );

    expect(markup).toContain("서울국제학교");
    expect(markup).toContain("국제학교");
    expect(markup).toContain("서울");
    expect(markup).toContain("현재 모집·입학정보");
    expect(markup).toContain("예정된 모집·입학정보");
    expect(markup).toContain("최근 모집·입학정보");
    expect(markup).toContain("교육비");
    expect(markup).toContain("연간 1,000만 원");
    expect(markup).toContain("2026년 8월 22일");
    expect(markup).toContain("학교 공식 입학처");
    expect(markup).toContain("학교 공식 홈페이지");
    expect(markup).toContain("국제학교 방문 전 확인할 점");
    expect(markup).toContain('href="/articles/school-visit-guide"');
    expect(markup).toContain("관심기관 상태 확인 중");
    expect(markup).toContain(
      "현재 관심기관 상태를 안전하게 확인하고 있습니다.",
    );
    expect(markup).not.toContain("Last Verified");
    expect(markup).not.toContain("페이지 최종 확인");
  });

  it("omits empty secondary opportunity groups and consolidates source provenance", () => {
    const markup = renderToStaticMarkup(
      createElement(InstitutionDetailView, {
        data: {
          ...detail,
          upcomingOpportunities: [],
          recentOpportunities: [],
          officialSources: [
            detail.verifiedFacts[0]!.officialSource!,
            ...detail.officialSources,
          ],
        },
      }),
    );

    expect(markup).toContain("현재 모집·입학정보");
    expect(markup).not.toContain("예정된 모집·입학정보");
    expect(markup).not.toContain("최근 모집·입학정보");
    expect(markup.match(/학교 공식 입학처/g)).toHaveLength(1);
    expect(markup).toContain("학교 공식 홈페이지");
  });

  it("wires async Next route values directly to canonical server queries and uses Link for live internal routes", async () => {
    // Mutation caught: raw database/REST/client fetching, bypassing canonical not-found mapping, or retaining anchors for known internal routes.
    const [listRoute, detailRoute, cards, primitives] = await Promise.all([
      readFile(
        new URL("../../app/(public)/institutions/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../../app/(public)/institutions/[slug]/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../../app/_components/public-cards.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../../app/_components/ui-primitives.tsx", import.meta.url),
        "utf8",
      ),
    ]);

    expect(listRoute).toContain(
      'import { listInstitutions } from "@/src/modules/public/institution-query.server"',
    );
    expect(listRoute).toMatch(
      /await listInstitutions\(getPublicExecutor\(\), input\)/,
    );
    expect(listRoute).toContain('export const dynamic = "force-dynamic"');
    expect(detailRoute).toContain(
      'import { getInstitutionBySlug } from "@/src/modules/public/institution-query.server"',
    );
    expect(detailRoute).toMatch(
      /await loadPublicPage\(\(\) =>\s*getInstitutionBySlug\(getPublicExecutor\(\), slug\),?\s*\)/,
    );
    expect(detailRoute).toMatch(/params: Promise/);
    for (const source of [listRoute, detailRoute]) {
      expect(source).not.toContain('"use client"');
      expect(source).not.toMatch(/fetch\(|\/api\/|\.drizzle|\.raw/);
    }
    expect(cards).toContain('import Link from "next/link"');
    expect(primitives).toContain('import Link from "next/link"');
  });
});
