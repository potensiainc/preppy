import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { applyInstitutionBackfill } from "@/src/infrastructure/db/institution-backfill.server";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { collectBackfillDryRun } from "@/src/modules/production-preflight/backfill-dry-run.server";
import { ReadOnlyPreflightSession } from "@/src/modules/production-preflight/read-only-database.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(testDatabaseUrl);

const baseUrl = new URL(testDatabaseUrl);
const databaseName = "admissionradar_wp15a_backfill_rehearsal";
const databaseUrl = new URL(baseUrl);
databaseUrl.pathname = `/${databaseName}`;
const maintenanceUrl = new URL(baseUrl);
maintenanceUrl.pathname = "/postgres";
const maintenance = postgres(maintenanceUrl.toString(), { max: 1 });
const sql = postgres(databaseUrl.toString(), { max: 1 });

describe("WP-15A exact backfill dry-run", () => {
  beforeAll(async () => {
    await maintenance`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await maintenance.unsafe(`drop database if exists ${databaseName}`);
    await maintenance.unsafe(`create database ${databaseName}`);
    await migrateDatabase(databaseUrl.toString());

    const schoolId = randomUUID();
    const cycleId = randomUUID();
    const sourceId = randomUUID();
    await sql`
      insert into schools (
        id, slug, canonical_name, school_type, lifecycle_status
      ) values (
        ${schoolId}, 'wp15a-backfill-school', 'WP15A School',
        'PRIVATE_ELEMENTARY', 'ACTIVE'
      )
    `;
    await sql`
      insert into admission_cycles (
        id, school_id, academic_year, lifecycle_status, admission_mode
      ) values (
        ${cycleId}, ${schoolId}, 2027, 'MONITORING', 'FIXED_WINDOW'
      )
    `;
    await sql`
      insert into admission_events (
        admission_cycle_id, event_key, event_type, canonical_title
      ) values (
        ${cycleId}, 'wp15a-application', 'APPLICATION', 'WP15A Application'
      )
    `;
    await sql`
      insert into sources (
        id, canonical_url, source_type, authority_level, lifecycle_status,
        source_name
      ) values (
        ${sourceId}, 'https://official.example.test/wp15a',
        'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP15A Source'
      )
    `;
    await sql`
      insert into source_bindings (
        source_id, school_id, source_role
      ) values (${sourceId}, ${schoolId}, 'ELIGIBILITY')
    `;

    const runtime = getRuntimeDatabase({
      DATABASE_URL: databaseUrl.toString(),
      DATABASE_MAX_CONNECTIONS: 2,
      NODE_ENV: "test",
    });
    await applyInstitutionBackfill({
      transactionManager: runtime.transactionManager,
    });
    await closeRuntimeDatabase();
  });

  afterAll(async () => {
    await closeRuntimeDatabase();
    await sql.end({ timeout: 5 });
    await maintenance.unsafe(`drop database if exists ${databaseName}`);
    await maintenance`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await maintenance.end({ timeout: 5 });
  });

  it("uses the approved deterministic policies without writing", async () => {
    const before = await sql<
      { opportunities: number; institutionBindings: number }[]
    >`
      select
        (select count(*)::int from opportunities) as opportunities,
        (select count(*)::int from institution_source_bindings)
          as "institutionBindings"
    `;
    const dryRun = await sql.begin(
      "isolation level repeatable read read only",
      (transaction) =>
        collectBackfillDryRun(
          new ReadOnlyPreflightSession(transaction, sql.options),
        ),
    );
    const after = await sql<
      { opportunities: number; institutionBindings: number }[]
    >`
      select
        (select count(*)::int from opportunities) as opportunities,
        (select count(*)::int from institution_source_bindings)
          as "institutionBindings"
    `;

    expect(dryRun.institution).toMatchObject({
      wouldInsert: 0,
      wouldReuse: 0,
      wouldSkip: 1,
      wouldBlock: 0,
    });
    expect(dryRun.opportunity).toMatchObject({
      wouldInsert: 1,
      wouldBlock: 0,
    });
    expect(dryRun.sourceBindings).toMatchObject({
      wouldInsert: 0,
      wouldSkip: 0,
      notImported: 1,
      wouldBlock: 0,
    });
    expect(dryRun.sourceBindings.notImportedCodes).toContain(
      "UNSAFE_LEGACY_ROLE",
    );
    expect(after).toEqual(before);
  });
});
