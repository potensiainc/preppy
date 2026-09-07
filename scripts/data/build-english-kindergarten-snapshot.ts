import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { englishKindergartenSectionValues } from "../../src/modules/english-kindergarten/coverage";
import type {
  CampusRecord,
  EvidenceRecord,
} from "../../src/modules/english-kindergarten-import/artifact-schema";
import {
  canonicalJsonSha256,
  loadEnglishKindergartenPackage,
  validateEnglishKindergartenPackage,
} from "../../src/modules/english-kindergarten-import/validator";

const packageId = "sg-ek-20260901-r01";
const historicalCollectedAt = "2026-09-01T03:00:00.000Z";
const recheckedAt = "2026-09-07T01:30:00.000Z";

type SourceSeed = Readonly<{
  url: string;
  sourceType:
    | "OFFICIAL_APPLICATION_PORTAL"
    | "OFFICIAL_SCHOOL_PAGE"
    | "THIRD_PARTY_DISCOVERY";
  authorityLevel: "PRIMARY" | "THIRD_PARTY";
  fetchStatus: "SUCCESS" | "ACCESS_FAILED";
  sourceCapture: string;
}>;

type CampusSeed = Readonly<{
  name: string;
  slug: string;
  address: string;
  district: "강남구" | "서초구";
  legalDong: "신사동" | "잠원동" | "반포동";
  officialUrl?: string;
  source: SourceSeed;
}>;

