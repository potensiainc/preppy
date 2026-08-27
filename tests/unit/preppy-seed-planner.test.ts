import { beforeAll, describe, expect, it } from "vitest";

import { loadAndValidateSeedPackage } from "@/src/modules/institution-seed/contract";
import {
  emptySeedImportInventory,
  planInstitutionSeedImport,
  type SeedImportInventory,
  type SeedImportPlan,
} from "@/src/modules/institution-seed/planner";

const seedFile =
  "data/seeds/preppy/preppy_seed_institutions_seoul_gyeonggi_v1.json";

let canonicalPackage: Awaited<ReturnType<typeof loadAndValidateSeedPackage>>;

beforeAll(async () => {
  canonicalPackage = await loadAndValidateSeedPackage(seedFile);
});

function inventoryFromPlan(plan: SeedImportPlan): SeedImportInventory {
  return {
    institutions: plan.institutionActions.map(
      (action) => action.desiredInstitution,
    ),
    registryIdentities: plan.institutionActions.map(
      (action) => action.desiredRegistryIdentity,
    ),
    sources: plan.sourceActions.map((action) => action.desiredSource),
    bindings: plan.bindingActions.map((action) => action.desiredBinding),
  };
}

function count(plan: SeedImportPlan, code: string): number {
  return plan.counts[code] ?? 0;
}

