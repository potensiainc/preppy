/**
 * Test fixture utilities for international school import packages.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type {
  InternationalSchoolImportPackage,
  InstitutionArtifactRecord,
  EvidenceArtifactRecord,
  FactArtifactRecord,
  OpportunityArtifactRecord,
  CoverageArtifactRecord,
  CandidateArtifactRecord,
  SpecialAccessArtifactRecord,
  SocialEvidenceArtifactRecord,
  AddressConflict,
} from "@/src/modules/international-school-import/artifact-schema";

/**
 * Mutable version of InstitutionArtifactRecord for test fixtures.
 */
export type MutableInstitutionArtifactRecord = {
  -readonly [K in keyof InstitutionArtifactRecord]: InstitutionArtifactRecord[K];
} & {
  addressConflict?: AddressConflict;
};

const COVERAGE_SECTIONS = [
  "IDENTITY",
  "TUITION",
  "CURRICULUM",
  "ELIGIBILITY",
  "ADMISSION_PROCESS",
  "INFORMATION_SESSION",
  "CALENDAR",
  "FACILITIES",
] as const;

function makeInstitution(
  index: number,
  overrides?: Partial<MutableInstitutionArtifactRecord>,
): MutableInstitutionArtifactRecord {
  const id = index + 1;
  return {
    institutionRef: `inst-${id}`,
    registryExternalId: `ST01:${id}`,
    registryRecordUrl: `https://isi.go.kr/schools/${id}`,
    slug: `test-international-school-${id}`,
    canonicalNameKo: `테스트 국제학교 ${id}`,
    canonicalNameEn: `Test International School ${id}`,
    regionCode: "서울특별시",
    city: "Seoul",
    district: "Gangnam-gu",
    addressLine: `123 Test Street ${id}`,
    websiteUrl: `https://school${id}.example.com`,
    category: "INTERNATIONAL_SCHOOL",
    subtype: "FOREIGN_SCHOOL",
    status: "OFFICIAL",
    ...overrides,
  };
}

function makeEvidence(
  index: number,
  institutionRef: string,
  overrides?: Partial<EvidenceArtifactRecord>,
): EvidenceArtifactRecord {
  return {
    evidenceId: `evidence-${index}`,
    institutionRef,
    field: "IDENTITY",
    sourceType: "OFFICIAL_REGISTRY",
    sourceUrl: `https://isi.go.kr/schools/${index}`,
    capturedAt: "2026-09-20T00:00:00.000Z",
    status: "VERIFIED",
    contentHash: `content-hash-${index}`,
    textHash: `text-hash-${index}`,
    normalizedText: null,
    metadata: {},
    ...overrides,
  };
}

function makeFact(
  index: number,
  institutionRef: string,
  evidenceId: string,
): FactArtifactRecord {
  return {
    factRef: `fact-${index}`,
    institutionRef,
    factType: "TUITION_ANNUAL",
    valueJson: { amount: 10000000 + index * 1000000, currency: "KRW" },
    displayText: `${10 + index}M KRW / year`,
    evidenceIds: [evidenceId],
    verifiedAt: "2026-09-20T00:00:00.000Z",
  };
}

function makeOpportunity(
  index: number,
  institutionRef: string,
  evidenceIds: readonly string[],
): OpportunityArtifactRecord {
  return {
    opportunityRef: `opp-${index}`,
    institutionRef,
    slug: `admission-2026-${index}`,
    kind: "ADMISSION",
    title: `2026 Admission ${index}`,
    businessState: "ACCEPTING",
    eventStartsAt: null,
    applicationClosesAt: "2026-12-31T23:59:59.000Z",
    actionUrl: null,
    evidenceIds,
    verifiedAt: "2026-09-20T00:00:00.000Z",
  };
}

function makeCoverage(
  institutionRef: string,
  section: string,
  evidenceId: string | null,
): CoverageArtifactRecord {
  return {
    institutionRef,
    section,
    status: evidenceId ? "COLLECTED" : "NOT_AVAILABLE",
    academicYearLabel: "2026",
    publicNote: null,
    internalNote: null,
    sourceEvidenceId: evidenceId,
    lastCollectedAt: evidenceId ? "2026-09-20T00:00:00.000Z" : null,
    lastCheckedAt: "2026-09-20T00:00:00.000Z",
  };
}

function makeCandidate(index: number): CandidateArtifactRecord {
  return {
    candidateRef: `candidate-${index}`,
    name: `Candidate School ${index}`,
    websiteUrl: `https://candidate${index}.example.com`,
    sourceUrl: `https://directory.example.com/schools/${index}`,
    status: "PENDING_VERIFICATION",
  };
}

