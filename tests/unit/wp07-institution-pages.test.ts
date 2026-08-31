import { readFile } from "node:fs/promises";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
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
  reviewedAdmissions: [
    {
      id: "opportunity-1",
      slug: "2027-admissions",
      title: "2027학년도 입학 전형",
      academicYearLabel: "2027학년도",
      knowledgeState: "SCHEDULE_FOUND",
      kind: "RECRUITMENT",
      businessState: "OPEN",
      summary: "공식 모집요강에서 확인한 입학 정보입니다.",
      targetAudience: "2020년 출생 아동",
      keyDates: {
        eventStartsAt: "2026-09-12T01:00:00.000Z",
        eventEndsAt: null,
        applicationOpensAt: "2026-09-01T00:00:00.000Z",
        applicationClosesAt: "2026-09-05T07:00:00.000Z",
      },
      actionUrl: "https://admissions.example.test/2027",
      officialSource: {
        name: "학교 공식 입학처",
        url: "https://admissions.example.test/2027",
        authorityLevel: "PRIMARY",
      },
      lastCollectedAt: "2026-08-21T03:30:00.000Z",
      lastVerifiedAt: "2026-08-23T03:30:00.000Z",
    },
  ],
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

it("does not show an empty second current-admission section when all current records are already in the guide", () => {
  const $ = load(
    renderToStaticMarkup(
      createElement(InstitutionDetailView, { data: detail }),
    ),
  );
  expect($("[aria-label='입학정보']").text()).toContain("2027학년도");
  expect($("[aria-label='현재 모집·입학정보']")).toHaveLength(0);
  expect($("[aria-label='예정된 모집·입학정보']")).toHaveLength(1);
});

it("separates institution fact prose without dropping fee years or exceptions", () => {
  const $ = load(
    renderToStaticMarkup(
      createElement(InstitutionDetailView, {
        data: {
          ...detail,
          verifiedFacts: [
            {
              ...detail.verifiedFacts[0]!,
              displayValue:
                "2025학년도 분기 수업료는 2,312,100원이다;2027학년도에는 변동될 수 있다.",
            },
          ],
        },
      }),
    ),
  );
  expect(
    $(".institution-facts li")
      .map((_, el) => $(el).text())
      .get(),
  ).toEqual([
    "2025학년도 분기 수업료는 2,312,100원이에요",
    "2027학년도에는 변동될 수 있어요.",
  ]);
  expect($(".institution-facts time").attr("datetime")).toBe(
    "2026-08-22T03:30:00.000Z",
  );
});

it("filters document narration from institution facts and source labels while preserving conditions and links", () => {
  const $ = load(
    renderToStaticMarkup(
      createElement(InstitutionDetailView, {
        data: {
          ...detail,
          verifiedFacts: [
            {
              ...detail.verifiedFacts[0]!,
              displayValue:
                "특수교육대상자는 일반(추첨)전형이 아닌 별도 전형이며 전형별 상세 자격은 공식 PDF 참조.",
              officialSource: {
                name: "학교 공식 모집요강 PDF",
                url: "https://school.test/guide.pdf",
                authorityLevel: "PRIMARY",
              },
            },
          ],
        },
      }),
    ),
  );
  expect($("body").text()).not.toContain("PDF");
  expect($(".institution-facts").text()).toContain(
    "특수교육대상자는 일반(추첨)전형이 아닌 별도 전형이에요.",
  );
  expect($("a[href='https://school.test/guide.pdf']")).toHaveLength(1);
});

it("shows a full-width reviewed card with dates before guidance and removes only the same opportunity from generic groups", () => {
  const $ = load(
    renderToStaticMarkup(
      createElement(InstitutionDetailView, {
        data: {
          ...detail,
          reviewedAdmissions: [
            {
              ...detail.reviewedAdmissions[0]!,
              summary:
                "[지원 조건]\n조건 전체\n\n[확인 필요]\n날짜가 충돌하므로 학교 확인이 필요합니다.",
            },
          ],
        },
      }),
    ),
  );
  const reviewed = $("[aria-label='입학정보']");
  expect(reviewed.find(".institution-detail__cards")).toHaveLength(0);
  expect(reviewed.text().indexOf("2026년 9월 1일")).toBeLessThan(
    reviewed.text().indexOf("조건 전체"),
  );
  expect(reviewed.find("details").text()).toContain("조건 전체");
  expect(reviewed.find("details:not([open])").text()).not.toContain(
    "날짜가 충돌",
  );
  expect(
    $(
      "[aria-label='현재 모집·입학정보'] a[href='/opportunities/2027-admissions']",
    ),
  ).toHaveLength(0);
  expect(
    $(
      "[aria-label='예정된 모집·입학정보'] a[href='/opportunities/2027-admissions']",
    ),
  ).toHaveLength(1);
});

