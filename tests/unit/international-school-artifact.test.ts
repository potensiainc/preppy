import { appendFile, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  loadInternationalSchoolPackage,
  validateInternationalSchoolPackage,
} from "@/src/modules/international-school-import/validator";
import {
  createValidInternationalSchoolPackageValues,
  writeValidInternationalSchoolPackage,
} from "../fixtures/international-school/minimal-valid-package";

const directories: string[] = [];

async function packageDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "preppy-is-artifact-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("international-school package validation", () => {
  it("accepts exactly 22 official, 7 special-access, and 60 candidate records", async () => {
    const directory = await packageDirectory();
    await writeValidInternationalSchoolPackage(directory);

    const report = validateInternationalSchoolPackage(
      await loadInternationalSchoolPackage(directory),
    );

    expect(report.errors).toEqual([]);
    expect(report.status).toBe("PASS");
    expect(report.counts).toMatchObject({
      officialActive: 22,
      specialAccess: 7,
      candidates: 60,
      snapshotInstitutions: 22,
    });
    expect(report.errors).toEqual([]);
  });

  it.each([
    [
      "OFFICIAL_COUNT",
      (
        values: ReturnType<typeof createValidInternationalSchoolPackageValues>,
      ) => values.institutions.pop(),
    ],
    [
      "SPECIAL_ACCESS_COUNT",
      (
        values: ReturnType<typeof createValidInternationalSchoolPackageValues>,
      ) => values.specialAccess.pop(),
    ],
    [
      "CANDIDATE_COUNT",
      (
        values: ReturnType<typeof createValidInternationalSchoolPackageValues>,
      ) => values.candidates.pop(),
    ],
    [
      "SNAPSHOT_COUNT",
      (
        values: ReturnType<typeof createValidInternationalSchoolPackageValues>,
      ) => values.snapshot.institutions.pop(),
    ],
  ])("rejects the wrong %s", async (code, mutate) => {
    const directory = await packageDirectory();
    await writeValidInternationalSchoolPackage(directory, mutate);

    const report = validateInternationalSchoolPackage(
      await loadInternationalSchoolPackage(directory),
    );

    expect(report.errors.map((error) => error.code)).toContain(code);
  });

  it("rejects duplicate ISI IDs and snapshot records outside the official set", async () => {
    const directory = await packageDirectory();
    await writeValidInternationalSchoolPackage(directory, (values) => {
      values.institutions[1]!.registryExternalId = "ST01:1";
      values.snapshot.institutions[2]!.registryExternalId = "ST01:999";
    });

    const report = validateInternationalSchoolPackage(
      await loadInternationalSchoolPackage(directory),
    );

    expect(report.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "DUPLICATE_ISI_ID",
        "SNAPSHOT_INSTITUTION_MISMATCH",
      ]),
    );
  });

  it.each([
    ["VERIFIED_WITH_WARNING", "UNQUALIFIED_CURRENT_FACT"],
    ["VERIFIED_WITH_DATE_LIMIT", "UNQUALIFIED_CURRENT_FACT"],
    ["NEEDS_REVIEW", "UNQUALIFIED_CURRENT_FACT"],
  ])(
    "does not promote %s evidence into a current fact",
    async (status, code) => {
      const directory = await packageDirectory();
      await writeValidInternationalSchoolPackage(directory, (values) => {
        values.evidence.at(-1)!.status = status;
      });

      const report = validateInternationalSchoolPackage(
        await loadInternationalSchoolPackage(directory),
      );

      expect(report.errors.map((error) => error.code)).toContain(code);
    },
  );

  it.each([
    ["sourceObservationRef", "MISSING_EVIDENCE_CAPTURE"],
    ["sourceSnapshotId", "MISSING_EVIDENCE_CAPTURE"],
  ])("requires %s for promoted facts", async (field, code) => {
    const directory = await packageDirectory();
    await writeValidInternationalSchoolPackage(directory, (values) => {
      Object.assign(values.evidence.at(-1)!, { [field]: null });
    });

    const report = validateInternationalSchoolPackage(
      await loadInternationalSchoolPackage(directory),
    );

    expect(report.errors.map((error) => error.code)).toContain(code);
  });

  it("rejects discovery-only evidence for a current fact", async () => {
    const directory = await packageDirectory();
    await writeValidInternationalSchoolPackage(directory, (values) => {
      const evidence = values.evidence.at(-1)!;
      evidence.sourceType = "THIRD_PARTY_DISCOVERY";
      evidence.authorityLevel = "DISCOVERY_ONLY";
    });

    const report = validateInternationalSchoolPackage(
      await loadInternationalSchoolPackage(directory),
    );

    expect(report.errors.map((error) => error.code)).toContain(
      "UNQUALIFIED_CURRENT_FACT",
    );
  });

  it.each([
    ["contact@example.com", "SOCIAL_PII"],
    ["010-1234-5678", "SOCIAL_PII"],
    ["<html><body>copied page</body></html>", "SOCIAL_HTML"],
    ["x".repeat(2_001), "SOCIAL_EXCERPT_TOO_LONG"],
  ])("rejects unsafe social excerpts: %s", async (excerpt, code) => {
    const directory = await packageDirectory();
    await writeValidInternationalSchoolPackage(directory, (values) => {
      values.socialEvidence[0]!.excerpt = excerpt;
    });

    const report = validateInternationalSchoolPackage(
      await loadInternationalSchoolPackage(directory),
    );

    expect(report.errors.map((error) => error.code)).toContain(code);
  });

  it("rejects full HTML in official evidence at the schema boundary", async () => {
    const directory = await packageDirectory();
    await writeValidInternationalSchoolPackage(directory, (values) => {
      values.evidence[0]!.excerpt = "<!doctype html><html></html>";
    });

    await expect(loadInternationalSchoolPackage(directory)).rejects.toThrow(
      /evidence\.ndjson 1행/u,
    );
  });

  it("detects a raw input byte change while excluding verification from hashes", async () => {
    const directory = await packageDirectory();
    await writeValidInternationalSchoolPackage(directory);
    await appendFile(join(directory, "institutions.ndjson"), " \n", "utf8");

    const tampered = validateInternationalSchoolPackage(
      await loadInternationalSchoolPackage(directory),
    );
    expect(tampered.errors.map((error) => error.code)).toContain(
      "FILE_CHECKSUM_MISMATCH",
    );

    const cleanDirectory = await packageDirectory();
    await writeValidInternationalSchoolPackage(cleanDirectory);
    await writeFile(
      join(cleanDirectory, "verification.json"),
      JSON.stringify({
        schemaVersion: 1,
        packageId: "sg-is-fixture-r01",
        status: "FAIL",
        checkedAt: "2026-09-15T01:00:00.000Z",
        checks: [{ name: "changed report", status: "FAIL" }],
        readyForDryRun: false,
      }),
      "utf8",
    );
    expect(
      validateInternationalSchoolPackage(
        await loadInternationalSchoolPackage(cleanDirectory),
      ).checksumsValid,
    ).toBe(true);
  });

  it("rejects manifest keys outside raw input files 1 through 7", async () => {
    const directory = await packageDirectory();
    await writeValidInternationalSchoolPackage(directory);
    const manifestPath = join(directory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.files["verification.json"] = "0".repeat(64);
    await writeFile(manifestPath, JSON.stringify(manifest), "utf8");

    await expect(loadInternationalSchoolPackage(directory)).rejects.toThrow(
      /manifest\.json/u,
    );
  });

  it("rejects unknown top-level files", async () => {
    const directory = await packageDirectory();
    await writeValidInternationalSchoolPackage(directory);
    await writeFile(join(directory, "unexpected.json"), "{}", "utf8");

    await expect(loadInternationalSchoolPackage(directory)).rejects.toThrow(
      /허용되지 않은 파일/u,
    );
  });
});
