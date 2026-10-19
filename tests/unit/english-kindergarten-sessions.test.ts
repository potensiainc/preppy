import { describe, it, expect } from "vitest";
import { normalizeCampusLocation } from "@/src/modules/english-kindergarten/campus-location";
import {
  sessionTargetsAge,
  sessionActionLabel,
  sessionBookingLabel,
  sessionEventLabel,
} from "@/src/modules/english-kindergarten/session-state";
import {
  sessionSlug,
  sessionPackageSchema,
} from "@/src/modules/english-kindergarten/session-package";
import type { EnglishKindergartenInformationSessionDTO as Session } from "@/src/modules/public/dto";
const base = {
  id: "one",
  slug: "one",
  title: "설명회",
  eventStartsAt: "2026-10-24T10:00:00+09:00",
  businessState: "UNKNOWN",
  applicationClosesAt: null,
  actionUrl: null,
  verifiedAt: "2026-10-18T16:00:00+09:00",
  lastCollectedAt: null,
  officialSource: null,
} satisfies Session;
describe("reviewed English-kindergarten sessions", () => {
  it("normalizes official address variants without inferring from campus name", () => {
    expect(
      normalizeCampusLocation(
        "서울특별시 양천구 목동동로12길 20",
        "서울특별시 양천구",
      ),
    ).toEqual({ regionCode: "KR-11", district: "양천구" });
    expect(
      normalizeCampusLocation("서울 중구 다산로 162", "서울 중구"),
    ).toEqual({ regionCode: "KR-11", district: "중구" });
    expect(
      normalizeCampusLocation("경기도 부천시 옥길로", "경기 부천시"),
    ).toEqual({ regionCode: "KR-41", district: null });
    expect(normalizeCampusLocation("", "목동캠퍼스")).toEqual({
      regionCode: null,
      district: null,
    });
  });
  it("searches only normalized institution ages, never quoted exclusions or birth years", () => {
    const text =
      "2027학년도 · 기관 표기 5세, 6세 · 대상 원문: 7세 제외, 2021년생 문의";
    expect(sessionTargetsAge(text, 5)).toBe(true);
    expect(sessionTargetsAge(text, 6)).toBe(true);
    expect(sessionTargetsAge(text, 7)).toBe(false);
    expect(sessionTargetsAge("만 3~5세 (2021~2023년생)", 5)).toBe(false);
  });
  it("keeps identity stable when event date changes", () => {
    const row = {
      institutionSlug: "ecc-mokdong",
      academicYear: 2027,
      sessionKey: "official-ecc-123",
    };
    expect(sessionSlug({ ...row })).toBe(
      "ecc-mokdong-briefing-2027-official-ecc-123",
    );
    expect(
      sessionPackageSchema.safeParse({
        schemaVersion: 1,
        packageId: "empty",
        sources: [],
        sessions: [],
      }).success,
    ).toBe(false);
  });
  it("does not infer reservable seats and keeps booking separate from event time", () => {
    const now = new Date("2026-10-18T16:00:00+09:00");
    expect(sessionBookingLabel(base, now)).toBe("예약 상태 확인 필요");
    expect(sessionBookingLabel({ ...base, businessState: "CLOSED" }, now)).toBe(
      "예약 마감",
    );
    expect(sessionEventLabel({ ...base, businessState: "CLOSED" }, now)).toBe(
      "개최 예정",
    );
    expect(
      sessionBookingLabel(
        { ...base, applicationClosesAt: now.toISOString() },
        now,
      ),
    ).toBe("예약 마감");
    expect(
      sessionBookingLabel({ ...base, businessState: "OPEN" }, now),
    ).toContain("잔여석 확인 필요");
  });
  it("labels consultation and contact destinations truthfully", () => {
    expect(
      sessionActionLabel("https://slp.ac.kr/admission/consultation", false),
    ).toContain("입학상담");
    expect(sessionActionLabel("https://pf.kakao.com/abc", false)).toContain(
      "카카오 채널",
    );
    expect(
      sessionActionLabel("https://www.ybmecc.com/nowon/notice/430388", false),
    ).toContain("설명회 안내");
    expect(
      sessionActionLabel(
        "https://docs.google.com/forms/d/e/abc/viewform",
        false,
      ),
    ).toContain("신청 페이지");
    expect(sessionActionLabel("https://example.test/unknown", false)).toBe(
      "공식 안내 페이지 열기",
    );
  });
});
