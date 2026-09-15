import postgres from "postgres";
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
    if (institutionIds.length === 0) return;
    await transaction`
      delete from institution_registry_identities
      where institution_id in ${transaction(institutionIds)}
    `;
    await transaction`
      delete from institutions where id in ${transaction(institutionIds)}
    `;
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