describe("PREPPY seed pure import planner", () => {
  it("plans the exact safe empty-database boundary", () => {
    // Mutation caught: pending IDs are guessed or dataset counts are mistaken for apply counts.
    const plan = planInstitutionSeedImport(
      canonicalPackage,
      emptySeedImportInventory(),
    );

    expect(plan.applyAllowed).toBe(true);
    expect(plan.conflicts).toEqual([]);
    expect(plan.invalidRows).toEqual([]);
    expect(plan.institutionActions).toHaveLength(57);
    expect(plan.pending.map((row) => row.name)).toEqual([
      "유석초등학교",
      "상명초등학교",
      "청원초등학교",
      "중앙대학교사범대학부속초등학교",
      "신광초등학교",
      "리라초등학교",
    ]);
    expect(plan.sourceActions).toHaveLength(114);
    expect(plan.bindingActions).toHaveLength(114);
    expect(count(plan, "CREATED")).toBe(57);
    expect(count(plan, "SKIPPED_PENDING_ID")).toBe(6);
    expect(count(plan, "SOURCE_CREATED")).toBe(114);
    expect(count(plan, "BINDING_CREATED")).toBe(114);
  });

  it("is idempotent against the exact graph produced by its first plan", () => {
    // Mutation caught: second apply duplicates an identity, Source, binding, or Institution.
    const first = planInstitutionSeedImport(
      canonicalPackage,
      emptySeedImportInventory(),
    );
    const second = planInstitutionSeedImport(
      canonicalPackage,
      inventoryFromPlan(first),
    );

    expect(second.applyAllowed).toBe(true);
    expect(count(second, "UNCHANGED")).toBe(57);
    expect(count(second, "SOURCE_REUSED")).toBe(114);
    expect(count(second, "BINDING_REUSED")).toBe(114);
    expect(count(second, "CREATED")).toBe(0);
    expect(count(second, "UPDATED_NON_MATERIAL")).toBe(0);
  });

  it("adopts only an exact slug-selected Institution and creates its identity", () => {
    // Mutation caught: the importer either duplicates an exact Institution or uses name-only matching.
    const emptyPlan = planInstitutionSeedImport(
      canonicalPackage,
      emptySeedImportInventory(),
    );
    const existing = emptyPlan.institutionActions[0]!.desiredInstitution;
    const plan = planInstitutionSeedImport(canonicalPackage, {
      ...emptySeedImportInventory(),
      institutions: [
        { ...existing, id: "11111111-1111-4111-8111-111111111111" },
      ],
    });
    const adopted = plan.institutionActions.find(
      (action) => action.seedId === emptyPlan.institutionActions[0]!.seedId,
    );

    expect(plan.applyAllowed).toBe(true);
    expect(adopted).toMatchObject({
      institutionId: "11111111-1111-4111-8111-111111111111",
      code: "UPDATED_NON_MATERIAL",
      institutionOperation: "NONE",
      registryOperation: "CREATE",
    });
    expect(count(plan, "CREATED")).toBe(56);
    expect(count(plan, "UPDATED_NON_MATERIAL")).toBe(1);
  });

  it("blocks a material mismatch behind an existing registry identity", () => {
    // Mutation caught: identity-key upsert silently overwrites a canonical address.
    const first = planInstitutionSeedImport(
      canonicalPackage,
      emptySeedImportInventory(),
    );
    const inventory = inventoryFromPlan(first);
    inventory.institutions[0] = {
      ...inventory.institutions[0]!,
      addressLine: "conflicting address",
    };
    const plan = planInstitutionSeedImport(canonicalPackage, inventory);

    expect(plan.applyAllowed).toBe(false);
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CONFLICT_EXISTING_IDENTITY" }),
      ]),
    );
  });

  it("classifies a website host drift before any adoption", () => {
    // Mutation caught: a reused slug can redirect the canonical Institution to another domain.
    const first = planInstitutionSeedImport(
      canonicalPackage,
      emptySeedImportInventory(),
    );
    const target = first.institutionActions[0]!.desiredInstitution;
    const plan = planInstitutionSeedImport(canonicalPackage, {
      ...emptySeedImportInventory(),
      institutions: [{ ...target, websiteUrl: "https://different.example/" }],
    });

    expect(plan.applyAllowed).toBe(false);
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CONFLICT_DOMAIN" }),
      ]),
    );
  });

  it("blocks an occupied slug without weakening to name matching", () => {
    // Mutation caught: the importer commandeers an unrelated Institution that shares a slug.
    const first = planInstitutionSeedImport(
      canonicalPackage,
      emptySeedImportInventory(),
    );
    const target = first.institutionActions[0]!.desiredInstitution;
    const plan = planInstitutionSeedImport(canonicalPackage, {
      ...emptySeedImportInventory(),
      institutions: [{ ...target, displayName: "다른 학교" }],
    });

    expect(plan.applyAllowed).toBe(false);
    expect(plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CONFLICT_SLUG" }),
      ]),
    );
  });

  it("repairs a missing binding while reusing its exact Source", () => {
    // Mutation caught: Source reuse is mistaken for complete graph idempotency.
    const first = planInstitutionSeedImport(
      canonicalPackage,
      emptySeedImportInventory(),
    );
    const inventory = inventoryFromPlan(first);
    inventory.bindings.splice(0, 1);
    const plan = planInstitutionSeedImport(canonicalPackage, inventory);

    expect(plan.applyAllowed).toBe(true);
    expect(count(plan, "SOURCE_REUSED")).toBe(114);
    expect(count(plan, "BINDING_CREATED")).toBe(1);
    expect(count(plan, "BINDING_REUSED")).toBe(113);
    expect(count(plan, "UPDATED_NON_MATERIAL")).toBe(1);
  });

  it("keeps KIS Seoul and Pangyo as separate Institutions with group metadata", () => {
    // Mutation caught: campus rows collapse by domain, English name, or group key.
    const plan = planInstitutionSeedImport(
      canonicalPackage,
      emptySeedImportInventory(),
    );
    const kis = plan.institutionActions.filter(
      (action) =>
        action.desiredRegistryIdentity.metadataJson.institution_group_key ===
        "korea-international-school",
    );

    expect(kis).toHaveLength(2);
    expect(new Set(kis.map((action) => action.institutionId)).size).toBe(2);
    expect(
      kis.map(
        (action) => action.desiredRegistryIdentity.metadataJson.campus_name,
      ),
    ).toEqual(expect.arrayContaining(["Seoul Campus", "Pangyo Campus"]));
  });
});
