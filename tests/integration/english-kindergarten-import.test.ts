import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  applyEnglishKindergartenImport,
  dryRunEnglishKindergartenImport,
} from "@/src/modules/english-kindergarten-import/importer.server";
import {
  loadEnglishKindergartenPackage,
  validateEnglishKindergartenPackage,
} from "@/src/modules/english-kindergarten-import/validator";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const lock = postgres(databaseUrl, { max: 1 });
const packageDirectory =
  "data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01";
const packageValue = await loadEnglishKindergartenPackage(packageDirectory);
const validation = validateEnglishKindergartenPackage(packageValue);
const slugs = packageValue.campuses.map((campus) => campus.slug);
const urls = [...new Set(packageValue.evidence.map((item) => item.sourceUrl))];

async function targetCounts() {
  const [row] = await runtime.client<
    {
      institutions: number;
      sources: number;
      snapshots: number;
      observations: number;
      coverages: number;
      registryIdentities: number;
    }[]
  >`
    select
      (select count(*)::int from institutions where slug in ${runtime.client(slugs)}) as institutions,
      (select count(*)::int from sources where canonical_url in ${runtime.client(urls)}) as sources,
      (select count(*)::int from source_snapshots where source_id in
        (select id from sources where canonical_url in ${runtime.client(urls)})) as snapshots,
      (select count(*)::int from source_observations where source_id in
        (select id from sources where canonical_url in ${runtime.client(urls)})) as observations,
      (select count(*)::int from institution_section_coverages where institution_id in
        (select id from institutions where slug in ${runtime.client(slugs)})) as coverages,
      (select count(*)::int from institution_registry_identities where institution_id in
        (select id from institutions where slug in ${runtime.client(slugs)})) as "registryIdentities"
  `;
  return row!;
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    const institutionRows = await transaction<{ id: string }[]>`
      select id from institutions where slug in ${transaction(slugs)}
    `;
    const institutionIds = institutionRows.map((row) => row.id);
    const sourceRows = await transaction<{ id: string }[]>`
      select id from sources where canonical_url in ${transaction(urls)}
    `;
    const sourceIds = sourceRows.map((row) => row.id);
    if (institutionIds.length > 0) {
      await transaction`delete from institution_section_coverages where institution_id in ${transaction(institutionIds)}`;
      await transaction`delete from institution_source_bindings where institution_id in ${transaction(institutionIds)}`;
      await transaction`delete from institution_registry_identities where institution_id in ${transaction(institutionIds)}`;
      await transaction`delete from institutions where id in ${transaction(institutionIds)}`;
    }
    if (sourceIds.length > 0) {
      await transaction`delete from source_observations where source_id in ${transaction(sourceIds)}`;
      await transaction`delete from source_snapshots where source_id in ${transaction(sourceIds)}`;
      await transaction`delete from sources where id in ${transaction(sourceIds)}`;
    }
  });
}

beforeAll(async () => {
  await lock`select pg_advisory_lock(hashtext('english-kindergarten-import-tests'))`;
  await migrateDatabase(databaseUrl);
  expect(validation.status).toBe("PASS");
});

afterEach(cleanup);

afterAll(async () => {
  await lock`select pg_advisory_unlock(hashtext('english-kindergarten-import-tests'))`;
  await lock.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("English-kindergarten snapshot import", () => {
  it("plans 25 DRAFT roots, applies once without signals, and converges to no-op", async () => {
    const first = await dryRunEnglishKindergartenImport(
      { packageValue },
      { transactionManager: runtime.transactionManager },
    );
    expect(first.plan.created.institutions).toBe(25);
    expect(first.plan.created.outboxEvents).toBe(0);
    expect(await targetCounts()).toEqual({
      institutions: 0,
      sources: 0,
      snapshots: 0,
      observations: 0,
      coverages: 0,
      registryIdentities: 0,
    });

    const applied = await applyEnglishKindergartenImport(
      {
        packageValue,
        expectedChecksum: validation.packageChecksum,
        occurredAt: new Date("2026-09-07T02:00:00.000Z"),
      },
      { transactionManager: runtime.transactionManager },
    );
    expect(applied).toMatchObject({ mode: "apply", applied: true });
    expect(applied.sideEffects).toEqual({
      outboxEvents: 0,
      notifications: 0,
      deliveries: 0,
      meaningfulChanges: 0,
    });
    expect(await targetCounts()).toEqual({
      institutions: 25,
      sources: 25,
      snapshots: 25,
      observations: 25,
      coverages: 200,
      registryIdentities: 0,
    });

    const second = await dryRunEnglishKindergartenImport(
      { packageValue },
      { transactionManager: runtime.transactionManager },
    );
    expect(second.plan.created.total).toBe(0);
    expect(second.plan.updated.total).toBe(0);
    expect(second.plan.unchanged.institutions).toBe(25);
    expect(second.plan.rejects).toEqual([]);
  });

  it("rejects a wrong-category slug collision and checksum mismatch", async () => {
    const target = packageValue.campuses[0]!;
    await runtime.client`
      insert into institutions
        (slug, display_name, category, operational_state, publication_state, city, district, address_line)
      values
        (${target.slug}, ${target.displayName}, 'PRIVATE_ELEMENTARY', 'ACTIVE', 'DRAFT', '서울특별시', ${target.district}, ${target.addressLine})
    `;
    const rejected = await dryRunEnglishKindergartenImport(
      { packageValue },
      { transactionManager: runtime.transactionManager },
    );
    expect(rejected.plan.applyAllowed).toBe(false);
    expect(rejected.plan.rejects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CATEGORY_COLLISION" }),
      ]),
    );

    await expect(
      applyEnglishKindergartenImport(
        { packageValue, expectedChecksum: "0".repeat(64) },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toThrow(/checksum/i);
  });

  it("rolls back every target row when a failure is injected", async () => {
    await expect(
      applyEnglishKindergartenImport(
        { packageValue, expectedChecksum: validation.packageChecksum },
        {
          transactionManager: runtime.transactionManager,
          afterDomainWrites: async () => {
            throw new Error("injected evidence failure");
          },
        },
      ),
    ).rejects.toThrow("injected evidence failure");
    expect(await targetCounts()).toEqual({
      institutions: 0,
      sources: 0,
      snapshots: 0,
      observations: 0,
      coverages: 0,
      registryIdentities: 0,
    });
  });
});
