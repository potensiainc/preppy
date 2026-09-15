import postgres from "postgres";
import { sql } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { institutionIdForRegistryIdentity } from "@/src/modules/institution-seed/planner";
import {
  applyInternationalSchoolImport,
  dryRunInternationalSchoolImport,
} from "@/src/modules/international-school-import/importer.server";
import { planInternationalSchoolImport } from "@/src/modules/international-school-import/planner.server";
import {
  loadInternationalSchoolPackage,
  validateInternationalSchoolPackage,
} from "@/src/modules/international-school-import/validator";
import type { InternationalSchoolImportPackage } from "@/src/modules/international-school-import/artifact-schema";
import {
  createValidInternationalSchoolPackageValues,
  writeValidInternationalSchoolPackage,
} from "@/tests/fixtures/international-school/minimal-valid-package";
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
const fixtureDirectories: string[] = [];
let packageValue: InternationalSchoolImportPackage;

type FixtureValues = ReturnType<
  typeof createValidInternationalSchoolPackageValues
>;

async function loadFixture(
  mutate?: (values: FixtureValues) => void,
): Promise<InternationalSchoolImportPackage> {
  const directory = await mkdtemp(join(tmpdir(), "preppy-is-planner-"));
  fixtureDirectories.push(directory);
  await writeValidInternationalSchoolPackage(directory, mutate);
  const loaded = await loadInternationalSchoolPackage(directory);
  expect(validateInternationalSchoolPackage(loaded).status).toBe("PASS");
  return loaded;
}

async function targetCounts() {
  const institutionIds = packageValue.institutions.map((institution) =>
    institutionIdForRegistryIdentity("ISI", institution.registryExternalId),
  );
  const sourceUrls = [
    ...new Set(packageValue.evidence.map((evidence) => evidence.sourceUrl)),
  ];
  const artifactOnlyNames = [
    ...packageValue.specialAccess.map((item) => item.name),
    ...packageValue.candidates.map((item) => item.name),
  ];
  const [row] = await runtime.client<
    {
      institutions: number;
      registryIdentities: number;
      sources: number;
      snapshots: number;
      observations: number;
      bindings: number;
      coverages: number;
      facts: number;
      factVersions: number;
      factVersionEvidence: number;
      opportunities: number;
      opportunityVersions: number;
      opportunityVersionEvidence: number;
      artifactOnlyInstitutions: number;
    }[]
  >`
    select
      (select count(*)::int from institutions where id = any(${institutionIds}::uuid[])) as institutions,
      (select count(*)::int from institution_registry_identities where institution_id = any(${institutionIds}::uuid[])) as "registryIdentities",
      (select count(*)::int from sources where canonical_url = any(${sourceUrls}::text[])) as sources,
      (select count(*)::int from source_snapshots where source_id in
        (select id from sources where canonical_url = any(${sourceUrls}::text[]))) as snapshots,
      (select count(*)::int from source_observations where source_id in
        (select id from sources where canonical_url = any(${sourceUrls}::text[]))) as observations,
      (select count(*)::int from institution_source_bindings where institution_id = any(${institutionIds}::uuid[])) as bindings,
      (select count(*)::int from institution_section_coverages where institution_id = any(${institutionIds}::uuid[])) as coverages,
      (select count(*)::int from institution_facts where institution_id = any(${institutionIds}::uuid[])) as facts,
      (select count(*)::int from institution_fact_versions where institution_fact_id in
        (select id from institution_facts where institution_id = any(${institutionIds}::uuid[]))) as "factVersions",
      (select count(*)::int from institution_fact_version_evidence where institution_fact_version_id in
        (select id from institution_fact_versions where institution_fact_id in
          (select id from institution_facts where institution_id = any(${institutionIds}::uuid[])))) as "factVersionEvidence",
      (select count(*)::int from opportunities where institution_id = any(${institutionIds}::uuid[])) as opportunities,
      (select count(*)::int from opportunity_versions where opportunity_id in
        (select id from opportunities where institution_id = any(${institutionIds}::uuid[]))) as "opportunityVersions",
      (select count(*)::int from opportunity_version_evidence where opportunity_version_id in
        (select id from opportunity_versions where opportunity_id in
          (select id from opportunities where institution_id = any(${institutionIds}::uuid[])))) as "opportunityVersionEvidence",
      (select count(*)::int from institutions where display_name = any(${artifactOnlyNames}::text[])) as "artifactOnlyInstitutions"
  `;
  return row!;
}

