import { describe, expect, it } from "vitest";

import {
  campaignEntryFromSearch,
  resolveCampaignEntry,
} from "@/src/analytics/campaign-entry";
import { parseAnalyticsEvent } from "@/src/analytics/events";
import { toGa4Event } from "@/src/analytics/provider-mapping";
import { upcomingSessionRows } from "@/app/_components/english-kindergarten-upcoming";
import {
  compareOfficialLink,
  compareSession,
} from "@/app/_lib/english-kindergarten-compare";
import {
  isUncheckedSummary,
  summaryBadges,
  summaryGap,
} from "@/app/_lib/english-kindergarten-summary";
import type {
  EnglishKindergartenCardSummaryDTO,
  EnglishKindergartenInformationSessionDTO,
  EnglishKindergartenSectionDTO,
  InstitutionListDTO,
} from "@/src/modules/public/dto";

const now = new Date("2026-10-21T00:00:00.000Z");

function session(
  id: string,
  eventStartsAt: string,
  businessState: EnglishKindergartenInformationSessionDTO["businessState"],
): EnglishKindergartenInformationSessionDTO {
  return {
    id,
    slug: id,
    title: `설명회 ${id}`,
    businessState,
    eventStartsAt,
    applicationClosesAt: null,
    actionUrl: null,
    lastCollectedAt: null,
    verifiedAt: "2026-10-21T01:00:00.000Z",
    targetAudience: "2027학년도 · 기관 표기 5세, 6세 · 5·6세",
    officialSource: {
      name: "공식 설명회 안내",
      url: `https://example.test/${id}`,
      authorityLevel: "PRIMARY",
    },
  };
}

function coverage(
  section: EnglishKindergartenSectionDTO["section"],
  status: EnglishKindergartenSectionDTO["status"],
): EnglishKindergartenSectionDTO {
  return {
    section,
    status,
    message: null,
    academicYearLabel: null,
    publicNote: null,
    lastCollectedAt: null,
    lastCheckedAt: "2026-10-21T01:00:00.000Z",
    source: null,
  };
}

function summary(
  overrides: Partial<EnglishKindergartenCardSummaryDTO> = {},
): EnglishKindergartenCardSummaryDTO {
  return {
    tuition: null,
    ageRange: null,
    transport: {
      state: "UNKNOWN",
      serviceAreas: [],
      inquiryRequired: false,
      displayText: null,
      verifiedAt: null,
    },
    nextInformationSession: null,
    informationSessions: [],
    coverage: [],
    lastContentCheckedAt: null,
    ...overrides,
  };
}

describe("YouTube campaign entry label", () => {
  it("labels only the exact video campaign and never forwards raw query values", () => {
    expect(
      campaignEntryFromSearch(
        "?utm_source=youtube&utm_medium=description&utm_campaign=bubuild_ek_video",
      ),
    ).toBe("BUBUILD_EK_VIDEO");
    expect(campaignEntryFromSearch("?utm_source=youtube")).toBe("OTHER");
    expect(
      campaignEntryFromSearch(
        "?utm_source=naver&utm_campaign=bubuild_ek_video",
      ),
    ).toBe("OTHER");
    const event = toGa4Event(
      parseAnalyticsEvent("guide_cta_click", {
        guide: "EK_CHECKLIST",
        entry: "BUBUILD_EK_VIDEO",
        target: "COMPARE",
      }),
    );
    expect(event).toEqual({
      name: "guide_cta_click",
      params: {
        guide: "EK_CHECKLIST",
        entry: "BUBUILD_EK_VIDEO",
        target: "COMPARE",
      },
    });
    expect(() =>
      parseAnalyticsEvent("guide_view", {
        guide: "EK_CHECKLIST",
        entry: "utm_source=youtube",
      }),
    ).toThrow();
  });

  it("keeps the label for later pages in the same tab and survives blocked storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    expect(
      resolveCampaignEntry(
        "?utm_source=youtube&utm_campaign=bubuild_ek_video",
        storage,
      ),
    ).toBe("BUBUILD_EK_VIDEO");
    expect(resolveCampaignEntry("", storage)).toBe("BUBUILD_EK_VIDEO");
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(resolveCampaignEntry("", blocked)).toBe("OTHER");
    expect(
      resolveCampaignEntry(
        "?utm_source=youtube&utm_campaign=bubuild_ek_video",
        blocked,
      ),
    ).toBe("BUBUILD_EK_VIDEO");
  });
});

