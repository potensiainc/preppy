// 2027학년도 서울 사립초 공동 전형 일정 (서울특별시교육청 모집전형요강, 서울 사립초 입학포털).
// 날짜를 바꾸면 허브 상태 배너·타임라인·학교별 아티클 문구가 함께 바뀐다.

export const PE_HUB_PATH = "/guides/seoul-private-elementary-2027";
export const PE_HUB_TITLE = "2027 서울 사립초 원서접수·추첨·등록 일정 총정리";
export const PE_HUB_DESCRIPTION =
  "서울 사립초 38개교 2027학년도 원서접수(11/6~11/11), 전산추첨(11/16), 등록(11/17~11/19) 일정과 학교별 모집 정보를 한곳에서 확인하세요.";
export const PE_PORTAL_URL = "https://www.kspesa.com";

export type PeHubStep = Readonly<{
  id: "apply" | "lottery" | "register";
  label: string;
  start: string; // ISO with +09:00
  end: string;
  when: string; // display text
  detail: string;
}>;

export const PE_HUB_STEPS: readonly PeHubStep[] = [
  {
    id: "apply",
    label: "원서접수",
    start: "2026-11-06T09:00:00+09:00",
    end: "2026-11-11T16:30:00+09:00",
    when: "11월 6일(금) 09:00 ~ 11월 11일(수) 16:30",
    detail: "서울 사립초 입학포털에서 온라인 접수 · 최대 3개교 · 학교당 전형료 3만 원",
  },
  {
    id: "lottery",
    label: "전산추첨",
    start: "2026-11-16T11:00:00+09:00",
    end: "2026-11-16T12:00:00+09:00",
    when: "11월 16일(월) 11:00",
    detail: "입학포털 전산추첨 · 결과는 지원 학교 안내에 따라 확인",
  },
  {
    id: "register",
    label: "당첨자 등록",
    start: "2026-11-17T09:00:00+09:00",
    end: "2026-11-19T16:30:00+09:00",
    when: "11월 17일(화) 09:00 ~ 11월 19일(목) 16:30",
    detail: "여러 곳에 당첨돼도 한 학교에만 등록 · 중복 등록하면 입학이 취소될 수 있어요",
  },
];

export const PE_HUB_FAQ: readonly Readonly<{ q: string; a: string }>[] = [
  {
    q: "몇 개 학교까지 지원할 수 있나요?",
    a: "한 아이당 최대 3개교까지 지원할 수 있어요. 접수는 학교 홈페이지가 아니라 서울 사립초 입학포털 한 곳에서 해요.",
  },
  {
    q: "전형료는 얼마인가요?",
    a: "학교당 3만 원(수수료 포함)이에요. 3개교에 모두 지원하면 9만 원이고, 접수한 전형료는 돌려받을 수 없어요.",
  },
  {
    q: "어떻게 선발하나요?",
    a: "시험이나 면접 없이 전산추첨으로 정해요. 11월 16일 오전 11시 서울시교육청에서 추첨하고 유튜브로 생중계해요. 재학생 형제자매 우선권은 본 추첨에 적용되지 않아요.",
  },
  {
    q: "여러 학교에 당첨되면 어떻게 하나요?",
    a: "등록 기간 안에 한 학교만 골라 등록해요. 여러 학교에 등록하면 등록한 모든 학교의 입학이 취소될 수 있어요.",
  },
  {
    q: "쌍둥이는 어떻게 추첨하나요?",
    a: "각자 추첨과 대표 추첨 중에서 고를 수 있어요. 대표 추첨에 당첨되면 함께 지원한 아동은 정원 외 허용 인원(승인 정원의 3% 범위) 안에서 입학할 수 있어요.",
  },
  {
    q: "대상 아동은 누구인가요?",
    a: "2027학년도 입학 대상은 2020년생 취학 적령 아동이에요. 조기입학·취학 유예 아동의 지원 가능 여부는 학교별 모집요강을 확인하세요.",
  },
];

export const PE_HUB_SOURCES: readonly Readonly<{ name: string; url: string }>[] =
  [
    { name: "서울 사립초 입학포털", url: PE_PORTAL_URL },
    { name: "서울특별시교육청", url: "https://www.sen.go.kr" },
  ];
