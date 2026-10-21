import { sessionBookingLabel } from "@/src/modules/english-kindergarten/session-state";
import type {
  EnglishKindergartenCardSummaryDTO,
  EnglishKindergartenInformationSessionDTO,
} from "@/src/modules/public/dto";
import type { SeoulDistrict } from "@/src/modules/public/location";

export const compareDistricts = {
  yangcheon: {
    district: "양천구",
    heading: "목동(양천구) 영어유치원 비교",
    areaLabel: "목동(양천구)",
    analyticsDistrict: "YANGCHEON",
  },
  gangnam: {
    district: "강남구",
    heading: "강남구 영어유치원 비교",
    areaLabel: "강남구",
    analyticsDistrict: "GANGNAM",
  },
  seocho: {
    district: "서초구",
    heading: "서초구 영어유치원 비교",
    areaLabel: "서초구",
    analyticsDistrict: "SEOCHO",
  },
  songpa: {
    district: "송파구",
    heading: "송파구 영어유치원 비교",
    areaLabel: "송파구",
    analyticsDistrict: "SONGPA",
  },
} as const satisfies Record<
  string,
  {
    district: SeoulDistrict;
    heading: string;
    areaLabel: string;
    analyticsDistrict: "YANGCHEON" | "GANGNAM" | "SEOCHO" | "SONGPA";
  }
>;

export type CompareDistrictKey = keyof typeof compareDistricts;

export function isCompareDistrictKey(
  value: string,
): value is CompareDistrictKey {
  return Object.hasOwn(compareDistricts, value);
}

function isBookable(
  session: EnglishKindergartenInformationSessionDTO,
  now: Date,
): boolean {
  const label = sessionBookingLabel(session, now);
  return label !== "예약 마감" && label !== "행사 취소";
}

/**
 * The session a parent can still act on comes first; a closed session is shown
 * only when no bookable one is listed, and it keeps its 마감 label.
 */
export function compareSession(
  summary: EnglishKindergartenCardSummaryDTO,
  now = new Date(),
): EnglishKindergartenInformationSessionDTO | null {
  const sessions = (
    summary.informationSessions ??
    (summary.nextInformationSession ? [summary.nextInformationSession] : [])
  ).filter((session) => new Date(session.eventStartsAt) > now);
  return (
    sessions.find((session) => isBookable(session, now)) ?? sessions[0] ?? null
  );
}

export function compareOfficialLink(
  summary: EnglishKindergartenCardSummaryDTO,
  session: EnglishKindergartenInformationSessionDTO | null,
): { name: string; url: string } | null {
  if (session?.officialSource) return session.officialSource;
  const official = summary.coverage.find(
    (item) =>
      item.source !== null && item.source.authorityLevel !== "DISCOVERY_ONLY",
  )?.source;
  return official ? { name: official.name, url: official.url } : null;
}
