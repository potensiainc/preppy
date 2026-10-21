import { SEOUL_REGION_CODE } from "@/src/modules/public/location";

export const EK_CHECKLIST_PATH = "/guides/english-kindergarten-checklist";
export const EK_CHECKLIST_TITLE = "영어유치원 고르기 전에 확인한 것들";
export const EK_CHECKLIST_DESCRIPTION =
  "원비, 운영 연령, 수업 시간, 셔틀, 설명회·입학 일정, 대기 여부를 기관마다 같은 기준으로 확인하는 방법과 목동 영어유치원 비교표를 정리했어요.";

export const YANGCHEON_COMPARE_HREF = "/compare/english-kindergarten/yangcheon";

export const EK_2027_SESSIONS_HREF = `/institutions?${new URLSearchParams({
  category: "ENGLISH_KINDERGARTEN",
  region: SEOUL_REGION_CODE,
  admissionYear: "2027",
  hasUpcomingInfoSession: "true",
  sort: "INFO_SESSION_ASC",
  page: "1",
}).toString()}`;

export const SEOUL_EK_LIST_HREF = `/institutions?${new URLSearchParams({
  category: "ENGLISH_KINDERGARTEN",
  region: SEOUL_REGION_CODE,
  page: "1",
}).toString()}`;