const seeds: readonly CampusSeed[] = [
  {
    name: "GEA 강남잉글리쉬아카데미",
    slug: "gea-gangnam-english-academy",
    address: "강남구 언주로164길 12",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://classup.io/academies/e0144d62-df9c-4773-8b20-499136cbdec0/%EA%B0%95%EB%82%A8-%EC%9E%89%EA%B8%80%EB%A6%AC%EC%89%AC%EC%95%84%EC%B9%B4%EB%8D%B0%EB%AF%B8",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "강남 잉글리쉬아카데미, 서울 강남구 언주로164길 12, 영어유치부로 표시된 2026년 공개 학원 정보.",
    },
  },
  {
    name: "몬테키즈",
    slug: "montekids",
    address: "강남구 논현로152길 30",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://www.gangmom.kr/institute/65b7af89b8368381373142a4",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "몬테키즈, 서울 강남구 논현로152길 30, 영어유치부로 분류된 공개 학원 정보.",
    },
  },
  {
    name: "LS 압구정",
    slug: "ls-apgujeong",
    address: "강남구 압구정로30길 62, 1~2층",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://www.youngu.kr/%EC%96%B4%ED%95%99%EC%9B%90/%EA%B0%95%EB%82%A8%EA%B5%AC-%EC%97%98%EC%97%90%EC%8A%A4%EC%95%95%EA%B5%AC%EC%A0%95%EC%96%B4%ED%95%99%EC%9B%90",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "엘에스압구정어학원, 서울 강남구 압구정로30길 62 1~2층, 3세~7세 대상 공개 학원 정보. 같은 건물 3~4층 GLS는 이 스냅샷에서 제외함.",
    },
  },
  {
    name: "Gate 압구정",
    slug: "gate-apgujeong",
    address: "강남구 압구정로 206",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://www.gangmom.kr/tuition/69c879eb152cc1b2c860b89a",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "2026년 공개 교습비 안내에서 Gate 압구정 명칭과 강남구 압구정로 206 소재 운영 정보를 확인함.",
    },
  },
  {
    name: "AppleTree 압구정",
    slug: "appletree-apgujeong",
    address: "강남구 압구정로 206",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://www.jobkorea.co.kr/Recruit/GI_Read/48368676?Oem_Code=C1&PageGbn=ST",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "AppleTree 압구정 유치부 운영과 서울 강남구 압구정로 206 소재를 확인할 수 있는 공개 채용 정보.",
    },
  },
  {
    name: "DEP 도산·대치잉글리쉬파크 압구정",
    slug: "dep-dosan-daechi-english-park-apgujeong",
    address: "강남구 언주로164길 16",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://learns.academy/academies/DSL9YGRUWD/%EB%8C%80%EC%B9%98%EC%9E%89%EA%B8%80%EB%A6%AC%EC%89%AC%ED%8C%8C%ED%81%AC-%EC%98%81%EC%96%B4-%EB%8F%84%EC%82%B0",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "대치잉글리쉬파크 영어 도산, 강남구 신사동 언주로164길 16, 유아 대상 영어 과정으로 표시된 공개 학원 정보.",
    },
  },
  {
    name: "프뢰벨영어은물",
    slug: "froebel-english-gifts",
    address: "강남구 압구정로32길 11",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://education.smileus.net/%ED%95%99%EC%9B%90/%EC%84%9C%EC%9A%B8/%EA%B0%95%EB%82%A8%EA%B5%AC/view/%ED%94%84%EB%A2%B0%EB%B2%A8%EC%98%81%EC%96%B4%EC%9D%80%EB%AC%BC%EC%96%B4%ED%95%99%EC%9B%90",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "ACCESS_FAILED",
      sourceCapture:
        "2026-09-01 수집 기록에서 프뢰벨영어은물어학원, 강남구 압구정로32길 11, 유아 영어과정 운영을 확인함. 2026-09-07 재접근은 실패함.",
    },
  },
  {
    name: "설리번 프렙·SPS",
    slug: "sullivan-prep-sps",
    address: "강남구 도산대로17길 21",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://www.gangmom.kr/tuition/69c87a14152cc1b2c860ecd1",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "2026년 공개 교습비 안내에서 설리번 프렙·SPS 명칭과 강남구 도산대로17길 21 소재 운영 정보를 확인함.",
    },
  },
  {
    name: "ANKids",
    slug: "ankids",
    address: "강남구 압구정로18길 25, 2층",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://classup.io/academies/f7e78c39-3656-4653-b491-3b8b2179cb2d",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "ANKids, 서울 강남구 압구정로18길 25 2층, 영어유치부로 표시된 2026년 공개 학원 정보.",
    },
  },
  {
    name: "Revere",
    slug: "revere",
    address: "강남구 도산대로23길 42",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://www.youngu.kr/%EC%96%B4%ED%95%99%EC%9B%90/%EA%B0%95%EB%82%A8%EA%B5%AC-%EB%A6%AC%EB%B9%84%EC%96%B4%28REVERE%29%EC%96%B4%ED%95%99%EC%9B%90",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "리비어(REVERE)어학원의 현재 소재는 강남구 도산대로23길 42이며 3세~7세 대상 공개 학원 정보가 확인됨. 과거 언주로153길 10-8 주소는 현행 레코드로 채택하지 않음.",
    },
  },
  {
    name: "C-Gate",
    slug: "c-gate",
    address: "강남구 압구정로18길 25, 3~4층",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://www.gangmom.kr/tuition/69c87b05152cc1b2c863004e",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "2026년 공개 교습비 안내에서 C-Gate 명칭과 강남구 압구정로18길 25 3~4층 소재 운영 정보를 확인함.",
    },
  },
  {
    name: "PSA 압구정",
    slug: "psa-apgujeong",
    address: "강남구 압구정로 206, 2~3층",
    district: "강남구",
    legalDong: "신사동",
    officialUrl: "https://www.ybmpine.com/psa-apply",
    source: {
      url: "https://www.ybmpine.com/psa-apply",
      sourceType: "OFFICIAL_APPLICATION_PORTAL",
      authorityLevel: "PRIMARY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "YBM PSA 공식 지원 페이지에서 PSA 과정의 현재 지원·운영 신호를 확인함. 승인된 기관 소재는 강남구 압구정로 206 2~3층임.",
    },
  },
  {
    name: "PODO Club",
    slug: "podo-club",
    address: "강남구 논현로153길 45",
    district: "강남구",
    legalDong: "신사동",
    source: {
      url: "https://learns.academy/academies/31R7BY9LGH/%ED%8F%AC%EB%8F%84%ED%81%B4%EB%9F%BD",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "포도클럽, 강남구 논현로153길 45, 유아 대상 영어 과정으로 표시된 공개 학원 정보.",
    },
  },
  {
    name: "플럼어학원",
    slug: "plum-academy",
    address: "서초구 잠원로8길 13, 4층",
    district: "서초구",
    legalDong: "잠원동",
    source: {
      url: "https://classup.io/academies/20c05c90-e1f7-41c3-a578-e13cea8a83d1",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "플럼어학원, 서울 서초구 잠원로8길 13 4층, 영어유치부로 표시된 공개 학원 정보.",
    },
  },
  {
    name: "RISE 서초",
    slug: "rise-seocho",
    address: "서초구 고무래로10길 26, 2층",
    district: "서초구",
    legalDong: "반포동",
    source: {
      url: "https://www.saramin.co.kr/zf_user/company-info/view-inner-recruit?csn=WmYrMlJ6bWNERkVDOVFSNVg4Um9rUT09",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "RISE 서초 유치부 운영과 서울 서초구 고무래로10길 26 2층 소재를 확인할 수 있는 공개 채용 정보.",
    },
  },
  {
    name: "i-Garten 반포",
    slug: "i-garten-banpo",
    address: "서초구 고무래로10길 27, 5~6층",
    district: "서초구",
    legalDong: "반포동",
    officialUrl: "https://creverse.com/i-garten/Banpo",
    source: {
      url: "https://creverse.com/i-garten/Banpo",
      sourceType: "OFFICIAL_SCHOOL_PAGE",
      authorityLevel: "PRIMARY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "크레버스 i-Garten 반포 공식 페이지에서 유아 영어과정의 현재 운영 신호를 확인함. 승인된 기관 소재는 서초구 고무래로10길 27 5~6층임.",
    },
  },
  {
    name: "서강SLP 서초",
    slug: "seogang-slp-seocho",
    address: "서초구 고무래로 6-10",
    district: "서초구",
    legalDong: "반포동",
    source: {
      url: "https://classup.io/academies/59b9e127-36fc-4fe5-b64a-4ed4b16256d9/%EC%84%9C%EA%B0%95slp-%EC%84%9C%EC%B4%88",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "서강SLP 서초, 서울 서초구 고무래로 6-10, 영어유치부와 유아 대상 과정으로 표시된 2026년 공개 학원 정보.",
    },
  },
  {
    name: "서초SCE",
    slug: "seocho-sce",
    address: "서초구 서초중앙로 225, 3층",
    district: "서초구",
    legalDong: "반포동",
    source: {
      url: "https://www.youngu.kr/%EC%96%B4%ED%95%99%EC%9B%90/%EC%84%9C%EC%B4%88%EA%B5%AC-%EC%84%9C%EC%B4%88SCE%EC%96%B4%ED%95%99%EC%9B%90",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "서초SCE어학원, 서울 서초구 서초중앙로 225 3층, 3세~7세 대상 공개 학원 정보.",
    },
  },
  {
    name: "BIS",
    slug: "bis",
    address: "서초구 고무래로10길 27, 2층",
    district: "서초구",
    legalDong: "반포동",
    source: {
      url: "https://m.jobkorea.co.kr/Recruit/GI_Read/49154168?PageGbn=MST",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "비아이에스어학원 유치부·초등부 운영과 서울 서초구 고무래로10길 27 2층 소재를 확인할 수 있는 2026년 공개 채용 정보.",
    },
  },
  {
    name: "SOT",
    slug: "sot",
    address: "서초구 서초중앙로31길 14-4",
    district: "서초구",
    legalDong: "반포동",
    source: {
      url: "https://learns.academy/academies/8F5ST37ISJ/%EC%97%90%EC%8A%A4%EC%98%A4%ED%8B%B0",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "에스오티, 서초구 반포동 서초중앙로31길 14-4, 유아·초등 대상 영어 전문 학원으로 표시된 공개 학원 정보.",
    },
  },
  {
    name: "Wyatt",
    slug: "wyatt",
    address: "서초구 동광로33길 10-6",
    district: "서초구",
    legalDong: "반포동",
    officialUrl: "https://www.wyatt.kr/",
    source: {
      url: "https://www.wyatt.kr/",
      sourceType: "OFFICIAL_SCHOOL_PAGE",
      authorityLevel: "PRIMARY",
      fetchStatus: "ACCESS_FAILED",
      sourceCapture:
        "2026-09-01 수집 기록에서 Wyatt, 서초구 동광로33길 10-6, 유아 영어과정 운영을 확인함. 2026-09-07 공식 페이지 재접근은 실패함.",
    },
  },
  {
    name: "EELC Kinder",
    slug: "eelc-kinder",
    address: "서초구 고무래로10-5, 5~6층",
    district: "서초구",
    legalDong: "반포동",
    source: {
      url: "https://www.youngu.kr/%EC%96%B4%ED%95%99%EC%9B%90/%EC%84%9C%EC%B4%88%EA%B5%AC-%EC%9D%B4%EC%9D%B4%EC%97%98%EC%94%A8%28eelc%29%ED%82%A8%EB%8D%94%EC%96%B4%ED%95%99%EC%9B%90",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "이이엘씨(EELC)킨더어학원, 서울 서초구 고무래로10-5 5~6층, 영어유치원으로 분류된 공개 학원 정보.",
    },
  },
  {
    name: "Little Learners",
    slug: "little-learners",
    address: "서초구 서래로5길 61",
    district: "서초구",
    legalDong: "반포동",
    source: {
      url: "https://www.gangmom.kr/tuition/69c87a52152cc1b2c8623fa2",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "2026년 공개 교습비 안내에서 리틀러너스어학원 명칭과 서초구 서래로5길 61 소재 운영 정보를 확인함.",
    },
  },
  {
    name: "Stella K 서초",
    slug: "stella-k-seocho",
    address: "서초구 신반포로 23, 3층",
    district: "서초구",
    legalDong: "반포동",
    officialUrl: "https://stellak.kkmom.com/page_postinglist.php?boardid=43478",
    source: {
      url: "https://stellak.kkmom.com/page_postinglist.php?boardid=43478",
      sourceType: "OFFICIAL_SCHOOL_PAGE",
      authorityLevel: "PRIMARY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "스텔라케이 어학원 공식 게시 페이지에서 현재 운영 신호를 확인함. 승인된 기관 소재는 서초구 신반포로 23 3층임.",
    },
  },
  {
    name: "비탑키즈학원",
    slug: "bitop-kids",
    address: "서초구 고무래로10길 42, 2층",
    district: "서초구",
    legalDong: "반포동",
    source: {
      url: "https://www.youngu.kr/%EC%96%B4%ED%95%99%EC%9B%90/%EC%84%9C%EC%B4%88%EA%B5%AC-%EB%B9%84%ED%83%91%ED%82%A4%EC%A6%88%ED%95%99%EC%9B%90",
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "THIRD_PARTY",
      fetchStatus: "SUCCESS",
      sourceCapture:
        "비탑키즈학원, 서울 서초구 고무래로10길 42 2층, 영어유치원으로 분류된 공개 학원 정보.",
    },
  },
];

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const campuses: CampusRecord[] = seeds.map((seed, index) => ({
  campusId: `sg-ek-${String(index + 1).padStart(3, "0")}`,
  displayName: seed.name,
  slug: seed.slug,
  addressLine: seed.address,
  district: seed.district,
  legalDong: seed.legalDong,
  operationalState: "ACTIVE",
  classificationState: "CONFIRMED",
  officialChannels: seed.officialUrl
    ? [{ kind: "WEBSITE" as const, value: seed.officialUrl }]
    : [],
  collectedAt: historicalCollectedAt,
}));

