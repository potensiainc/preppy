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
  it("keeps the recovered curation home while handling mixed institution data", () => {
    const markup = renderToStaticMarkup(
      createElement(HomePageView, {
        data: {
          ...homePage,
          featuredInstitutions: [
            { ...homePage.featuredInstitutions[0], id: "primary", slug: "primary", category: "PRIVATE_ELEMENTARY" },
            { ...homePage.featuredInstitutions[0], id: "ek", slug: "ek", category: "ENGLISH_KINDERGARTEN" },
          ],
        },
      }),
    );
    expect(markup).toContain('id="home-title"');
    expect(markup).toContain("PREPPY CURATION");
    expect(markup).toContain('href="/institutions?category=PRIVATE_ELEMENTARY"');
    expect(markup).toContain('href="/institutions?category=ENGLISH_KINDERGARTEN"');
    expect(markup).not.toContain('href="/institutions/primary"');
    expect(markup).not.toContain('href="/institutions/ek"');
  });

  it("renders source-backed admissions and articles in the recovered layout", () => {
    const markup = renderToStaticMarkup(createElement(HomePageView, { data: homePage }));
    expect(markup).toContain('id="home-title"');
    expect(markup).toContain('href="/institutions?category=INTERNATIONAL_SCHOOL"');
    expect(markup).toContain('href="/curation/briefings"');
    expect(markup).toContain('href="/curation/guides"');
    expect(markup).toContain('href="/opportunities/seoul-2027-admissions"');
    expect(markup).toContain('dateTime="2026-09-01T00:00:00.000Z"');
    expect(markup).toContain('href="/articles/school-visit-guide"');
    expect(markup).not.toContain("English Kindergartens");
    expect(markup).not.toContain("Private Elementary Schools");
  });

  it("uses a truthful empty admissions state and omits absent articles", () => {
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
    expect(markup).toContain("현재 PREPPY에 공개된 모집·입학 일정이 없어요");
    expect(markup).not.toContain('href="/opportunities/seoul-2027-admissions"');
    expect(markup).not.toContain('href="/articles/school-visit-guide"');
    expect(markup).toContain('href="/institutions?category=PRIVATE_ELEMENTARY"');
  });

  it("keeps the Home route server-only and calls the canonical query directly", async () => {
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

  it("keeps the shared home brand compatible with the Home route", async () => {
    const source = await readFile(
      new URL("../../app/_components/site-header.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('import Link from "next/link"');
    expect(source).toContain('<Link className={styles.brand} href="/"');
    expect(source).not.toContain('<a className="wordmark" href="/"');
  });
});