function makeSpecialAccess(index: number): SpecialAccessArtifactRecord {
  return {
    institutionRef: `special-${index}`,
    name: `Special Access School ${index}`,
    websiteUrl: null,
    reason: "Restricted enrollment",
  };
}

function makeSocialEvidence(
  index: number,
  institutionRef: string,
): SocialEvidenceArtifactRecord {
  return {
    evidenceId: `social-${index}`,
    institutionRef,
    platform: "instagram",
    sourceUrl: `https://instagram.com/school${index}`,
    capturedAt: "2026-09-20T00:00:00.000Z",
    status: "COLLECTED",
  };
}

export type FixtureValues = ReturnType<
  typeof createValidInternationalSchoolPackageValues
>;

/**
 * Creates the raw values for a valid international school package fixture.
 *
 * Returns mutable objects that can be modified before writing.
 */
export function createValidInternationalSchoolPackageValues() {
  // 22 official institutions (matching expected counts in planner tests)
  const institutions: MutableInstitutionArtifactRecord[] = [];
  const evidence: EvidenceArtifactRecord[] = [];
  const facts: FactArtifactRecord[] = [];
  const opportunities: OpportunityArtifactRecord[] = [];
  const coverages: CoverageArtifactRecord[] = [];
  const candidates: CandidateArtifactRecord[] = [];
  const specialAccess: SpecialAccessArtifactRecord[] = [];
  const socialEvidence: SocialEvidenceArtifactRecord[] = [];

  let evidenceIndex = 1;

  for (let i = 0; i < 22; i++) {
    const inst = makeInstitution(i);
    institutions.push(inst);

    // Each institution gets one identity evidence
    const identityEvidence = makeEvidence(evidenceIndex++, inst.institutionRef, {
      evidenceId: `identity-evidence-${i + 1}`,
      field: "IDENTITY",
      sourceType: "OFFICIAL_REGISTRY",
      sourceUrl: inst.registryRecordUrl,
    });
    evidence.push(identityEvidence);

    // First institution gets a tuition fact with evidence
    if (i === 0) {
      const tuitionEvidence = makeEvidence(evidenceIndex++, inst.institutionRef, {
        evidenceId: `tuition-evidence-1`,
        field: "TUITION",
        sourceType: "OFFICIAL_SCHOOL_PAGE",
        sourceUrl: `${inst.websiteUrl}/tuition`,
      });
      evidence.push(tuitionEvidence);

      facts.push(makeFact(1, inst.institutionRef, tuitionEvidence.evidenceId));
    }

    // Create coverages for each section
    for (const section of COVERAGE_SECTIONS) {
      const sectionEvidence =
        section === "IDENTITY" ? identityEvidence.evidenceId : null;
      coverages.push(makeCoverage(inst.institutionRef, section, sectionEvidence));
    }
  }

  // Add candidates (60 total to match expected ignored count)
  for (let i = 0; i < 60; i++) {
    candidates.push(makeCandidate(i + 1));
  }

  // Add special access (7 total to match expected ignored count)
  for (let i = 0; i < 7; i++) {
    specialAccess.push(makeSpecialAccess(i + 1));
  }

  // Add one social evidence (to match expected ignored count)
  socialEvidence.push(makeSocialEvidence(1, institutions[0]!.institutionRef));

  return {
    snapshot: {
      packageId: "test-package-2026-09-20",
      packageVersion: "1.0.0",
      exportedAt: "2026-09-20T12:00:00.000Z",
      scope: ["international-schools", "seoul"],
    },
    institutions,
    evidence,
    facts,
    opportunities,
    coverages,
    candidates,
    specialAccess,
    socialEvidence,
  };
}

/**
 * Writes a valid international school package fixture to a directory.
 *
 * @param directory - The directory to write the fixture to
 * @param mutate - Optional function to mutate the values before writing
 */
export async function writeValidInternationalSchoolPackage(
  directory: string,
  mutate?: (values: FixtureValues) => void,
): Promise<void> {
  const values = createValidInternationalSchoolPackageValues();

  if (mutate) {
    mutate(values);
  }

  const pkg: InternationalSchoolImportPackage = {
    snapshot: values.snapshot,
    institutions: values.institutions,
    evidence: values.evidence,
    facts: values.facts,
    opportunities: values.opportunities,
    coverages: values.coverages,
    candidates: values.candidates,
    specialAccess: values.specialAccess,
    socialEvidence: values.socialEvidence,
  };

  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify(pkg, null, 2),
    "utf8",
  );
}
