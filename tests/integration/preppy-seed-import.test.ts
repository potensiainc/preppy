import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { NotFoundError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { loadAndValidateSeedPackage } from "@/src/modules/institution-seed/contract";
import {
  applyInstitutionSeedImport,
  dryRunInstitutionSeedImport,
} from "@/src/modules/institution-seed/importer.server";
import {
  emptySeedImportInventory,
  planInstitutionSeedImport,
} from "@/src/modules/institution-seed/planner";
import {
  getInstitutionBySlug,
  listInstitutions,
} from "@/src/modules/public/institution-query.server";
import { listPublicSitemapEntries } from "@/src/modules/public/sitemap-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
}
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const seedFile =
  "data/seeds/preppy/preppy_seed_institutions_seoul_gyeonggi_v1.json";
const extraInstitutionIds = new Set<string>();

let validated: Awaited<ReturnType<typeof loadAndValidateSeedPackage>>;
let seedInstitutionIds: string[];
let seedIdentityIds: string[];
let seedSourceIds: string[];

async function seedCounts() {
  const [row] = await runtime.client<
    {
      institutions: number;
      identities: number;
      sources: number;
      bindings: number;
      audits: number;
      facts: number;
      opportunities: number;
    }[]
  >`
    select
      (select count(*)::int from institutions where id in ${runtime.client(seedInstitutionIds)}) as institutions,
      (select count(*)::int from institution_registry_identities where id in ${runtime.client(seedIdentityIds)}) as identities,
      (select count(*)::int from sources where id in ${runtime.client(seedSourceIds)}) as sources,
      (select count(*)::int from institution_source_bindings
        where institution_id in ${runtime.client([...seedInstitutionIds, ...extraInstitutionIds])}
          and source_id in ${runtime.client(seedSourceIds)}) as bindings,
      (select count(*)::int from audit_logs where action_type='SEED_BOOTSTRAP_IMPORT') as audits,
      (select count(*)::int from institution_facts
        where institution_id in ${runtime.client([...seedInstitutionIds, ...extraInstitutionIds])}) as facts,
      (select count(*)::int from opportunities
        where institution_id in ${runtime.client([...seedInstitutionIds, ...extraInstitutionIds])}) as opportunities
  `;
  return row!;
}

async function insertExistingInstitution(
  desired: ReturnType<
    typeof planInstitutionSeedImport
  >["institutionActions"][number]["desiredInstitution"],
  overrides: Partial<typeof desired> = {},
): Promise<string> {
  const row = {
    ...desired,
    id: randomUUID(),
    ...overrides,
  };
  extraInstitutionIds.add(row.id);
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, international_subtype,
      operational_state, publication_state, region_code, city, district,
      address_line, website_url
    ) values (
      ${row.id}, ${row.slug}, ${row.displayName}, ${row.category},
      ${row.internationalSubtype}, ${row.operationalState},
      ${row.publicationState}, ${row.regionCode}, ${row.city}, ${row.district},
      ${row.addressLine}, ${row.websiteUrl}
    )
  `;
  return row.id;
}

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(hashtext('preppy-seed-import-tests'))`;
  await migrateDatabase(databaseUrl);
  validated = await loadAndValidateSeedPackage(seedFile);
  const emptyPlan = planInstitutionSeedImport(
    validated,
    emptySeedImportInventory(),
  );
  seedInstitutionIds = emptyPlan.institutionActions.map(
    (action) => action.institutionId,
  );
  seedIdentityIds = emptyPlan.institutionActions.map(
    (action) => action.desiredRegistryIdentity.id,
  );
  seedSourceIds = emptyPlan.sourceActions.map((action) => action.sourceId);
});

afterEach(async () => {
  const institutionIds = [...seedInstitutionIds, ...extraInstitutionIds];
  await runtime.client.begin(async (transaction) => {
    await transaction`
      delete from institution_source_bindings
      where institution_id in ${transaction(institutionIds)}
        or source_id in ${transaction(seedSourceIds)}
    `;
    await transaction`
      delete from institution_registry_identities
      where id in ${transaction(seedIdentityIds)}
        or institution_id in ${transaction(institutionIds)}
    `;
    await transaction`
      delete from audit_logs where action_type='SEED_BOOTSTRAP_IMPORT'
    `;
    await transaction`delete from sources where id in ${transaction(seedSourceIds)}`;
    await transaction`delete from institutions where id in ${transaction(institutionIds)}`;
  });
  extraInstitutionIds.clear();
});

