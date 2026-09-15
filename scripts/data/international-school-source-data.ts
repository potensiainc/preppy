import { createHash } from "node:crypto";
import type { z } from "zod";

import { englishKindergartenSectionValues } from "../../src/modules/english-kindergarten/coverage";
import { importSnapshotSchema } from "../../src/modules/international-school-import/artifact-schema";
import type {
  CandidateArtifactRecord,
  EvidenceArtifactRecord,
  InternationalSchoolProgress,
  InstitutionArtifactRecord,
  SocialEvidenceArtifactRecord,
  SpecialAccessArtifactRecord,
} from "../../src/modules/international-school-import/artifact-schema";

type InternationalSchoolImportSnapshotInput = z.input<typeof importSnapshotSchema>;

export const INTERNATIONAL_SCHOOL_PACKAGE_ID = "sg-is-20260915-r01";
export const INTERNATIONAL_SCHOOL_AS_OF = "2026-09-15";
export const INTERNATIONAL_SCHOOL_COLLECTED_AT = "2026-09-15T03:00:00.000Z";
export const INTERNATIONAL_SCHOOL_TARGET_YEAR = "2026–27";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deterministicUuid(value: string): string {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type SchoolSeed = readonly [
  registryExternalId: `ST01:${number}`,
  canonicalNameKo: string,
  canonicalNameEn: string,
  slug: string,
  regionCode: "11" | "41",
  city: "서울특별시" | "경기도",
  district: string | null,
  addressLine: string | null,
  websiteUrl: `https://${string}`,
  aliases?: readonly string[],
];

const SCHOOL_SEEDS = [
  ["ST01:1", "한국외국인학교 서울캠퍼스", "Korea International School Seoul Campus", "korea-international-school-seoul", "11", "서울특별시", "강남구", "서울특별시 강남구 개포로 408", "https://kisseoul.or.kr", ["KIS 서울"]],
  ["ST01:3", "한국켄트외국인학교", "Korea Kent Foreign School", "korea-kent-foreign-school", "11", "서울특별시", "광진구", "서울특별시 광진구 자양로35길 13", "https://www.kkfs.org", ["KKFS"]],
  ["ST01:4", "아시아퍼시픽국제외국인학교", "Asia Pacific International School Seoul", "asia-pacific-international-school-seoul", "11", "서울특별시", "노원구", "서울특별시 노원구 월계로45가길 57", "https://www.apis.org", ["APIS Seoul"]],
  ["ST01:5", "서울외국인학교", "Seoul Foreign School", "seoul-foreign-school", "11", "서울특별시", "서대문구", "서울특별시 서대문구 연희로22길 39", "https://www.seoulforeign.org", ["SFS"]],
  ["ST01:6", "코리아외국인학교", "Korea Foreign School", "korea-foreign-school", "11", "서울특별시", null, null, "https://koreaforeign.org", ["KFS"]],
  ["ST01:10", "서울용산국제학교", "Yongsan International School of Seoul", "yongsan-international-school-of-seoul", "11", "서울특별시", "용산구", "서울특별시 용산구 이태원로 285", "https://www.yisseoul.org", ["YISS"]],
  ["ST01:13", "한국영등포화교소학교", "Yeongdeungpo Korea Chinese Primary School", "yeongdeungpo-korea-chinese-primary-school", "11", "서울특별시", "영등포구", "서울특별시 영등포구 경인로88길 9", "https://yongxiao.kr", []],
  ["ST01:14", "한국한성화교중고등학교", "Overseas Chinese High School Seoul Korea", "overseas-chinese-high-school-seoul", "11", "서울특별시", "서대문구", "서울특별시 서대문구 연희로 176", "https://www.scs.or.kr", []],
  ["ST01:15", "한국한성화교소학교", "Seoul Chinese Primary School", "seoul-chinese-primary-school", "11", "서울특별시", "중구", "서울특별시 중구 명동2길 35", "https://www.hanxiao.or.kr", []],
  ["ST01:16", "서울프랑스학교", "Lycee Francais de Seoul", "lycee-francais-de-seoul", "11", "서울특별시", "서초구", "서울특별시 서초구 서래로 7", "https://www.lfseoul.org", ["LFS"]],
  ["ST01:17", "하비에르 국제학교", "Lycee International Xavier", "lycee-international-xavier", "11", "서울특별시", "종로구", "서울특별시 종로구 비봉길 23", "https://www.xavier.sc.kr", ["LIX"]],
  ["ST01:18", "서울일본인학교", "Japanese School in Seoul", "japanese-school-in-seoul", "11", "서울특별시", "마포구", "서울특별시 마포구 월드컵북로62길 11", "https://www.sjs.or.kr", []],
  ["ST01:19", "서울독일학교", "Deutsche Schule Seoul International", "deutsche-schule-seoul-international", "11", "서울특별시", "용산구", "서울특별시 용산구 독서당로 123-6", "https://www.dsseoul.org", ["DSSI"]],
  ["ST01:20", "재한몽골학교", "International Mongolian School", "international-mongolian-school", "11", "서울특별시", "광진구", "서울특별시 광진구 광장로 1", "https://www.mongolschool.org", []],
  ["ST01:32", "한국외국인학교 판교캠퍼스", "Korea International School Pangyo Campus", "korea-international-school-pangyo", "41", "경기도", "성남시 분당구", "경기도 성남시 분당구 대왕판교로385번길 27", "https://www.kis.or.kr", ["KIS 판교"]],
  ["ST01:33", "서울국제학교", "Seoul International School", "seoul-international-school", "41", "경기도", "성남시 수정구", "경기도 성남시 수정구 성남대로1518번길 15", "https://www.siskorea.org", ["SIS"]],
  ["ST01:34", "경기수원외국인학교", "Gyeonggi Suwon International School", "gyeonggi-suwon-international-school", "41", "경기도", "수원시 영통구", "경기도 수원시 영통구 영통로 451", "https://www.gsis.sc.kr", ["GSIS"]],
  ["ST01:36", "국제 크리스쳔학교", "International Christian School Uijeongbu", "international-christian-school-uijeongbu", "41", "경기도", "의정부시", "경기도 의정부시 진등로 28", "https://www.icsu.kr", ["ICSU"]],
  ["ST01:38", "수원화교중정소학교", "Suwon Chinese International School", "suwon-chinese-international-school", "41", "경기도", "수원시 팔달구", "경기도 수원시 팔달구 효원로85번길 62-7", "https://www.scis.sc.kr", []],
  ["ST01:56", "덜위치칼리지서울영국학교", "Dulwich College Seoul", "dulwich-college-seoul", "11", "서울특별시", "서초구", "서울특별시 서초구 신반포로15길 6", "https://www.dulwich.org", ["Dulwich Seoul"]],
  ["ST01:57", "평택크리스천외국인학교", "International Christian School Pyeongtaek", "pyeongtaek-international-christian-school", "41", "경기도", "평택시", "경기도 평택시 신대고잔길 53", "https://www.icsptk.org", ["ICSP"]],
  ["ST01:76", "서울드와이트외국인학교", "Dwight School Seoul", "dwight-school-seoul", "11", "서울특별시", "마포구", "서울특별시 마포구 월드컵북로62길 21", "https://www.dwight.or.kr", ["DSS"]],
] as const satisfies readonly SchoolSeed[];

export const OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS = SCHOOL_SEEDS.map(
  ([id, ko, en, slug, regionCode, city, district, addressLine, url, aliases = []]) => ({
    recordId: `official-${id.slice(5).padStart(3, "0")}`,
    registryName: "ISI" as const,
    registryExternalId: id,
    canonicalNameKo: ko,
    canonicalNameEn: en,
    aliases: [...aliases],
    slug,
    category: "INTERNATIONAL_SCHOOL" as const,
    internationalSubtype: "FOREIGN_SCHOOL" as const,
    operationalState: "ACTIVE" as const,
    publicationState: "DRAFT" as const,
    regionCode,
    city,
    district,
    addressLine,
    websiteUrl: url,
    registryRecordUrl: `https://www.isi.go.kr/schl/info/SinfoView.do?schoolId=${id.slice(5)}&schoolType=ST01`,
    officialMainUrl: url,
    addressConflict:
      id === "ST01:6"
        ? {
            status: "NEEDS_REVIEW" as const,
            values: [
              { addressLine: "서울특별시 서초구 남부순환로364길 7-16", evidenceId: "kfs-address-isi" },
              { addressLine: "서울특별시 강남구 역삼로 509", evidenceId: "kfs-address-official" },
            ],
          }
        : null,
    collectedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT,
  }),
) satisfies readonly InstitutionArtifactRecord[];

function evidence(
  value: Omit<EvidenceArtifactRecord, "collectedAt" | "observedAt" | "sourceObservationRef" | "sourceSnapshotId" | "sourceContentSha256">,
): EvidenceArtifactRecord {
  return {
    ...value,
    collectedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT,
    observedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT,
    sourceObservationRef: `obs-${value.evidenceId}`,
    sourceSnapshotId: deterministicUuid(`snapshot:${value.evidenceId}`),
    sourceContentSha256: sha256(value.excerpt ?? ""),
  };
}

const IDENTITY_EVIDENCE = OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS.map((school) =>
  evidence({
    evidenceId: `isi-identity-${school.registryExternalId.slice(5)}`,
    institutionRegistryId: school.registryExternalId,
    claimType: "IDENTITY",
    field: "IDENTITY",
    sourceName: "대한민국 국제학교 정보 ISI",
    sourceUrl: school.registryRecordUrl,
    finalUrl: school.registryRecordUrl,
    sourceType: "OFFICIAL_REGISTRY",
    authorityLevel: "PRIMARY",
    status: "VERIFIED",
    excerpt: `ISI 등록부에서 ${school.canonicalNameKo}의 등록키와 소재지를 확인했어요.`,
    academicYearLabel: null,
    observedValueJson: { registryExternalId: school.registryExternalId, canonicalNameKo: school.canonicalNameKo, city: school.city },
    publicNote: null,
    internalNote: null,
  }),
);

const CURRENT_TUITION_SOURCES = [
  ["ST01:1", "https://kisseoul.or.kr"], ["ST01:3", "https://www.kkfs.org"],
  ["ST01:4", "https://webhard.apis.seoul.kr/admissions_tuition_and_fees.php"],
  ["ST01:5", "https://www.seoulforeign.org/admissions/tuition-and-fees"],
  ["ST01:6", "https://koreaforeign.org"], ["ST01:16", "https://www.lfseoul.org"],
  ["ST01:19", "https://www.dsseoul.org"], ["ST01:32", "https://www.kis.or.kr"],
  ["ST01:33", "https://www.siskorea.org"], ["ST01:34", "https://www.gsis.sc.kr"],
  ["ST01:36", "https://www.icsu.kr/tuitionfees"], ["ST01:56", "https://www.dulwich.org"],
  ["ST01:76", "https://www.dwight.or.kr"],
] as const;

const TUITION_EVIDENCE = CURRENT_TUITION_SOURCES.map(([id, url]) =>
  evidence({
    evidenceId: `tuition-${id.slice(5)}`,
    institutionRegistryId: id,
    claimType: "FACT",
    field: "TUITION",
    sourceName: "학교 공식 학비 안내",
    sourceUrl: url,
    finalUrl: url,
    sourceType: "OFFICIAL_SCHOOL_PAGE",
    authorityLevel: "PRIMARY",
    status: "VERIFIED",
    excerpt: id === "ST01:4" || id === "ST01:5"
      ? "2026–27학년도 학비는 학년군별 KRW 금액과 USD 금액으로 나뉘어 안내돼 있어요."
      : "학교 공식 안내에서 2026–27학년도 학비 기준을 확인했어요.",
    academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
    observedValueJson: { academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR, currencyHandling: "원화와 외화를 합산하지 않음" },
    publicNote: null,
    internalNote: id === "ST01:4" || id === "ST01:5"
      ? "구조화 학비 사실까지 반입해요."
      : "학비표 원문은 확인했지만 이번 MVP 스냅샷에서는 구조화 금액을 보류해요.",
  }),
);

const REVIEW_EVIDENCE: EvidenceArtifactRecord[] = [
  evidence({
    evidenceId: "kfs-address-isi", institutionRegistryId: "ST01:6", claimType: "IDENTITY", field: "IDENTITY",
    sourceName: "ISI 등록 주소", sourceUrl: "https://www.isi.go.kr/schl/info/SinfoView.do?schoolId=6&schoolType=ST01",
    finalUrl: "https://www.isi.go.kr/schl/info/SinfoView.do?schoolId=6&schoolType=ST01", sourceType: "OFFICIAL_REGISTRY",
    authorityLevel: "PRIMARY", status: "NEEDS_REVIEW", excerpt: "ISI 등록부에는 서울특별시 서초구 소재 주소가 기재돼 있어요.",
    academicYearLabel: null, observedValueJson: { addressLine: "서울특별시 서초구 남부순환로364길 7-16" },
    publicNote: null, internalNote: "학교 공식 사이트의 현재 주소와 달라 자동 반입하지 않아요.",
  }),
  evidence({
    evidenceId: "kfs-address-official", institutionRegistryId: "ST01:6", claimType: "IDENTITY", field: "IDENTITY",
    sourceName: "Korea Foreign School 공식 위치 안내", sourceUrl: "https://koreaforeign.org/directions-to-kfs",
    finalUrl: "https://koreaforeign.org/directions-to-kfs", sourceType: "OFFICIAL_SCHOOL_PAGE", authorityLevel: "PRIMARY",
    status: "NEEDS_REVIEW", excerpt: "학교 공식 위치 안내에는 서울특별시 강남구 역삼로 509가 기재돼 있어요.",
    academicYearLabel: null, observedValueJson: { addressLine: "서울특별시 강남구 역삼로 509" },
    publicNote: null, internalNote: "ISI 주소와 달라 자동 반입하지 않아요.",
  }),
  evidence({
    evidenceId: "apis-tls-warning", institutionRegistryId: "ST01:4", claimType: "OPERATION", field: "OPERATING_INFO",
    sourceName: "APIS 공식 사이트", sourceUrl: "https://www.apis.org", finalUrl: "https://www.apis.org",
    sourceType: "OFFICIAL_SCHOOL_PAGE", authorityLevel: "PRIMARY", status: "VERIFIED_WITH_WARNING", excerpt: null,
    academicYearLabel: null, observedValueJson: { reachableWithWarning: true }, publicNote: null,
    internalNote: "수집 시 TLS 인증서 경고가 있어 성공 상태로 승격하지 않아요.",
  }),
  evidence({
    evidenceId: "yiss-tuition-not-found", institutionRegistryId: "ST01:10", claimType: "FACT", field: "TUITION",
    sourceName: "YISS 공식 입학 안내", sourceUrl: "https://www.yisseoul.org", finalUrl: "https://www.yisseoul.org",
    sourceType: "OFFICIAL_SCHOOL_PAGE", authorityLevel: "PRIMARY", status: "NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES",
    excerpt: null, academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR, observedValueJson: null,
    publicNote: "확인한 학교 공식 안내에서 학비 정보를 찾지 못했어요.", internalNote: "미발표로 해석하지 않아요.",
  }),
  evidence({
    evidenceId: "icsp-tuition-date-limited", institutionRegistryId: "ST01:57", claimType: "FACT", field: "TUITION",
    sourceName: "ICSP 공식 학비 안내", sourceUrl: "https://www.icsptk.org", finalUrl: "https://www.icsptk.org",
    sourceType: "OFFICIAL_SCHOOL_PAGE", authorityLevel: "PRIMARY", status: "VERIFIED_WITH_DATE_LIMIT",
    excerpt: "확인된 학비 안내의 기준은 2025–26학년도예요.", academicYearLabel: "2025–26",
    observedValueJson: { academicYearLabel: "2025–26" },
    publicNote: "이 정보는 2025–26학년도 안내예요. 2026–27학년도에는 달라질 수 있어요.",
    internalNote: "현재 학년도 사실로 승격하지 않아요.",
  }),
  evidence({
    evidenceId: "suwon-chinese-tuition-access-failed", institutionRegistryId: "ST01:38", claimType: "FACT", field: "TUITION",
    sourceName: "수원화교중정소학교 공식 사이트", sourceUrl: "https://www.scis.sc.kr", finalUrl: "https://www.scis.sc.kr",
    sourceType: "OFFICIAL_SCHOOL_PAGE", authorityLevel: "PRIMARY", status: "ACCESS_FAILED", excerpt: null,
    academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR, observedValueJson: null,
    publicNote: "학교 페이지를 불러오지 못해 학비를 확인하지 못했어요.",
    internalNote: "주소 충돌과 페이지 접근 실패는 별도 이슈로 관리해요.",
  }),
  evidence({
    evidenceId: "kis-pangyo-open-house-page", institutionRegistryId: "ST01:32", claimType: "OPPORTUNITY",
    field: "INFORMATION_SESSION", sourceName: "KIS 판교 공식 오픈하우스 안내",
    sourceUrl: "https://www.kis.or.kr/admissions/open-house", finalUrl: "https://www.kis.or.kr/admissions/open-house",
    sourceType: "OFFICIAL_ADMISSION_PAGE", authorityLevel: "PRIMARY", status: "NEEDS_REVIEW",
    excerpt: "공식 오픈하우스 페이지에는 9월 29일 오전 10시 시작으로 안내돼 있어요.",
    academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
    observedValueJson: { date: "2026-09-29", startTime: "10:00", timezone: "Asia/Seoul" },
    publicNote: "학교 안내에 적힌 시간이 서로 달라요. 정확한 시간은 학교에 확인해 주세요.",
    internalNote: "학교 캘린더에는 오전 9시 시작으로 표시돼 행사 레코드를 만들지 않아요.",
  }),
  evidence({
    evidenceId: "kis-pangyo-open-house-calendar", institutionRegistryId: "ST01:32", claimType: "OPPORTUNITY",
    field: "INFORMATION_SESSION", sourceName: "KIS 판교 공식 캘린더",
    sourceUrl: "https://www.kis.or.kr/academics/high-school", finalUrl: "https://www.kis.or.kr/academics/high-school",
    sourceType: "OFFICIAL_SCHOOL_PAGE", authorityLevel: "PRIMARY", status: "NEEDS_REVIEW",
    excerpt: "공식 캘린더에는 9월 29일 오전 9시 시작으로 표시돼 있어요.", academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
    observedValueJson: { date: "2026-09-29", startTime: "09:00", timezone: "Asia/Seoul" },
    publicNote: "학교 안내에 적힌 시간이 서로 달라요. 정확한 시간은 학교에 확인해 주세요.",
    internalNote: "오픈하우스 페이지의 오전 10시와 달라 행사 레코드를 만들지 않아요.",
  }),
  evidence({
    evidenceId: "icsu-grade-range-conflict", institutionRegistryId: "ST01:36", claimType: "FACT", field: "TARGET_AGE_GRADE",
    sourceName: "ICSU 공식 학교 안내", sourceUrl: "https://www.icsu.kr", finalUrl: "https://www.icsu.kr",
    sourceType: "OFFICIAL_SCHOOL_PAGE", authorityLevel: "PRIMARY", status: "NEEDS_REVIEW",
    excerpt: "공식 안내에서 운영 학년이 G4–12와 G5–12로 다르게 표시돼 있어요.",
    academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR, observedValueJson: { conflictingGradeRanges: ["G4–12", "G5–12"] },
    publicNote: null, internalNote: "확인 전 운영 학년 사실을 만들지 않아요.",
  }),
  evidence({
    evidenceId: "dssi-transport-year-conflict", institutionRegistryId: "ST01:19", claimType: "FACT", field: "TRANSPORT",
    sourceName: "DSSI 공식 통학 안내", sourceUrl: "https://www.dsseoul.org", finalUrl: "https://www.dsseoul.org",
    sourceType: "OFFICIAL_DOCUMENT", authorityLevel: "PRIMARY", status: "NEEDS_REVIEW",
    excerpt: "영문 안내와 독문 안내의 통학비 적용 학년도 표기가 서로 달라요.", academicYearLabel: null,
    observedValueJson: { conflict: "영문·독문 학년도 표기 불일치" }, publicNote: null,
    internalNote: "학년도 확인 전 통학비 사실을 만들지 않아요.",
  }),
  evidence({
    evidenceId: "sfs-application-2026-27", institutionRegistryId: "ST01:5", claimType: "OPPORTUNITY", field: "ADMISSION_PROCESS",
    sourceName: "SFS 공식 지원 안내", sourceUrl: "https://www.seoulforeign.org/admissions/apply",
    finalUrl: "https://www.seoulforeign.org/admissions/apply", sourceType: "OFFICIAL_ADMISSION_PAGE",
    authorityLevel: "PRIMARY", status: "VERIFIED",
    excerpt: "학교는 2026–27학년도 지원서를 접수 중이며 좌석 여부를 먼저 문의하도록 안내해요.",
    academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
    observedValueJson: { acceptingApplications: true, seatAvailabilityRequired: true }, publicNote: null, internalNote: null,
  }),
];

export const INTERNATIONAL_SCHOOL_EVIDENCE = [
  ...IDENTITY_EVIDENCE, ...TUITION_EVIDENCE, ...REVIEW_EVIDENCE,
] satisfies readonly EvidenceArtifactRecord[];

export const INTERNATIONAL_SCHOOL_SOCIAL_EVIDENCE =
  OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS.map((school, index) => {
    const accessStatus = index < 7 ? "ROBOTS_BLOCKED" as const : index < 14 ? "LOGIN_REQUIRED" as const : "NO_PUBLIC_RESULT" as const;
    const base = accessStatus === "ROBOTS_BLOCKED"
      ? "https://blog.naver.com/PostSearchList.naver"
      : accessStatus === "LOGIN_REQUIRED"
        ? "https://www.instagram.com/explore/search/keyword/"
        : "https://www.google.com/search";
    return {
      socialEvidenceId: `social-${school.registryExternalId.slice(5)}`,
      institutionRegistryId: school.registryExternalId,
      channelType: accessStatus === "ROBOTS_BLOCKED" ? "BLOG" as const : accessStatus === "LOGIN_REQUIRED" ? "OFFICIAL_SOCIAL" as const : "COMMUNITY" as const,
      url: `${base}?query=${encodeURIComponent(school.canonicalNameEn)}`,
      accessStatus,
      accessedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT,
      perspective: "UNKNOWN" as const,
      reviewSampleCount: 0,
      themeSummary: [],
      periodStart: null,
      periodEnd: null,
      recency: "UNKNOWN" as const,
      promotionEligibility: "DISCOVERY_ONLY" as const,
      limitation: accessStatus === "ROBOTS_BLOCKED"
        ? "수집 환경의 robots 정책으로 공개 본문과 댓글을 확인하지 못했어요."
        : accessStatus === "LOGIN_REQUIRED"
          ? "로그인이 필요해 공개 본문과 댓글을 확인하지 못했어요."
          : "지정한 공개 검색 범위에서 분석 가능한 독립 후기 표본을 찾지 못했어요.",
      excerpt: null,
    };
  }) satisfies readonly SocialEvidenceArtifactRecord[];

export const SPECIAL_ACCESS_SCHOOLS = [
  "Humphreys Central Elementary School",
  "Humphreys West Elementary School",
  "Humphreys Middle School",
  "Humphreys High School",
  "Osan Elementary School",
  "Osan Middle High School",
  "Russian Embassy School in Seoul",
] as const;

const SPECIAL_ACCESS_URLS = [
  "https://humphreyscentrales.dodea.edu/", "https://humphreyswestes.dodea.edu/",
  "https://humphreysms.dodea.edu/", "https://humphreyshs.dodea.edu/",
  "https://osanes.dodea.edu/", "https://osanmhhs.dodea.edu/",
  "https://korea-seoul.mid.ru/en/",
] as const;

export const SPECIAL_ACCESS_RECORDS = SPECIAL_ACCESS_SCHOOLS.map((name, index) => ({
  recordId: `special-access-${String(index + 1).padStart(2, "0")}`,
  name,
  system: index < 6 ? "DODEA" as const : "EMBASSY" as const,
  regionCode: index < 6 ? "41" as const : "11" as const,
  city: index < 6 ? "경기도 평택시" : "서울특별시 중구",
  district: index < 6 ? "평택시" : "중구",
  publicUrl: SPECIAL_ACCESS_URLS[index]!,
  accessStatus: "VERIFIED" as const,
  legalClassification: "SPECIAL_ACCESS" as const,
  publicationEligibility: "ARTIFACT_ONLY" as const,
  limitation: index < 6
    ? "DoDEA 입학 자격을 충족한 부양가족이 대상이며 일부 범주는 잔여석과 유료 심사가 필요해요."
    : "외교공관 관계자 자녀가 주 대상이며 예외 입학은 대사관 결정에 따라요.",
  checkedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT,
})) satisfies readonly SpecialAccessArtifactRecord[];

type CandidateSeed = readonly [
  string,
  "서울특별시" | "경기도",
  CandidateArtifactRecord["disposition"],
  CandidateArtifactRecord["legalStatus"],
  string | null,
  `https://${string}` | null,
];

const CANDIDATE_SEEDS = [
  ["Lighthouse International School", "서울특별시", "HOLD", "UNKNOWN", "lighthouse", null],
  ["Lighthouse International School Seoul", "서울특별시", "HOLD", "UNKNOWN", "lighthouse", null],
  ["Lighthouse International School Ilsan", "경기도", "HOLD", "UNKNOWN", "lighthouse", null],
  ["Seoul Academy", "서울특별시", "HOLD", "UNKNOWN", "seoul-academy", null],
  ["Seoul Academy International School", "서울특별시", "ACADEMY", "ACADEMY", "seoul-academy", null],
  ["Seoul Academy Bundang", "경기도", "HOLD", "UNKNOWN", "seoul-academy", null],
  ["Gangnam International School", "서울특별시", "HOLD", "UNKNOWN", "gis-jukjeon", null],
  ["Gangnam International School Jukjeon", "경기도", "HOLD", "UNKNOWN", "gis-jukjeon", null],
  ["GIS Jukjeon", "경기도", "HOLD", "UNKNOWN", "gis-jukjeon", null],
  ["Gen.G Global Academy", "서울특별시", "ACADEMY", "ACADEMY", "gen-g", "https://www.gengacademy.com"],
  ["Gen.G Esports Academy", "서울특별시", "ACADEMY", "ACADEMY", "gen-g", "https://www.gengacademy.com"],
  ["Saint Paul Preparatory Seoul", "서울특별시", "HOLD", "UNKNOWN", "saint-paul", null],
  ["Saint Paul American Scholars", "서울특별시", "HOLD", "UNKNOWN", "saint-paul", null],
  ["Saint Paul Daechi", "서울특별시", "ACADEMY", "ACADEMY", "saint-paul", null],
  ["Saint Paul Bundang", "경기도", "HOLD", "UNKNOWN", "saint-paul", null],
  ["SIE Central", "서울특별시", "ACADEMY", "ACADEMY", "sie", null],
  ["SIE Gangdong", "서울특별시", "ACADEMY", "ACADEMY", "sie", null],
  ["SIE Gangnam", "서울특별시", "ACADEMY", "ACADEMY", "sie", null],
  ["SIE Bundang", "경기도", "ACADEMY", "ACADEMY", "sie", null],
  ["SIE Pangyo", "경기도", "ACADEMY", "ACADEMY", "sie", null],
  ["FIS Seoul", "서울특별시", "HOLD", "UNKNOWN", "fis", null],
  ["FIS Bundang", "경기도", "HOLD", "UNKNOWN", "fis", null],
  ["FIS Pangyo", "경기도", "HOLD", "UNKNOWN", "fis", null],
  ["Fayston Preparatory School", "경기도", "REGISTERED_ALTERNATIVE", "REGISTERED_ALTERNATIVE", "fis", "https://www.fayston.org"],
  ["Fayston Preparatory School Suji", "경기도", "REGISTERED_ALTERNATIVE", "REGISTERED_ALTERNATIVE", "fis", "https://www.fayston.org"],
  ["Fayston Preparatory School Bundang", "경기도", "HOLD", "UNKNOWN", "fis", "https://www.fayston.org"],
  ["British Education Korea", "서울특별시", "ACADEMY", "ACADEMY", "bek", null],
  ["BEK Hannam", "서울특별시", "ACADEMY", "ACADEMY", "bek", null],
  ["BEK Cheongdam", "서울특별시", "ACADEMY", "ACADEMY", "bek", null],
  ["BEK Bundang", "경기도", "ACADEMY", "ACADEMY", "bek", null],
  ["BEK Pangyo", "경기도", "ACADEMY", "ACADEMY", "bek", null],
  ["Seoul Scholars International", "서울특별시", "REGISTERED_ALTERNATIVE", "REGISTERED_ALTERNATIVE", null, "https://www.ssiskorea.org"],
  ["Seoul International Christian Academy", "서울특별시", "HOLD", "UNKNOWN", null, null],
  ["Seoul International School of Arts", "서울특별시", "HOLD", "UNKNOWN", null, null],
  ["Korea International Christian School Seoul", "서울특별시", "HOLD", "UNKNOWN", null, null],
  ["Korea International Christian School Bucheon", "경기도", "HOLD", "UNKNOWN", null, null],
  ["Korea International Christian School Ilsan", "경기도", "HOLD", "UNKNOWN", null, null],
  ["Cornerstone Collegiate Academy of Seoul", "서울특별시", "HOLD", "UNKNOWN", null, null],
  ["Grace International School", "서울특별시", "HOLD", "UNKNOWN", null, null],
  ["Global Vision Christian School Seoul", "서울특별시", "HOLD", "UNKNOWN", null, null],
  ["Big Heart Christian School", "경기도", "HOLD", "UNKNOWN", null, null],
  ["BCC Canadian International School", "서울특별시", "ACADEMY", "ACADEMY", null, null],
  ["BIS Canada", "서울특별시", "ACADEMY", "ACADEMY", null, null],
  ["BIS Bundang", "경기도", "ACADEMY", "ACADEMY", null, null],
  ["Westminster Canadian Academy", "경기도", "HOLD", "UNKNOWN", null, null],
  ["SSI Art and Design", "서울특별시", "ACADEMY", "ACADEMY", null, null],
  ["SSI Performing Arts", "서울특별시", "ACADEMY", "ACADEMY", null, null],
  ["Hankuk Academy of Foreign Studies", "경기도", "NOT_INTERNATIONAL", "DOMESTIC_PRIVATE_SCHOOL", null, "https://www.hafs.hs.kr"],
  ["Cheongna Dalton School", "경기도", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.daltonschool.kr"],
  ["Chadwick International School", "경기도", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.chadwickinternational.org"],
  ["North London Collegiate School Jeju", "서울특별시", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.nlcsjeju.co.kr"],
  ["Korea International School Jeju Campus", "서울특별시", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.kis.ac"],
  ["Branksome Hall Asia", "서울특별시", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.branksome.asia"],
  ["Saint Johnsbury Academy Jeju", "서울특별시", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.sjajeju.kr"],
  ["Taejon Christian International School", "경기도", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.tcis.or.kr"],
  ["Busan Foreign School", "서울특별시", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.busanforeignschool.org"],
  ["International School of Busan", "서울특별시", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.isbusan.org"],
  ["Daegu International School", "경기도", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.dis.sc.kr"],
  ["Gwangju Foreign School", "경기도", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.gwangjuforeignschool.org"],
  ["Global Vision Christian School Mungyeong", "경기도", "EXCLUDE_OUT_OF_REGION", "OUT_OF_REGION", null, "https://www.gvcs-es.org"],
] as const satisfies readonly CandidateSeed[];

const SEOUL_ALTERNATIVE_DIRECTORY = "https://www.sen.go.kr/user/bbs/BD_selectBbsList.do?q_bbsSn=1524";
const GYEONGGI_ALTERNATIVE_DIRECTORY = "https://www.goe.go.kr/goe/na/ntt/selectNttInfo.do?mi=10961&nttSn=2337176";

export const CANDIDATE_SCHOOLS = CANDIDATE_SEEDS.map(
  ([name, region, disposition, legalStatus, collisionGroup, officialUrl], index) => ({
    recordId: `candidate-${String(index + 1).padStart(3, "0")}`,
    name,
    aliases: [],
    regionCandidates: [region],
    officialUrl,
    disposition,
    legalStatus,
    evidenceUrls: [officialUrl ?? (region === "서울특별시" ? SEOUL_ALTERNATIVE_DIRECTORY : GYEONGGI_ALTERNATIVE_DIRECTORY)],
    collisionGroup,
    publicationEligibility: "ARTIFACT_ONLY" as const,
    notes: [disposition === "EXCLUDE_OUT_OF_REGION"
      ? "서울·경기 검색에서 발견됐지만 소재지가 조사 권역 밖이라 제외 후보로 보존해요."
      : disposition === "ACADEMY"
        ? "학원 후보로 분류했으며 공식 외국인학교로 공개하지 않아요."
        : disposition === "REGISTERED_ALTERNATIVE"
          ? "등록 대안교육기관 후보로 분리하며 국내 학력인정 학교로 표현하지 않아요."
          : disposition === "NOT_INTERNATIONAL"
            ? "국제학교 검색에 함께 노출되지만 공식 외국인학교와 다른 법적 유형이에요."
            : "공식 외국인학교 22곳과 별도인 후보로 보존하며 국내 법적 지위는 추가 확인이 필요해요."],
    checkedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT,
  }),
) satisfies readonly CandidateArtifactRecord[];

type CoverageOverride = {
  status: "CONFIRMED" | "CHECKED_NOT_FOUND" | "ACCESS_FAILED" | "NEEDS_REVIEW";
  evidenceId: string;
  academicYearLabel: string | null;
  publicNote: string | null;
  internalNote: string | null;
};
const coverageOverrides = new Map<string, CoverageOverride>();
for (const [id] of CURRENT_TUITION_SOURCES) {
  coverageOverrides.set(`${id}:TUITION`, {
    status: "CONFIRMED", evidenceId: `tuition-${id.slice(5)}`,
    academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR, publicNote: null, internalNote: null,
  });
}
coverageOverrides.set("ST01:10:TUITION", {
  status: "CHECKED_NOT_FOUND", evidenceId: "yiss-tuition-not-found",
  academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
  publicNote: "확인한 학교 공식 안내에서 학비 정보를 찾지 못했어요.", internalNote: "미발표로 해석하지 않아요.",
});
coverageOverrides.set("ST01:57:TUITION", {
  status: "NEEDS_REVIEW", evidenceId: "icsp-tuition-date-limited", academicYearLabel: "2025–26",
  publicNote: "이 정보는 2025–26학년도 안내예요. 2026–27학년도에는 달라질 수 있어요.",
  internalNote: "현재 학년도 사실로 승격하지 않아요.",
});
coverageOverrides.set("ST01:38:TUITION", {
  status: "ACCESS_FAILED", evidenceId: "suwon-chinese-tuition-access-failed",
  academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
  publicNote: "학교 페이지를 불러오지 못해 학비를 확인하지 못했어요.", internalNote: null,
});
coverageOverrides.set("ST01:32:INFORMATION_SESSION", {
  status: "NEEDS_REVIEW", evidenceId: "kis-pangyo-open-house-page",
  academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
  publicNote: "학교 안내에 적힌 시간이 서로 달라요. 정확한 시간은 학교에 확인해 주세요.",
  internalNote: "오전 9시와 오전 10시가 충돌해 행사 레코드를 만들지 않아요.",
});
coverageOverrides.set("ST01:36:TARGET_AGE_GRADE", {
  status: "NEEDS_REVIEW", evidenceId: "icsu-grade-range-conflict",
  academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR, publicNote: null,
  internalNote: "G4–12와 G5–12 표기를 확인해야 해요.",
});
coverageOverrides.set("ST01:19:TRANSPORT", {
  status: "NEEDS_REVIEW", evidenceId: "dssi-transport-year-conflict",
  academicYearLabel: null, publicNote: null,
  internalNote: "영문·독문 통학비 학년도 표기를 확인해야 해요.",
});

const APIS_TUITION_FACT = {
  factType: "TUITION" as const,
  value: {
    academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
    gradeBands: [
      { label: "Kindergarten–Grade 5", tuitionComponents: [
        { currency: "KRW" as const, amount: 23_400_000, billingUnit: "ANNUAL" as const, required: true },
        { currency: "USD" as const, amount: 7_600, billingUnit: "ANNUAL" as const, required: true },
      ], notes: [] },
      { label: "Grades 6–8", tuitionComponents: [
        { currency: "KRW" as const, amount: 28_100_000, billingUnit: "ANNUAL" as const, required: true },
        { currency: "USD" as const, amount: 7_900, billingUnit: "ANNUAL" as const, required: true },
      ], notes: [] },
      { label: "Grades 9–12", tuitionComponents: [
        { currency: "KRW" as const, amount: 31_000_000, billingUnit: "ANNUAL" as const, required: true },
        { currency: "USD" as const, amount: 8_100, billingUnit: "ANNUAL" as const, required: true },
      ], notes: [] },
    ],
    extraFees: [
      { feeType: "APPLICATION" as const, label: "Application processing fee", components: [
        { currency: "KRW" as const, amount: 400_000, billingUnit: "ONE_TIME" as const, required: true },
      ], refundable: false, note: null },
      { feeType: "ADMISSION" as const, label: "Entrance fee", components: [
        { currency: "KRW" as const, amount: 4_000_000, billingUnit: "ONE_TIME" as const, required: true },
      ], refundable: false, note: null },
      { feeType: "TRANSPORT" as const, label: "Annual bus fee within Seoul", components: [
        { currency: "KRW" as const, amount: 4_000_000, billingUnit: "ANNUAL" as const, required: null },
      ], refundable: null, note: "서울시 밖 35km 이내는 연 4,100,000원으로 안내돼 있어요." },
    ],
    paymentOptions: ["KRW 학비와 버스비는 분기 납부를 선택할 수 있어요.", "USD 학비와 그 밖의 비용은 첫 납부 때 전액 납부해요."],
    refundTerms: "USD 학비와 분기 납부액 등 공식 안내에 명시된 비용은 환불되지 않아요.",
    changeNote: "통화별 금액을 임의 환율로 합산하지 않았어요.",
  },
  displayText: "2026–27학년도 APIS 학비는 학년군별 원화와 달러 금액으로 나뉘어요.",
  evidenceIds: ["tuition-4"], verifiedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT,
};

const SFS_TUITION_FACT = {
  factType: "TUITION" as const,
  value: {
    academicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
    gradeBands: [
      { label: "Kindergarten–Grade 5", tuitionComponents: [
        { currency: "KRW" as const, amount: 27_285_000, billingUnit: "ANNUAL" as const, required: true },
        { currency: "USD" as const, amount: 13_500, billingUnit: "ANNUAL" as const, required: true },
      ], notes: [] },
      { label: "Grades 6–8", tuitionComponents: [
        { currency: "KRW" as const, amount: 27_930_000, billingUnit: "ANNUAL" as const, required: true },
        { currency: "USD" as const, amount: 14_625, billingUnit: "ANNUAL" as const, required: true },
      ], notes: [] },
      { label: "Grades 9–12", tuitionComponents: [
        { currency: "KRW" as const, amount: 33_370_000, billingUnit: "ANNUAL" as const, required: true },
        { currency: "USD" as const, amount: 14_955, billingUnit: "ANNUAL" as const, required: true },
      ], notes: [] },
    ],
    extraFees: [
      { feeType: "APPLICATION" as const, label: "Application fee", components: [
        { currency: "KRW" as const, amount: 450_000, billingUnit: "ONE_TIME" as const, required: true },
      ], refundable: false, note: null },
      { feeType: "TRANSPORT" as const, label: "Annual round-trip bus fee", components: [
        { currency: "KRW" as const, amount: 4_200_000, billingUnit: "ANNUAL" as const, required: null },
      ], refundable: null, note: "좌석은 보장되지 않으며 학교 확인이 필요해요." },
    ],
    paymentOptions: [], refundTerms: null,
    changeNote: "통화별 금액을 임의 환율로 합산하지 않았어요.",
  },
  displayText: "2026–27학년도 SFS 학비는 학년군별 원화와 달러 금액으로 나뉘어요.",
  evidenceIds: ["tuition-5"], verifiedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT,
};

export const INTERNATIONAL_SCHOOL_IMPORT_SNAPSHOT: InternationalSchoolImportSnapshotInput = {
  schemaVersion: 1,
  packageId: INTERNATIONAL_SCHOOL_PACKAGE_ID,
  targetAcademicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
  institutions: OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS.map((school) => ({
    registryName: "ISI" as const,
    registryExternalId: school.registryExternalId,
    category: "INTERNATIONAL_SCHOOL" as const,
    internationalSubtype: "FOREIGN_SCHOOL" as const,
    operationalState: "ACTIVE" as const,
    publicationState: "DRAFT" as const,
    coverages: englishKindergartenSectionValues.map((section) => {
      const override = coverageOverrides.get(`${school.registryExternalId}:${section}`);
      return override
        ? { section, ...override, lastCollectedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT, lastCheckedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT }
        : { section, status: "NOT_RESEARCHED" as const, evidenceId: null, academicYearLabel: null,
            publicNote: null, internalNote: null, lastCollectedAt: null, lastCheckedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT };
    }),
    facts: school.registryExternalId === "ST01:4" ? [APIS_TUITION_FACT]
      : school.registryExternalId === "ST01:5" ? [SFS_TUITION_FACT] : [],
    opportunities: school.registryExternalId === "ST01:5" ? [{
      slug: "seoul-foreign-school-2026-27-application",
      title: "서울외국인학교 2026–27학년도 지원 안내",
      kind: "APPLICATION" as const,
      businessState: "OPEN" as const,
      eventStartsAt: null,
      applicationClosesAt: null,
      actionUrl: "https://www.seoulforeign.org/admissions/apply",
      evidenceIds: ["sfs-application-2026-27"],
      verifiedAt: INTERNATIONAL_SCHOOL_COLLECTED_AT,
    }] : [],
  })),
};

function coverageCounts(section: (typeof englishKindergartenSectionValues)[number]) {
  const rows = INTERNATIONAL_SCHOOL_IMPORT_SNAPSHOT.institutions.map(
    (institution) => institution.coverages.find((coverage) => coverage.section === section)!,
  );
  return {
    confirmed: rows.filter((row) => row.status === "CONFIRMED").length,
    needsReview: rows.filter((row) => row.status === "NEEDS_REVIEW").length,
    checkedNotFound: rows.filter((row) => row.status === "CHECKED_NOT_FOUND").length,
    accessFailed: rows.filter((row) => row.status === "ACCESS_FAILED").length,
    notResearched: rows.filter((row) => row.status === "NOT_RESEARCHED").length,
  };
}

const allAccessStatuses = [
  ...INTERNATIONAL_SCHOOL_EVIDENCE.map((item) => item.status),
  ...INTERNATIONAL_SCHOOL_SOCIAL_EVIDENCE.map((item) => item.accessStatus),
];

export const INTERNATIONAL_SCHOOL_PROGRESS = {
  schemaVersion: 1,
  packageId: INTERNATIONAL_SCHOOL_PACKAGE_ID,
  asOf: INTERNATIONAL_SCHOOL_AS_OF,
  targetAcademicYearLabel: INTERNATIONAL_SCHOOL_TARGET_YEAR,
  counts: {
    officialActive: OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS.length,
    specialAccess: SPECIAL_ACCESS_RECORDS.length,
    candidates: CANDIDATE_SCHOOLS.length,
    importInstitutions: INTERNATIONAL_SCHOOL_IMPORT_SNAPSHOT.institutions.length,
  },
  regions: {
    서울특별시: OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS.filter((item) => item.city === "서울특별시").length,
    경기도: OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS.filter((item) => item.city === "경기도").length,
  },
  fieldCoverage: Object.fromEntries(
    englishKindergartenSectionValues.map((section) => [section, coverageCounts(section)]),
  ) as InternationalSchoolProgress["fieldCoverage"],
  accessSummary: {
    verified: allAccessStatuses.filter((status) => status === "VERIFIED").length,
    warning: allAccessStatuses.filter((status) => status === "VERIFIED_WITH_WARNING").length,
    dateLimited: allAccessStatuses.filter((status) => status === "VERIFIED_WITH_DATE_LIMIT").length,
    needsReview: allAccessStatuses.filter((status) => status === "NEEDS_REVIEW").length,
    checkedNotFound: allAccessStatuses.filter((status) => status === "NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES").length,
    accessFailed: allAccessStatuses.filter((status) => status === "ACCESS_FAILED").length,
    leadOnly: allAccessStatuses.filter((status) => status === "LEAD_ONLY").length,
    loginRequired: allAccessStatuses.filter((status) => status === "LOGIN_REQUIRED").length,
    robotsBlocked: allAccessStatuses.filter((status) => status === "ROBOTS_BLOCKED").length,
    noPublicResult: allAccessStatuses.filter((status) => status === "NO_PUBLIC_RESULT").length,
  },
  unresolvedConflicts: [
    { code: "kfs-address-conflict", institutionRegistryId: "ST01:6", note: "ISI 등록 주소와 학교 공식 사이트의 현재 주소가 달라 주소 반입을 보류해요." },
    { code: "kis-pangyo-time-conflict", institutionRegistryId: "ST01:32", note: "오픈하우스 시작 시간이 공식 페이지끼리 달라 행사 생성을 보류해요." },
    { code: "icsu-grade-conflict", institutionRegistryId: "ST01:36", note: "운영 학년 범위가 G4–12와 G5–12로 달라 확인이 필요해요." },
    { code: "dssi-transport-year-conflict", institutionRegistryId: "ST01:19", note: "영문·독문 통학비 안내의 학년도 표기가 달라 사실 생성을 보류해요." },
    { code: "suwon-chinese-access-failed", institutionRegistryId: "ST01:38", note: "공식 사이트 접근 실패로 학비 확인을 마치지 못했어요." },
  ],
} satisfies InternationalSchoolProgress;
