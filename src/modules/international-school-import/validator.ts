import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  candidateArtifactRecordSchema,
  evidenceArtifactRecordSchema,
  importSnapshotSchema,
  institutionArtifactRecordSchema,
  manifestFileNames,
  manifestSchema,
  OFFICIAL_ACTIVE_COUNT,
  progressSchema,
  socialEvidenceArtifactRecordSchema,
  SPECIAL_ACCESS_COUNT,
  specialAccessArtifactRecordSchema,
  CANDIDATE_COUNT,
  verificationSchema,
  type EvidenceArtifactRecord,
  type InternationalSchoolImportPackage,
} from "./artifact-schema";

const PACKAGE_FILES = [
  ...manifestFileNames,
  "manifest.json",
  "verification.json",
] as const;
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const REQUIRED_SECTIONS = [
  "TUITION",
  "INFORMATION_SESSION",
  "TARGET_AGE_GRADE",
  "CURRICULUM",
  "TRANSPORT",
  "MEALS",
  "REVIEWS",
  "OPERATING_INFO",
] as const;
const FACT_OFFICIAL_SOURCE_TYPES = new Set([
  "OFFICIAL_ADMISSION_PAGE",
  "OFFICIAL_NOTICE_BOARD",
  "OFFICIAL_DOCUMENT",
  "OFFICIAL_APPLICATION_PORTAL",
  "OFFICIAL_SCHOOL_PAGE",
]);
const OPPORTUNITY_OFFICIAL_SOURCE_TYPES = new Set([
  ...FACT_OFFICIAL_SOURCE_TYPES,
  "OFFICIAL_SOCIAL",
]);

function sha256(value: string | Buffer): string {
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

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalJsonSha256(value: unknown): string {
  return sha256(canonicalJson(value));
}

function parseNdjson<T>(
  text: string,
  filename: string,
  parse: (value: unknown) => T,
): T[] {
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return parse(JSON.parse(line));
      } catch (error) {
        throw new Error(
          `${filename} ${index + 1}행의 값이 계약과 맞지 않습니다.`,
          { cause: error },
        );
      }
    });
}

