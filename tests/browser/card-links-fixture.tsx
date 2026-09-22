/** Local-only, real React cards and production CSS; no database or public writes. */
/* eslint-disable @next/next/no-head-element -- Standalone SSR fixture, not a Next.js page. */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePageView } from "@/app/_components/home-page";
import { InstitutionCard } from "@/app/_components/public-cards";
import type { HomePageDTO } from "@/src/modules/public/dto";

const data: HomePageDTO = {
  categories: [],
  featuredInstitutions: [
    {
      id: "ek",
      slug: "test-english",
      name: "테스트 영어유치원",
      category: "ENGLISH_KINDERGARTEN",
      region: "KR-11",
      district: "강남구",
      followable: true,
      currentAdmissionsState: null,
    },
    {
      id: "primary",
      slug: "test-primary",
      name: "테스트 초등학교",
      category: "PRIVATE_ELEMENTARY",
      region: "서울",
      district: "서초구",
      followable: true,
      currentAdmissionsState: "UPCOMING",
      currentOpportunity: {
        id: "admission",
        slug: "test-admission",
        title: "2027학년도 신입생 모집 안내(예정)",
        kind: "RECRUITMENT",
        state: "UPCOMING",
        keyDate: "2026-10-21T00:00:00.000Z",
      },
      lastVerifiedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  currentOpportunities: [
    {
      id: "admission",
      slug: "test-admission",
      title: "2027학년도 테스트 초등학교 신입생 모집 안내(예정)",
      kind: "RECRUITMENT",
      businessState: "UPCOMING",
      keyDate: "2026-10-21T00:00:00.000Z",
      institution: {
        id: "primary",
        slug: "test-primary",
        name: "테스트 초등학교",
        category: "PRIVATE_ELEMENTARY",
        region: "서울",
        followable: true,
      },
      lastVerifiedAt: "2026-09-01T00:00:00.000Z",
      indexability: "INDEX",
    },
  ],
  latestArticles: [],
};
const destinations: Record<string, string> = {
  "/institutions/test-english": "테스트 영어유치원",
  "/institutions/test-primary": "테스트 초등학교",
  "/opportunities/test-admission":
    "2027학년도 테스트 초등학교 신입생 모집 안내(예정)",
};
createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1:3317").pathname;
  const content =
    path === "/" ? (
      <>
        <HomePageView data={data} />
        <section className="fixture-analytics page-container">
          <InstitutionCard
            institution={data.featuredInstitutions[1]}
            analyticsEvent={{
              name: "article_to_institution",
              properties: {
                articleId: "test-article",
                institutionId: "primary",
              },
            }}
          />
        </section>
      </>
    ) : (
      <h1>{destinations[path] ?? "테스트 대상 외 경로"}</h1>
    );
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(
    "<!doctype html>" +
      renderToStaticMarkup(
        <html lang="ko">
          <head>
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
            <style>{readFileSync("app/globals.css", "utf8")}</style>
          </head>
          <body>{content}</body>
        </html>,
      ),
  );
}).listen(3317, "127.0.0.1", () =>
  console.log("Card link fixture: http://127.0.0.1:3317"),
);
