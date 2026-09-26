import type { RepositoryMigration } from "@/src/modules/production-preflight/migrations";

// This static manifest keeps runtime/Admin bundles from performing dynamic
// filesystem discovery. The contract test compares it with the repository SQL
// files so a migration change cannot silently leave this list stale.
export const EXPECTED_REPOSITORY_MIGRATIONS = [
  {
    identifier: "0000_absent_shen",
    hash: "6fc04abf76823a27eafa1ebdcf8fcb0d31a06547f5fa77b15c03843fe92bf5ca",
  },
  {
    identifier: "0001_productive_morph",
    hash: "ab998519f88895df3e5e2ca3167dd4c81b08a9716b74b6764004ce02a1734e11",
  },
  {
    identifier: "0002_spicy_starbolt",
    hash: "62f762b168a5cd9c9363d9e552d3420108ae634115562d966f5d208f00fad032",
  },
  {
    identifier: "0003_stormy_mach_iv",
    hash: "69867fcec2dd5d06aa83f148c08fcfab37b92ea545c5fa7626e38cd4fdb43cb6",
  },
  {
    identifier: "0004_panoramic_vindicator",
    hash: "dff6dbf61aaf40a77a9a7a3995b11c35647c64b206c8a3be74355b66426a585a",
  },
  {
    identifier: "0005_canonical_identity_follow",
    hash: "3d50a7324597a1c1f55bac941957c13e016c081a1ba358c06500d77e4495e2dc",
  },
  {
    identifier: "0006_bright_garia",
    hash: "0cdfe6457784c1e3c06b91350f5f99e40988c78e1e409c43c33d46eb207beb32",
  },
  {
    identifier: "0007_unknown_morgan_stark",
    hash: "b168eaa84881ba4193f1e8f3d318dfec39ce987049e42b91edf308bd19e6f963",
  },
  {
    identifier: "0008_short_toxin",
    hash: "62db1be9a7745415423ef6433d67e8eabef72f648facba04005b98024e37c1a8",
  },
  {
    identifier: "0009_exotic_nico_minoru",
    hash: "08788938053c03ae3d659f4e4eb8df6d9f0559ffdb621a9dbdd42717c3260032",
  },
  {
    identifier: "0010_colorful_randall_flagg",
    hash: "b2b24cfdf2fc655fdcbdc2ecb2212616dd3e709ff30cbb6b26f83feac870e901",
  },
  {
    identifier: "0011_preppy_seed_registry",
    hash: "f1dbfa4648f903c9ae651a9e3ca6e7416f7c3f827f6cd2597295c67bd4361fe0",
  },
  {
    identifier: "0012_loving_trauma",
    hash: "86763907ea81b534fb3fbfd9e7af09a1f8f65e1b7314fbf1f105215f0cf674cd",
  },
  {
    identifier: "0013_normalized_institution_search",
    hash: "1a5bfaee5532b0115d08f8b1e403a18d8400d19dfcc246248298459fd88d5b31",
  },
  {
    identifier: "0014_aspiring_deathbird",
    hash: "53aed2c43c6711ce4144c36208bb90af888b59299888ff89898dcb7053088c88",
  },
  {
    identifier: "0015_smart_king_bedlam",
    hash: "6cb7c289cc9428aebdffde1238e1b7c4a771073de1a974a1c38f17bc6f997e5a",
  },
  {
    identifier: "0016_english_kindergarten_profiles",
    hash: "d1c9c1b17e71c813db4dccedbf0054051df6895fb68c2d78d3bcc4ac4c70d47c",
  },
  { identifier: "0017_account_deletion", hash: "e4ad10ea39af39346176bcbdaa0340ef3b1a71664106be2c3e6cf16762bca6c1" },
] as const satisfies readonly RepositoryMigration[];
