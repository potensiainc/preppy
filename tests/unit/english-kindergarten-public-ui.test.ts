import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";

import {
  EnglishKindergartenDetailView,
  EnglishKindergartenListView,
} from "@/app/_components/english-kindergarten-pages";
import type {
  EnglishKindergartenSectionDTO,
  InstitutionDetailDTO,
  InstitutionListDTO,
} from "@/src/modules/public/dto";

const checkedAt = "2026-09-05T03:00:00.000Z";
const collectedAt = "2026-09-04T03:00:00.000Z";

const sectionStates: Record<
  EnglishKindergartenSectionDTO["section"],
  EnglishKindergartenSectionDTO["status"]
> = {
  TUITION: "CONFIRMED",
  INFORMATION_SESSION: "CONFIRMED",
  TARGET_AGE_GRADE: "CONFIRMED",
  CURRICULUM: "CONFIRMED",
  TRANSPORT: "CONFIRMED",
  MEALS: "CHECKED_NOT_FOUND",
  REVIEWS: "CONFIRMED",
  OPERATING_INFO: "NOT_RESEARCHED",
};

const sectionMessages: Partial<
  Record<EnglishKindergartenSectionDTO["section"], string>
> = {
  MEALS: "확인한 공식 안내에서 급식 정보를 찾지 못했어요.",
  OPERATING_INFO: "운영 정보를 준비하고 있어요.",
};

const coverage = Object.entries(sectionStates).map(([section, status]) => ({
  section: section as EnglishKindergartenSectionDTO["section"],
  status,
  message:
    sectionMessages[section as EnglishKindergartenSectionDTO["section"]] ??
    null,
  academicYearLabel: "2026학년도",
  publicNote: null,
  lastCollectedAt: collectedAt,
  lastCheckedAt: checkedAt,
  source: {
    name: "기관 공식 홈페이지",
    url: "https://academy.example.test",
    sourceType: "WEB_PAGE",
    authorityLevel: "PRIMARY" as const,
  },
})) satisfies EnglishKindergartenSectionDTO[];

const summary = {
  tuition: {
    academicYearLabel: "2026학년도",
    billingCadence: "MONTHLY" as const,
    amountMin: 1_850_000,
    amountMax: 1_850_000,
    displayText: "2026학년도 월 185만 원이에요.",
    verifiedAt: checkedAt,
  },
  ageRange: {
    min: 4,
    max: 7,
    basis: "INTERNATIONAL_AGE" as const,
    academicYearLabel: "2026학년도",
    displayText: "만 4~7세 반을 운영해요.",
    verifiedAt: checkedAt,
  },
  transport: {
    state: "AVAILABLE" as const,
    serviceAreas: ["서초구", "강남구"],
    inquiryRequired: true,
    displayText: "서초구와 강남구 일부 지역을 운행해요.",
    verifiedAt: checkedAt,
  },
  nextInformationSession: {
    id: "session-1",
    slug: "2027-info-session",
    title: "2027학년도 입학설명회",
    businessState: "UPCOMING" as const,
    eventStartsAt: "2026-10-15T01:00:00.000Z",
    applicationClosesAt: "2026-10-01T14:59:59.000Z",
    actionUrl: null,
    lastCollectedAt: collectedAt,
    verifiedAt: checkedAt,
    officialSource: {
      name: "기관 공식 설명회 안내",
      url: "https://academy.example.test/session",
      authorityLevel: "PRIMARY" as const,
    },
  },
  coverage,
  lastContentCheckedAt: checkedAt,
};

const institution = {
  id: "institution-english-1",
  slug: "example-english-academy",
  name: "예시 영어유치원",
  category: "ENGLISH_KINDERGARTEN" as const,
  region: "KR-11",
  district: "서초구",
  address: "서울특별시 서초구 예시로 12",
  followable: true,
  currentAdmissionsState: null,
  englishKindergarten: summary,
};

