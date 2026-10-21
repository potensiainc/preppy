import type {
  EnglishKindergartenCardSummaryDTO,
  EnglishKindergartenSectionDTO,
} from "@/src/modules/public/dto";

export type SummarySection =
  "TUITION" | "TARGET_AGE_GRADE" | "TRANSPORT" | "INFORMATION_SESSION";

export type SummaryGap = Readonly<{ value: string; note: string | null }>;

const inquiryNotes: Record<SummarySection, string> = {
  TUITION: "원비는 원내에 문의해 주세요.",
  TARGET_AGE_GRADE: "운영 연령은 원내에 문의해 주세요.",
  TRANSPORT: "셔틀 운행은 원내에 문의해 주세요.",
  INFORMATION_SESSION: "설명회 일정은 원내에 문의해 주세요.",
};

function coverageStatus(
  summary: Pick<EnglishKindergartenCardSummaryDTO, "coverage">,
  section: SummarySection,
): EnglishKindergartenSectionDTO["status"] | null {
  return (
    summary.coverage.find((item) => item.section === section)?.status ?? null
  );
}

export function hasSummaryValue(
  summary: EnglishKindergartenCardSummaryDTO,
  section: SummarySection,
): boolean {
  switch (section) {
    case "TUITION":
      return summary.tuition !== null;
    case "TARGET_AGE_GRADE":
      return summary.ageRange !== null;
    case "TRANSPORT":
      return (
        summary.transport.verifiedAt !== null &&
        summary.transport.state !== "UNKNOWN"
      );
    case "INFORMATION_SESSION":
      return summary.nextInformationSession !== null;
  }
}

/**
 * Explains why a card value is missing without turning "not checked" or
 * "page failed to load" into "does not exist".
 */
export function summaryGap(
  summary: EnglishKindergartenCardSummaryDTO,
  section: SummarySection,
): SummaryGap {
  const status = coverageStatus(summary, section);
  if (status === "CHECKED_NOT_FOUND") {
    return {
      value:
        section === "INFORMATION_SESSION"
          ? "확인한 공식 안내에 예정된 설명회가 없어요"
          : "확인한 공식 안내에 없어요",
      note: inquiryNotes[section],
    };
  }
  if (status === "ACCESS_FAILED") {
    return {
      value: "공식 페이지를 불러오지 못했어요",
      note: "공식 페이지에서 직접 확인해 주세요.",
    };
  }
  if (status === "NEEDS_REVIEW") {
    return { value: "내용을 확인하고 있어요", note: null };
  }
  if (status === "CONFIRMED" && section === "INFORMATION_SESSION") {
    return { value: "등록된 예정 설명회가 없어요", note: null };
  }
  return { value: "아직 확인하지 않았어요", note: null };
}

export const summarySections: readonly SummarySection[] = [
  "INFORMATION_SESSION",
  "TUITION",
  "TARGET_AGE_GRADE",
  "TRANSPORT",
];

/** True when nothing on the card has been checked yet. */
export function isUncheckedSummary(
  summary: EnglishKindergartenCardSummaryDTO,
): boolean {
  return summarySections.every((section) => {
    if (hasSummaryValue(summary, section)) return false;
    const status = coverageStatus(summary, section);
    return status === null || status === "NOT_RESEARCHED";
  });
}

export function summaryBadges(
  summary: EnglishKindergartenCardSummaryDTO,
): string[] {
  return [
    hasSummaryValue(summary, "TUITION") ? "원비 확인됨" : null,
    hasSummaryValue(summary, "INFORMATION_SESSION") ? "설명회 일정 있음" : null,
    hasSummaryValue(summary, "TARGET_AGE_GRADE") ? "운영 연령 확인됨" : null,
    hasSummaryValue(summary, "TRANSPORT") ? "셔틀 확인됨" : null,
  ].filter((badge): badge is string => badge !== null);
}
