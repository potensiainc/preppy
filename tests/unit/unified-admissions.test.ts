import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
  AdmissionSessions,
  ReviewedAdmissions,
} from "@/app/_components/admissions-content";
import { OpportunityDetailView } from "@/app/_components/admissions-detail";
import { FollowCta } from "@/app/_components/follow-cta";
import {
  unifiedAdmissionDestination,
  groupReviewedAdmissions,
  isPastAdmissionDate,
} from "@/app/_lib/admission-navigation";
import type {
  PublicOpportunityDTO,
  ReviewedAdmissionDTO,
} from "@/src/modules/public/dto";

const schoolId = "11111111-1111-5111-8111-111111111111";
const mainSlug = `live-admissions-${schoolId}-2027`;
const source = {
  name: "공식 모집요강",
  url: "https://school.example/guide",
  authorityLevel: "PRIMARY" as const,
};
const dates = {
  eventStartsAt: null,
  eventEndsAt: null,
  applicationOpensAt: null,
  applicationClosesAt: null,
};
const main: PublicOpportunityDTO = {
  id: "main",
  slug: mainSlug,
  title: "2027학년도 신입생 모집",
  academicYearLabel: "2027학년도",
  kind: "RECRUITMENT",
  businessState: "UPCOMING",
  keyDate: null,
  keyDates: dates,
  institution: {
    id: schoolId,
    slug: "school",
    name: "검증 학교",
    category: "PRIVATE_ELEMENTARY",
    region: "서울",
    followable: false,
  },
  targetAudience: "2020년 출생;84명",
  summary:
    "[제출 서류]\n공통 제출 서류입니다.\n\n[교육비]\n2025학년도 기준 2,312,100원입니다.",
  actionUrl: null,
  officialSource: source,
  officialSources: [source],
  lastCollectedAt: "2026-08-30T01:00:00Z",
  lastVerifiedAt: "2026-08-31T02:00:00Z",
  recentMeaningfulChanges: [],
  relatedArticles: [],
  indexability: "INDEX",
};
const events = [
  {
    slug: `${mainSlug}-event-session-1`,
    title: "입학설명회 1",
    kind: "INFORMATION_SESSION" as const,
    businessState: "UPCOMING" as const,
    keyDates: {
      ...dates,
      eventStartsAt: "2026-10-24T01:00:00Z",
      eventEndsAt: "2026-10-24T02:30:00Z",
      applicationOpensAt: "2026-10-01",
    },
    summary: "학생 동반이 필요합니다.",
    targetAudience: "학생과 보호자",
    actionUrl: "https://school.example/morning",
    officialSources: [source],
    lastCollectedAt: "2026-08-28T01:00:00Z",
    lastVerifiedAt: "2026-08-29T02:00:00Z",
  },
  {
    slug: `${mainSlug}-event-session-2`,
    title: "입학설명회 2",
    kind: "INFORMATION_SESSION" as const,
    businessState: "UPCOMING" as const,
    keyDates: { ...dates, eventStartsAt: "2026-10-28T00:30:00Z" },
    summary: "보호자만 참석합니다.",
    targetAudience: "보호자",
    actionUrl: "javascript:alert(1)",
    officialSources: [source],
    lastCollectedAt: "2026-08-27T01:00:00Z",
    lastVerifiedAt: "2026-08-28T02:00:00Z",
  },
];
function render(opportunity: PublicOpportunityDTO) {
  return load(
    renderToStaticMarkup(createElement(OpportunityDetailView, { opportunity })),
  );
}
function reviewed(
  value: PublicOpportunityDTO,
  id: string,
): ReviewedAdmissionDTO {
  return {
    ...value,
    id,
    academicYearLabel: value.academicYearLabel ?? null,
    knowledgeState: "SCHEDULE_FOUND",
    officialSource: source,
    lastCollectedAt: value.lastCollectedAt!,
    lastVerifiedAt: value.lastVerifiedAt!,
  };
}

