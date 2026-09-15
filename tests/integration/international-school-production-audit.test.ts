import postgres from "postgres";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { institutionIdForRegistryIdentity } from "@/src/modules/institution-seed/planner";
import {
  runInternationalSchoolProductionAudit,
  type InternationalSchoolProductionAuditDependencies,
} from "@/src/modules/international-school-import/production-audit.server";
import { UnsafeProductionConnectionError } from "@/src/modules/production-preflight/read-only-database.server";
import {
  createValidInternationalSchoolPackageValues,
  writeValidInternationalSchoolPackage,
} from "@/tests/fixtures/international-school/minimal-valid-package";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const readOnlyRole = "international_school_audit_readonly_test";
const readOnlyPassword = "international-school-audit-test-only";
const admin = postgres(databaseUrl, { max: 1 });
const lock = postgres(databaseUrl, { max: 1 });
let packageDirectory = "";

function readOnlyUrl(): string {
  const value = new URL(databaseUrl!);
  value.username = readOnlyRole;
  value.password = readOnlyPassword;
  return value.toString();
}

async function cleanup(): Promise<void> {
  await admin`
    delete from institution_registry_identities
    where registry_name='ISI' and registry_external_id like 'ST01:%'
  `;
  await admin`
    delete from institutions
    where slug like 'fixture-international-school-%'
       or slug like 'audit-artifact-only-%'
  `;
}

async function seedInstitution(options: {
  number: number;
  publicationState: "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
  displayName?: string;
}): Promise<void> {
  const values = createValidInternationalSchoolPackageValues();
  const source = values.institutions[options.number - 1]!;
  const id = institutionIdForRegistryIdentity("ISI", source.registryExternalId);
  await admin`
    insert into institutions (
      id, slug, display_name, category, international_subtype,
      operational_state, publication_state, region_code, city, district,
      address_line, website_url, published_at, archived_at
    ) values (
      ${id}, ${source.slug}, ${options.displayName ?? source.canonicalNameKo},
      'INTERNATIONAL_SCHOOL', 'FOREIGN_SCHOOL', 'ACTIVE',
      ${options.publicationState}, ${source.regionCode}, ${source.city},
      ${source.district}, ${source.addressLine}, ${source.websiteUrl},
      ${options.publicationState === "PUBLISHED" ? "2026-09-15T00:00:00.000Z" : null},
      ${options.publicationState === "ARCHIVED" ? "2026-09-15T00:00:00.000Z" : null}
    )
  `;
  await admin`
    insert into institution_registry_identities (
      institution_id, registry_name, registry_external_id,
      registry_record_url, registry_locator, metadata_json
    ) values (
      ${id}, 'ISI', ${source.registryExternalId}, ${source.registryRecordUrl},
      ${source.registryExternalId}, '{}'::jsonb
    )
  `;
}

beforeAll(async () => {
  await lock`select pg_advisory_lock(hashtext('international-school-import-tests'))`;
  await migrateDatabase(databaseUrl!);
  packageDirectory = await mkdtemp(join(tmpdir(), "preppy-is-production-audit-"));
  await writeValidInternationalSchoolPackage(packageDirectory);

  await admin`select pg_advisory_lock(hashtext('production-readonly-role-ddl-tests'))`;
  const [existingRole] = await admin<{ exists: boolean }[]>`
    select exists(select 1 from pg_roles where rolname=${readOnlyRole}) as exists
  `;
  if (existingRole?.exists) {
    await admin.unsafe(`drop owned by ${readOnlyRole}`);
  }
  await admin.unsafe(`drop role if exists ${readOnlyRole}`);
  await admin.unsafe(
    `create role ${readOnlyRole} login password '${readOnlyPassword}'`,
  );
  await admin.unsafe(
    `alter role ${readOnlyRole} set default_transaction_read_only = on`,
  );
  await admin.unsafe(
    `grant connect on database admissionradar_test to ${readOnlyRole}`,
  );
  await admin.unsafe(`grant usage on schema public to ${readOnlyRole}`);
  await admin.unsafe(`grant select on all tables in schema public to ${readOnlyRole}`);
});

