import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PACKAGE_ID = "sg-is-fixture-r01";
const CHECKED_AT = "2026-09-15T00:00:00.000Z";
const SECTIONS = [
  "TUITION",
  "INFORMATION_SESSION",
  "TARGET_AGE_GRADE",
  "CURRICULUM",
  "TRANSPORT",
  "MEALS",
  "REVIEWS",
  "OPERATING_INFO",
] as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function createValidInternationalSchoolPackageValues() {
  const institutions = Array.from({ length: 22 }, (_, index) => {
    const number = index + 1;
    return {
      recordId: `institution-${number.toString().padStart(2, "0")}`,
      registryName: "ISI",
      registryExternalId: `ST01:${number}`,
      canonicalNameKo: `Fixture 국제학교 ${number}`,
      canonicalNameEn: `Fixture International School ${number}`,
      aliases: [],
      slug: `fixture-international-school-${number}`,
      category: "INTERNATIONAL_SCHOOL",
      internationalSubtype: "FOREIGN_SCHOOL",
      operationalState: "ACTIVE",
      publicationState: "DRAFT",
      regionCode: index < 16 ? "11" : "41",
      city: index < 16 ? "서울특별시" : "경기도",
      district: index < 16 ? "용산구" : "성남시",
      addressLine: `Fixture address ${number}`,
      websiteUrl: `https://school-${number}.example/`,
      registryRecordUrl: `https://isi.example/school/${number}`,
      officialMainUrl: `https://school-${number}.example/`,
      addressConflict: null,
      collectedAt: CHECKED_AT,
    };
  });
  const identityEvidence = institutions.map((institution, index) => {
    const excerpt = `${institution.canonicalNameEn} is active.`;
    return {
      evidenceId: `identity-evidence-${index + 1}`,
      institutionRegistryId: institution.registryExternalId,
      claimType: "IDENTITY",
      field: "IDENTITY",
      sourceName: "ISI fixture registry",
      sourceUrl: institution.registryRecordUrl,
      finalUrl: institution.registryRecordUrl,
      sourceType: "OFFICIAL_REGISTRY",
      authorityLevel: "PRIMARY",
      status: "VERIFIED",
      excerpt,
      collectedAt: CHECKED_AT,
      observedAt: CHECKED_AT,
      sourceObservationRef: `identity-observation-${index + 1}`,
      sourceSnapshotId: `00000000-0000-4000-8000-${(index + 1)
        .toString()
        .padStart(12, "0")}`,
      sourceContentSha256: sha256(excerpt),
      academicYearLabel: null,
      observedValueJson: {
        registryExternalId: institution.registryExternalId,
        operationalState: "ACTIVE",
      },
      publicNote: null,
      internalNote: null,
    };
  });
  const tuitionExcerpt = "Annual tuition is KRW 100.";
  const tuitionEvidence = {
    evidenceId: "tuition-evidence-1",
    institutionRegistryId: "ST01:1",
    claimType: "FACT",
    field: "TUITION",
    sourceName: "Fixture school tuition",
    sourceUrl: "https://school-1.example/tuition",
    finalUrl: "https://school-1.example/tuition",
    sourceType: "OFFICIAL_DOCUMENT",
    authorityLevel: "PRIMARY",
    status: "VERIFIED",
    excerpt: tuitionExcerpt,
    collectedAt: CHECKED_AT,
    observedAt: CHECKED_AT,
    sourceObservationRef: "tuition-observation-1",
    sourceSnapshotId: "10000000-0000-4000-8000-000000000001",
    sourceContentSha256: sha256(tuitionExcerpt),
    academicYearLabel: "2026–27",
    observedValueJson: { currency: "KRW", amount: 100 },
    publicNote: null,
    internalNote: null,
  };
  const evidence = [...identityEvidence, tuitionEvidence];
  const socialEvidence = [
    {
      socialEvidenceId: "social-evidence-1",
      institutionRegistryId: "ST01:1",
      channelType: "BLOG",
      url: "https://blog.example/public-review",
      accessStatus: "LEAD_ONLY",
      accessedAt: CHECKED_AT,
      perspective: "UNKNOWN",
      reviewSampleCount: 0,
      themeSummary: [],
      periodStart: null,
      periodEnd: null,
      recency: "UNKNOWN",
      promotionEligibility: "DISCOVERY_ONLY",
      limitation: "검색 결과에서 공개 URL만 확인했어요.",
      excerpt: null as string | null,
    },
  ];
  const specialAccess = Array.from({ length: 7 }, (_, index) => ({
    recordId: `special-access-${index + 1}`,
    name: `Fixture Special Access School ${index + 1}`,
    system: index < 6 ? "DODEA" : "EMBASSY",
    regionCode: index < 6 ? "41" : "11",
    city: index < 6 ? "평택시" : "서울특별시",
    district: null,
    publicUrl: `https://special-${index + 1}.example/`,
    accessStatus: "VERIFIED",
    legalClassification: "SPECIAL_ACCESS",
    publicationEligibility: "ARTIFACT_ONLY",
    limitation: "일반 공개 입학 대상 여부를 확인해야 해요.",
    checkedAt: CHECKED_AT,
  }));
  const candidates = Array.from({ length: 60 }, (_, index) => ({
    recordId: `candidate-${(index + 1).toString().padStart(2, "0")}`,
    name: `Fixture Candidate School ${index + 1}`,
    aliases: [],
    regionCandidates: [index < 30 ? "서울특별시" : "경기도"],
    officialUrl: null,
    disposition: "HOLD",
    legalStatus: "UNKNOWN",
    evidenceUrls: [],
    collisionGroup: null,
    publicationEligibility: "ARTIFACT_ONLY",
    notes: ["공식 분류 확인 전 후보로만 보관해요."],
    checkedAt: CHECKED_AT,
  }));
  const coverages = SECTIONS.map((section) => ({
    section,
    status: "NOT_RESEARCHED",
    evidenceId: null,
    academicYearLabel: null,
    publicNote: null,
    internalNote: null,
    lastCollectedAt: null,
    lastCheckedAt: CHECKED_AT,
  }));
  const snapshot = {
    schemaVersion: 1,
    packageId: PACKAGE_ID,
    targetAcademicYearLabel: "2026–27",
    institutions: institutions.map((institution, index) => ({
      registryName: "ISI",
      registryExternalId: institution.registryExternalId,
      category: "INTERNATIONAL_SCHOOL",
      internationalSubtype: "FOREIGN_SCHOOL",
      operationalState: "ACTIVE",
      publicationState: "DRAFT",
      coverages:
        index === 0
          ? coverages.map((coverage) =>
              coverage.section === "TUITION"
                ? {
                    ...coverage,
                    status: "CONFIRMED",
                    evidenceId: "tuition-evidence-1",
                    academicYearLabel: "2026–27",
                    lastCollectedAt: CHECKED_AT,
                  }
                : coverage,
            )
          : coverages,
      facts:
        index === 0
          ? [
              {
                factType: "TUITION",
                value: {
                  academicYearLabel: "2026–27",
                  gradeBands: [
                    {
                      label: "K",
                      tuitionComponents: [
                        {
                          currency: "KRW",
                          amount: 100,
                          billingUnit: "ANNUAL",
                          required: true,
                        },
                      ],
                      notes: [],
                    },
                  ],
                  extraFees: [],
                  paymentOptions: [],
                  refundTerms: null,
                  changeNote: null,
                },
                displayText: "연간 KRW 100",
                evidenceIds: ["tuition-evidence-1"],
                verifiedAt: CHECKED_AT,
              },
            ]
          : [],
      opportunities: [],
    })),
  };
  const progress = {
    schemaVersion: 1,
    packageId: PACKAGE_ID,
    asOf: "2026-09-15",
    targetAcademicYearLabel: "2026–27",
    counts: {
      officialActive: 22,
      specialAccess: 7,
      candidates: 60,
      importInstitutions: 22,
    },
    regions: { 서울특별시: 16, 경기도: 6 },
    fieldCoverage: Object.fromEntries(
      SECTIONS.map((section) => [
        section,
        {
          confirmed: section === "TUITION" ? 1 : 0,
          needsReview: 0,
          checkedNotFound: 0,
          accessFailed: 0,
          notResearched: section === "TUITION" ? 21 : 22,
        },
      ]),
    ),
    accessSummary: {
      verified: 23,
      warning: 0,
      dateLimited: 0,
      needsReview: 0,
      checkedNotFound: 0,
      accessFailed: 0,
      leadOnly: 1,
      loginRequired: 0,
      robotsBlocked: 0,
      noPublicResult: 0,
    },
    unresolvedConflicts: [],
  };
  const verification = {
    schemaVersion: 1,
    packageId: PACKAGE_ID,
    status: "PENDING",
    checkedAt: null,
    checks: [],
    readyForDryRun: false,
  };
  return {
    institutions,
    evidence,
    socialEvidence,
    specialAccess,
    candidates,
    progress,
    snapshot,
    verification,
  };
}

