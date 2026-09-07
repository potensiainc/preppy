import { z } from "zod";

export const englishKindergartenSectionValues = [
  "TUITION",
  "INFORMATION_SESSION",
  "TARGET_AGE_GRADE",
  "CURRICULUM",
  "TRANSPORT",
  "MEALS",
  "REVIEWS",
  "OPERATING_INFO",
] as const;

export type EnglishKindergartenSection =
  (typeof englishKindergartenSectionValues)[number];

export const coverageStatusValues = [
  "NOT_RESEARCHED",
  "CONFIRMED",
  "CHECKED_NOT_FOUND",
  "ACCESS_FAILED",
  "NEEDS_REVIEW",
] as const;

export type CoverageStatus = (typeof coverageStatusValues)[number];

const sectionSchema = z.enum(englishKindergartenSectionValues);
const coverageStatusSchema = z.enum(coverageStatusValues);

const sectionLabels: Record<EnglishKindergartenSection, string> = {
  TUITION: "원비",
  INFORMATION_SESSION: "설명회",
  TARGET_AGE_GRADE: "운영 연령",
  CURRICULUM: "커리큘럼",
  TRANSPORT: "셔틀",
  MEALS: "급식",
  REVIEWS: "후기",
  OPERATING_INFO: "운영 정보",
};

export function parseEnglishKindergartenSection(
  value: unknown,
): EnglishKindergartenSection {
  return sectionSchema.parse(value);
}

export function parseCoverageStatus(value: unknown): CoverageStatus {
  return coverageStatusSchema.parse(value);
}

export function coverageMessage(
  section: EnglishKindergartenSection,
  status: CoverageStatus,
): string | null {
  if (status === "CONFIRMED") return null;

  const label = sectionLabels[section];
  if (status === "NOT_RESEARCHED") {
    return `${label} 정보를 준비하고 있어요.`;
  }
  if (status === "NEEDS_REVIEW") {
    return `${label} 내용을 확인하고 있어요.`;
  }
  if (section === "REVIEWS") {
    return status === "CHECKED_NOT_FOUND"
      ? "확인한 후기에서 반복되는 내용을 찾지 못했어요."
      : "후기 출처를 불러오지 못해 후기 내용을 확인하지 못했어요.";
  }
  if (status === "CHECKED_NOT_FOUND") {
    return `확인한 공식 안내에서 ${label} 정보를 찾지 못했어요.`;
  }
  return `기관 페이지를 불러오지 못해 ${label}를 확인하지 못했어요.`;
}