describe("English-kindergarten card gaps", () => {
  it("states why a value is missing instead of saying it does not exist", () => {
    const value = summary({
      coverage: [
        coverage("TUITION", "CHECKED_NOT_FOUND"),
        coverage("TRANSPORT", "ACCESS_FAILED"),
        coverage("TARGET_AGE_GRADE", "NEEDS_REVIEW"),
      ],
    });
    expect(summaryGap(value, "TUITION")).toEqual({
      value: "확인한 공식 안내에 없어요",
      note: "원비는 원내에 문의해 주세요.",
    });
    expect(summaryGap(value, "TRANSPORT").value).toBe(
      "공식 페이지를 불러오지 못했어요",
    );
    expect(summaryGap(value, "TARGET_AGE_GRADE").value).toBe(
      "내용을 확인하고 있어요",
    );
    expect(summaryGap(value, "INFORMATION_SESSION").value).toBe(
      "아직 확인하지 않았어요",
    );
    expect(isUncheckedSummary(value)).toBe(false);
    expect(isUncheckedSummary(summary())).toBe(true);
    expect(JSON.stringify(value)).not.toContain("정보가 없어요");
  });

  it("badges only values a parent can see on the card", () => {
    const next = session("a", "2026-11-07T01:30:00.000Z", "UPCOMING");
    expect(
      summaryBadges(
        summary({
          tuition: {
            academicYearLabel: "2026학년도",
            billingCadence: "MONTHLY",
            amountMin: 1_230_000,
            amountMax: 1_230_000,
            displayText: null,
            verifiedAt: "2026-10-21T01:00:00.000Z",
          },
          nextInformationSession: next,
          transport: {
            state: "UNKNOWN",
            serviceAreas: [],
            inquiryRequired: false,
            displayText: null,
            verifiedAt: "2026-10-21T01:00:00.000Z",
          },
        }),
      ),
    ).toEqual(["원비 확인됨", "설명회 일정 있음"]);
  });
});

describe("comparison and calendar session order", () => {
  it("prefers the next bookable session and keeps a closed one only as a fallback", () => {
    const closed = session("closed", "2026-10-22T01:30:00.000Z", "CLOSED");
    const open = session("open", "2026-10-28T01:30:00.000Z", "OPEN");
    const past = session("past", "2026-10-20T01:30:00.000Z", "OPEN");
    expect(
      compareSession(
        summary({ informationSessions: [past, closed, open] }),
        now,
      )?.id,
    ).toBe("open");
    expect(
      compareSession(summary({ informationSessions: [past, closed] }), now)?.id,
    ).toBe("closed");
    expect(compareOfficialLink(summary(), open)?.url).toBe(
      "https://example.test/open",
    );
  });

  it("lists future sessions with closed ones after the rest", () => {
    const data = {
      items: [
        {
          name: "가",
          slug: "ga",
          district: "양천구",
          englishKindergarten: summary({
            informationSessions: [
              session("ga-closed", "2026-10-22T01:30:00.000Z", "CLOSED"),
              session("ga-past", "2026-10-19T01:30:00.000Z", "UPCOMING"),
            ],
          }),
        },
        {
          name: "나",
          slug: "na",
          district: "양천구",
          englishKindergarten: summary({
            informationSessions: [
              session("na-open", "2026-11-07T01:30:00.000Z", "UPCOMING"),
            ],
          }),
        },
      ],
    } as unknown as InstitutionListDTO;
    const rows = upcomingSessionRows(data, 8, now);
    expect(rows.map((row) => row.session.id)).toEqual(["na-open", "ga-closed"]);
    expect(rows[1]?.bookingLabel).toBe("예약 마감");
  });
});