const evidence: EvidenceRecord[] = campuses.flatMap((campus, index) => {
  const seed = seeds[index]!;
  const collectedAt =
    seed.source.fetchStatus === "SUCCESS" ? recheckedAt : historicalCollectedAt;
  const sourceContentSha256 = sha256(seed.source.sourceCapture);
  return [
    {
      evidenceId: `${campus.campusId}-identity`,
      campusId: campus.campusId,
      claimType: "IDENTITY" as const,
      boundedExcerpt: `${campus.displayName} 명칭과 ${campus.addressLine} 소재를 확인했어요. ${seed.source.sourceCapture}`,
    },
    {
      evidenceId: `${campus.campusId}-operation`,
      campusId: campus.campusId,
      claimType: "OPERATION" as const,
      boundedExcerpt:
        seed.source.fetchStatus === "SUCCESS"
          ? `${campus.displayName}의 현재 운영 신호를 공개 페이지에서 확인했어요. ${seed.source.sourceCapture}`
          : `${campus.displayName}의 운영 근거는 2026-09-01 수집 기록에 보존했어요. 2026-09-07에는 페이지 접근에 실패했어요.`,
    },
    {
      evidenceId: `${campus.campusId}-classification`,
      campusId: campus.campusId,
      claimType: "CLASSIFICATION" as const,
      boundedExcerpt: `${campus.displayName}을 미취학 아동 대상 영어 주간과정 기관으로 분류할 근거를 확인했어요. ${seed.source.sourceCapture}`,
    },
  ].map((item) => ({
    ...item,
    sourceUrl: seed.source.url,
    sourceType: seed.source.sourceType,
    authorityLevel: seed.source.authorityLevel,
    collectedAt,
    sourceContentSha256,
  }));
});