async function sideEffectCounts() {
  const [row] = await runtime.client<
    {
      outboxEvents: number;
      notifications: number;
      notificationDeliveries: number;
      alerts: number;
      updates: number;
      detectedChanges: number;
      meaningfulChanges: number;
    }[]
  >`
    select
      (select count(*)::int from outbox_events) as "outboxEvents",
      (select count(*)::int from notifications) as notifications,
      (select count(*)::int from notification_deliveries) as "notificationDeliveries",
      (select count(*)::int from alerts) as alerts,
      (select count(*)::int from updates) as updates,
      (select count(*)::int from detected_changes) as "detectedChanges",
      (select count(*)::int from meaningful_changes) as "meaningfulChanges"
  `;
  return row!;
}

async function cleanup() {
  if (!packageValue) return;
  const registryIds = packageValue.institutions.map(
    (institution) => institution.registryExternalId,
  );
  const slugs = [
    ...packageValue.institutions.map((institution) => institution.slug),
    "similar-unrelated-school",
  ];
  await runtime.client.begin(async (transaction) => {
    const rows = await transaction<{ id: string }[]>`
      select distinct i.id
      from institutions i
      left join institution_registry_identities identity
        on identity.institution_id=i.id and identity.registry_name='ISI'
      where i.slug in ${transaction(slugs)}
         or identity.registry_external_id in ${transaction(registryIds)}
    `;
    const institutionIds = rows.map((row) => row.id);
    const sourceUrls = [
      ...new Set(packageValue.evidence.map((evidence) => evidence.sourceUrl)),
    ];
    const sourceRows = await transaction<{ id: string }[]>`
      select id from sources where canonical_url in ${transaction(sourceUrls)}
    `;
    const sourceIds = sourceRows.map((row) => row.id);
    if (institutionIds.length > 0) {
      await transaction`delete from opportunity_changes where opportunity_id in
        (select id from opportunities where institution_id = any(${institutionIds}::uuid[]))`;
      await transaction`delete from opportunity_version_evidence where opportunity_version_id in
        (select id from opportunity_versions where opportunity_id in
          (select id from opportunities where institution_id = any(${institutionIds}::uuid[])))`;
      await transaction`delete from opportunity_versions where opportunity_id in
        (select id from opportunities where institution_id = any(${institutionIds}::uuid[]))`;
      await transaction`delete from opportunities where institution_id = any(${institutionIds}::uuid[])`;
      await transaction`delete from institution_fact_version_evidence where institution_fact_version_id in
        (select id from institution_fact_versions where institution_fact_id in
          (select id from institution_facts where institution_id = any(${institutionIds}::uuid[])))`;
      await transaction`delete from institution_fact_versions where institution_fact_id in
        (select id from institution_facts where institution_id = any(${institutionIds}::uuid[]))`;
      await transaction`delete from institution_facts where institution_id = any(${institutionIds}::uuid[])`;
      await transaction`delete from institution_section_coverages where institution_id = any(${institutionIds}::uuid[])`;
      await transaction`delete from institution_source_bindings where institution_id = any(${institutionIds}::uuid[])`;
      await transaction`delete from institution_registry_identities where institution_id = any(${institutionIds}::uuid[])`;
      await transaction`delete from institutions where id = any(${institutionIds}::uuid[])`;
    }
    if (sourceIds.length > 0) {
      await transaction`delete from source_observations where source_id = any(${sourceIds}::uuid[])`;
      await transaction`delete from source_snapshots where source_id = any(${sourceIds}::uuid[])`;
      await transaction`delete from sources where id = any(${sourceIds}::uuid[])`;
    }
  });
}

