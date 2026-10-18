import { describe, it, expect } from "vitest";
import {
  loadMigrationSpecs,
  planFullMigrations,
  planEnglishIdentityMigration,
  type LedgerRow,
  type MigrationSpec,
} from "@/src/db/migration-plan";
const specs = await loadMigrationSpecs();
const rows = (indices: number[]): LedgerRow[] =>
  indices.map((index, id) => ({
    id: id + 1,
    hash: specs[index]!.hash,
    created_at: specs[index]!.when,
  }));
describe("migration execution guards", () => {
  it("accepts only ordered known prefixes for full execution", () => {
    expect(planFullMigrations(specs, rows([0, 1]))).toEqual(specs.slice(2));
    expect(planFullMigrations(specs, rows(specs.map((_, i) => i)))).toEqual([]);
  });
  it("rejects earlier missing migrations before selecting future SQL", () => {
    const applied = rows([...Array(17).keys(), 18]);
    const future: MigrationSpec = {
      identifier: "0019_future",
      hash: "a".repeat(64),
      when: specs[18]!.when + 1,
      source: "create table must_not_run(id int)",
    };
    expect(() => planFullMigrations([...specs, future], applied)).toThrow(
      "MIGRATION_GAP_REQUIRES_REVIEW",
    );
  });
  it("blocks unknown hashes including the historical article-tags branch", () => {
    expect(() =>
      planFullMigrations(specs, [
        ...rows([0]),
        {
          id: 2,
          hash: "c15754b2f47e236cf7f308f5e7a5d7c279eba015369efc4f5ef51c8b1d1120c6",
          created_at: 1790477016170,
        },
      ]),
    ).toThrow("UNKNOWN_MIGRATION_HASH");
  });
  it("rejects duplicate rows, timestamp substitution and order rewriting", () => {
    expect(() =>
      planFullMigrations(specs, [...rows([0]), { ...rows([0])[0]!, id: 2 }]),
    ).toThrow("DUPLICATE");
    expect(() =>
      planFullMigrations(specs, [{ ...rows([0])[0]!, created_at: 0 }]),
    ).toThrow("TIMESTAMP");
    expect(() => planFullMigrations(specs, rows([1, 0]))).toThrow("ORDER");
  });
  it("scopes exactly0018 while reporting0017 pending without claiming full readiness", () => {
    const plan = planEnglishIdentityMigration(
      specs,
      rows([...Array(17).keys()]),
    );
    expect(plan.migration.identifier).toBe("0018_english_session_identity");
    expect(plan.deferred0017).toBe(true);
    expect(plan.applied).toBe(false);
    const repeat = planEnglishIdentityMigration(
      specs,
      rows([...Array(17).keys(), 18]),
    );
    expect(repeat.applied).toBe(true);
    expect(repeat.deferred0017).toBe(true);
  });
  it("requires every actual schema predecessor and immutable SQL identity", () => {
    expect(() =>
      planEnglishIdentityMigration(specs, rows([...Array(16).keys()])),
    ).toThrow("PREDECESSOR");
    expect(() =>
      planEnglishIdentityMigration(
        specs.map((s, i) => (i === 18 ? { ...s, hash: "b".repeat(64) } : s)),
        rows([...Array(17).keys()]),
      ),
    ).toThrow("CHECKSUM");
  });
});