it("keeps Soongeui's separated caution and early-admission caveat visible while safe guide sections can collapse", async () => {
  const bundle = JSON.parse(
    await readFile(
      new URL(
        "../../data/corrections/PREPPY_PRIVATE_ELEMENTARY_FULL_GUIDES_20260831.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    schools: Array<{
      target: { slug: string };
      admissions: Array<{ key: string; summary: string }>;
    }>;
  };
  const summary = bundle.schools
    .find((school) => school.target.slug === "soongeui")!
    .admissions.find((admission) => admission.key === "main")!.summary;
  const $ = load(
    renderToStaticMarkup(
      createElement(InstitutionDetailView, {
        data: {
          ...detail,
          reviewedAdmissions: [
            { ...detail.reviewedAdmissions[0]!, summary },
            {
              ...detail.reviewedAdmissions[0]!,
              id: "safe-guide",
              slug: "safe-guide",
              summary: "[지원 조건]\n지원 연령을 참고하세요.",
            },
          ],
        },
      }),
    ),
  );
  const reviewed = $("[aria-label='입학정보']");
  const closed = reviewed.find("details:not([open])");
  const caution =
    "조기입학 희망자는 학습능력뿐 아니라 교우관계와 정서적 적응도 신중하게 고려하라고 안내해요.";
  expect(closed.text()).not.toContain("교육비·유의사항·문의");
  expect(closed.text()).not.toContain(caution);
  expect(reviewed.find("[data-admission-topic='유의사항']").text()).toContain(
    caution,
  );
  expect(reviewed.find("h3").text()).toContain("교육비");
  expect(reviewed.text()).toContain(caution);
  expect(closed.text()).toContain("지원 연령을 참고하세요.");
});

it("presents recruitment and canonical main guides before event cards without mutating or losing the reviewed records", () => {
  const base = detail.reviewedAdmissions[0]!;
  const records: InstitutionDetailDTO["reviewedAdmissions"] = [
    {
      ...base,
      id: "session-2",
      slug: "session-2",
      kind: "INFORMATION_SESSION",
      title: "오후 설명회",
    },
    {
      ...base,
      id: "main",
      slug: "main",
      kind: "RECRUITMENT",
      title: "신입생 모집요강",
    },
    {
      ...base,
      id: "lottery-event",
      slug: "lottery-event",
      kind: "LOTTERY",
      title: "추첨 행사",
    },
    {
      ...base,
      id: "session-1",
      slug: "session-1",
      kind: "INFORMATION_SESSION",
      title: "오전 설명회",
    },
    {
      ...base,
      id: "additional",
      slug: "additional",
      kind: "ADDITIONAL_RECRUITMENT",
      title: "추가 모집",
    },
    {
      ...base,
      id: "lottery-main",
      slug: "live-admissions-12345678-1234-1234-1234-123456789abc-2026",
      kind: "LOTTERY",
      title: "추첨 전형 전체 요강",
    },
  ];
  const admissions = records.map((admission) => ({
    ...admission,
    summary: `[원문 유의사항]\n${admission.title} 원문 날짜 충돌은 학교 확인이 필요합니다.`,
    officialSources: [
      {
        ...base.officialSource,
        name: `${admission.title} 공식 자료`,
        url: `https://school.example.test/${admission.id}.pdf`,
      },
    ],
  }));
  const original = structuredClone(admissions);
  Object.freeze(admissions);
  const $ = load(
    renderToStaticMarkup(
      createElement(InstitutionDetailView, {
        data: { ...detail, reviewedAdmissions: admissions },
      }),
    ),
  );
  const cards = $("[aria-label='입학정보'] article");
  expect(
    cards.map((_, card) => $(card).find("h3 a").first().text()).get(),
  ).toEqual([
    "신입생 모집요강",
    "추가 모집",
    "추첨 전형 전체 요강",
    "오후 설명회",
    "추첨 행사",
    "오전 설명회",
  ]);
  expect(admissions).toEqual(original);
  expect(cards).toHaveLength(6);
  for (const admission of original) {
    const card = cards.filter(
      (_, element) =>
        $(element).find(`h3 a[href='/opportunities/${admission.slug}']`)
          .length === 1,
    );
    expect(card.text()).not.toContain(
      `${admission.title} 원문 날짜 충돌은 학교 확인이 필요합니다.`,
    );
    expect(card.find("details:not([open])").text()).not.toContain(
      "원문 날짜 충돌",
    );
    expect(
      card
        .find(`a[href='https://school.example.test/${admission.id}.pdf']`)
        .text(),
    ).toContain(`${admission.title} 공식 자료`);
  }
});

it("labels a verified lottery as 추첨, never as an information session, and renders every source", () => {
  const admission = detail.reviewedAdmissions[0]!;
  const markup = renderToStaticMarkup(
    createElement(InstitutionDetailView, {
      data: {
        ...detail,
        reviewedAdmissions: [
          {
            ...admission,
            title: "2026학년도 추첨",
            kind: "LOTTERY",
            keyDates: {
              ...admission.keyDates,
              applicationOpensAt: null,
              applicationClosesAt: null,
            },
            officialSources: [
              admission.officialSource,
              {
                name: "원본 이미지",
                url: "https://admissions.example.test/original.png",
                authorityLevel: "PRIMARY",
              },
            ],
          },
        ],
      },
    }),
  );
  expect(load(markup)("[aria-label='주요 일정']").text()).toContain(
    "추첨 일정",
  );
  expect(markup).not.toContain("설명회 / Open House");
  expect(markup).toContain(
    'href="https://admissions.example.test/original.png"',
  );
});

it("does not imply missing applications or sessions when the fields are represented by separate records", () => {
  const admission = detail.reviewedAdmissions[0]!;
  const markup = renderToStaticMarkup(
    createElement(InstitutionDetailView, {
      data: {
        ...detail,
        reviewedAdmissions: [
          {
            ...admission,
            keyDates: {
              ...admission.keyDates,
              eventStartsAt: null,
              eventEndsAt: null,
            },
          },
          ...["2026-10-31T01:00:00.000Z", "2026-10-31T05:00:00.000Z"].map(
            (date, index) => ({
              ...admission,
              id: `session-${index}`,
              kind: "INFORMATION_SESSION" as const,
              keyDates: {
                eventStartsAt: date,
                eventEndsAt: null,
                applicationOpensAt: null,
                applicationClosesAt: null,
              },
            }),
          ),
        ],
      },
    }),
  );
  expect(markup).not.toContain("확인된 일정 없음");
  const $ = load(markup);
  expect(
    $("[aria-label='주요 일정']").filter((_, element) =>
      $(element).text().includes("원서접수 일정"),
    ),
  ).toHaveLength(1);
  expect(
    $("[aria-label='주요 일정']").filter((_, element) =>
      $(element).text().includes("입학설명회 일정"),
    ),
  ).toHaveLength(2);
});

it("shows the separate 10:00 and 14:00 session clocks and the result announcement label", () => {
  const admission = detail.reviewedAdmissions[0]!;
  const markup = renderToStaticMarkup(
    createElement(InstitutionDetailView, {
      data: {
        ...detail,
        reviewedAdmissions: [
          ...["2026-10-31T01:00:00.000Z", "2026-10-31T05:00:00.000Z"].map(
            (date, index) => ({
              ...admission,
              id: `session-${index}`,
              kind: "INFORMATION_SESSION" as const,
              keyDates: { ...admission.keyDates, eventStartsAt: date },
            }),
          ),
          { ...admission, id: "result", kind: "RESULT_ANNOUNCEMENT" },
        ],
      },
    }),
  );
  expect(markup).toContain("10:00");
  expect(markup).toContain("오후 2:00");
  expect(load(markup)("[aria-label='주요 일정']").text()).toContain(
    "결과 발표 일정",
  );
});

it("labels a qualified admission-session card as provisional instead of a confirmed schedule", () => {
  const admission = detail.reviewedAdmissions[0]!;
  const markup = renderToStaticMarkup(
    createElement(InstitutionDetailView, {
      data: {
        ...detail,
        reviewedAdmissions: [
          {
            ...admission,
            title: "2027학년도 입학설명회 2 (예정)",
            kind: "INFORMATION_SESSION",
            summary: "공식 입학 안내입니다.",
          },
        ],
      },
    }),
  );

  expect(markup).toContain("예정 안내 · 변경 가능");
  expect(markup).not.toContain("공식 일정 확인됨");
});

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
    expect(emptyMarkup).toContain("조건에 맞는 기관을 찾지 못했어요");
  });

  it("renders only DTO-backed institution hero, grouped records, fact-level trust, sources, articles, and the local Follow CTA", () => {
    // Mutation caught: inventing page-wide freshness, flattening opportunity sections, losing fact provenance, or claiming persisted Follow behavior.
    const markup = renderToStaticMarkup(
      createElement(InstitutionDetailView, { data: detail }),
    );

    expect(markup).toContain("서울국제학교");
    expect(markup).toContain("국제학교");
    expect(markup).toContain("서울");
    expect(markup).not.toContain("현재 모집·입학정보");
    expect(markup).toContain("예정된 모집·입학정보");
    expect(markup).toContain("최근 모집·입학정보");
    expect(markup).toContain("입학정보");
    expect(markup).toContain("2027학년도");
    expect(markup).toContain("공식 일정 확인");
    expect(markup).toContain("2020년 출생 아동");
    expect(markup).toContain("자료 수집");
    expect(markup).toContain("2026년 8월 21일");
    expect(markup).toContain("내용 확인");
    expect(markup).toContain("2026년 8월 23일");
    expect(markup).toContain("교육비");
    expect(markup).toContain("연간 1,000만 원");
    expect(markup).toContain("2026년 8월 22일");
    expect(markup).toContain("학교 공식 입학처");
    expect(markup).toContain("학교 공식 홈페이지");
    expect(markup).toContain("국제학교 방문 전 확인할 점");
    expect(markup).toContain('href="/articles/school-visit-guide"');
    expect(markup).toContain("관심기관 상태 확인 중");
    expect(markup).toContain("관심기관 등록 여부를 확인하고 있어요.");
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

    expect(markup).not.toContain("현재 모집·입학정보");
    expect(markup).not.toContain("예정된 모집·입학정보");
    expect(markup).not.toContain("최근 모집·입학정보");
    expect(markup.match(/학교 공식 입학처/g)).toHaveLength(2);
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
