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
    hash: "c8ca302801557941071fe2aed8e4775faa79a6e5d5ba7650084efb6cfbb44d2a",
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
    hash: "769709600cfe1722157691cfad229e1afe54505d79e1027270470a7505368c56",
  },
  {
    identifier: "0010_colorful_randall_flagg",
    hash: "13e8eba61bda25617411b760bb270d9ed1d800be06c91423412de2debd7c9248",
  },
  {
    identifier: "0011_preppy_seed_registry",
    hash: "f1dbfa4648f903c9ae651a9e3ca6e7416f7c3f827f6cd2597295c67bd4361fe0",
  },
  {
    identifier: "0012_loving_trauma",
    hash: "86763907ea81b534fb3fbfd9e7af09a1f8f65e1b7314fbf1f105215f0cf674cd",
  },
] as const satisfies readonly RepositoryMigration[];
