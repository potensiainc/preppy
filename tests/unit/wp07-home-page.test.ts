import { readFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { HomePageDTO } from "@/src/modules/public/dto";

import { HomePageView } from "@/app/_components/home-page";

const homePage: HomePageDTO = {
  categories: [
    {
      category: "ENGLISH_KINDERGARTEN",
      label: "English Kindergartens",
      href: "/institutions?category=ENGLISH_KINDERGARTEN",
    },
    {
      category: "PRIVATE_ELEMENTARY",
      label: "Private Elementary Schools",
      href: "/institutions?category=PRIVATE_ELEMENTARY",
    },
    {
      category: "INTERNATIONAL_SCHOOL",
      label: "International Schools",
      href: "/institutions?category=INTERNATIONAL_SCHOOL",
    },
  ],
  currentOpportunities: [
    {
      id: "opportunity-1",
      slug: "seoul-2027-admissions",
      title: "2027학년도 입학 전형",
      kind: "RECRUITMENT",
      businessState: "OPEN",
      keyDate: "2026-09-01T00:00:00.000Z",
      institution: {
        id: "institution-1",
        slug: "seoul-international-school",
        name: "서울국제학교",
        category: "INTERNATIONAL_SCHOOL",
        region: "서울",
        followable: true,
      },
      lastVerifiedAt: "2026-08-23T03:30:00.000Z",
      indexability: "INDEX",
    },
  ],
  featuredInstitutions: [
    {
      id: "institution-1",
      slug: "seoul-international-school",
      name: "서울국제학교",
      category: "INTERNATIONAL_SCHOOL",
      region: "서울",
      followable: true,
      currentAdmissionsState: "OPEN",
      currentOpportunity: {
        id: "opportunity-1",
        slug: "seoul-2027-admissions",
        title: "2027학년도 입학 전형",
        kind: "RECRUITMENT",
        state: "OPEN",
        keyDate: "2026-09-01T00:00:00.000Z",
      },
      lastVerifiedAt: "2026-08-23T03:30:00.000Z",
    },
  ],
  latestArticles: [
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
};

describe("WP-07 Home page", () => {
  it("separates mixed institutions into named groups while preserving admission facts and links", () => {
    const markup = renderToStaticMarkup(
      createElement(HomePageView, {
        data: {
          ...homePage,
          featuredInstitutions: [
            {
              ...homePage.featuredInstitutions[0],
              id: "primary",
              slug: "primary",
              name: "사립초 테스트",
              category: "PRIVATE_ELEMENTARY",
            },
            {
              ...homePage.featuredInstitutions[0],
              id: "ek",
              slug: "ek",
              name: "영유 테스트",
              category: "ENGLISH_KINDERGARTEN",
              region: "KR-11",
              district: "서초구",
            },
          ],
        },
      }),
    );
    const groups = [
      ...markup.matchAll(
        /<section[^>]*data-category="([^"]+)"[^>]*>(.*?)<\/section>/gs,
      ),
    ];
    expect(groups.map((group) => group[1])).toEqual([
      "ENGLISH_KINDERGARTEN",
      "PRIVATE_ELEMENTARY",
    ]);
    expect(groups[0][2]).toContain("영유 테스트");
    expect(groups[0][2]).not.toContain("사립초 테스트");
    expect(groups[1][2]).toContain("사립초 테스트");
    expect(groups[1][2]).not.toContain("영유 테스트");
    expect(groups[0][2]).toContain("서초구");
    expect(groups[0][2]).not.toContain("KR-11");
    expect(groups[0][2]).toContain("영어유치원 전체 보기");
    expect(groups[1][2]).toContain("사립초등학교 전체 보기");
    for (const group of groups) {
      expect(group[2]).toContain("2027학년도 입학 전형");
      expect(group[2]).toContain("2026-08-23T03:30:00.000Z");
      expect(group[2]).toContain('href="/opportunities/seoul-2027-admissions"');
      expect(group[2]).toContain("<h4>");
    }
    expect(markup).toContain('href="/#home-private-elementary"');
    expect(markup).not.toContain('id="home-international-schools"');
  });

  it("turns complete public Home data into a truthful acquisition page", () => {
    // Mutation caught: Home stops displaying query-backed discovery content, locked CTAs, or truthful monitoring value.
    const markup = renderToStaticMarkup(
      createElement(HomePageView, { data: homePage }),
    );

    expect(markup).toContain('id="home-title"');
    expect(markup).toContain("공식 출처");
    expect(markup).not.toMatch(/프레피가 알려드려요|놓치지 않도록/);
    expect(markup).toContain('href="/institutions"');
    expect(markup).toContain("기관 둘러보기");
    expect(markup).toContain('href="/#current-opportunities"');
    expect(markup).toContain("현재 모집·입학정보 보기");
    expect(markup).toContain(
      'href="/institutions?category=ENGLISH_KINDERGARTEN"',
    );
    expect(markup).toContain(
      'href="/institutions?category=PRIVATE_ELEMENTARY"',
    );
    expect(markup).toContain(
      'href="/institutions?category=INTERNATIONAL_SCHOOL"',
    );
    expect(markup).toContain("영어유치원");
    expect(markup).toContain("사립초등학교");
    expect(markup).toContain("국제학교");
    expect(markup).not.toContain("English Kindergartens");
    expect(markup).not.toContain("Private Elementary Schools");
    expect(markup).not.toContain("International Schools");
    expect(markup).toContain("2027학년도 입학 전형");
    expect(markup).toContain("서울국제학교");
    expect(markup).toContain("국제학교 방문 전 확인할 점");
    expect(markup).toContain("살펴볼 기관");
    expect(markup).toContain('aria-label="현재 모집·입학정보"');
    expect(markup).toContain('aria-label="살펴볼 기관"');
    expect(markup).toContain('aria-label="입학 준비 아티클"');
    expect(markup).toContain("관심기관을 등록하면 내 프레피에서");
    expect(markup).not.toContain("실시간");
    expect(markup).not.toMatch(/(?:1위|순위|랭킹|추천)/);
  });

  it("uses distinct empty states when a public Home section has no data", () => {
    // Mutation caught: an empty query section silently disappears or claims unavailable information exists.
    const markup = renderToStaticMarkup(
      createElement(HomePageView, {
        data: {
          ...homePage,
          currentOpportunities: [],
          featuredInstitutions: [],
          latestArticles: [],
        },
      }),
    );

    expect(markup).toContain("PREPPY에 공개된 모집·입학정보가 없어요");
    expect(markup).toContain("PREPPY에 공개된 기관 정보가 없어요");
    expect(markup).toContain("PREPPY에 공개된 아티클이 없어요");
  });

  it("keeps the Home route server-only and calls the canonical query directly", async () => {
    // Mutation caught: routing Home through REST, raw database access, or client-side data fetching.
    const source = await readFile(
      new URL("../../app/(public)/page.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain(
      'import { getHomePage } from "@/src/modules/public/home-query.server"',
    );
    expect(source).toContain(
      'import { getPublicExecutor } from "@/app/_lib/public-page.server"',
    );
    expect(source).toMatch(/await getHomePage\(getPublicExecutor\(\)\)/);
    expect(source).toContain("<HomePageView data={data} />");
    expect(source).toContain('export const dynamic = "force-dynamic"');
    expect(source).not.toContain('"use client"');
    expect(source).not.toMatch(/fetch\(|\/api\/|\.drizzle|\.raw/);
  });

  it("keeps the shared home wordmark compatible with the Home route", async () => {
    // Mutation caught: reintroducing an anchor navigation to the Home route and breaking the Next lint rule.
    const source = await readFile(
      new URL("../../app/_components/site-header.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('import Link from "next/link"');
    expect(source).toContain('<Link className="wordmark" href="/"');
    expect(source).not.toContain('<a className="wordmark" href="/"');
  });
});
