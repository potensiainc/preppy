import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  campusRecordSchema,
  evidenceRecordSchema,
  importSnapshotSchema,
  manifestSchema,
  progressSchema,
  type EnglishKindergartenImportPackage,
  type EnglishKindergartenManifest,
} from "./artifact-schema";

const PACKAGE_FILES = [
  "campuses.ndjson",
  "evidence.ndjson",
  "progress.json",
  "preppy-import.snapshot.json",
  "manifest.json",
] as const;
const HASHED_FILES = PACKAGE_FILES.slice(
  0,
  4,
) as readonly (keyof EnglishKindergartenManifest["files"])[];
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;
const exactDistricts = { 강남구: 13, 서초구: 12 } as const;
const exactLegalDongs = { 신사동: 13, 잠원동: 1, 반포동: 11 } as const;

function sha256(value: string | Buffer) {
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

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalJsonSha256(value: unknown) {
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
      let decoded: unknown;
      try {
        decoded = JSON.parse(line);
      } catch (error) {
        throw new Error(
          `${filename} ${index + 1}행의 JSON 형식이 올바르지 않습니다.`,
          {
            cause: error,
          },
        );
      }
      try {
        return parse(decoded);
      } catch (error) {
        throw new Error(
          `${filename} ${index + 1}행의 값이 계약과 맞지 않습니다.`,
          {
            cause: error,
          },
        );
      }
    });
}

export async function loadEnglishKindergartenPackage(
  directory: string,
): Promise<EnglishKindergartenImportPackage> {
  const paths = Object.fromEntries(
    PACKAGE_FILES.map((filename) => [filename, resolve(directory, filename)]),
  ) as Record<(typeof PACKAGE_FILES)[number], string>;
  const sizes = await Promise.all(
    PACKAGE_FILES.map((filename) => stat(paths[filename])),
  );
  const totalBytes = sizes.reduce((sum, item) => sum + item.size, 0);
  if (totalBytes > MAX_PACKAGE_BYTES) {
    throw new Error(
      `영어유치원 반입 패키지는 ${MAX_PACKAGE_BYTES}바이트를 넘을 수 없습니다.`,
    );
  }
  const contents = Object.fromEntries(
    await Promise.all(
      PACKAGE_FILES.map(async (filename) => [
        filename,
        await readFile(paths[filename], "utf8"),
      ]),
    ),
  ) as Record<(typeof PACKAGE_FILES)[number], string>;

  const actualFileHashes = Object.fromEntries(
    HASHED_FILES.map((filename) => [filename, sha256(contents[filename])]),
  ) as Record<keyof EnglishKindergartenManifest["files"], string>;

  return deepFreeze({
    directory: resolve(directory),
    campuses: parseNdjson(
      contents["campuses.ndjson"],
      "campuses.ndjson",
      (value) => campusRecordSchema.parse(value),
    ),
    evidence: parseNdjson(
      contents["evidence.ndjson"],
      "evidence.ndjson",
      (value) => evidenceRecordSchema.parse(value),
    ),
    progress: progressSchema.parse(JSON.parse(contents["progress.json"])),
    snapshot: importSnapshotSchema.parse(
      JSON.parse(contents["preppy-import.snapshot.json"]),
    ),
    manifest: manifestSchema.parse(JSON.parse(contents["manifest.json"])),
    actualFileHashes,
  });
}

function duplicates(values: readonly string[]) {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort();
}

function counts<T extends string>(values: readonly T[]) {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [
        value,
        values.filter((candidate) => candidate === value).length,
      ]),
  );
}

export type ValidationReport = Readonly<{
  status: "PASS" | "FAIL";
  packageId: string;
  packageChecksum: string;
  reportChecksum: string;
  counts: Readonly<{
    campuses: number;
    evidence: number;
    districts: Readonly<Record<string, number>>;
    legalDongs: Readonly<Record<string, number>>;
  }>;
  duplicateCampusIds: readonly string[];
  duplicateSlugs: readonly string[];
  duplicateEvidenceIds: readonly string[];
  unknownEvidenceCampusIds: readonly string[];
  missingEvidenceCampusIds: readonly string[];
  sourceTextHashMismatches: readonly string[];
  snapshotCampusMismatches: readonly string[];
  progressMatches: boolean;
  checksumsValid: boolean;
  errors: readonly string[];
}>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

