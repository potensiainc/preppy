import { describe, expect, it } from "vitest";

import {
  CANDIDATE_SCHOOLS,
  INTERNATIONAL_SCHOOL_EVIDENCE,
  INTERNATIONAL_SCHOOL_IMPORT_SNAPSHOT,
  INTERNATIONAL_SCHOOL_SOCIAL_EVIDENCE,
  OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS,
  SPECIAL_ACCESS_RECORDS,
  SPECIAL_ACCESS_SCHOOLS,
} from "@/scripts/data/international-school-source-data";

const expectedOfficialIds = [
  "ST01:1",
  "ST01:3",
  "ST01:4",
  "ST01:5",
  "ST01:6",
  "ST01:10",
  "ST01:13",
  "ST01:14",
  "ST01:15",
  "ST01:16",
  "ST01:17",
  "ST01:18",
  "ST01:19",
  "ST01:20",
  "ST01:32",
  "ST01:33",
  "ST01:34",
  "ST01:36",
  "ST01:38",
  "ST01:56",
  "ST01:57",
  "ST01:76",
] as const;

function imported(id: string) {
  return INTERNATIONAL_SCHOOL_IMPORT_SNAPSHOT.institutions.find(
    (institution) => institution.registryExternalId === id,
  )!;
}

function coverage(id: string, section: string) {
  return imported(id).coverages.find((item) => item.section === section)!;
}

