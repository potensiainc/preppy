import { describe, expect, it } from "vitest";

import {
  compareMigrationLedgers,
  loadRepositoryMigrationManifest,
  type AppliedMigration,
  type RepositoryMigration,
} from "@/src/modules/production-preflight/migrations";

const repository: RepositoryMigration[] = [
  { identifier: "0000_absent_shen", hash: "hash-0000" },
  { identifier: "0001_productive_morph", hash: "hash-0001" },
  { identifier: "0002_spicy_starbolt", hash: "hash-0002" },
];

describe("WP-15A migration ledger comparison", () => {
  it("loads the exact repository migration order and Drizzle hashes", async () => {
    const manifest = await loadRepositoryMigrationManifest("src/db/migrations");
    expect(manifest.map((row) => row.identifier)).toEqual([
      "0000_absent_shen",
      "0001_productive_morph",
      "0002_spicy_starbolt",
      "0003_stormy_mach_iv",
      "0004_panoramic_vindicator",
      "0005_canonical_identity_follow",
      "0006_bright_garia",
      "0007_unknown_morgan_stark",
      "0008_short_toxin",
      "0009_exotic_nico_minoru",
      "0010_colorful_randall_flagg",
    ]);
    expect(manifest.every((row) => /^[a-f0-9]{64}$/.test(row.hash))).toBe(true);
  });

  it("reports an exact ordered match", () => {
    const applied: AppliedMigration[] = repository.map((migration, index) => ({
      ...migration,
      appliedOrder: index,
    }));

    expect(compareMigrationLedgers(repository, applied)).toEqual({
      expected: repository.map((row) => row.identifier),
      applied: repository.map((row) => row.identifier),
      latestApplied: "0002_spicy_starbolt",
      missing: [],
      unexpected: [],
      hashMismatches: [],
      identifierStatus: "MATCH",
    });
  });

  it("detects missing, unexpected, out-of-order, and hash-mismatched ledgers", () => {
    const result = compareMigrationLedgers(repository, [
      { identifier: "0000_absent_shen", hash: "wrong", appliedOrder: 0 },
      { identifier: "9999_production_only", hash: "extra", appliedOrder: 1 },
      { identifier: "0002_spicy_starbolt", hash: "hash-0002", appliedOrder: 2 },
    ]);

    expect(result.missing).toEqual(["0001_productive_morph"]);
    expect(result.unexpected).toEqual(["9999_production_only"]);
    expect(result.hashMismatches).toEqual(["0000_absent_shen"]);
    expect(result.identifierStatus).toBe("MISMATCH");
  });

  it("does not treat a later migration with a prefix gap as a valid upgrade prefix", () => {
    const result = compareMigrationLedgers(repository, [
      { identifier: "0000_absent_shen", hash: "hash-0000", appliedOrder: 0 },
      { identifier: "0002_spicy_starbolt", hash: "hash-0002", appliedOrder: 1 },
    ]);

    expect(result.missing).toEqual(["0001_productive_morph"]);
    expect(result.identifierStatus).toBe("MISMATCH");
  });
});