afterAll(async () => {
  await cleanup();
  await admin.unsafe(`drop owned by ${readOnlyRole}`);
  await admin.unsafe(`drop role if exists ${readOnlyRole}`);
  await admin`select pg_advisory_unlock(hashtext('production-readonly-role-ddl-tests'))`;
  await admin.end({ timeout: 5 });
  await rm(packageDirectory, { recursive: true, force: true });
  await lock`select pg_advisory_unlock(hashtext('international-school-import-tests'))`;
  await lock.end({ timeout: 5 });
});

describe("international-school production audit", () => {
  it("does not fall back to DATABASE_URL when production credentials are absent", async () => {
    const runReadOnly = vi.fn();
    const result = await runInternationalSchoolProductionAudit(
      packageDirectory,
      { DATABASE_URL: databaseUrl, PRODUCTION_DATABASE_URL: undefined },
      { runReadOnly } as unknown as InternationalSchoolProductionAuditDependencies,
    );

    expect(result).toMatchObject({
      executed: false,
      reason: "CREDENTIALS_UNAVAILABLE",
      expectedIsiIds: expect.arrayContaining(["ST01:1", "ST01:22"]),
    });
    expect(result.expectedIsiIds).toHaveLength(22);
    expect(runReadOnly).not.toHaveBeenCalled();
  });

  it("stops before queries when the connection cannot prove read-only mode", async () => {
    const runReadOnly = vi.fn(async () => {
      throw new UnsafeProductionConnectionError();
    });
    const result = await runInternationalSchoolProductionAudit(
      packageDirectory,
      { PRODUCTION_DATABASE_URL: databaseUrl },
      { runReadOnly } as unknown as InternationalSchoolProductionAuditDependencies,
    );

    expect(result).toMatchObject({
      executed: false,
      reason: "UNSAFE_CONNECTION",
      blockers: [expect.objectContaining({ code: "UNSAFE_CONNECTION" })],
    });
  });

  it("finds exact drafts, public collisions, material mismatches, and artifact-only contamination", async () => {
    await cleanup();
    await seedInstitution({ number: 1, publicationState: "DRAFT" });
    await seedInstitution({ number: 2, publicationState: "PUBLISHED" });
    await seedInstitution({ number: 3, publicationState: "HIDDEN" });
    await seedInstitution({ number: 4, publicationState: "ARCHIVED" });
    await seedInstitution({
      number: 5,
      publicationState: "DRAFT",
      displayName: "중요 필드가 다른 기관명",
    });

    const values = createValidInternationalSchoolPackageValues();
    const candidate = values.candidates[0]!;
    const specialAccess = values.specialAccess[0]!;
    await admin`
      insert into institutions (
        slug, display_name, category, operational_state, publication_state,
        region_code, city, website_url
      ) values
      ('audit-artifact-only-candidate', ${candidate.name}, 'INTERNATIONAL_SCHOOL',
        'ACTIVE', 'DRAFT', '11', '서울특별시', 'https://unrelated.example'),
      ('audit-artifact-only-special', '다른 표기 이름', 'INTERNATIONAL_SCHOOL',
        'ACTIVE', 'DRAFT', '11', '서울특별시', ${specialAccess.publicUrl})
    `;

    const result = await runInternationalSchoolProductionAudit(
      packageDirectory,
      { PRODUCTION_DATABASE_URL: readOnlyUrl() },
    );

    expect(result.executed).toBe(true);
    expect(result.reason).toBe("COMPLETED");
    expect(result.expectedIsiIds).toHaveLength(22);
    expect(result.counts).toEqual({
      existingIsiIdentities: 5,
      exactDraftMatches: 1,
      publicCollisions: 3,
      materialCollisions: 1,
      artifactOnlyDomainRows: 2,
    });
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PUBLICATION_STATE_COLLISION" }),
        expect.objectContaining({ code: "MATERIAL_FIELD_COLLISION" }),
        expect.objectContaining({ code: "ARTIFACT_ONLY_DOMAIN_ROW" }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(readOnlyPassword);
    expect(JSON.stringify(result)).not.toContain("postgres://");
  });
});
