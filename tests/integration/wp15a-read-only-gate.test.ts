import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  runWithProductionReadOnlyDatabase,
  UnsafeProductionConnectionError,
} from "@/src/modules/production-preflight/read-only-database.server";
import { runProductionPreflight } from "@/src/modules/production-preflight/run-production-preflight.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(testDatabaseUrl);
const databaseName = `wp15a_current_${randomUUID().replaceAll("-", "").slice(0, 8)}_test`;
const database = new URL(testDatabaseUrl);
database.pathname = `/${databaseName}`;
const databaseUrl = database.toString();
const maintenanceUrl = new URL(testDatabaseUrl);
maintenanceUrl.pathname = "/postgres";

describe("WP-15A production connection gate", () => {
  const readOnlyRole = `wp15a_readonly_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const readOnlyPassword = "wp15a-test-only";
  const maintenance = postgres(maintenanceUrl.toString(), { max: 1 });
  const admin = postgres(databaseUrl, { max: 1 });

  beforeAll(async () => {
    await maintenance`create database ${maintenance(databaseName)}`;
    await migrateDatabase(databaseUrl);
    await admin`select pg_advisory_lock(hashtext('production-readonly-role-ddl-tests'))`;
    await admin.unsafe(
      `create role ${readOnlyRole} login password '${readOnlyPassword}'`,
    );
    await admin.unsafe(
      `alter role ${readOnlyRole} set default_transaction_read_only = on`,
    );
    await admin`grant connect on database ${admin(databaseName)} to ${admin(readOnlyRole)}`;
    await admin.unsafe(`grant usage on schema public to ${readOnlyRole}`);
    await admin.unsafe(
      `grant select on all tables in schema public to ${readOnlyRole}`,
    );
    await admin.unsafe(`grant usage on schema drizzle to ${readOnlyRole}`);
    await admin.unsafe(
      `grant select on all tables in schema drizzle to ${readOnlyRole}`,
    );
  });

  afterAll(async () => {
    await admin.unsafe(`drop owned by ${readOnlyRole}`);
    await admin.unsafe(`drop role if exists ${readOnlyRole}`);
    await admin`select pg_advisory_unlock(hashtext('production-readonly-role-ddl-tests'))`;
    await admin.end({ timeout: 5 });
    await maintenance`drop database ${maintenance(databaseName)}`;
    await maintenance.end({ timeout: 5 });
  });

  it("rejects a writable connection before the inventory callback", async () => {
    let enteredInventory = false;
    await expect(
      runWithProductionReadOnlyDatabase(databaseUrl, async () => {
        enteredInventory = true;
      }),
    ).rejects.toBeInstanceOf(UnsafeProductionConnectionError);
    expect(enteredInventory).toBe(false);
  });

  it("runs bounded reads when the connection is demonstrably read-only", async () => {
    const readOnlyUrl = new URL(databaseUrl);
    readOnlyUrl.username = readOnlyRole;
    readOnlyUrl.password = readOnlyPassword;

    const result = await runWithProductionReadOnlyDatabase(
      readOnlyUrl.toString(),
      async ({ metadata, session }) => ({
        metadata,
        relations: await session.listPublicTables(),
      }),
    );

    expect(result.metadata.transactionReadOnly).toBe("on");
    expect(result.metadata.defaultTransactionReadOnly).toBe("on");
    expect(result.metadata.snapshotConsistency).toBe(
      "REPEATABLE_READ_READ_ONLY",
    );
    expect(result.relations).toContain("institutions");
    expect(result.relations).toEqual(
      expect.arrayContaining([
        "institution_registry_identities",
        "institution_section_coverages",
        "institution_review_insights",
        "institution_review_insight_versions",
        "institution_review_insight_version_evidence",
      ]),
    );
  });

  it("assembles a PII-safe machine report without production mutation paths", async () => {
    const readOnlyUrl = new URL(databaseUrl);
    readOnlyUrl.username = readOnlyRole;
    readOnlyUrl.password = readOnlyPassword;
    const result = await runProductionPreflight({
      productionDatabaseUrl: readOnlyUrl.toString(),
      appBaseUrl: "https://preppy.example",
      generatedAt: new Date("2026-08-25T03:00:00.000Z"),
      ga4Configured: false,
    });

    expect(result.executed).toBe(true);
    expect(result.report.mode).toBe("PRODUCTION_READ_ONLY");
    expect(result.report.database.snapshotConsistency).toBe(
      "REPEATABLE_READ_READ_ONLY",
    );
    expect(result.report.migrations.latestApplied).toBe(
      "0016_english_kindergarten_profiles",
    );
    expect(JSON.stringify(result.report)).not.toContain(readOnlyPassword);
    expect(JSON.stringify(result.report)).not.toContain("postgres://");
  });

  it("gates current canonical evidence, not a replay of an obsolete source backfill", async () => {
    const suffix = randomUUID();
    const institutionId = randomUUID();
    const opportunityId = randomUUID();
    const versionId = randomUUID();
    const legacySchoolId = randomUUID();
    const primarySourceId = randomUUID();
    const supportingSourceId = randomUUID();
    const readOnlyUrl = new URL(databaseUrl);
    readOnlyUrl.username = readOnlyRole;
    readOnlyUrl.password = readOnlyPassword;
    const inspect = () =>
      runProductionPreflight({
        productionDatabaseUrl: readOnlyUrl.toString(),
        appBaseUrl: "https://preppy.example",
        generatedAt: new Date("2026-09-20T00:00:00.000Z"),
        ga4Configured: true,
      });

    try {
      await admin`
        insert into institutions (
          id, slug, display_name, category, operational_state, publication_state
        ) values (
          ${institutionId}, ${`wp15a-audit-${suffix}`}, 'Audit Fixture',
          'PRIVATE_ELEMENTARY', 'ACTIVE', 'DRAFT'
        )
      `;
      await admin`
        insert into opportunities (
          id, institution_id, slug, kind, truth_mode, publication_state
        ) values (
          ${opportunityId}, ${institutionId}, ${`wp15a-audit-opportunity-${suffix}`},
          'APPLICATION', 'NATIVE', 'DRAFT'
        )
      `;
      await admin`
        insert into opportunity_versions (
          id, opportunity_id, version_number, verification_state,
          business_state, is_current, title, verified_at
        ) values (
          ${versionId}, ${opportunityId}, 1, 'VERIFIED', 'UPCOMING', true,
          'Audit Fixture', now()
        )
      `;
      await admin`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name
        ) values
          (${primarySourceId}, ${`https://example.test/${suffix}/primary`},
            'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Primary'),
          (${supportingSourceId}, ${`https://example.test/${suffix}/supporting`},
            'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Supporting')
      `;
      await admin`
        insert into opportunity_source_bindings (
          opportunity_id, source_id, role, is_primary, is_active
        ) values
          (${opportunityId}, ${primarySourceId}, 'PRIMARY_NOTICE', true, true),
          (${opportunityId}, ${supportingSourceId}, 'SUPPORTING', false, true)
      `;
      await admin`
        insert into opportunity_version_evidence (
          opportunity_version_id, source_id, evidence_role
        ) values
          (${versionId}, ${primarySourceId}, 'PRIMARY'),
          (${versionId}, ${supportingSourceId}, 'SUPPORTING')
      `;

      const healthy = (await inspect()).report;
      expect(healthy.backfills).toMatchObject({
        sourceBindings: { wouldBlock: expect.any(Number) },
      });
      expect(healthy.checks.find((check) => check.code === "SOURCE_BINDING_BACKFILL_BLOCKED")).toBeUndefined();
      expect(healthy.summary.finalGate).toBe("READY_FOR_WP16A");

      await admin`
        update opportunity_source_bindings
        set is_active=false, unbound_at=now()
        where opportunity_id=${opportunityId} and source_id=${supportingSourceId}
      `;
      const missing = (await inspect()).report;
      expect(missing.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "CURRENT_EVIDENCE_MISSING_ACTIVE_BINDING",
          severity: "BLOCKER",
          count: 1,
        }),
      ]));
      expect(missing.summary.finalGate).toBe("BLOCKED");

      await admin`
        update opportunity_source_bindings
        set is_active=true, unbound_at=null
        where opportunity_id=${opportunityId} and source_id=${supportingSourceId}
      `;
      await admin`
        update opportunity_version_evidence
        set evidence_role='PRIMARY'
        where opportunity_version_id=${versionId} and source_id=${supportingSourceId}
      `;
      const mislabeled = (await inspect()).report;
      expect(mislabeled.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "CURRENT_EVIDENCE_BINDING_ROLE_MISMATCH",
          severity: "BLOCKER",
          count: 1,
        }),
      ]));
      expect(mislabeled.summary.finalGate).toBe("BLOCKED");

      await admin`
        insert into schools (
          id, slug, canonical_name, school_type, lifecycle_status
        ) values (
          ${legacySchoolId}, ${`wp15a-legacy-${suffix}`}, 'Legacy Audit Fixture',
          'PRIVATE_ELEMENTARY', 'ACTIVE'
        )
      `;
      await admin`
        insert into source_bindings (
          school_id, source_id, source_role
        ) values (
          ${legacySchoolId}, ${primarySourceId}, 'NOTICE_BOARD'
        )
      `;
      const mixed = (await inspect()).report;
      expect(mixed.checks).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "CURRENT_EVIDENCE_BINDING_ROLE_MISMATCH",
          severity: "BLOCKER",
          count: 1,
        }),
      ]));
      expect(mixed.summary.finalGate).toBe("BLOCKED");
    } finally {
      await admin`delete from source_bindings where school_id=${legacySchoolId}`;
      await admin`delete from schools where id=${legacySchoolId}`;
      await admin`delete from opportunity_version_evidence where opportunity_version_id=${versionId}`;
      await admin`delete from opportunity_source_bindings where opportunity_id=${opportunityId}`;
      await admin`delete from opportunity_versions where id=${versionId}`;
      await admin`delete from opportunities where id=${opportunityId}`;
      await admin`delete from institutions where id=${institutionId}`;
      await admin`delete from sources where id in (${primarySourceId}, ${supportingSourceId})`;
    }
  });
});