export async function writeValidInternationalSchoolPackage(
  directory: string,
  mutate?: (values: ReturnType<typeof createValidInternationalSchoolPackageValues>) => void,
) {
  const values = createValidInternationalSchoolPackageValues();
  mutate?.(values);
  await mkdir(directory, { recursive: true });
  const contents = {
    "institutions.ndjson":
      values.institutions.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "evidence.ndjson":
      values.evidence.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "social-evidence.ndjson":
      values.socialEvidence.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "special-access.ndjson":
      values.specialAccess.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "candidates.ndjson":
      values.candidates.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "progress.json": JSON.stringify(values.progress, null, 2) + "\n",
    "preppy-import.snapshot.json": JSON.stringify(values.snapshot, null, 2) + "\n",
  };
  const manifest = {
    schemaVersion: 1,
    packageId: PACKAGE_ID,
    files: Object.fromEntries(
      Object.entries(contents).map(([filename, content]) => [
        filename,
        sha256(content),
      ]),
    ),
    preppyImportChecksum: sha256(canonicalJson(values.snapshot)),
  };
  for (const [filename, content] of Object.entries(contents)) {
    await writeFile(join(directory, filename), content, "utf8");
  }
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );
  await writeFile(
    join(directory, "verification.json"),
    JSON.stringify(values.verification, null, 2) + "\n",
    "utf8",
  );
}