async function insertInstitution(
  overrides: Partial<{
    id: string;
    slug: string;
    displayName: string;
    publicationState: "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
    websiteUrl: string;
  }> = {},
) {
  const source = packageValue.institutions[0]!;
  const id =
    overrides.id ??
    institutionIdForRegistryIdentity("ISI", source.registryExternalId);
  const publicationState = overrides.publicationState ?? "DRAFT";
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, international_subtype,
      operational_state, publication_state, region_code, city, district,
      address_line, website_url, published_at
    ) values (
      ${id},
      ${overrides.slug ?? source.slug},
      ${overrides.displayName ?? source.canonicalNameKo},
      'INTERNATIONAL_SCHOOL',
      'FOREIGN_SCHOOL',
      'ACTIVE',
      ${publicationState},
      ${source.regionCode},
      ${source.city},
      ${source.district},
      ${source.addressLine},
      ${overrides.websiteUrl ?? source.websiteUrl},
      ${publicationState === "PUBLISHED"
        ? "2026-09-15T00:00:00.000Z"
        : null}
    )
  `;
  return id;
}

async function insertIdentity(institutionId: string) {
  const source = packageValue.institutions[0]!;
  await runtime.client`
    insert into institution_registry_identities (
      institution_id, registry_name, registry_external_id,
      registry_record_url, registry_locator, metadata_json
    ) values (
      ${institutionId}, 'ISI', ${source.registryExternalId},
      ${source.registryRecordUrl}, ${source.registryExternalId},
      ${JSON.stringify({ packageId: packageValue.snapshot.packageId })}::jsonb
    )
  `;
}

beforeAll(async () => {
  await lock`select pg_advisory_lock(hashtext('international-school-import-tests'))`;
  await migrateDatabase(databaseUrl);
  packageValue = await loadFixture();
});

afterEach(cleanup);

afterAll(async () => {
  await cleanup();
  await Promise.all(
    fixtureDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
  await lock`select pg_advisory_unlock(hashtext('international-school-import-tests'))`;
  await lock.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("international-school import planner", () => {
  it("plans only the official 22 records with deterministic ISI identities", async () => {
    const plan = await planInternationalSchoolImport(
      runtime.executor,
      packageValue,
    );
    expect(plan.applyAllowed).toBe(true);
    expect(plan.rejects).toEqual([]);
    expect(plan.created).toMatchObject({
      institutions: 22,
      registryIdentities: 22,
      sources: 23,
      snapshots: 23,
      observations: 23,
      bindings: 23,
      coverages: 176,
      facts: 1,
      factVersions: 1,
      factVersionEvidence: 1,
    });
    expect(plan.ignored).toEqual({
      specialAccess: 7,
      candidates: 60,
      socialEvidence: 1,
    });
    expect(plan.actions.institutions[0]).toMatchObject({
      operation: "CREATE",
      institutionId: institutionIdForRegistryIdentity("ISI", "ST01:1"),
      registryExternalId: "ST01:1",
    });
    expect(plan.actions.institutions).toHaveLength(22);
  });

  it("produces the same IDs, ordering, and checksum on repeated planning", async () => {
    const first = await planInternationalSchoolImport(
      runtime.executor,
      packageValue,
    );
    const second = await planInternationalSchoolImport(
      runtime.executor,
      packageValue,
    );
    expect(second).toEqual(first);
  });

  it("reuses an exact DRAFT institution linked by the same ISI identity", async () => {
    const institutionId = await insertInstitution();
    await insertIdentity(institutionId);
    const plan = await planInternationalSchoolImport(
      runtime.executor,
      packageValue,
    );
    expect(plan.rejects).toEqual([]);
    expect(plan.actions.institutions[0]).toMatchObject({ operation: "NONE" });
    expect(plan.actions.registryIdentities[0]).toMatchObject({
      operation: "NONE",
    });
  });

  it("rejects material and publication collisions on the ISI identity", async () => {
    const institutionId = await insertInstitution({ displayName: "Wrong Name" });
    await insertIdentity(institutionId);
    const material = await planInternationalSchoolImport(
      runtime.executor,
      packageValue,
    );
    expect(material.rejects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MATERIAL_FIELD_COLLISION" }),
      ]),
    );
    await cleanup();

    const publishedId = await insertInstitution({
      publicationState: "PUBLISHED",
    });
    await insertIdentity(publishedId);
    const published = await planInternationalSchoolImport(
      runtime.executor,
      packageValue,
    );
    expect(published.rejects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PUBLICATION_STATE_COLLISION" }),
      ]),
    );
  });

  it("rejects an ISI identity attached to a non-deterministic institution", async () => {
    const institutionId = await insertInstitution({
      id: "90000000-0000-4000-8000-000000000001",
    });
    await insertIdentity(institutionId);
    const plan = await planInternationalSchoolImport(
      runtime.executor,
      packageValue,
    );
    expect(plan.rejects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ISI_IDENTITY_COLLISION" }),
      ]),
    );
  });

  it("does not merge similar names or domains without an ISI identity", async () => {
    const source = packageValue.institutions[0]!;
    await insertInstitution({
      id: "90000000-0000-4000-8000-000000000002",
      slug: "similar-unrelated-school",
      displayName: source.canonicalNameKo,
      websiteUrl: source.websiteUrl,
    });
    const plan = await planInternationalSchoolImport(
      runtime.executor,
      packageValue,
    );
    expect(plan.rejects).toEqual([]);
    expect(plan.actions.institutions[0]).toMatchObject({ operation: "CREATE" });
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "POSSIBLE_IDENTITY_COLLISION" }),
      ]),
    );
  });

  it("keeps conflicted addresses null and omits artifact-only collections", async () => {
    const conflicted = await loadFixture((values) => {
      const institution = values.institutions[0]! as Omit<
        (typeof values.institutions)[number],
        "addressLine" | "addressConflict"
      > & {
        addressLine: string | null;
        addressConflict: null | {
          status: "NEEDS_REVIEW";
          values: Array<{ addressLine: string; evidenceId: string }>;
        };
      };
      institution.addressLine = null;
      institution.addressConflict = {
        status: "NEEDS_REVIEW",
        values: [
          {
            addressLine: "Registry address",
            evidenceId: "identity-evidence-1",
          },
          {
            addressLine: "School address",
            evidenceId: "tuition-evidence-1",
          },
        ],
      };
    });
    const plan = await planInternationalSchoolImport(
      runtime.executor,
      conflicted,
    );
    expect(plan.actions.institutions[0]!.desired.addressLine).toBeNull();
    expect(plan.actions.institutions).toHaveLength(22);
    expect(plan.actions).not.toHaveProperty("candidates");
    expect(plan.actions).not.toHaveProperty("specialAccess");
    expect(plan.actions).not.toHaveProperty("socialEvidence");
  });
});

describe("international-school snapshot import", () => {
  const emptyTargetCounts = {
    institutions: 0,
    registryIdentities: 0,
    sources: 0,
    snapshots: 0,
    observations: 0,
    bindings: 0,
    coverages: 0,
    facts: 0,
    factVersions: 0,
    factVersionEvidence: 0,
    opportunities: 0,
    opportunityVersions: 0,
    opportunityVersionEvidence: 0,
    artifactOnlyInstitutions: 0,
  };

  it("keeps dry-run read-only", async () => {
    const beforeSignals = await sideEffectCounts();
    const report = await dryRunInternationalSchoolImport(
      { packageValue },
      { transactionManager: runtime.transactionManager },
    );
    expect(report).toMatchObject({ mode: "dry-run", applied: false });
    expect(report.plan.created.institutions).toBe(22);
    expect(await targetCounts()).toEqual(emptyTargetCounts);
    expect(await sideEffectCounts()).toEqual(beforeSignals);
  });

  it("applies the official 22 in one transaction without signals and converges to no-op", async () => {
    const validation = validateInternationalSchoolPackage(packageValue);
    expect(validation.status).toBe("PASS");
    const beforeSignals = await sideEffectCounts();
    const first = await applyInternationalSchoolImport(
      {
        packageValue,
        expectedChecksum: validation.packageChecksum,
        occurredAt: new Date("2026-09-15T03:00:00.000Z"),
      },
      { transactionManager: runtime.transactionManager },
    );
    expect(first).toMatchObject({ mode: "apply", applied: true });
    expect(first.sideEffects).toEqual({
      outboxEvents: 0,
      notifications: 0,
      notificationDeliveries: 0,
      alerts: 0,
      updates: 0,
      detectedChanges: 0,
      meaningfulChanges: 0,
      opportunityChanges: 0,
    });
    expect(await targetCounts()).toEqual({
      ...emptyTargetCounts,
      institutions: 22,
      registryIdentities: 22,
      sources: 23,
      snapshots: 23,
      observations: 23,
      bindings: 23,
      coverages: 176,
      facts: 1,
      factVersions: 1,
      factVersionEvidence: 1,
    });
    const [roots] = await runtime.client<
      {
        total: number;
        draftActiveForeign: number;
        exactIsiIdentity: number;
      }[]
    >`
      select
        count(*)::int as total,
        count(*) filter (
          where i.publication_state='DRAFT'
            and i.operational_state='ACTIVE'
            and i.international_subtype='FOREIGN_SCHOOL'
        )::int as "draftActiveForeign",
        count(identity.id)::int as "exactIsiIdentity"
      from institutions i
      left join institution_registry_identities identity
        on identity.institution_id=i.id and identity.registry_name='ISI'
      where i.id = any(${packageValue.institutions.map((institution) =>
        institutionIdForRegistryIdentity("ISI", institution.registryExternalId),
      )}::uuid[])
    `;
    expect(roots).toEqual({
      total: 22,
      draftActiveForeign: 22,
      exactIsiIdentity: 22,
    });
    const [evidence] = await runtime.client<
      { total: number; complete: number }[]
    >`
      select
        count(*)::int as total,
        count(*) filter (
          where source_observation_id is not null
            and source_snapshot_id is not null
        )::int as complete
      from institution_fact_version_evidence
      where institution_fact_version_id in (
        select fv.id
        from institution_fact_versions fv
        join institution_facts f on f.id=fv.institution_fact_id
        where f.institution_id = any(${packageValue.institutions.map(
          (institution) =>
            institutionIdForRegistryIdentity(
              "ISI",
              institution.registryExternalId,
            ),
        )}::uuid[])
      )
    `;
    expect(evidence).toEqual({ total: 1, complete: 1 });
    expect(await sideEffectCounts()).toEqual(beforeSignals);

    const second = await applyInternationalSchoolImport(
      {
        packageValue,
        expectedChecksum: validation.packageChecksum,
        occurredAt: new Date("2026-09-15T04:00:00.000Z"),
      },
      { transactionManager: runtime.transactionManager },
    );
    expect(second.applied).toBe(true);
    expect(second.plan.created.total).toBe(0);
    expect(second.plan.updated.total).toBe(0);
    expect(second.appliedCounts.total).toBe(0);
    expect(await targetCounts()).toEqual({
      ...emptyTargetCounts,
      institutions: 22,
      registryIdentities: 22,
      sources: 23,
      snapshots: 23,
      observations: 23,
      bindings: 23,
      coverages: 176,
      facts: 1,
      factVersions: 1,
      factVersionEvidence: 1,
    });
  });

  it("rolls back every domain row when a failure is injected", async () => {
    const validation = validateInternationalSchoolPackage(packageValue);
    await expect(
      applyInternationalSchoolImport(
        {
          packageValue,
          expectedChecksum: validation.packageChecksum,
        },
        {
          transactionManager: runtime.transactionManager,
          afterDomainWrites: async (executor) => {
            await executor.raw(sql`select 1`);
            throw new Error("injected international-school evidence failure");
          },
        },
      ),
    ).rejects.toThrow("injected international-school evidence failure");
    expect(await targetCounts()).toEqual(emptyTargetCounts);
  });
});
