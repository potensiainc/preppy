// Only explicit guide/schedule qualifications count. "취학 예정 아동" and
// an upcoming business state do not mean an official guide is provisional.
export function isProvisionalAdmissionGuidance(value: string): boolean {
  return /예정\s*안내\s*·\s*변경\s*가능\s*:|(?:모집\s*(?:전형\s*)?요강|입학\s*안내|전형\s*요강|일정|계획|입학\s*설명회|추첨)\s*(?:\d+\s*)?[（(]\s*(?:예정|안|초안)\s*[）)]|(?:모집\s*(?:전형\s*)?요강|일정)\s*(?:은|이)?\s*(?:잠정|예정안)|\b(?:tentative|provisional|draft)\b/iu.test(
    value,
  );
}

export const PROVISIONAL_ADMISSION_NOTICE =
  "예정 안내 · 변경 가능: 공식 원문의 예정·초안 정보입니다. 지원 전 최종 공지를 확인해 주세요.";
