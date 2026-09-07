import { describe, expect, it } from "vitest";

import {
  coverageMessage,
  parseCoverageStatus,
  parseEnglishKindergartenSection,
} from "@/src/modules/english-kindergarten/coverage";
import { parseReviewInsightValue } from "@/src/modules/english-kindergarten/review-insight";

describe("English-kindergarten section coverage", () => {
  it("distinguishes unresearched, not found, access failure, and review states", () => {
    expect(coverageMessage("TUITION", "NOT_RESEARCHED")).toBe(
      "원비 정보를 준비하고 있어요.",
    );
    expect(coverageMessage("TUITION", "CHECKED_NOT_FOUND")).toBe(
      "확인한 공식 안내에서 원비 정보를 찾지 못했어요.",
    );
    expect(coverageMessage("TUITION", "ACCESS_FAILED")).toBe(
      "기관 페이지를 불러오지 못해 원비를 확인하지 못했어요.",
    );
    expect(coverageMessage("TUITION", "NEEDS_REVIEW")).toBe(
      "원비 내용을 확인하고 있어요.",
    );
    expect(coverageMessage("TUITION", "CONFIRMED")).toBeNull();
  });

  it("accepts only the designed sections and coverage statuses", () => {
    expect(parseEnglishKindergartenSection("INFORMATION_SESSION")).toBe(
      "INFORMATION_SESSION",
    );
    expect(parseCoverageStatus("CHECKED_NOT_FOUND")).toBe("CHECKED_NOT_FOUND");
    expect(() => parseEnglishKindergartenSection("RANKING")).toThrow();
    expect(() => parseCoverageStatus("MISSING")).toThrow();
  });
});

describe("English-kindergarten review insights", () => {
  it("keeps neutral themes, sample size, period, and limitations together", () => {
    expect(
      parseReviewInsightValue({
        periodStart: "2026-01-01",
        periodEnd: "2026-08-31",
        reviewCount: 12,
        themes: [{ summary: "놀이 활동 언급이 반복돼요.", mentionCount: 5 }],
        limitations: "공개적으로 접근 가능한 후기만 확인했어요.",
      }),
    ).toMatchObject({ reviewCount: 12, themes: [{ mentionCount: 5 }] });
  });

  it("rejects an empty review theme", () => {
    expect(() =>
      parseReviewInsightValue({
        periodStart: null,
        periodEnd: null,
        reviewCount: 1,
        themes: [{ summary: "   " }],
        limitations: null,
      }),
    ).toThrow();
  });

  it("rejects ratings from the review insight contract", () => {
    expect(() =>
      parseReviewInsightValue({
        periodStart: null,
        periodEnd: null,
        reviewCount: 1,
        themes: [{ summary: "교사 소통 언급이 있어요.", rating: 5 }],
        limitations: null,
      }),
    ).toThrow();
  });

  it("rejects a zero-sized review sample", () => {
    expect(() =>
      parseReviewInsightValue({
        periodStart: null,
        periodEnd: null,
        reviewCount: 0,
        themes: [{ summary: "표본이 없는 요약이에요." }],
        limitations: null,
      }),
    ).toThrow();
  });
});
