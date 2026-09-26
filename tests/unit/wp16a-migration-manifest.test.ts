import { describe, expect, it } from "vitest";

import { loadRepositoryMigrationManifest } from "@/src/modules/production-preflight/migrations";
import { EXPECTED_REPOSITORY_MIGRATIONS } from "@/src/modules/production-safety/migration-manifest";

describe("WP-16A static runtime migration manifest", () => {
  it("matches the repository journal and SQL hashes exactly", async () => {
    await expect(
      loadRepositoryMigrationManifest("src/db/migrations"),
    ).resolves.toEqual(EXPECTED_REPOSITORY_MIGRATIONS);
  });

  it("reproduces the 17 SQL files applied to Production in their original order", async () => {
    const migrations = await loadRepositoryMigrationManifest(
      "src/db/migrations",
    );
    expect(migrations.slice(0, 17).map((migration) => migration.identifier)).toEqual([
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
      "0011_preppy_seed_registry",
      "0012_loving_trauma",
      "0013_normalized_institution_search",
      "0014_aspiring_deathbird",
      "0015_smart_king_bedlam",
      "0016_english_kindergarten_profiles",
    ]);
    expect(
      migrations
        .filter((migration) =>
          ["0002_spicy_starbolt", "0009_exotic_nico_minoru",
            "0010_colorful_randall_flagg", "0013_normalized_institution_search",
            "0014_aspiring_deathbird", "0015_smart_king_bedlam",
            "0016_english_kindergarten_profiles"].includes(migration.identifier),
        )
        .map(({ identifier, hash }) => [identifier, hash]),
    ).toEqual([
      ["0002_spicy_starbolt", "62f762b168a5cd9c9363d9e552d3420108ae634115562d966f5d208f00fad032"],
      ["0009_exotic_nico_minoru", "08788938053c03ae3d659f4e4eb8df6d9f0559ffdb621a9dbdd42717c3260032"],
      ["0010_colorful_randall_flagg", "b2b24cfdf2fc655fdcbdc2ecb2212616dd3e709ff30cbb6b26f83feac870e901"],
      ["0013_normalized_institution_search", "1a5bfaee5532b0115d08f8b1e403a18d8400d19dfcc246248298459fd88d5b31"],
      ["0014_aspiring_deathbird", "53aed2c43c6711ce4144c36208bb90af888b59299888ff89898dcb7053088c88"],
      ["0015_smart_king_bedlam", "6cb7c289cc9428aebdffde1238e1b7c4a771073de1a974a1c38f17bc6f997e5a"],
      ["0016_english_kindergarten_profiles", "d1c9c1b17e71c813db4dccedbf0054051df6895fb68c2d78d3bcc4ac4c70d47c"],
    ]);
  });
});
