import type { EnglishKindergartenInformationSessionDTO } from "@/src/modules/public/dto";

/** Institution-labelled ages for the stated admission year, never inferred international age. */
export function sessionTargetsAge(
  audience: string | null | undefined,
  age: number,
): boolean {
  return Boolean(audience && new RegExp(sessionAgePattern(age)).test(audience));
}

/** Only the reviewed normalization is searchable; numbers in quoted conditions are not eligibility. */
export function sessionAgePattern(age: number): string {
  return `^[0-9]{4}학년도 · 기관 표기 ([3-7]세, )*${age}세(, | ·)`;
}

export function sessionActionLabel(url: string, closed: boolean): string {
  const parsed = new URL(url);
  if (parsed.pathname.includes("/admission/consultation"))
    return "공식 입학상담 페이지 열기";
  if (parsed.hostname === "pf.kakao.com") return "공식 카카오 채널 열기";
  if (
    parsed.pathname.includes("/notice/") ||
    parsed.hostname.includes("blog.naver.com")
  )
    return "공식 설명회 안내 보기";
  if (
    parsed.hostname === "docs.google.com" ||
    parsed.hostname === "forms.gle" ||
    parsed.hostname === "naver.me" ||
    parsed.pathname.includes("presentation") ||
    parsed.pathname.includes("admissionLandingPage")
  )
    return closed ? "공식 마감·대기 안내 보기" : "공식 신청 페이지 열기";
  return "공식 안내 페이지 열기";
}

export function sessionBookingLabel(
  session: EnglishKindergartenInformationSessionDTO,
  now = new Date(),
): string {
  if (session.businessState === "CANCELLED") return "행사 취소";
  if (
    session.businessState === "CLOSED" ||
    (session.applicationClosesAt &&
      new Date(session.applicationClosesAt) <= now)
  )
    return "예약 마감";
  if (session.applicationOpensAt && new Date(session.applicationOpensAt) > now)
    return "예약 시작 전";
  return session.businessState === "OPEN"
    ? "공식 안내상 접수 중 · 잔여석 확인 필요"
    : "예약 상태 확인 필요";
}

export function sessionEventLabel(
  session: EnglishKindergartenInformationSessionDTO,
  now = new Date(),
): string {
  if (session.businessState === "CANCELLED") return "행사 취소";
  if (new Date(session.eventStartsAt) > now) return "개최 예정";
  return session.eventEndsAt && new Date(session.eventEndsAt) <= now
    ? "행사 종료"
    : "시작 시각 지남 · 종료 시각 확인 필요";
}
