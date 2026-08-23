import type {
  ArticleCategory,
  ArticleType,
  InstitutionCategory,
  InstitutionFactType,
  OpportunityBusinessState,
  OpportunityKind,
} from "@/src/db/schema";

const categoryLabels: Record<InstitutionCategory | ArticleCategory, string> = {
  ENGLISH_KINDERGARTEN: "영어유치원",
  PRIVATE_ELEMENTARY: "사립초등학교",
  INTERNATIONAL_SCHOOL: "국제학교",
  ADMISSIONS_GENERAL: "입학 일반",
};

const homeCategoryLabels: Record<InstitutionCategory, string> = {
  ENGLISH_KINDERGARTEN: "영유",
  PRIVATE_ELEMENTARY: "사립초",
  INTERNATIONAL_SCHOOL: "국제학교",
};

const opportunityKindLabels: Record<OpportunityKind, string> = {
  RECRUITMENT: "모집",
  ADDITIONAL_RECRUITMENT: "추가 모집",
  INFORMATION_SESSION: "입학설명회",
  CONSULTATION: "상담",
  LEVEL_TEST: "레벨 테스트",
  OPEN_HOUSE: "오픈하우스",
  APPLICATION: "지원",
  DOCUMENT_SUBMISSION: "서류 제출",
  ASSESSMENT: "평가",
  INTERVIEW: "인터뷰",
  LOTTERY: "추첨",
  RESULT_ANNOUNCEMENT: "결과 발표",
  REGISTRATION: "등록",
  DEADLINE: "마감일",
  OTHER: "안내",
};

const opportunityStateLabels: Record<OpportunityBusinessState, string> = {
  UPCOMING: "예정",
  OPEN: "모집 중",
  CLOSED: "마감",
  COMPLETED: "종료",
  CANCELLED: "취소",
  UNKNOWN: "확인 중",
};

const factLabels: Record<InstitutionFactType, string> = {
  TUITION: "교육비",
  TARGET_AGE_GRADE: "대상 연령/학년",
  CURRICULUM: "커리큘럼",
  ELIGIBILITY: "지원 자격",
  TRANSPORT: "통학",
  ADMISSION_PROCESS: "입학 절차",
  OPERATING_INFO: "운영 정보",
};

const articleTypeLabels: Record<ArticleType, string> = {
  GUIDE: "가이드",
  UPDATE: "업데이트",
  ROUNDUP: "모아보기",
};

const publicDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const localCalendarDatePattern =
  /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)?$/;

function formatLocalCalendarDate(value: string): string | null {
  const match = localCalendarDatePattern.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}년 ${month}월 ${day}일`;
}

export function categoryLabel(
  value: InstitutionCategory | ArticleCategory,
): string {
  return categoryLabels[value];
}

export function homeCategoryLabel(value: InstitutionCategory): string {
  return homeCategoryLabels[value];
}

export function opportunityKindLabel(value: OpportunityKind): string {
  return opportunityKindLabels[value];
}

export function opportunityStateLabel(value: OpportunityBusinessState): string {
  return opportunityStateLabels[value];
}

export function factLabel(value: InstitutionFactType): string {
  return factLabels[value];
}

export function articleTypeLabel(value: ArticleType): string {
  return articleTypeLabels[value];
}

export function formatPublicDate(value: string): string {
  const localCalendarDate = formatLocalCalendarDate(value);
  if (localCalendarDate) return localCalendarDate;

  return publicDateFormatter.format(new Date(value));
}

export function safeExternalHref(value: string): string | null {
  if (value.trim() !== value) return null;

  try {
    const destination = new URL(value);
    if (
      (destination.protocol !== "http:" && destination.protocol !== "https:") ||
      !destination.hostname
    ) {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}