const list: InstitutionListDTO = {
  items: [institution],
  districtFacets: [
    { district: "강남구", count: 13 },
    { district: "서초구", count: 1 },
    { district: "송파구", count: 0 },
  ],
  pagination: { page: 1, pageSize: 12, total: 1, hasNext: false },
};

const detail: InstitutionDetailDTO = {
  institution,
  reviewedAdmissions: [],
  currentOpportunities: [],
  upcomingOpportunities: [],
  recentOpportunities: [],
  verifiedFacts: [],
  officialSources: [
    {
      name: "기관 공식 홈페이지",
      url: "https://academy.example.test",
      authorityLevel: "PRIMARY",
    },
  ],
  relatedArticles: [],
  englishKindergarten: {
    ...summary,
    sections: coverage,
    facts: [
      {
        factType: "TUITION",
        value: {
          factType: "TUITION",
          academicYearLabel: "2026학년도",
          validityNote: null,
          billingCadence: "MONTHLY",
          currency: "KRW",
          amountMin: 1_850_000,
          amountMax: 1_850_000,
          programFees: [],
          extraCosts: [
            {
              label: "교재비",
              amount: 120_000,
              cadence: "SEMESTER",
            },
          ],
          includedItems: ["정규 수업"],
          refundTerms: null,
          changeNote: "반과 선택 수업에 따라 달라질 수 있어요.",
        },
        displayText: "2026학년도 월 185만 원이에요.",
        lastCollectedAt: collectedAt,
        verifiedAt: checkedAt,
        officialSources: [
          {
            name: "기관 공식 원비 안내",
            url: "https://academy.example.test/tuition",
            authorityLevel: "PRIMARY",
          },
        ],
      },
      {
        factType: "TARGET_AGE_GRADE",
        value: {
          factType: "TARGET_AGE_GRADE",
          academicYearLabel: "2026학년도",
          ageBasis: "INTERNATIONAL_AGE",
          minAge: 4,
          maxAge: 7,
          classes: [{ name: "Rainbow", minAge: 4, maxAge: 5 }],
          midyearAdmission: {
            available: null,
            conditions: "결원 여부를 기관에 확인해야 해요.",
          },
        },
        displayText: "만 4~7세 반을 운영해요.",
        lastCollectedAt: collectedAt,
        verifiedAt: checkedAt,
        officialSources: [],
      },
      {
        factType: "CURRICULUM",
        value: {
          factType: "CURRICULUM",
          instructionalLanguages: [
            { language: "영어", percentage: 80 },
            { language: "한국어", percentage: 20 },
          ],
          components: ["파닉스", "프로젝트 수업"],
          specialActivities: ["미술"],
          dailySchedule: "오전 정규 수업 뒤 오후 특별활동을 운영해요.",
          classVariations: null,
          separatePrograms: [],
        },
        displayText: "파닉스와 프로젝트 수업을 운영해요.",
        lastCollectedAt: collectedAt,
        verifiedAt: checkedAt,
        officialSources: [],
      },
      {
        factType: "TRANSPORT",
        value: {
          factType: "TRANSPORT",
          isAvailable: true,
          serviceAreas: ["서초구", "강남구"],
          routes: [
            {
              name: "서초 노선",
              areas: ["반포동", "잠원동"],
              direction: "BOTH",
              fee: 150_000,
              currency: "KRW",
              note: "좌석은 기관 확인이 필요해요.",
            },
          ],
          restrictions: null,
          inquiryRequired: true,
        },
        displayText: "서초구와 강남구 일부 지역을 운행해요.",
        lastCollectedAt: collectedAt,
        verifiedAt: checkedAt,
        officialSources: [],
      },
    ],
    reviewInsight: {
      periodStart: "2026-01-01",
      periodEnd: "2026-08-31",
      sampleSize: 12,
      themes: [{ summary: "놀이 활동 언급이 반복돼요.", mentionCount: 5 }],
      limitations: "공개된 후기만 검토했어요.",
      lastCollectedAt: collectedAt,
      verifiedAt: checkedAt,
      sources: [
        {
          name: "공개 후기 출처",
          url: "https://reviews.example.test/academy",
          sourceType: "REVIEW_PAGE",
          authorityLevel: "DISCOVERY_ONLY",
        },
      ],
    },
  },
  indexability: "INDEX",
};