const snapshot = {
  schemaVersion: 1 as const,
  packageId,
  institutions: campuses.map((campus, index) => {
    const seed = seeds[index]!;
    return {
      campusId: campus.campusId,
      category: "ENGLISH_KINDERGARTEN" as const,
      publicationState: "DRAFT" as const,
      coverages: englishKindergartenSectionValues.map((section) => {
        const operatingEvidenceId = `${campus.campusId}-operation`;
        if (section === "OPERATING_INFO") {
          const succeeded = seed.source.fetchStatus === "SUCCESS";
          return {
            section,
            status: succeeded
              ? ("CONFIRMED" as const)
              : ("ACCESS_FAILED" as const),
            evidenceId: operatingEvidenceId,
            academicYearLabel: null,
            publicNote: succeeded
              ? `${campus.displayName}의 운영 신호를 확인했어요.`
              : "기관 페이지를 불러오지 못해 최신 운영 정보를 다시 확인하지 못했어요.",
            internalNote: succeeded
              ? "기관 신원·운영·분류 근거를 재확인했어요."
              : "2026-09-01 운영 근거는 보존했지만 2026-09-07 재접근에 실패했어요.",
            lastCollectedAt: succeeded ? recheckedAt : historicalCollectedAt,
            lastCheckedAt: recheckedAt,
          };
        }
        return {
          section,
          status: "NOT_RESEARCHED" as const,
          evidenceId: null,
          academicYearLabel: null,
          publicNote: null,
          internalNote:
            "이번 스냅샷에서는 기관 신원·운영·분류만 검증했어요. 이 항목은 후속 수집 대상이에요.",
          lastCollectedAt: null,
          lastCheckedAt: recheckedAt,
        };
      }),
      facts: [],
      opportunities: [],
    };
  }),
};