afterAll(async () => {
  await schemaLockSql`select pg_advisory_unlock(hashtext('preppy-seed-import-tests'))`;
  await schemaLockSql.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("PREPPY transactional seed import", () => {
  it("keeps dry-run write-free, applies 57/114/114 once, and converges on second apply", async () => {
    const dryRun = await dryRunInstitutionSeedImport(
      { validated },
      { transactionManager: runtime.transactionManager },
    );
    expect(dryRun).toMatchObject({ mode: "dry-run", applied: false });
    expect(await seedCounts()).toEqual({
      institutions: 0,
      identities: 0,
      sources: 0,
      bindings: 0,
      audits: 0,
      facts: 0,
      opportunities: 0,
    });

    const first = await applyInstitutionSeedImport(
      { validated, occurredAt: new Date("2026-08-27T12:00:00.000Z") },
      { transactionManager: runtime.transactionManager },
    );
    expect(first).toMatchObject({
      mode: "apply",
      applied: true,
      context: { source: "MIGRATION", emitProductSignals: false },
      audit: { actionType: "SEED_BOOTSTRAP_IMPORT", written: true },
    });
    expect(first.plan.counts).toMatchObject({
      CREATED: 57,
      SKIPPED_PENDING_ID: 6,
      SOURCE_CREATED: 114,
      BINDING_CREATED: 114,
    });
    expect(Object.values(first.productSideEffects.delta)).toEqual(
      expect.arrayContaining([0]),
    );
    expect(new Set(Object.values(first.productSideEffects.delta))).toEqual(
      new Set([0]),
    );
    expect(await seedCounts()).toEqual({
      institutions: 57,
      identities: 57,
      sources: 114,
      bindings: 114,
      audits: 1,
      facts: 0,
      opportunities: 0,
    });

    const second = await applyInstitutionSeedImport(
      { validated, occurredAt: new Date("2026-08-27T12:01:00.000Z") },
      { transactionManager: runtime.transactionManager },
    );
    expect(second.plan.counts).toMatchObject({
      UNCHANGED: 57,
      SOURCE_REUSED: 114,
      BINDING_REUSED: 114,
    });
    expect(await seedCounts()).toMatchObject({
      institutions: 57,
      identities: 57,
      sources: 114,
      bindings: 114,
      audits: 2,
    });
  });

  it("adopts an exact existing Institution without changing its identity", async () => {
    const emptyPlan = planInstitutionSeedImport(
      validated,
      emptySeedImportInventory(),
    );
    const target = emptyPlan.institutionActions[0]!;
    const existingId = await insertExistingInstitution(
      target.desiredInstitution,
    );

    const result = await applyInstitutionSeedImport(
      { validated },
      { transactionManager: runtime.transactionManager },
    );
    expect(result.applied).toBe(true);
    expect(
      result.plan.institutionActions.find(
        (action) => action.seedId === target.seedId,
      ),
    ).toMatchObject({
      institutionId: existingId,
      code: "UPDATED_NON_MATERIAL",
      institutionOperation: "NONE",
      registryOperation: "CREATE",
    });
    const [identity] = await runtime.client<{ institutionId: string }[]>`
      select institution_id as "institutionId"
      from institution_registry_identities
      where registry_name=${target.desiredRegistryIdentity.registryName}
        and registry_external_id=${target.desiredRegistryIdentity.registryExternalId}
    `;
    expect(identity?.institutionId).toBe(existingId);
  });

  it("reuses an exact Source and repairs one missing binding", async () => {
    const first = await applyInstitutionSeedImport(
      { validated },
      { transactionManager: runtime.transactionManager },
    );
    const binding = first.plan.bindingActions[0]!.desiredBinding;
    await runtime.client`
      delete from institution_source_bindings
      where institution_id=${binding.institutionId}
        and source_id=${binding.sourceId} and role=${binding.role}
    `;

    const repaired = await applyInstitutionSeedImport(
      { validated },
      { transactionManager: runtime.transactionManager },
    );
    expect(repaired.plan.counts).toMatchObject({
      SOURCE_REUSED: 114,
      BINDING_CREATED: 1,
      BINDING_REUSED: 113,
      UPDATED_NON_MATERIAL: 1,
    });
    expect((await seedCounts()).bindings).toBe(114);
  });

  it("reports a slug conflict and writes nothing", async () => {
    const emptyPlan = planInstitutionSeedImport(
      validated,
      emptySeedImportInventory(),
    );
    const target = emptyPlan.institutionActions[0]!;
    await insertExistingInstitution(target.desiredInstitution, {
      displayName: "다른 학교",
    });

    const result = await applyInstitutionSeedImport(
      { validated },
      { transactionManager: runtime.transactionManager },
    );
    expect(result).toMatchObject({ mode: "apply", applied: false });
    expect(result.plan.applyAllowed).toBe(false);
    expect(result.plan.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CONFLICT_SLUG" }),
      ]),
    );
    expect(await seedCounts()).toMatchObject({
      institutions: 0,
      identities: 0,
      sources: 0,
      bindings: 0,
      audits: 0,
    });
  });

  it("rolls back every domain row and Audit when a mid-import failure is injected", async () => {
    await expect(
      applyInstitutionSeedImport(
        { validated },
        {
          transactionManager: runtime.transactionManager,
          afterDomainWrites: async () => {
            throw new Error("injected seed rollback");
          },
        },
      ),
    ).rejects.toThrow(/injected seed rollback/i);
    expect(await seedCounts()).toEqual({
      institutions: 0,
      identities: 0,
      sources: 0,
      bindings: 0,
      audits: 0,
      facts: 0,
      opportunities: 0,
    });
  });

  it("keeps imported DRAFT rows out of list, detail, sitemap, and verified Product truth", async () => {
    const result = await applyInstitutionSeedImport(
      { validated },
      { transactionManager: runtime.transactionManager },
    );
    const simseok = result.plan.institutionActions.find(
      (action) => action.desiredInstitution.slug === "simseok-e",
    )!;
    const list = await listInstitutions(runtime.executor, {
      query: simseok.desiredInstitution.displayName,
    });
    expect(list.items).toEqual([]);
    await expect(
      getInstitutionBySlug(runtime.executor, simseok.desiredInstitution.slug),
    ).rejects.toBeInstanceOf(NotFoundError);
    const sitemap = await listPublicSitemapEntries(
      runtime.executor,
      "https://preppy.test",
    );
    expect(sitemap.map((entry) => entry.url)).not.toContain(
      `https://preppy.test/institutions/${simseok.desiredInstitution.slug}`,
    );

    const [identity] = await runtime.client<
      { metadata: Record<string, unknown> }[]
    >`
      select metadata_json as metadata from institution_registry_identities
      where institution_id=${simseok.institutionId}
    `;
    expect(identity?.metadata.verified_at).toBe("2026-08-27");
    expect((await seedCounts()).facts).toBe(0);
    expect((await seedCounts()).opportunities).toBe(0);
  });
});