describe("English-kindergarten public experience", () => {
  it("renders comparison filters and decision fields from public DTO values", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(EnglishKindergartenListView, {
          data: list,
          filters: {
            category: "ENGLISH_KINDERGARTEN",
            region: "KR-11",
            district: "서초구",
            hasConfirmedTuition: true,
            minAge: 4,
            transport: "AVAILABLE",
            hasUpcomingInfoSession: true,
            page: 1,
            pageSize: 12,
          },
        }),
      ),
    );

    expect($("h1").text()).toBe("조건에 맞는 곳을 바로 비교해 보세요");
    expect($("form[action='/institutions'][method='get']")).toHaveLength(1);
    for (const name of [
      "query",
      "region",
      "district",
      "hasConfirmedTuition",
      "minAge",
      "transport",
      "hasUpcomingInfoSession",
      "sort",
    ]) {
      expect($(`[name='${name}']`)).toHaveLength(1);
    }
    expect($("[name='category']").attr("value")).toBe("ENGLISH_KINDERGARTEN");
    expect($("input[name='region']").attr("value")).toBe("KR-11");
    expect($("input[name='district']").attr("value")).toBe("서초구");
    expect($("details[aria-label='서울 자치구 선택'] summary").text()).toBe(
      "서초구 · 1곳",
    );
    expect($("nav[aria-label='서울 자치구'] a")).toHaveLength(4);
    expect(
      $(
        "nav[aria-label='서울 자치구'] a[href*='district=%EA%B0%95%EB%82%A8%EA%B5%AC']",
      )
        .first()
        .text(),
    ).toContain("강남구13곳");
    expect($(".ek-card__region").text()).toBe("서초구");
    expect($("body").text()).not.toContain("KR-11");
    expect($("#ek-result-title").text()).toBe("서초구 영어유치원 1곳");
    expect($("[name='sort'] option:selected").attr("value")).toBe("NAME_ASC");
    expect($("main, body").text()).toContain("월 원비");
    expect($("main, body").text()).toContain("2026학년도 월 185만 원이에요.");
    expect($("main, body").text()).toContain("운영 연령");
    expect($("main, body").text()).toContain("만 4~7세 반을 운영해요.");
    expect($("main, body").text()).toContain("셔틀");
    expect($("main, body").text()).toContain("다음 설명회");
    expect($("main, body").text()).toContain("2026년 10월 15일");
  });

  it("distinguishes an uncovered district from filters with no matches", () => {
    const districtEmpty = load(
      renderToStaticMarkup(
        createElement(EnglishKindergartenListView, {
          data: {
            ...list,
            items: [],
            districtFacets: list.districtFacets.map((facet) => ({
              ...facet,
              count: 0,
            })),
            pagination: { ...list.pagination, total: 0 },
          },
          filters: {
            category: "ENGLISH_KINDERGARTEN",
            region: "KR-11",
            district: "송파구",
            page: 1,
            pageSize: 12,
          },
        }),
      ),
    );
    expect(districtEmpty("body").text()).toContain(
      "현재 송파구에 공개된 영어유치원이 없어요",
    );
    expect(
      districtEmpty("a").filter(
        (_, link) => districtEmpty(link).text() === "서울 전체 보기",
      ),
    ).toHaveLength(1);

    const filteredEmpty = load(
      renderToStaticMarkup(
        createElement(EnglishKindergartenListView, {
          data: {
            ...list,
            items: [],
            pagination: { ...list.pagination, total: 0 },
          },
          filters: {
            category: "ENGLISH_KINDERGARTEN",
            region: "KR-11",
            district: "서초구",
            hasConfirmedTuition: true,
            page: 1,
            pageSize: 12,
          },
        }),
      ),
    );
    expect(filteredEmpty("body").text()).toContain(
      "선택한 조건에 맞는 영어유치원을 찾지 못했어요",
    );
    expect(
      filteredEmpty("a").filter(
        (_, link) => filteredEmpty(link).text() === "비교 조건 초기화",
      ),
    ).toHaveLength(1);
  });

  it("renders structured values when optional display text is absent", () => {
    const structuredList = {
      ...list,
      items: [
        {
          ...institution,
          englishKindergarten: {
            ...summary,
            tuition: { ...summary.tuition, displayText: null },
            ageRange: { ...summary.ageRange, displayText: null },
            transport: { ...summary.transport, displayText: null },
          },
        },
      ],
    } satisfies InstitutionListDTO;
    const structuredDetail = {
      ...detail,
      institution: structuredList.items[0]!,
      englishKindergarten: {
        ...detail.englishKindergarten!,
        facts: detail.englishKindergarten!.facts.map((fact) => ({
          ...fact,
          displayText: null,
        })),
      },
    } satisfies InstitutionDetailDTO;

    const listText = load(
      renderToStaticMarkup(
        createElement(EnglishKindergartenListView, {
          data: structuredList,
          filters: { category: "ENGLISH_KINDERGARTEN", page: 1, pageSize: 12 },
        }),
      ),
    )("body").text();
    expect(listText).toContain("2026학년도 · 월 1,850,000원");
    expect(listText).toContain("만 4~7세");
    expect(listText).toContain("운영 · 서초구, 강남구");

    const detailText = load(
      renderToStaticMarkup(
        createElement(EnglishKindergartenDetailView, {
          data: structuredDetail,
        }),
      ),
    )("body").text();
    expect(detailText).toContain("2026학년도 · 월 1,850,000원");
    expect(detailText).toContain("2026학년도 · 만 4~7세");
    expect(detailText).toContain("운영 · 서초구, 강남구");
  });

  it("renders an answer-first detail with exact coverage states and trust labels", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(EnglishKindergartenDetailView, { data: detail }),
      ),
    );
    const text = $("body").text();

    for (const heading of [
      "원비",
      "입학설명회",
      "연령·커리큘럼",
      "셔틀",
      "급식",
      "후기 요약",
      "공식 출처",
    ]) {
      expect(
        $(
          `a[href='#${
            {
              원비: "tuition",
              입학설명회: "information-session",
              "연령·커리큘럼": "age-curriculum",
              셔틀: "transport",
              급식: "meals",
              "후기 요약": "review-summary",
              "공식 출처": "official-sources",
            }[heading]
          }']`,
        ),
      ).toHaveLength(1);
    }
    expect(text).toContain("확인한 공식 안내에서 급식 정보를 찾지 못했어요.");
    expect(text).toContain("신청 마감");
    expect(text).toContain("2026년 10월 1일");
    expect(text).toContain("자료 수집");
    expect(text).toContain("2026년 9월 4일");
    expect(text).toContain("내용 확인");
    expect(text).toContain("2026년 9월 5일");
    expect(text).toContain("공개 후기 요약 · 공식 정보 아님");
    expect(text).toContain("후기 12건을 검토했어요.");
    expect(
      $("a[href='https://academy.example.test']").filter((_, element) =>
        $(element).text().includes("기관 공식 홈페이지 열기"),
      ),
    ).toHaveLength(1);
    expect($("button[disabled]:not(.favorite-heart), a[href='']")).toHaveLength(
      0,
    );
    for (const internalTerm of [
      "Evidence",
      "VERIFIED",
      "Snapshot",
      "정보 없음",
    ]) {
      expect(text).not.toContain(internalTerm);
    }
  });
});