const progress = {
  packageId,
  confirmed: campuses.length,
  excluded: 0,
  held: 0,
  recordsReviewed: campuses.length,
  districts: { 강남구: 13, 서초구: 12 },
  legalDongs: { 신사동: 13, 잠원동: 1, 반포동: 11 },
  sourceFetches: { success: 23, accessFailed: 2, checkedNotFound: 0 },
};

async function main() {
  const directory = resolve(
    "data/snapshots/preppy/english-kindergarten",
    packageId,
  );
  await mkdir(directory, { recursive: true });
  const files = {
    "campuses.ndjson":
      campuses.map((item) => JSON.stringify(item)).join("\n") + "\n",
    "evidence.ndjson":
      evidence.map((item) => JSON.stringify(item)).join("\n") + "\n",
    "progress.json": JSON.stringify(progress, null, 2) + "\n",
    "preppy-import.snapshot.json": JSON.stringify(snapshot, null, 2) + "\n",
  };
  const manifest = {
    schemaVersion: 1 as const,
    packageId,
    files: Object.fromEntries(
      Object.entries(files).map(([filename, contents]) => [
        filename,
        sha256(contents),
      ]),
    ),
    preppyImportChecksum: canonicalJsonSha256(snapshot),
  };
  await Promise.all([
    ...Object.entries(files).map(([filename, contents]) =>
      writeFile(resolve(directory, filename), contents, "utf8"),
    ),
    writeFile(
      resolve(directory, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8",
    ),
  ]);

  const loaded = await loadEnglishKindergartenPackage(directory);
  const report = validateEnglishKindergartenPackage(loaded);
  await writeFile(
    resolve(directory, "verification.json"),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );
  if (report.status !== "PASS") {
    throw new Error(JSON.stringify(report, null, 2));
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
