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

const primaryName = new URL(databaseUrl).pathname.slice(1);
const base = primaryName
  .replace(/(?:^|_)(?:test|verify\d*)$/, "")
  .replace(/[^a-zA-Z0-9_]/g, "_")
  .slice(0, 20);
const migrationDatabaseName = `${base}_wp12bmigration_verify${`${Date.now()}${randomUUID().replace(/\D/g, "")}`.slice(0, 20)}`;
if (!/^[A-Za-z0-9_]+_verify\d+$/.test(migrationDatabaseName)) {
  throw new Error("WP-12B migration database name must be identifier-safe");
}
const migrationUrl = new URL(databaseUrl);
migrationUrl.pathname = `/${migrationDatabaseName}`;
assertDedicatedTestDatabaseUrl(migrationUrl.toString());
const maintenanceUrl = new URL(databaseUrl);
maintenanceUrl.pathname = "/postgres";
const migrationDirectory = resolve(process.cwd(), "src/db/migrations");

async function resetDatabase() {
  const maintenance = postgres(maintenanceUrl.toString(), { max: 1 });
  try {
    await maintenance`select pg_terminate_backend(pid) from pg_stat_activity
      where datname=${migrationDatabaseName} and pid<>pg_backend_pid()`;
    await maintenance`drop database if exists ${maintenance(migrationDatabaseName)}`;
  } finally {
    await maintenance.end({ timeout: 5 });
  }
}

async function createDatabase() {
  const maintenance = postgres(maintenanceUrl.toString(), { max: 1 });
  try {
    await maintenance`create database ${maintenance(migrationDatabaseName)}`;
  } finally {
    await maintenance.end({ timeout: 5 });
  }
}

async function preWp12bFolder() {
  const folder = await mkdtemp(join(tmpdir(), "preppy-wp12b-upgrade-"));
  const metadata = join(folder, "meta");
  await mkdir(metadata);
  const journal = JSON.parse(
    await readFile(join(migrationDirectory, "meta", "_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const entries = journal.entries.slice(0, 10);
  await writeFile(
    join(metadata, "_journal.json"),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
  );
  for (const entry of entries) {
    await copyFile(
      join(migrationDirectory, `${entry.tag}.sql`),
      join(folder, `${entry.tag}.sql`),
    );
  }
  return folder;
}

async function migrateFolder(folder: string) {
  const client = postgres(migrationUrl.toString(), { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function state() {
  const sql = postgres(migrationUrl.toString(), { max: 1 });
  try {
    const [row] = await sql<
      { migrationCount: number; receiptTable: string | null }[]
    >`
      select
        (select count(*)::int from drizzle.__drizzle_migrations) as "migrationCount",
        to_regclass('public.email_provider_events')::text as "receiptTable"`;
    return row!;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

describe("WP-12B provider event migration", () => {
  beforeEach(async () => {
    await resetDatabase();
    await createDatabase();
  });
  afterEach(resetDatabase);
  afterAll(resetDatabase);

  it("migrates a fresh database through the current repository migration and re-runs as a ledger no-op", async () => {
    await migrateDatabase(migrationUrl.toString());
    expect(await state()).toEqual({
      migrationCount: 13,
      receiptTable: "email_provider_events",
    });
    await migrateDatabase(migrationUrl.toString());
    expect((await state()).migrationCount).toBe(13);
  });

  it("upgrades 0009 additively while preserving existing Outbox rows", async () => {
    const folder = await preWp12bFolder();
    const sql = postgres(migrationUrl.toString(), { max: 1 });
    const eventId = randomUUID();
    try {
      await migrateFolder(folder);
      expect(await state()).toEqual({ migrationCount: 10, receiptTable: null });
      await sql`
        insert into outbox_events(
          id, event_type, aggregate_type, aggregate_id, payload, status,
          dedupe_key
        ) values (
          ${eventId}, 'WP12B_UPGRADE_FIXTURE', 'FIXTURE', ${randomUUID()},
          '{}'::jsonb, 'PENDING', ${`wp12b-upgrade-${eventId}`}
        )`;

      await migrateDatabase(migrationUrl.toString());
      const [preserved] = await sql<{ count: number }[]>`
        select count(*)::int count from outbox_events where id=${eventId}`;
      expect(preserved?.count).toBe(1);
      expect(await state()).toEqual({
        migrationCount: 13,
        receiptTable: "email_provider_events",
      });
      await migrateDatabase(migrationUrl.toString());
      expect((await state()).migrationCount).toBe(13);
    } finally {
      await sql.end({ timeout: 5 });
      await rm(folder, { recursive: true, force: true });
    }
  });
});
