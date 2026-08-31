import { readFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
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
import { isProvisionalAdmissionGuidance } from "@/src/modules/live-admissions/guidance";

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

type FullGuidesAdmission = {
  key: string;
  title: string;
  summary: string | null;
  kind: PublicOpportunityDTO["kind"];
  businessState: PublicOpportunityDTO["businessState"];
  targetAudience: string | null;
  applicationOpenAt: string | null;
  applicationCloseAt: string | null;
  eventStartAt: string | null;
  eventEndAt: string | null;
  actionUrl: string | null;
};

type FullGuidesBundle = {
  schools: {
    target: { slug: string };
    admissions: FullGuidesAdmission[];
  }[];
};

const canonicalProvisionalPrefix = "예정 안내 · 변경 가능:";

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
  lastCollectedAt: "2026-08-22T02:30:00.000Z",
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
  it("renders the exact stored provisional notice once even when it is also attached to the parent guide", () => {
    const notice =
      "예정 안내 · 변경 가능: 공식 원문이 예정 또는 초안임을 명시합니다. 지원 전 최종 공지를 확인해 주세요.";
    const $ = load(
      renderToStaticMarkup(
        createElement(OpportunityDetailView, {
          opportunity: {
            ...opportunity,
            summary: `${notice}\n\n[일정]\n공식 일정 안내.`,
            admissionGuide: {
              title: "2027학년도 모집요강(안)",
              slug: "parent",
              summary: `${notice}\n\n[추가 안내]\n학교별 예외.`,
              officialSources: [],
              lastCollectedAt: null,
              lastVerifiedAt: "2026-08-30T23:51:03.205Z",
            },
          },
        }),
      ),
    );
    expect($("body").text().split("예정 안내 · 변경 가능:").length - 1).toBe(1);
    expect($("header").text()).toContain(notice);
    expect($("body").text()).toContain("학교별 예외.");
  });

  it("does not invent midnight, KST for zone-less local dates, quota, tuition or region", () => {
    for (const [value, expected, absent] of [
      ["2026-10-31", "2026년 10월 31일", "오전"],
      ["2026-10-31T14:15", "오후 2:15 · 원문 현지 시각", "KST"],
    ]) {
      const $ = load(
        renderToStaticMarkup(
          createElement(OpportunityDetailView, {
            opportunity: {
              ...opportunity,
              kind: "INFORMATION_SESSION",
              summary: null,
              targetAudience: null,
              institution: { ...opportunity.institution, region: null },
              keyDates: {
                eventStartsAt: null,
                eventEndsAt: value!,
                applicationOpensAt: null,
                applicationClosesAt: null,
              },
            },
          }),
        ),
      );
      expect($("header").text()).toContain(expected);
      expect($("header").text()).not.toContain(absent);
      expect($("header").text()).not.toMatch(
        /84명|수업료|기관 소재 지역|00:00/,
      );
      expect($("header").text()).toContain("시작 일정 미확인");
    }
  });

  it("puts canonical event time first and navigates real same-cycle sessions without inventing an end", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(OpportunityDetailView, {
          opportunity: {
            ...opportunity,
            academicYearLabel: "2027학년도",
            kind: "INFORMATION_SESSION",
            keyDates: {
              eventStartsAt: "2026-10-31T05:00:00.000Z",
              eventEndsAt: null,
              applicationOpensAt: "2026-10-01",
              applicationClosesAt: null,
            },
            relatedAdmissions: [
              {
                slug: "morning-session",
                title: "설명회 1",
                kind: "INFORMATION_SESSION",
                businessState: "UPCOMING",
                keyDates: {
                  eventStartsAt: "2026-10-31T01:00:00.000Z",
                  eventEndsAt: null,
                  applicationOpensAt: null,
                  applicationClosesAt: null,
                },
              },
              {
                slug: opportunity.slug,
                title: "설명회 2",
                kind: "INFORMATION_SESSION",
                businessState: "UPCOMING",
                keyDates: {
                  eventStartsAt: "2026-10-31T05:00:00.000Z",
                  eventEndsAt: null,
                  applicationOpensAt: null,
                  applicationClosesAt: null,
                },
              },
            ],
          },
        }),
      ),
    );
    expect($("header [aria-label='주요 일정']").text()).toContain("오후 2:00");
    expect($("header").text()).toContain("2027학년도");
    expect(
      $(
        "[aria-label='같은 학년도 일정'] a[href='/opportunities/morning-session']",
      ).text(),
    ).toContain("오전 10:00");
    expect($("[aria-current='page']").text()).toContain("오후 2:00");
    expect($("header").text()).toContain("종료 일정 미확인");
    expect($("body").text()).not.toContain("2026년 10월 1일 00:00");
  });

  it("preserves every paragraph and unknown heading, exposing caveats and distinct source times without collapsed warnings", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(OpportunityDetailView, {
          opportunity: {
            ...opportunity,
            summary:
              "서문입니다.\n\n[서류·추첨·등록]\n첫 문단: 원서와 증빙.\n\n둘째 문단: 중복등록 시 모두 취소.\n[학교별 추가 조건]\n쌍둥이 예외와 예비당첨.\n\n[원문 확인 필요]\n11월 23–25일과 11월 17–19일이 충돌합니다.\n\n[수업료]\n2025학년도 1기 2,312,100원.\n\n[공식 출처]\n원문 추가 공지도 확인하세요.",
            lastCollectedAt: "2026-08-30T22:53:18.107Z",
            lastVerifiedAt: "2026-08-30T23:51:03.205Z",
            officialSources: [
              {
                name: "학교 원문",
                url: "https://school.test/guide.PNG?download=1",
                authorityLevel: "PRIMARY",
              },
            ],
          },
        }),
      ),
    );
    expect($("h3").text()).toContain("학교별 추가 조건");
    expect($("nav[aria-label='이 페이지 안내'] a").length).toBeLessThanOrEqual(
      6,
    );
    $("nav[aria-label='이 페이지 안내'] a").each((_, element) => {
      expect($($(element).attr("href")!).length).toBe(1);
    });
    const caveat = $("section").filter(
      (_, el) => $(el).children("h3").text() === "원문 확인 필요",
    );
    expect(caveat.text()).toContain("11월 23–25일과 11월 17–19일");
    expect(caveat.parents("details:not([open])")).toHaveLength(0);
    expect($("body").text()).toContain("둘째 문단: 중복등록 시 모두 취소.");
    expect($("body").text()).toContain("2025학년도 1기 2,312,100원.");
    expect($("body").text()).toContain("07:53:18 KST");
    expect($("body").text()).toContain("08:51:03 KST");
    expect(
      $("a[href='https://school.test/guide.PNG?download=1']").text(),
    ).toContain("원본 이미지");
    expect($("img")).toHaveLength(0);
  });
  it("renders planned guidance in separate paragraphs and labels dates as provisional", () => {
    const markup = renderToStaticMarkup(
      createElement(OpportunityDetailView, {
        opportunity: {
          ...opportunity,
          title: "2027학년도 신입생 모집요강(예정)",
          summary:
            "모집 인원: 84명\n\n전형료: 30,000원\n\n수업료: 2025학년도 기준, 변동 가능",
        },
      }),
    );
    expect(markup).toContain("예정 안내 · 변경 가능");
    expect(markup).toContain("지원 시작 (예정)");
    expect(markup).toContain("<p>모집 인원: 84명</p>");
    expect(markup).toContain("<p>전형료: 30,000원</p>");
    expect(markup).toContain("수업료: 2025학년도 기준, 변동 가능");
  });

  it("does not label an eligible child's expected enrolment as a provisional guide", () => {
    const markup = renderToStaticMarkup(
      createElement(OpportunityDetailView, {
        opportunity: {
          ...opportunity,
          summary: "취학 예정 아동을 대상으로 모집합니다.",
        },
      }),
    );
    expect(markup).not.toContain("예정 안내 · 변경 가능");
  });

  it("labels an explicitly qualified admission-session event as provisional", () => {
    const markup = renderToStaticMarkup(
      createElement(OpportunityDetailView, {
        opportunity: {
          ...opportunity,
          title: "2027학년도 입학설명회 1 (예정)",
          kind: "INFORMATION_SESSION",
          summary: "공식 입학 안내입니다.",
        },
      }),
    );

    expect(markup).toContain("예정 안내 · 변경 가능");
    expect(markup).toContain("행사 시작 (예정)");
    expect(
      isProvisionalAdmissionGuidance(
        "예정 안내 · 변경 가능: 공식 원문의 예정·초안 정보입니다.",
      ),
    ).toBe(true);
    expect(isProvisionalAdmissionGuidance("2027학년도 신입생 입학 안내")).toBe(
      false,
    );
  });

  it("renders the approved Donggwang provisional events and preserves every canonical marker decision", async () => {
    const bundle = JSON.parse(
      await readFile(
        new URL(
          "../../data/corrections/PREPPY_PRIVATE_ELEMENTARY_FULL_GUIDES_20260831.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as FullGuidesBundle;
    const admissions = bundle.schools.flatMap((school) =>
      school.admissions.map((admission) => ({
        ...admission,
        schoolSlug: school.target.slug,
      })),
    );
    const markedAdmissions = admissions.filter((admission) =>
      admission.summary?.startsWith(canonicalProvisionalPrefix),
    );

    expect(admissions).toHaveLength(69);
    expect(markedAdmissions).toHaveLength(17);
    for (const admission of admissions) {
      expect(
        isProvisionalAdmissionGuidance(
          `${admission.title}\n${admission.summary ?? ""}`,
        ),
      ).toBe(
        admission.summary?.startsWith(canonicalProvisionalPrefix) ?? false,
      );
    }

    const donggwang = admissions.filter(
      (admission) =>
        admission.schoolSlug === "donggwang" &&
        ["session-1", "session-2", "lottery"].includes(admission.key),
    );
    expect(donggwang.map((admission) => admission.key)).toEqual([
      "session-1",
      "session-2",
      "lottery",
    ]);

    for (const admission of donggwang) {
      expect(
        isProvisionalAdmissionGuidance(
          `${admission.title}\n${admission.summary ?? ""}`,
        ),
      ).toBe(true);
      const markup = renderToStaticMarkup(
        createElement(OpportunityDetailView, {
          opportunity: {
            ...opportunity,
            id: `full-guides-donggwang-${admission.key}`,
            slug: `full-guides-donggwang-${admission.key}`,
            title: admission.title,
            kind: admission.kind,
            businessState: admission.businessState,
            keyDate: admission.eventStartAt,
            keyDates: {
              eventStartsAt: admission.eventStartAt,
              eventEndsAt: admission.eventEndAt,
              applicationOpensAt: admission.applicationOpenAt,
              applicationClosesAt: admission.applicationCloseAt,
            },
            targetAudience: admission.targetAudience,
            summary: admission.summary,
            actionUrl: admission.actionUrl,
          },
        }),
      );

      expect(markup).toContain(admission.title);
      expect(markup).toContain("예정 안내 · 변경 가능");
      expect(markup).toContain("행사 시작 (예정)");
    }

    const hwarang2027 = admissions.find(
      (admission) =>
        admission.schoolSlug === "hwarang-s" && admission.key === "main",
    )!;
    expect(hwarang2027.title).toContain("2027학년도");
    expect(
      isProvisionalAdmissionGuidance(
        `${hwarang2027.title}\n${hwarang2027.summary ?? ""}`,
      ),
    ).toBe(false);
  });

  it("renders KST event times, retains date-only precision, and safely structures a same-cycle guide", () => {
    const markup = renderToStaticMarkup(
      createElement(OpportunityDetailView, {
        opportunity: {
          ...opportunity,
          keyDates: {
            eventStartsAt: "2026-09-01T01:00:00.000Z",
            eventEndsAt: "2026-09-01T05:00:00.000Z",
            applicationOpensAt: "2026-08-20",
            applicationClosesAt: null,
          },
          admissionGuide: {
            title: "2027학년도 모집요강(예정)",
            slug: "2027-seoul-international-admission-guide",
            summary:
              "[지원 대상 및 모집인원]\n초등 과정 신입생 84명\n\n[지원 방법]\n온라인으로 지원합니다.\n\n<img src=x onerror=alert(1)>",
            officialSources: [
              {
                name: "2027 모집요강 PDF",
                url: "https://admissions.example.test/2027-guide.pdf",
                authorityLevel: "PRIMARY",
              },
              {
                name: "입학처 공지",
                url: "https://admissions.example.test/2027-notice",
                authorityLevel: "SECONDARY_OFFICIAL",
              },
            ],
            lastCollectedAt: "2026-08-24T01:30:00.000Z",
            lastVerifiedAt: "2026-08-25T02:30:00.000Z",
          },
        },
      }),
    );

    expect(markup).toContain("2026년 9월 1일 10:00");
    expect(markup).toContain("2026년 9월 1일 14:00");
    expect(markup).toContain("2026년 8월 20일");
    expect(markup).not.toContain("2026년 8월 20일 00:00");
    expect(markup).toContain("공식 모집요강");
    expect(markup).toContain("예정 안내 · 변경 가능");
    expect(markup).toContain("<h3>지원 대상 및 모집인원</h3>");
    expect(markup).toContain("<p>초등 과정 신입생 84명</p>");
    expect(markup).toContain("<h3>지원 방법</h3>");
    expect(markup).toContain("<p>온라인으로 지원합니다.</p>");
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(markup).not.toContain("<img src=x onerror=alert(1)>");
    expect(markup).toContain("2027 모집요강 PDF");
    expect(markup).toContain("입학처 공지");
    expect(markup).toContain("Last Collected");
    expect(markup).toContain("Last Verified");
  });

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
    expect(markup).toContain("Last Collected");
    expect(markup).toContain("Last Verified");
    expect(markup).toContain("2026년 8월 23일");
    expect(markup).toContain("지원 페이지 확인");
    expect(markup).toContain('href="https://apply.example.test/2027"');
    expect(markup).toContain("서울국제학교 입학처");
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
    const article = toPublicArticleDTO(
      unsafeArticle,
      "https://preppy.example.test",
    );
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
    expect(markup).toContain(unsafeSentinel);
    expect(markup).toContain("서울국제학교");
    expect(markup).toContain("2027학년도 신입생 모집");
    expect(markup).toContain('href="/institutions/seoul-international-school"');
    expect(markup).toContain(
      'href="/opportunities/2027-seoul-international-admissions"',
    );
    expect(markup).toContain("관심기관 상태 확인 중");
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
          lastCollectedAt: null,
          lastVerifiedAt: null,
          targetAudience: null,
          summary: null,
          actionUrl: null,
          officialSource: null,
          recentMeaningfulChanges: [],
        },
      }),
    );

    expect(markup).not.toContain("Last Collected");
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
    expect(articleRoute).toContain("resolvePublicArticlePage");
    expect(articleRoute).toContain("permanentRedirect");
    for (const source of [opportunityRoute, articleRoute]) {
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).toMatch(/params: Promise/);
      expect(source).not.toContain('"use client"');
      expect(source).not.toMatch(/fetch\(|\/api\/|\.drizzle|\.raw/);
    }
    expect(viewSource).not.toContain("unsafeStoredContentHtml");
    expect(viewSource).not.toContain("unsafeStoredContentHtml");
  });
});
