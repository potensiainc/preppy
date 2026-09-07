import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  CampusRecord,
  EnglishKindergartenImportPackage,
  EvidenceRecord,
} from "@/src/modules/english-kindergarten-import/artifact-schema";
import {
  canonicalJsonSha256,
  loadEnglishKindergartenPackage,
  validateEnglishKindergartenPackage,
} from "@/src/modules/english-kindergarten-import/validator";
import { englishKindergartenSectionValues } from "@/src/modules/english-kindergarten/coverage";

const temporaryDirectories: string[] = [];
const collectedAt = "2026-09-01T03:00:00.000Z";

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureRecords() {
  const campuses: CampusRecord[] = Array.from({ length: 25 }, (_, index) => {
    const district = index < 13 ? "강남구" : "서초구";
    const legalDong =
      index < 13 ? "신사동" : index === 13 ? "잠원동" : "반포동";
    return {
      campusId: `sg-ek-${String(index + 1).padStart(3, "0")}`,
      displayName: `검증 기관 ${index + 1}`,
      slug: `validated-academy-${index + 1}`,
      addressLine: `${district} 검증로 ${index + 1}`,
      district,
      legalDong,
      operationalState: "ACTIVE",
      classificationState: "CONFIRMED",
      officialChannels: [],
      collectedAt,
    };
  });
  const evidence: EvidenceRecord[] = campuses.flatMap((campus) =>
    (["IDENTITY", "OPERATION", "CLASSIFICATION"] as const).map((claimType) => {
      const sourceTextExcerpt = `${campus.displayName}의 ${claimType} 공개 안내예요.`;
      const sourceUrl = `https://evidence.example.test/${campus.campusId}/${claimType.toLowerCase()}`;
      return {
        evidenceId: `${campus.campusId}-${claimType.toLowerCase()}`,
        campusId: campus.campusId,
        claimType,
        sourceUrl,
        finalUrl: sourceUrl,
        sourceType: "OFFICIAL_SCHOOL_PAGE" as const,
        authorityLevel: "PRIMARY" as const,
        fetchOutcome: "SUCCESS" as const,
        sourceTextExcerpt,
        boundedExcerpt: `${campus.displayName}의 ${claimType} 근거를 확인했어요.`,
        collectedAt,
        sourceContentSha256: sha(sourceTextExcerpt),
      };
    }),
  );
  const snapshot = {
    schemaVersion: 1 as const,
    packageId: "sg-ek-20260901-r01",
    institutions: campuses.map((campus) => ({
      campusId: campus.campusId,
      category: "ENGLISH_KINDERGARTEN" as const,
      publicationState: "DRAFT" as const,
      coverages: englishKindergartenSectionValues.map((section) => ({
        section,
        status: "NOT_RESEARCHED" as const,
        evidenceId: null,
        academicYearLabel: null,
        publicNote: null,
        internalNote: null,
        lastCollectedAt: null,
        lastCheckedAt: collectedAt,
      })),
      facts: [],
      opportunities: [],
      reviewInsight: null,
    })),
  };
  const progress = {
    packageId: "sg-ek-20260901-r01",
    confirmed: 25,
    excluded: 0,
    held: 0,
    recordsReviewed: 25,
    districts: { 강남구: 13, 서초구: 12 },
    legalDongs: { 신사동: 13, 잠원동: 1, 반포동: 11 },
    sourceFetches: { success: 25, accessFailed: 0, checkedNotFound: 0 },
  };
  return { campuses, evidence, snapshot, progress };
}

function packageFixture(): EnglishKindergartenImportPackage {
  const { campuses, evidence, snapshot, progress } = fixtureRecords();
  const checksum = canonicalJsonSha256(snapshot);
  const zero = "0".repeat(64);
  return {
    directory: "fixture",
    campuses,
    evidence,
    snapshot,
    progress,
    manifest: {
      schemaVersion: 1,
      packageId: snapshot.packageId,
      files: {
        "campuses.ndjson": zero,
        "evidence.ndjson": zero,
        "progress.json": zero,
        "preppy-import.snapshot.json": zero,
      },
      preppyImportChecksum: checksum,
    },
    actualFileHashes: {
      "campuses.ndjson": zero,
      "evidence.ndjson": zero,
      "progress.json": zero,
      "preppy-import.snapshot.json": zero,
    },
  };
}