function parseJson<T>(
  text: string,
  filename: string,
  parse: (value: unknown) => T,
): T {
  try {
    return parse(JSON.parse(text));
  } catch (error) {
    throw new Error(`${filename}의 값이 계약과 맞지 않습니다.`, {
      cause: error,
    });
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export async function loadInternationalSchoolPackage(
  directory: string,
): Promise<InternationalSchoolImportPackage> {
  const resolvedDirectory = resolve(directory);
  const actualFiles = (await readdir(resolvedDirectory)).sort();
  const expectedFiles = [...PACKAGE_FILES].sort();
  const unexpected = actualFiles.filter(
    (filename) => !expectedFiles.includes(filename as (typeof PACKAGE_FILES)[number]),
  );
  const missing = expectedFiles.filter((filename) => !actualFiles.includes(filename));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `허용되지 않은 파일 또는 누락 파일이 있습니다. unexpected=${unexpected.join(",")} missing=${missing.join(",")}`,
    );
  }

  const buffers = Object.fromEntries(
    await Promise.all(
      PACKAGE_FILES.map(async (filename) => [
        filename,
        await readFile(resolve(resolvedDirectory, filename)),
      ]),
    ),
  ) as Record<(typeof PACKAGE_FILES)[number], Buffer>;
  const sizes = await Promise.all(
    PACKAGE_FILES.map((filename) => stat(resolve(resolvedDirectory, filename))),
  );
  const totalBytes = sizes.reduce((sum, item) => sum + item.size, 0);
  if (totalBytes > MAX_PACKAGE_BYTES) {
    throw new Error(
      `국제학교 반입 패키지는 ${MAX_PACKAGE_BYTES}바이트를 넘을 수 없습니다.`,
    );
  }
  const text = Object.fromEntries(
    Object.entries(buffers).map(([filename, buffer]) => [
      filename,
      buffer.toString("utf8"),
    ]),
  ) as Record<(typeof PACKAGE_FILES)[number], string>;
  const actualFileHashes = Object.fromEntries(
    manifestFileNames.map((filename) => [filename, sha256(buffers[filename])]),
  ) as Record<(typeof manifestFileNames)[number], string>;
  let rawSnapshot: unknown;
  try {
    rawSnapshot = JSON.parse(text["preppy-import.snapshot.json"]);
  } catch (error) {
    throw new Error(
      "preppy-import.snapshot.json의 JSON 형식이 올바르지 않습니다.",
      { cause: error },
    );
  }

  return deepFreeze({
    directory: resolvedDirectory,
    institutions: parseNdjson(
      text["institutions.ndjson"],
      "institutions.ndjson",
      (value) => institutionArtifactRecordSchema.parse(value),
    ),
    evidence: parseNdjson(
      text["evidence.ndjson"],
      "evidence.ndjson",
      (value) => evidenceArtifactRecordSchema.parse(value),
    ),
    socialEvidence: parseNdjson(
      text["social-evidence.ndjson"],
      "social-evidence.ndjson",
      (value) => socialEvidenceArtifactRecordSchema.parse(value),
    ),
    specialAccess: parseNdjson(
      text["special-access.ndjson"],
      "special-access.ndjson",
      (value) => specialAccessArtifactRecordSchema.parse(value),
    ),
    candidates: parseNdjson(
      text["candidates.ndjson"],
      "candidates.ndjson",
      (value) => candidateArtifactRecordSchema.parse(value),
    ),
    progress: parseJson(text["progress.json"], "progress.json", (value) =>
      progressSchema.parse(value),
    ),
    snapshot: parseJson(
      text["preppy-import.snapshot.json"],
      "preppy-import.snapshot.json",
      () => importSnapshotSchema.parse(rawSnapshot),
    ),
    manifest: parseJson(text["manifest.json"], "manifest.json", (value) =>
      manifestSchema.parse(value),
    ),
    verification: parseJson(
      text["verification.json"],
      "verification.json",
      (value) => verificationSchema.parse(value),
    ),
    actualImportChecksum: canonicalJsonSha256(rawSnapshot),
    actualFileHashes,
  });
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort();
}

export type InternationalSchoolValidationError = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type InternationalSchoolValidationReport = Readonly<{
  status: "PASS" | "FAIL";
  packageId: string;
  packageChecksum: string;
  reportChecksum: string;
  counts: Readonly<{
    officialActive: number;
    evidence: number;
    socialEvidence: number;
    specialAccess: number;
    candidates: number;
    snapshotInstitutions: number;
  }>;
  checksumsValid: boolean;
  errors: readonly InternationalSchoolValidationError[];
}>;

function isCaptured(evidence: EvidenceArtifactRecord): boolean {
  return (
    evidence.observedAt !== null &&
    evidence.sourceObservationRef !== null &&
    evidence.sourceSnapshotId !== null
  );
}

function isOfficial(evidence: EvidenceArtifactRecord): boolean {
  return (
    evidence.authorityLevel === "PRIMARY" ||
    evidence.authorityLevel === "SECONDARY_OFFICIAL"
  );
}