describe("unified school-cycle admission experience", () => {
  it("shows identical shared audience, action and provisional notice only once without hiding different event conditions", () => {
    const summary =
      "예정 안내 · 변경 가능: 일정은 변경될 수 있습니다.\n\n공통 안내";
    const $ = render({
      ...main,
      title: "2027학년도 모집 (예정)",
      summary,
      actionUrl: "https://school.example/apply",
      relatedAdmissions: [
        {
          ...events[0]!,
          title: "설명회 (예정)",
          summary: `${summary}\n\n학생 동반이 필요합니다.`,
          targetAudience: main.targetAudience,
          actionUrl: "https://school.example/apply",
        },
        events[1]!,
      ],
    });
    expect($("#admission-sessions").text()).not.toContain("2020년 출생");
    expect($("#admission-sessions").text()).toContain("보호자만 참석합니다.");
    expect($("#admission-sessions").text()).toContain(
      "학생 동반이 필요합니다.",
    );
    expect(
      $("body")
        .text()
        .match(/일정은 변경될 수 있습니다/g),
    ).toHaveLength(1);
    expect($("a[href='https://school.example/apply']")).toHaveLength(1);
  });
  it("separates past dates without inventing an end time or using registration status", () => {
    const now = new Date("2026-10-24T03:00:00Z");
    expect(
      isPastAdmissionDate(
        { ...dates, eventStartsAt: "2026-10-24T01:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isPastAdmissionDate({ ...dates, eventStartsAt: "2026-10-23" }, now),
    ).toBe(true);
    expect(
      isPastAdmissionDate({ ...dates, eventEndsAt: "2026-10-24" }, now),
    ).toBe(false);
    expect(
      isPastAdmissionDate(
        { ...dates, eventEndsAt: "2026-10-24T02:00:00Z" },
        now,
      ),
    ).toBe(true);
    expect(isPastAdmissionDate(dates, now)).toBe(false);
  });
  it("keeps common guide once but never discards unique conditions or historical price qualifiers", () => {
    const $ = render({
      ...main,
      relatedAdmissions: [
        {
          ...events[0]!,
          summary: `${main.summary}\n\n[유의사항]\n서류는 원본만 가능합니다.`,
        },
      ],
    });
    expect(
      $("body")
        .text()
        .match(/공통 제출 서류입니다/g),
    ).toHaveLength(1);
    expect($("body").text()).toContain("2025학년도 기준 2,312,100원");
    expect($("#admission-sessions").text()).toContain(
      "서류는 원본만 가능합니다.",
    );
    expect($("#admission-sessions details").text()).not.toContain(
      "서류는 원본만 가능합니다.",
    );
  });

  it("preserves date-only precision, unknown end, cancellation and sorts known dates before unknown", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(AdmissionSessions, {
          items: [
            { ...events[1]!, slug: "unknown", keyDates: dates },
            {
              ...events[0]!,
              slug: "date-only",
              businessState: "CANCELLED",
              keyDates: { ...dates, eventStartsAt: "2026-10-24" },
            },
          ],
          currentSlug: mainSlug,
        }),
      ),
    );
    expect($("article").first().attr("data-admission-session")).toBe(
      "date-only",
    );
    expect($("article").first().text()).toContain("취소");
    expect($("article").first().text()).toContain("종료 시각 미확인");
    expect($("time[datetime='2026-10-24']").text()).not.toContain("00:00");
  });

  it("redirects only an exact official guide with the requested child actually present", () => {
    const child = {
      ...main,
      ...events[0]!,
      relatedAdmissions: events,
      admissionGuide: {
        slug: mainSlug,
        title: main.title,
        summary: main.summary,
        officialSources: [source],
        lastCollectedAt: main.lastCollectedAt!,
        lastVerifiedAt: main.lastVerifiedAt!,
      },
    };
    expect(unifiedAdmissionDestination(child)).toBe(
      `/opportunities/${mainSlug}#session-${events[0]!.slug}`,
    );
    expect(
      unifiedAdmissionDestination({ ...child, admissionGuide: null }),
    ).toBeNull();
    expect(
      unifiedAdmissionDestination({ ...child, relatedAdmissions: [] }),
    ).toBeNull();
    for (const slug of [
      mainSlug.replace("2027", "2026"),
      mainSlug.replace("2027", "current"),
      "legacy-guide",
    ]) {
      expect(
        unifiedAdmissionDestination({
          ...child,
          admissionGuide: { ...child.admissionGuide, slug },
        }),
      ).toBeNull();
    }
    expect(
      unifiedAdmissionDestination({
        ...child,
        institution: { ...main.institution, id: "another-school" },
      }),
    ).toBeNull();
    expect(
      groupReviewedAdmissions([
        reviewed({ ...main, kind: "ADDITIONAL_RECRUITMENT" }, "additional"),
        reviewed({ ...main, ...events[0]! }, "child"),
      ]),
    ).toHaveLength(2);
  });
  it("lets parents compare complete event conditions in place, without navigating between numbered pages", () => {
    const $ = render({ ...main, relatedAdmissions: events });
    const list = $("#admission-sessions");
    expect(list.find("article")).toHaveLength(2);
    expect(list.text()).toContain("학생 동반이 필요합니다.");
    expect(list.text()).toContain("보호자만 참석합니다.");
    expect(list.text()).toContain("오전 10:00");
    expect(list.text()).toContain("오전 9:30");
    expect(list.find("a[href^='/opportunities/']")).toHaveLength(0);
    expect(list.find("a[href='https://school.example/morning']")).toHaveLength(
      1,
    );
    expect(list.find("a[href^='javascript:']")).toHaveLength(0);
    expect(list.find("time[datetime='2026-08-29T02:00:00Z']")).toHaveLength(1);
    expect(list.find("time[datetime='2026-08-28T02:00:00Z']")).toHaveLength(1);
    expect($("body").text()).not.toMatch(
      /ADMISSION GUIDE|FULL ADMISSION GUIDE|RELATED ADMISSION DATES/,
    );
    expect(
      $("body")
        .text()
        .match(/공통 제출 서류입니다/g),
    ).toHaveLength(1);
    expect($("section[aria-label='관심기관 알림']")).toHaveLength(0);
  });

  it("groups only exact school-cycle children on institution details and retains ungrouped records", () => {
    const child = reviewed({ ...main, ...events[0]! }, "event");
    const older = reviewed(
      {
        ...main,
        slug: `live-admissions-${schoolId}-2026-event-session-1`,
        title: "2026학년도 설명회",
        kind: "INFORMATION_SESSION",
      },
      "old",
    );
    const $ = load(
      renderToStaticMarkup(
        createElement(ReviewedAdmissions, {
          admissions: [child, reviewed(main, "main"), older],
        }),
      ),
    );
    expect($("section[aria-label='입학정보'] > div > article")).toHaveLength(2);
    expect($("[data-admission-session]")).toHaveLength(1);
    expect($("body").text()).toContain("2026학년도 설명회");
    expect($("body").text()).toContain("학생 동반이 필요합니다.");
  });

  it("omits the unavailable Follow wrapper entirely, not just its message", () => {
    const markup = renderToStaticMarkup(
      createElement(FollowCta, {
        institutionId: schoolId,
        returnPath: "/institutions/school",
        context: "INSTITUTION",
        followable: false,
      }),
    );
    expect(markup).toBe("");
  });

  it("keeps a future event in the available dates even if its reservation is closed", () => {
    const $ = load(
      renderToStaticMarkup(
        createElement(AdmissionSessions, {
          items: [
            {
              ...events[0]!,
              businessState: "CLOSED",
              keyDates: { ...dates, eventStartsAt: "2099-10-24T01:00:00Z" },
            },
          ],
          currentSlug: mainSlug,
        }),
      ),
    );
    expect($("[data-admission-session]")).toHaveLength(1);
    expect($("[data-past-sessions]")).toHaveLength(0);
    expect($("body").text()).not.toContain("행사 종료");
  });
});