async function writePackage(overrides?: {
  campusesText?: string;
  evidenceText?: string;
  progress?: unknown;
  manifestHashMismatch?: boolean;
}) {
  const directory = await mkdtemp(join(tmpdir(), "preppy-ek-artifact-"));
  temporaryDirectories.push(directory);
  const { campuses, evidence, snapshot, progress } = fixtureRecords();
  const files = {
    "campuses.ndjson":
      overrides?.campusesText ??
      campuses.map((item) => JSON.stringify(item)).join("\n") + "\n",
    "evidence.ndjson":
      overrides?.evidenceText ??
      evidence.map((item) => JSON.stringify(item)).join("\n") + "\n",
    "progress.json":
      JSON.stringify(overrides?.progress ?? progress, null, 2) + "\n",
    "preppy-import.snapshot.json": JSON.stringify(snapshot, null, 2) + "\n",
  };
  const manifest = {
    schemaVersion: 1,
    packageId: snapshot.packageId,
    files: Object.fromEntries(
      Object.entries(files).map(([name, contents]) => [name, sha(contents)]),
    ),
    preppyImportChecksum: canonicalJsonSha256(snapshot),
  };
  if (overrides?.manifestHashMismatch)
    manifest.files["campuses.ndjson"] = "0".repeat(64);
  await Promise.all([
    ...Object.entries(files).map(([name, contents]) =>
      writeFile(join(directory, name), contents, "utf8"),
    ),
    writeFile(
      join(directory, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8",
    ),
  ]);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("English-kindergarten snapshot contracts", () => {
  it("derives exact counts, required evidence, and stable checksums", () => {
    const fixture = packageFixture();
    const report = validateEnglishKindergartenPackage(fixture);
    expect(report.counts).toEqual({
      campuses: 25,
      evidence: fixture.evidence.length,
      districts: { 강남구: 13, 서초구: 12 },
      legalDongs: { 신사동: 13, 잠원동: 1, 반포동: 11 },
    });
    expect(report.status).toBe("PASS");
    expect(report.duplicateSlugs).toEqual([]);
    expect(report.missingEvidenceCampusIds).toEqual([]);
    expect(report.sourceTextHashMismatches).toEqual([]);
    expect(report.checksumsValid).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
    const changedManifest = {
      ...fixture,
      manifest: {
        ...fixture.manifest,
        files: {
          ...fixture.manifest.files,
          "campuses.ndjson": "1".repeat(64),
        },
      },
    };
    expect(
      validateEnglishKindergartenPackage(changedManifest).packageChecksum,
    ).not.toBe(report.packageChecksum);
  });

  it("reports duplicate identity, unknown references, missing evidence, progress, and checksum failures", () => {
    const fixture = packageFixture();
    const brokenEvidence = [
      ...fixture.evidence.filter(
        (item) =>
          !(
            item.campusId === fixture.campuses[0]!.campusId &&
            item.claimType === "OPERATION"
          ),
      ),
      {
        ...fixture.evidence[0]!,
        evidenceId: "unknown-campus-evidence",
        campusId: "unknown-campus",
      },
    ];
    const broken: EnglishKindergartenImportPackage = {
      ...fixture,
      campuses: [
        fixture.campuses[0]!,
        { ...fixture.campuses[1]!, slug: fixture.campuses[0]!.slug },
        ...fixture.campuses.slice(2),
      ],
      evidence: brokenEvidence,
      progress: { ...fixture.progress, confirmed: 24 },
      manifest: { ...fixture.manifest, preppyImportChecksum: "f".repeat(64) },
    };
    const report = validateEnglishKindergartenPackage(broken);
    expect(report.status).toBe("FAIL");
    expect(report.duplicateSlugs).toEqual([fixture.campuses[0]!.slug]);
    expect(report.missingEvidenceCampusIds).toContain(
      fixture.campuses[0]!.campusId,
    );
    expect(report.unknownEvidenceCampusIds).toEqual(["unknown-campus"]);
    expect(report.progressMatches).toBe(false);
    expect(report.checksumsValid).toBe(false);
  });

  it("loads valid NDJSON and rejects malformed rows, unsafe/full-document evidence, and mismatched hashes", async () => {
    const valid = await loadEnglishKindergartenPackage(await writePackage());
    expect(validateEnglishKindergartenPackage(valid).status).toBe("PASS");
    expect(Object.isFrozen(valid)).toBe(true);
    expect(Object.isFrozen(valid.campuses[0])).toBe(true);

    await expect(
      loadEnglishKindergartenPackage(
        await writePackage({ campusesText: "{bad json\n" }),
      ),
    ).rejects.toThrow("campuses.ndjson 1행");

    const { evidence } = fixtureRecords();
    const invalidEvidence = [
      {
        ...evidence[0]!,
        sourceUrl: "http://unsafe.example.test",
        finalUrl: "http://unsafe.example.test",
        boundedExcerpt: "<!doctype html><html><body>full</body></html>",
      },
      ...evidence.slice(1),
    ];
    await expect(
      loadEnglishKindergartenPackage(
        await writePackage({
          evidenceText:
            invalidEvidence.map((item) => JSON.stringify(item)).join("\n") +
            "\n",
        }),
      ),
    ).rejects.toThrow("evidence.ndjson 1행");

    const mismatched = await loadEnglishKindergartenPackage(
      await writePackage({ manifestHashMismatch: true }),
    );
    expect(validateEnglishKindergartenPackage(mismatched).checksumsValid).toBe(
      false,
    );
  });
});