describe("international-school canonical source data", () => {
  it("fixes the exact official-active ISI cohort to Seoul 16 and Gyeonggi 6", () => {
    expect(
      OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS.map(
        (school) => school.registryExternalId,
      ).sort(),
    ).toEqual([...expectedOfficialIds].sort());
    expect(
      OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS.filter(
        (school) => school.city === "서울특별시",
      ),
    ).toHaveLength(16);
    expect(
      OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS.filter(
        (school) => school.city === "경기도",
      ),
    ).toHaveLength(6);
    expect(expectedOfficialIds).not.toContain("ST01:8");
    expect(expectedOfficialIds).not.toContain("ST01:11");
    expect(expectedOfficialIds).not.toContain("ST01:12");
  });

  it("preserves official identity evidence and withholds a conflicted address", () => {
    for (const school of OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS) {
      expect(school.canonicalNameKo).not.toBe("");
      expect(school.canonicalNameEn).not.toBe("");
      expect(school.websiteUrl).toMatch(/^https:\/\//u);
      expect(school.registryRecordUrl).toContain(
        `schoolId=${school.registryExternalId.slice(5)}`,
      );
      expect(
        INTERNATIONAL_SCHOOL_EVIDENCE.some(
          (item) =>
            item.institutionRegistryId === school.registryExternalId &&
            item.claimType === "IDENTITY" &&
            item.sourceType === "OFFICIAL_REGISTRY" &&
            item.status === "VERIFIED" &&
            item.sourceSnapshotId !== null,
        ),
      ).toBe(true);
    }
    const kfs = OFFICIAL_ACTIVE_INTERNATIONAL_SCHOOLS.find(
      (school) => school.registryExternalId === "ST01:6",
    )!;
    expect(kfs.addressLine).toBeNull();
    expect(kfs.addressConflict?.values).toHaveLength(2);
    expect(
      kfs.addressConflict?.values.every((item) =>
        INTERNATIONAL_SCHOOL_EVIDENCE.some(
          (evidence) => evidence.evidenceId === item.evidenceId,
        ),
      ),
    ).toBe(true);
  });

  it("keeps the tuition baseline and unresolved cases semantically distinct", () => {
    const confirmed = INTERNATIONAL_SCHOOL_IMPORT_SNAPSHOT.institutions.filter(
      (institution) =>
        institution.coverages.some(
          (item) => item.section === "TUITION" && item.status === "CONFIRMED",
        ),
    );
    expect(confirmed).toHaveLength(13);
    expect(coverage("ST01:10", "TUITION")).toMatchObject({
      status: "CHECKED_NOT_FOUND",
      publicNote: "확인한 학교 공식 안내에서 학비 정보를 찾지 못했어요.",
    });
    expect(coverage("ST01:57", "TUITION")).toMatchObject({
      status: "NEEDS_REVIEW",
      academicYearLabel: "2025–26",
      publicNote:
        "이 정보는 2025–26학년도 안내예요. 2026–27학년도에는 달라질 수 있어요.",
    });
    expect(coverage("ST01:38", "TUITION")).toMatchObject({
      status: "ACCESS_FAILED",
      publicNote: "학교 페이지를 불러오지 못해 학비를 확인하지 못했어요.",
    });
    expect(coverage("ST01:32", "INFORMATION_SESSION")).toMatchObject({
      status: "NEEDS_REVIEW",
      publicNote:
        "학교 안내에 적힌 시간이 서로 달라요. 정확한 시간은 학교에 확인해 주세요.",
    });
    expect(imported("ST01:32").opportunities).toEqual([]);
  });

  it("retains APIS, ICSU, and DSSI warnings without promoting them to facts", () => {
    expect(
      INTERNATIONAL_SCHOOL_EVIDENCE.some(
        (item) =>
          item.institutionRegistryId === "ST01:4" &&
          item.status === "VERIFIED_WITH_WARNING" &&
          item.internalNote?.includes("TLS"),
      ),
    ).toBe(true);
    expect(coverage("ST01:36", "TARGET_AGE_GRADE").status).toBe(
      "NEEDS_REVIEW",
    );
    expect(coverage("ST01:19", "TRANSPORT").status).toBe("NEEDS_REVIEW");
    const dssiTransportEvidence = INTERNATIONAL_SCHOOL_EVIDENCE.filter(
      (item) =>
        item.institutionRegistryId === "ST01:19" &&
        item.field === "TRANSPORT",
    );
    expect(dssiTransportEvidence).toHaveLength(2);
    expect(
      new Set(dssiTransportEvidence.map((item) => item.sourceUrl)).size,
    ).toBe(2);
    expect(
      dssiTransportEvidence.every(
        (item) => item.sourceType === "OFFICIAL_DOCUMENT",
      ),
    ).toBe(true);
    expect(
      imported("ST01:36").facts.some(
        (fact) => fact.factType === "TARGET_AGE_GRADE",
      ),
    ).toBe(false);
    expect(
      imported("ST01:19").facts.some((fact) => fact.factType === "TRANSPORT"),
    ).toBe(false);
  });

  it("keeps social discovery coverage for all 22 without copying inaccessible text", () => {
    expect(
      new Set(
        INTERNATIONAL_SCHOOL_SOCIAL_EVIDENCE.map(
          (item) => item.institutionRegistryId,
        ),
      ).size,
    ).toBe(22);
    expect(
      new Set(
        INTERNATIONAL_SCHOOL_SOCIAL_EVIDENCE.map((item) => item.accessStatus),
      ),
    ).toEqual(
      expect.objectContaining({
        has: expect.any(Function),
      }),
    );
    for (const status of [
      "ROBOTS_BLOCKED",
      "LOGIN_REQUIRED",
      "NO_PUBLIC_RESULT",
    ]) {
      expect(
        INTERNATIONAL_SCHOOL_SOCIAL_EVIDENCE.some(
          (item) => item.accessStatus === status,
        ),
      ).toBe(true);
    }
    for (const item of INTERNATIONAL_SCHOOL_SOCIAL_EVIDENCE) {
      expect(item.url).toMatch(/^https:\/\//u);
      expect(item.promotionEligibility).toBe("DISCOVERY_ONLY");
      if (
        item.accessStatus === "ROBOTS_BLOCKED" ||
        item.accessStatus === "LOGIN_REQUIRED"
      ) {
        expect(item.excerpt).toBeNull();
        expect(item.reviewSampleCount).toBe(0);
      }
      expect(JSON.stringify(item)).not.toMatch(
        /(?:01[016789][-\s]?\d{3,4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/u,
      );
    }
  });

  it("separates exact special-access and 60 candidate records from publication", () => {
    expect(SPECIAL_ACCESS_SCHOOLS).toEqual([
      "Humphreys Central Elementary School",
      "Humphreys West Elementary School",
      "Humphreys Middle School",
      "Humphreys High School",
      "Osan Elementary School",
      "Osan Middle High School",
      "Russian Embassy School in Seoul",
    ]);
    expect(SPECIAL_ACCESS_RECORDS).toHaveLength(7);
    expect(CANDIDATE_SCHOOLS).toHaveLength(60);
    expect(
      SPECIAL_ACCESS_RECORDS.every(
        (item) => item.publicationEligibility === "ARTIFACT_ONLY",
      ),
    ).toBe(true);
    expect(
      CANDIDATE_SCHOOLS.every(
        (item) => item.publicationEligibility === "ARTIFACT_ONLY",
      ),
    ).toBe(true);
    const serializedSpecial = JSON.stringify(SPECIAL_ACCESS_RECORDS);
    for (const unsafeKey of [
      "addressLine",
      "coordinates",
      "gate",
      "busRoute",
      "stopTime",
    ]) {
      expect(serializedSpecial).not.toContain(`\"${unsafeKey}\"`);
    }
    for (const collisionGroup of [
      "lighthouse",
      "seoul-academy",
      "gis-jukjeon",
      "gen-g",
      "saint-paul",
      "sie",
      "fis",
      "bek",
    ]) {
      expect(
        CANDIDATE_SCHOOLS.some(
          (candidate) => candidate.collisionGroup === collisionGroup,
        ),
      ).toBe(true);
    }
    expect(new Set(CANDIDATE_SCHOOLS.map((item) => item.disposition)).size).toBeGreaterThan(2);
    expect(new Set(CANDIDATE_SCHOOLS.map((item) => item.legalStatus)).size).toBeGreaterThan(3);
  });
});
