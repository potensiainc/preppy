import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const primaryDatabaseName = new URL(databaseUrl).pathname.slice(1);
const databaseBase = primaryDatabaseName
  .replace(/(?:^|_)(?:test|verify\d*)$/, "")
  .replace(/[^a-zA-Z0-9_]/g, "_")
  .slice(0, 24);
const migrationDatabaseName = `${databaseBase}_wp10amigration_verify${`${Date.now()}${randomUUID().replace(/\D/g, "")}`.slice(0, 20)}`;
if (!/^[A-Za-z0-9_]+_verify\d+$/.test(migrationDatabaseName)) {
  throw new Error("WP-10A migration database name must be identifier-safe");
}
const migrationDatabaseUrl = new URL(databaseUrl);
migrationDatabaseUrl.pathname = `/${migrationDatabaseName}`;
assertDedicatedTestDatabaseUrl(migrationDatabaseUrl.toString());
const maintenanceDatabaseUrl = new URL(databaseUrl);
maintenanceDatabaseUrl.pathname = "/postgres";
const migrationDirectory = resolve(process.cwd(), "src/db/migrations");

async function resetMigrationDatabase() {
  const maintenance = postgres(maintenanceDatabaseUrl.toString(), { max: 1 });
  try {
    await maintenance`select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${migrationDatabaseName} and pid <> pg_backend_pid()`;
    await maintenance`drop database if exists ${maintenance(migrationDatabaseName)}`;
  } finally {
    await maintenance.end({ timeout: 5 });
  }
}

async function createMigrationDatabase() {
  const maintenance = postgres(maintenanceDatabaseUrl.toString(), { max: 1 });
  try {
    await maintenance`create database ${maintenance(migrationDatabaseName)}`;
  } finally {
    await maintenance.end({ timeout: 5 });
  }
}

async function createPreWp10aMigrationFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), "preppy-wp10a-upgrade-"));
  const metadataDirectory = join(folder, "meta");
  await mkdir(metadataDirectory);
  const journal = JSON.parse(
    await readFile(join(migrationDirectory, "meta", "_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const preWp10aEntries = journal.entries.slice(0, 9);
  await writeFile(
    join(metadataDirectory, "_journal.json"),
    `${JSON.stringify({ ...journal, entries: preWp10aEntries }, null, 2)}\n`,
  );
  for (const entry of preWp10aEntries) {
    const filename = `${entry.tag}.sql`;
    await copyFile(join(migrationDirectory, filename), join(folder, filename));
  }
  return folder;
}

async function migrateFolder(folder: string) {
  const client = postgres(migrationDatabaseUrl.toString(), { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function migrationState() {
  const sql = postgres(migrationDatabaseUrl.toString(), { max: 1 });
  try {
    const [row] = await sql<
      {
        migrationCount: number;
        institutionBindings: string | null;
        opportunityBindings: string | null;
      }[]
    >`
      select
        (select count(*)::int from drizzle.__drizzle_migrations) as "migrationCount",
        to_regclass('public.institution_source_bindings')::text as "institutionBindings",
        to_regclass('public.opportunity_source_bindings')::text as "opportunityBindings"
    `;
    return row;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

describe("WP-10A Source binding migration", () => {
  beforeEach(async () => {
    await resetMigrationDatabase();
    await createMigrationDatabase();
  });

  afterEach(resetMigrationDatabase);
  afterAll(resetMigrationDatabase);

  it("migrates a fresh database through the current repository migration and re-runs as a ledger no-op", async () => {
    await migrateDatabase(migrationDatabaseUrl.toString());
    expect(await migrationState()).toEqual({
      migrationCount: 12,
      institutionBindings: "institution_source_bindings",
      opportunityBindings: "opportunity_source_bindings",
    });

    await migrateDatabase(migrationDatabaseUrl.toString());
    expect((await migrationState()).migrationCount).toBe(12);
  });

  it("upgrades 0008 data additively without automatic backfill", async () => {
    const preWp10aFolder = await createPreWp10aMigrationFolder();
    const sql = postgres(migrationDatabaseUrl.toString(), { max: 1 });
    const institutionId = randomUUID();
    const schoolId = randomUUID();
    const sourceId = randomUUID();
    try {
      await migrateFolder(preWp10aFolder);
      expect(await migrationState()).toEqual({
        migrationCount: 9,
        institutionBindings: null,
        opportunityBindings: null,
      });
      await sql`
        insert into institutions (id, slug, display_name, category)
        values (${institutionId}, 'wp10a-upgrade-institution', 'Upgrade Institution',
          'PRIVATE_ELEMENTARY')
      `;
      await sql`
        insert into schools (id, slug, canonical_name, school_type, lifecycle_status)
        values (${schoolId}, 'wp10a-upgrade-school', 'Upgrade School',
          'PRIVATE_ELEMENTARY', 'ACTIVE')
      `;
      await sql`
        insert into institution_school_links (institution_id, school_id, link_reason)
        values (${institutionId}, ${schoolId}, 'WP10A_UPGRADE_TEST')
      `;
      await sql`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name
        ) values (
          ${sourceId}, 'https://official.example.test/wp10a-upgrade',
          'OFFICIAL_NOTICE_BOARD', 'PRIMARY', 'ACTIVE', 'Upgrade Source'
        )
      `;
      await sql`
        insert into source_bindings (
          source_id, school_id, source_role, is_active
        ) values (${sourceId}, ${schoolId}, 'NOTICE_BOARD', true)
      `;

      await migrateDatabase(migrationDatabaseUrl.toString());
      const [preserved] = await sql<
        { legacyBindings: number; canonicalBindings: number }[]
      >`
        select
          (select count(*)::int from source_bindings) as "legacyBindings",
          (select count(*)::int from institution_source_bindings) as "canonicalBindings"
      `;
      expect(preserved).toEqual({ legacyBindings: 1, canonicalBindings: 0 });
      expect(await migrationState()).toEqual({
        migrationCount: 12,
        institutionBindings: "institution_source_bindings",
        opportunityBindings: "opportunity_source_bindings",
      });

      await migrateDatabase(migrationDatabaseUrl.toString());
      expect((await migrationState()).migrationCount).toBe(12);
    } finally {
      await sql.end({ timeout: 5 });
      await rm(preWp10aFolder, { recursive: true, force: true });
    }
  });
});