export function validateEnglishKindergartenPackage(
  packageValue: EnglishKindergartenImportPackage,
): ValidationReport {
  const campusIds = packageValue.campuses.map((campus) => campus.campusId);
  const campusIdSet = new Set(campusIds);
  const duplicateCampusIds = duplicates(campusIds);
  const duplicateSlugs = duplicates(
    packageValue.campuses.map((campus) => campus.slug),
  );
  const duplicateEvidenceIds = duplicates(
    packageValue.evidence.map((evidence) => evidence.evidenceId),
  );
  const unknownEvidenceCampusIds = [
    ...new Set(
      packageValue.evidence
        .filter((evidence) => !campusIdSet.has(evidence.campusId))
        .map((evidence) => evidence.campusId),
    ),
  ].sort();
  const evidenceByCampus = new Map<string, Set<string>>();
  for (const evidence of packageValue.evidence) {
    const claims = evidenceByCampus.get(evidence.campusId) ?? new Set<string>();
    claims.add(evidence.claimType);
    evidenceByCampus.set(evidence.campusId, claims);
  }
  const requiredClaims = ["IDENTITY", "OPERATION", "CLASSIFICATION"];
  const missingEvidenceCampusIds = campusIds.filter((campusId) => {
    const claims = evidenceByCampus.get(campusId);
    return requiredClaims.some((claim) => !claims?.has(claim));
  });
  const sourceTextHashMismatches = packageValue.evidence
    .filter(
      (evidence) =>
        sha256(evidence.sourceTextExcerpt) !== evidence.sourceContentSha256,
    )
    .map((evidence) => evidence.evidenceId)
    .sort();
  const snapshotCampusIds = packageValue.snapshot.institutions.map(
    (item) => item.campusId,
  );
  const snapshotCampusMismatches = [
    ...new Set([
      ...campusIds.filter((id) => !snapshotCampusIds.includes(id)),
      ...snapshotCampusIds.filter((id) => !campusIdSet.has(id)),
      ...duplicates(snapshotCampusIds),
    ]),
  ].sort();
  const districtCounts = counts(
    packageValue.campuses.map((campus) => campus.district),
  );
  const legalDongCounts = counts(
    packageValue.campuses.map((campus) => campus.legalDong),
  );
  const progressMatches =
    packageValue.progress.confirmed === packageValue.campuses.length &&
    packageValue.progress.excluded === 0 &&
    packageValue.progress.held === 0 &&
    packageValue.progress.recordsReviewed === packageValue.campuses.length &&
    canonicalJson(packageValue.progress.districts) ===
      canonicalJson(districtCounts) &&
    canonicalJson(packageValue.progress.legalDongs) ===
      canonicalJson(legalDongCounts) &&
    canonicalJson(packageValue.progress.sourceFetches) ===
      canonicalJson({
        success: packageValue.evidence.filter(
          (evidence) =>
            evidence.claimType === "IDENTITY" &&
            evidence.fetchOutcome === "SUCCESS",
        ).length,
        accessFailed: packageValue.evidence.filter(
          (evidence) =>
            evidence.claimType === "IDENTITY" &&
            evidence.fetchOutcome === "ACCESS_FAILED",
        ).length,
        checkedNotFound: packageValue.evidence.filter(
          (evidence) =>
            evidence.claimType === "IDENTITY" &&
            evidence.fetchOutcome === "CHECKED_NOT_FOUND",
        ).length,
      });
  const packageChecksum = canonicalJsonSha256(packageValue.manifest);
  const snapshotChecksum = canonicalJsonSha256(packageValue.snapshot);
  const checksumsValid =
    HASHED_FILES.every(
      (filename) =>
        packageValue.manifest.files[filename] ===
        packageValue.actualFileHashes[filename],
    ) && packageValue.manifest.preppyImportChecksum === snapshotChecksum;

  const evidenceById = new Map(
    packageValue.evidence.map((evidence) => [evidence.evidenceId, evidence]),
  );
  const crossFileErrors: string[] = [];
  for (const item of packageValue.snapshot.institutions) {
    const sections = item.coverages.map((coverage) => coverage.section);
    if (duplicates(sections).length > 0 || new Set(sections).size !== 8) {
      crossFileErrors.push(
        `${item.campusId}: coverage 항목 구성이 올바르지 않습니다.`,
      );
    }
    const references = [
      ...item.coverages.flatMap((coverage) =>
        coverage.evidenceId ? [coverage.evidenceId] : [],
      ),
      ...item.facts.flatMap((fact) => fact.evidenceIds),
      ...item.opportunities.flatMap((opportunity) => opportunity.evidenceIds),
      ...(item.reviewInsight?.evidenceIds ?? []),
    ];
    for (const evidenceId of references) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence || evidence.campusId !== item.campusId) {
        crossFileErrors.push(
          `${item.campusId}: 근거 ${evidenceId} 참조가 올바르지 않습니다.`,
        );
      }
    }
    for (const coverage of item.coverages) {
      if (
        coverage.status !== "CONFIRMED" &&
        coverage.status !== "CHECKED_NOT_FOUND"
      ) {
        continue;
      }
      const evidence = coverage.evidenceId
        ? evidenceById.get(coverage.evidenceId)
        : undefined;
      if (!evidence || evidence.authorityLevel === "THIRD_PARTY") {
        crossFileErrors.push(
          `${item.campusId}: ${coverage.status} 상태에는 공식 근거가 필요합니다.`,
        );
      } else if (
        (coverage.status === "CONFIRMED" &&
          evidence.fetchOutcome !== "SUCCESS") ||
        (coverage.status === "CHECKED_NOT_FOUND" &&
          evidence.fetchOutcome !== "CHECKED_NOT_FOUND")
      ) {
        crossFileErrors.push(
          `${item.campusId}: ${coverage.status} 상태와 수집 결과가 일치하지 않습니다.`,
        );
      }
    }
    for (const verifiedItem of [...item.facts, ...item.opportunities]) {
      const hasAuthoritativeEvidence = verifiedItem.evidenceIds.some(
        (evidenceId) => {
          const evidence = evidenceById.get(evidenceId);
          return (
            evidence?.authorityLevel !== "THIRD_PARTY" &&
            evidence?.fetchOutcome === "SUCCESS"
          );
        },
      );
      if (!hasAuthoritativeEvidence) {
        crossFileErrors.push(
          `${item.campusId}: 검증된 정보에는 수집에 성공한 공식 근거가 필요합니다.`,
        );
      }
    }
  }

  const errors = [
    ...(packageValue.campuses.length === 25
      ? []
      : ["기관 행 수가 25가 아닙니다."]),
    ...(canonicalJson(districtCounts) === canonicalJson(exactDistricts)
      ? []
      : ["자치구 합계가 13/12와 일치하지 않습니다."]),
    ...(canonicalJson(legalDongCounts) === canonicalJson(exactLegalDongs)
      ? []
      : ["법정동 합계가 13/1/11과 일치하지 않습니다."]),
    ...(duplicateCampusIds.length ? ["중복 campusId가 있습니다."] : []),
    ...(duplicateSlugs.length ? ["중복 slug가 있습니다."] : []),
    ...(duplicateEvidenceIds.length ? ["중복 evidenceId가 있습니다."] : []),
    ...(unknownEvidenceCampusIds.length
      ? ["알 수 없는 기관 근거가 있습니다."]
      : []),
    ...(missingEvidenceCampusIds.length
      ? ["필수 신원·운영·분류 근거가 누락됐습니다."]
      : []),
    ...(sourceTextHashMismatches.length
      ? ["근거 캡처 텍스트 해시가 일치하지 않습니다."]
      : []),
    ...(snapshotCampusMismatches.length
      ? ["반입 스냅샷의 기관 집합이 다릅니다."]
      : []),
    ...(progressMatches ? [] : ["progress.json 합계가 원장과 다릅니다."]),
    ...(checksumsValid ? [] : ["파일 또는 반입 스냅샷 체크섬이 다릅니다."]),
    ...(packageValue.progress.packageId === packageValue.manifest.packageId &&
    packageValue.snapshot.packageId === packageValue.manifest.packageId
      ? []
      : ["패키지 ID가 파일 사이에서 일치하지 않습니다."]),
    ...crossFileErrors,
  ];
  const withoutReportChecksum = {
    status: errors.length === 0 ? ("PASS" as const) : ("FAIL" as const),
    packageId: packageValue.manifest.packageId,
    packageChecksum,
    counts: {
      campuses: packageValue.campuses.length,
      evidence: packageValue.evidence.length,
      districts: districtCounts,
      legalDongs: legalDongCounts,
    },
    duplicateCampusIds,
    duplicateSlugs,
    duplicateEvidenceIds,
    unknownEvidenceCampusIds,
    missingEvidenceCampusIds,
    sourceTextHashMismatches,
    snapshotCampusMismatches,
    progressMatches,
    checksumsValid,
    errors,
  };
  return deepFreeze({
    ...withoutReportChecksum,
    reportChecksum: canonicalJsonSha256(withoutReportChecksum),
  });
}