export function validateInternationalSchoolPackage(
  packageValue: InternationalSchoolImportPackage,
): InternationalSchoolValidationReport {
  const errors: InternationalSchoolValidationError[] = [];
  const add = (code: string, path: string, message: string) => {
    errors.push({ code, path, message });
  };
  const counts = {
    officialActive: packageValue.institutions.length,
    evidence: packageValue.evidence.length,
    socialEvidence: packageValue.socialEvidence.length,
    specialAccess: packageValue.specialAccess.length,
    candidates: packageValue.candidates.length,
    snapshotInstitutions: packageValue.snapshot.institutions.length,
  };
  if (counts.officialActive !== OFFICIAL_ACTIVE_COUNT) {
    add("OFFICIAL_COUNT", "institutions.ndjson", "공식 운영 기관은 22곳이어야 합니다.");
  }
  if (counts.specialAccess !== SPECIAL_ACCESS_COUNT) {
    add("SPECIAL_ACCESS_COUNT", "special-access.ndjson", "특수접근 기관은 7곳이어야 합니다.");
  }
  if (counts.candidates !== CANDIDATE_COUNT) {
    add("CANDIDATE_COUNT", "candidates.ndjson", "후보 레코드는 60개여야 합니다.");
  }
  if (counts.snapshotInstitutions !== OFFICIAL_ACTIVE_COUNT) {
    add("SNAPSHOT_COUNT", "preppy-import.snapshot.json", "반입 스냅샷은 22곳이어야 합니다.");
  }

  const officialIds = packageValue.institutions.map(
    (institution) => institution.registryExternalId,
  );
  const officialIdSet = new Set(officialIds);
  if (duplicates(officialIds).length > 0) {
    add("DUPLICATE_ISI_ID", "institutions.ndjson", "중복 ISI 등록키가 있습니다.");
  }
  if (
    duplicates(packageValue.institutions.map((item) => item.recordId)).length >
    0
  ) {
    add("DUPLICATE_RECORD_ID", "institutions.ndjson", "중복 기관 recordId가 있습니다.");
  }
  if (duplicates(packageValue.institutions.map((item) => item.slug)).length > 0) {
    add("DUPLICATE_SLUG", "institutions.ndjson", "중복 기관 slug가 있습니다.");
  }
  if (
    duplicates(packageValue.institutions.map((item) => item.officialMainUrl))
      .length > 0
  ) {
    add("DUPLICATE_OFFICIAL_URL", "institutions.ndjson", "중복 공식 URL이 있습니다.");
  }

  const evidenceIds = packageValue.evidence.map((item) => item.evidenceId);
  if (duplicates(evidenceIds).length > 0) {
    add("DUPLICATE_EVIDENCE_ID", "evidence.ndjson", "중복 evidenceId가 있습니다.");
  }
  const evidenceById = new Map(
    packageValue.evidence.map((evidence) => [evidence.evidenceId, evidence]),
  );
  for (const evidence of packageValue.evidence) {
    if (!officialIdSet.has(evidence.institutionRegistryId)) {
      add(
        "UNKNOWN_EVIDENCE_INSTITUTION",
        `evidence.ndjson:${evidence.evidenceId}`,
        "공식 기관 집합에 없는 근거입니다.",
      );
    }
    if (
      evidence.excerpt !== null &&
      sha256(evidence.excerpt) !== evidence.sourceContentSha256
    ) {
      add(
        "SOURCE_TEXT_CHECKSUM_MISMATCH",
        `evidence.ndjson:${evidence.evidenceId}`,
        "근거 발췌문 해시가 일치하지 않습니다.",
      );
    }
  }
  for (const institutionId of officialIds) {
    const identity = packageValue.evidence.some(
      (evidence) =>
        evidence.institutionRegistryId === institutionId &&
        evidence.claimType === "IDENTITY" &&
        evidence.status === "VERIFIED" &&
        evidence.sourceType === "OFFICIAL_REGISTRY" &&
        isOfficial(evidence) &&
        isCaptured(evidence),
    );
    if (!identity) {
      add(
        "MISSING_OFFICIAL_IDENTITY",
        `institutions.ndjson:${institutionId}`,
        "검증된 ISI 신원 근거가 필요합니다.",
      );
    }
  }

  const snapshotIds = packageValue.snapshot.institutions.map(
    (item) => item.registryExternalId,
  );
  if (
    duplicates(snapshotIds).length > 0 ||
    snapshotIds.some((id) => !officialIdSet.has(id)) ||
    officialIds.some((id) => !snapshotIds.includes(id))
  ) {
    add(
      "SNAPSHOT_INSTITUTION_MISMATCH",
      "preppy-import.snapshot.json",
      "스냅샷 기관 집합이 공식 22곳과 일치하지 않습니다.",
    );
  }
  for (const item of packageValue.snapshot.institutions) {
    const sections = item.coverages.map((coverage) => coverage.section);
    if (
      duplicates(sections).length > 0 ||
      REQUIRED_SECTIONS.some((section) => !sections.includes(section)) ||
      sections.length !== REQUIRED_SECTIONS.length
    ) {
      add(
        "COVERAGE_SET_MISMATCH",
        `snapshot:${item.registryExternalId}:coverages`,
        "coverage 8개 항목이 정확히 한 번씩 필요합니다.",
      );
    }
    for (const coverage of item.coverages) {
      const evidence =
        coverage.evidenceId === null
          ? undefined
          : evidenceById.get(coverage.evidenceId);
      if (
        coverage.evidenceId !== null &&
        evidence?.institutionRegistryId !== item.registryExternalId
      ) {
        add(
          "INVALID_EVIDENCE_REFERENCE",
          `snapshot:${item.registryExternalId}:${coverage.section}`,
          "coverage 근거 참조가 기관과 일치하지 않습니다.",
        );
      }
      if (coverage.status === "CONFIRMED") {
        if (
          !evidence ||
          evidence.status !== "VERIFIED" ||
          !isOfficial(evidence) ||
          !isCaptured(evidence)
        ) {
          add(
            "UNQUALIFIED_CONFIRMED_COVERAGE",
            `snapshot:${item.registryExternalId}:${coverage.section}`,
            "CONFIRMED에는 캡처된 공식 VERIFIED 근거가 필요합니다.",
          );
        }
      } else if (
        coverage.status === "CHECKED_NOT_FOUND" &&
        evidence?.status !== "NOT_FOUND_IN_CHECKED_OFFICIAL_SOURCES"
      ) {
        add(
          "COVERAGE_STATUS_MISMATCH",
          `snapshot:${item.registryExternalId}:${coverage.section}`,
          "CHECKED_NOT_FOUND와 근거 상태가 일치하지 않습니다.",
        );
      } else if (
        coverage.status === "ACCESS_FAILED" &&
        evidence?.status !== "ACCESS_FAILED"
      ) {
        add(
          "COVERAGE_STATUS_MISMATCH",
          `snapshot:${item.registryExternalId}:${coverage.section}`,
          "ACCESS_FAILED와 근거 상태가 일치하지 않습니다.",
        );
      } else if (
        coverage.status === "NOT_RESEARCHED" &&
        coverage.evidenceId !== null
      ) {
        add(
          "COVERAGE_STATUS_MISMATCH",
          `snapshot:${item.registryExternalId}:${coverage.section}`,
          "NOT_RESEARCHED에는 근거를 연결할 수 없습니다.",
        );
      }
    }
    for (const fact of item.facts) {
      const factEvidence = fact.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((value): value is EvidenceArtifactRecord => value !== undefined);
      const qualified = factEvidence.some(
        (evidence) =>
          evidence.institutionRegistryId === item.registryExternalId &&
          evidence.claimType === "FACT" &&
          evidence.field === fact.factType &&
          evidence.status === "VERIFIED" &&
          isOfficial(evidence) &&
          FACT_OFFICIAL_SOURCE_TYPES.has(evidence.sourceType) &&
          isCaptured(evidence),
      );
      if (!qualified) {
        add(
          "UNQUALIFIED_CURRENT_FACT",
          `snapshot:${item.registryExternalId}:fact:${fact.factType}`,
          "현재 사실에는 캡처된 공식 VERIFIED 근거가 필요합니다.",
        );
      }
      if (factEvidence.some((evidence) => !isCaptured(evidence))) {
        add(
          "MISSING_EVIDENCE_CAPTURE",
          `snapshot:${item.registryExternalId}:fact:${fact.factType}`,
          "현재 사실 근거에는 observation과 snapshot이 모두 필요합니다.",
        );
      }
    }
    for (const opportunity of item.opportunities) {
      const opportunityEvidence = opportunity.evidenceIds
        .map((id) => evidenceById.get(id))
        .filter((value): value is EvidenceArtifactRecord => value !== undefined);
      const qualified = opportunityEvidence.some(
        (evidence) =>
          evidence.institutionRegistryId === item.registryExternalId &&
          evidence.claimType === "OPPORTUNITY" &&
          evidence.status === "VERIFIED" &&
          isOfficial(evidence) &&
          OPPORTUNITY_OFFICIAL_SOURCE_TYPES.has(evidence.sourceType) &&
          isCaptured(evidence),
      );
      if (!qualified) {
        add(
          "UNQUALIFIED_CURRENT_OPPORTUNITY",
          `snapshot:${item.registryExternalId}:opportunity:${opportunity.slug}`,
          "현재 행사에는 캡처된 공식 VERIFIED 근거가 필요합니다.",
        );
      }
    }
  }

  const socialPiiPattern =
    /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|01[016789][-\s]?\d{3,4}[-\s]?\d{4})/u;
  const htmlPattern = /<(?:!doctype|html|head|body|script|style)\b/iu;
  for (const social of packageValue.socialEvidence) {
    const path = `social-evidence.ndjson:${social.socialEvidenceId}`;
    if (!officialIdSet.has(social.institutionRegistryId)) {
      add("UNKNOWN_SOCIAL_INSTITUTION", path, "공식 기관 집합에 없는 소셜 근거입니다.");
    }
    if (social.excerpt !== null && social.excerpt.length > 2_000) {
      add("SOCIAL_EXCERPT_TOO_LONG", path, "소셜 발췌문은 2,000자를 넘을 수 없습니다.");
    }
    if (social.excerpt !== null && htmlPattern.test(social.excerpt)) {
      add("SOCIAL_HTML", path, "전체 HTML을 소셜 근거로 저장할 수 없습니다.");
    }
    if (social.excerpt !== null && socialPiiPattern.test(social.excerpt)) {
      add("SOCIAL_PII", path, "작성자 개인정보가 소셜 근거에 포함돼 있습니다.");
    }
    if (
      (social.accessStatus === "LOGIN_REQUIRED" ||
        social.accessStatus === "ROBOTS_BLOCKED") &&
      social.excerpt !== null
    ) {
      add("INACCESSIBLE_SOCIAL_EXCERPT", path, "열지 못한 글의 내용을 저장할 수 없습니다.");
    }
  }

  if (
    duplicates(packageValue.specialAccess.map((item) => item.recordId)).length >
    0
  ) {
    add("DUPLICATE_SPECIAL_ACCESS_ID", "special-access.ndjson", "중복 특수접근 ID가 있습니다.");
  }
  if (duplicates(packageValue.candidates.map((item) => item.recordId)).length > 0) {
    add("DUPLICATE_CANDIDATE_ID", "candidates.ndjson", "중복 후보 ID가 있습니다.");
  }

  const checksumsValid =
    manifestFileNames.every(
      (filename) =>
        packageValue.manifest.files[filename] ===
        packageValue.actualFileHashes[filename],
    ) &&
    packageValue.manifest.preppyImportChecksum ===
      packageValue.actualImportChecksum;
  if (!checksumsValid) {
    add(
      "FILE_CHECKSUM_MISMATCH",
      "manifest.json",
      "원시 파일 또는 반입 스냅샷 체크섬이 일치하지 않습니다.",
    );
  }

  const packageIds = [
    packageValue.progress.packageId,
    packageValue.snapshot.packageId,
    packageValue.manifest.packageId,
    packageValue.verification.packageId,
  ];
  if (packageIds.some((id) => id !== packageValue.manifest.packageId)) {
    add("PACKAGE_ID_MISMATCH", "package", "파일 사이의 packageId가 일치하지 않습니다.");
  }
  if (
    packageValue.progress.counts.officialActive !== counts.officialActive ||
    packageValue.progress.counts.specialAccess !== counts.specialAccess ||
    packageValue.progress.counts.candidates !== counts.candidates ||
    packageValue.progress.counts.importInstitutions !==
      counts.snapshotInstitutions
  ) {
    add("PROGRESS_COUNT_MISMATCH", "progress.json", "progress 합계가 원장과 다릅니다.");
  }

  errors.sort(
    (left, right) =>
      left.code.localeCompare(right.code) ||
      left.path.localeCompare(right.path) ||
      left.message.localeCompare(right.message),
  );
  const withoutReportChecksum = {
    status: errors.length === 0 ? ("PASS" as const) : ("FAIL" as const),
    packageId: packageValue.manifest.packageId,
    packageChecksum: canonicalJsonSha256(packageValue.manifest),
    counts,
    checksumsValid,
    errors,
  };
  return deepFreeze({
    ...withoutReportChecksum,
    reportChecksum: canonicalJsonSha256(withoutReportChecksum),
  });
}
