import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  canonicalDomain,
  loadAndValidateSeedPackage,
  mapSeedInstitution,
  validateSeedPackage,
} from "@/src/modules/institution-seed/contract";

const seedFile = resolve(
  "data/seeds/preppy/preppy_seed_institutions_seoul_gyeonggi_v1.json",
);
const temporaryDirectories: string[] = [];

async function rawPackage(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(seedFile, "utf8")) as Record<
    string,
    unknown
  >;
}

async function temporaryPackage(): Promise<{
  directory: string;
  seedPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "preppy-seed-contract-"));
  temporaryDirectories.push(directory);
  for (const filename of [
    basename(seedFile),
    "PREPPY_SEED_DATASET_README.md",
    "PREPPY_CODEX_SEED_DATASET_PROMPT.md",
    "preppy_seed_institutions_seoul_gyeonggi_v1.csv",
    "preppy_seed_institutions_seoul_gyeonggi_v1.xlsx",
    "SHA256SUMS",
  ]) {
    await copyFile(
      join(dirname(seedFile), filename),
      join(directory, filename),
    );
  }
  return { directory, seedPath: join(directory, basename(seedFile)) };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("PREPPY seed dataset contract", () => {
  it("verifies immutable artifacts and validates the canonical literal counts", async () => {
    // Mutation caught: checksum verification is bypassed or any required coverage count drifts.
    const result = await loadAndValidateSeedPackage(seedFile);

    expect(result.checksums.verifiedFiles).toEqual([
      "PREPPY_CODEX_SEED_DATASET_PROMPT.md",
      "PREPPY_SEED_DATASET_README.md",
      "preppy_seed_institutions_seoul_gyeonggi_v1.csv",
      "preppy_seed_institutions_seoul_gyeonggi_v1.json",
      "preppy_seed_institutions_seoul_gyeonggi_v1.xlsx",
    ]);
    expect(result.counts).toEqual({
      institutions: 63,
      privateElementary: 41,
      internationalSchool: 22,
      seoul: 54,
      gyeonggi: 9,
      sources: 126,
      excluded: 3,
      pendingSchoolInfoIds: 6,
      safelyResolvedInstitutions: 57,
    });
  });

  it("maps only canonical Institution fields and keeps publication internal", async () => {
    // Mutation caught: seed provenance leaks into the core Institution or a row becomes public.
    const validated = validateSeedPackage(await rawPackage());
    const simseok = validated.package.institutions.find(
      (row) => row.canonical_name_ko === "심석초등학교",
    );
    expect(simseok).toBeDefined();

    expect(mapSeedInstitution(simseok!)).toEqual({
      slug: "simseok-e",
      displayName: "심석초등학교",
      category: "PRIVATE_ELEMENTARY",
      internationalSubtype: null,
      operationalState: "ACTIVE",
      publicationState: "DRAFT",
      regionCode: "경기도",
      city: null,
      district: "남양주시",
      addressLine: "경기도 남양주시 화도읍 마석로76번길 10",
      websiteUrl: "https://simseok-e.goegn.kr/simseok-e/main.do",
    });
  });

  it("derives canonical domains without persisting a second URL identity", () => {
    // Mutation caught: path/port/case is mistaken for the deterministic host boundary.
    expect(canonicalDomain("HTTPS://Example.COM:443/a?q=1")).toBe(
      "example.com",
    );
    expect(canonicalDomain("https://www.Example.com/path")).toBe("example.com");
    expect(canonicalDomain("http://Sub.Example.com:8080/path")).toBe(
      "sub.example.com:8080",
    );
  });

  it("hard-stops before parsing when a required artifact checksum mismatches", async () => {
    // Mutation caught: apply could accept a modified canonical JSON or README.
    const fixture = await temporaryPackage();
    await writeFile(fixture.seedPath, '{"tampered":true}\n', "utf8");

    await expect(loadAndValidateSeedPackage(fixture.seedPath)).rejects.toThrow(
      /checksum mismatch.*preppy_seed_institutions_seoul_gyeonggi_v1\.json/i,
    );
  });

  it("rejects a duplicate Institution input row", async () => {
    // Mutation caught: duplicate package identities could reach planning or writes.
    const value = await rawPackage();
    const institutions = value.institutions as Record<string, unknown>[];
    institutions[1] = structuredClone(institutions[0]);

    expect(() => validateSeedPackage(value)).toThrow(/duplicate seed_id/i);
  });

  it("rejects a missing official website", async () => {
    // Mutation caught: a Source-less seed can be imported despite hard validation.
    const value = await rawPackage();
    const institutions = value.institutions as Record<string, unknown>[];
    institutions[0].official_website_url_raw = "";
    institutions[0].official_website_url_normalized = "";

    expect(() => validateSeedPackage(value)).toThrow(/official website/i);
  });

  it("rejects an expected-count mismatch even when the rows still parse", async () => {
    // Mutation caught: metadata or actual coverage can drift from the canonical 63-row contract.
    const value = await rawPackage();
    const metadata = value.metadata as {
      counts: { institutions_total: number };
    };
    metadata.counts.institutions_total = 62;

    expect(() => validateSeedPackage(value)).toThrow(
      /institutions.*expected 63.*actual 62/i,
    );
  });

  it("rejects a pending identity that pretends to have an external ID", async () => {
    // Mutation caught: a pending SchoolInfo row can masquerade as resolved.
    const value = await rawPackage();
    const institutions = value.institutions as Record<string, unknown>[];
    const pending = institutions.find(
      (row) => row.registry_record_id_status === "PENDING",
    )!;
    pending.registry_external_id = "guessed-id";

    expect(() => validateSeedPackage(value)).toThrow(
      /pending.*registry_external_id/i,
    );
  });

  it("rejects a package canonical domain that differs from the normalized URL", async () => {
    // Mutation caught: derived domain QA can drift from the canonical normalized URL.
    const value = await rawPackage();
    const institutions = value.institutions as Record<string, unknown>[];
    institutions[0].canonical_domain = "different.example";

    expect(() => validateSeedPackage(value)).toThrow(/canonical_domain/i);
  });
});
