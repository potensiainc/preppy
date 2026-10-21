import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runFullMigrations, type MigrationSql } from "@/src/db/migrate";
import {
  ACCOUNT_DELETION_MIGRATION,
  ENGLISH_IDENTITY_MIGRATION,
  loadMigrationSpecs,
  migrationStatements,
} from "@/src/db/migration-plan";
import * as schema from "@/src/db/schema";
import {
  inspectAccountDeletionSchema,
  ledgerFingerprintWithout0017,
  runScopedAccountDeletionMigration,
} from "@/src/db/scoped-account-deletion-migration";
import {
  isAccountDeletionSchemaReady,
  resetAccountDeletionReadinessCache,
} from "@/src/modules/account-deletion/readiness.server";
import { getOperationalSnapshot } from "@/src/modules/production-safety/operational-snapshot.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const sharedUrl = process.env.TEST_DATABASE_URL!;
assertDedicatedTestDatabaseUrl(sharedUrl);
if (new URL(sharedUrl).hostname !== "127.0.0.1")
  throw Error("LOCAL_MIGRATION_TEST_ONLY");
// This suite creates and drops its own database; never the shared one.
const own = new URL(sharedUrl);
own.pathname += "_deletion_scoped_test";
const url = own.toString();
assertDedicatedTestDatabaseUrl(url);
const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
const name = own.pathname.slice(1);
const restoreName = name + "_restore_test";
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1 });
const specs = await loadMigrationSpecs();
let client: MigrationSql;
let receiptPath: string;
const target = {
  environmentId: "isolated-test",
  databaseServiceId: "isolated-db",
  database: name,
};
const environment = {
  RAILWAY_ENVIRONMENT_ID: target.environmentId,
  RAILWAY_SERVICE_ID: target.databaseServiceId,
};
const args = (overrides: Partial<{ apply: boolean }> = {}) => ({
  target,
  environment,
  backupReceiptPath: receiptPath,
  apply: true,
  expectedSqlChecksum: ACCOUNT_DELETION_MIGRATION.hash,
  ...overrides,
});

function tool(command: string, toolArgs: string[]) {
  const r = spawnSync(command, toolArgs, { stdio: "ignore", timeout: 30000 });
  if (r.status !== 0) throw Error("LOCAL_BACKUP_RESTORE_TOOL_FAILED");
}
async function fingerprints(db: MigrationSql) {
  const tables =
    await db`select schemaname,tablename from pg_tables where schemaname in ('public','drizzle') order by 1,2`;
  const out = [];
  for (const t of tables) {
    const [r] = await db.unsafe(
      "select count(*)::int as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') as sha256 from " +
        quote(t.schemaname) +
        "." +
        quote(t.tablename) +
        " t",
    );
    out.push({ kind: "table", table: t.schemaname + "." + t.tablename, ...r });
  }
  return out.map((x) => JSON.stringify(x)).join("\n") + "\n";
}
async function makeBackup() {
  const dir = await mkdtemp(join(tmpdir(), "preppy-0017-backup-"));
  const dumpPath = join(dir, "source.dump");
  tool("pg_dump", [
    "--dbname",
    url,
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file",
    dumpPath,
  ]);
  await admin.unsafe(
    "drop database if exists " + quote(restoreName) + " with (force)",
  );
  await admin.unsafe(
    "create database " + quote(restoreName) + " owner preppy_migration",
  );
  const restoreUrl = new URL(url);
  restoreUrl.pathname = "/" + restoreName;
  tool("pg_restore", [
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--role=preppy_migration",
    "--exit-on-error",
    "--dbname",
    restoreUrl.toString(),
    dumpPath,
  ]);
  const restored = postgres(restoreUrl.toString(), { max: 1 });
  const before = await fingerprints(client);
  const after = await fingerprints(restored);
  await restored.end();
  expect(after).toBe(before);
  const beforeTablesPath = join(dir, "before.jsonl");
  const restoredTablesPath = join(dir, "restored.jsonl");
  await writeFile(beforeTablesPath, before);
  await writeFile(restoredTablesPath, after);
  const ledgerSha256 = await client.begin((tx) =>
    ledgerFingerprintWithout0017(tx, false),
  );
  const now = new Date().toISOString();
  receiptPath = join(dir, "receipt.json");
  await writeFile(
    receiptPath,
    JSON.stringify({
      version: 1,
      target,
      capturedAt: now,
      verifiedAt: now,
      dumpPath,
      dumpSha256: createHash("sha256")
        .update(await readFile(dumpPath))
        .digest("hex"),
      beforeTablesPath,
      restoredTablesPath,
      tablesSha256: createHash("sha256").update(before).digest("hex"),
      ledgerSha256,
      schemaEquivalent: true,
    }),
  );
}
async function ledger() {
  return await client`select id,hash,created_at from drizzle.__drizzle_migrations order by id`;
}
async function deletionTables() {
  return (
    await client`select count(*)::int as count from pg_tables where schemaname='public' and tablename in ('account_deletion_jobs','kakao_unlink_inbox')`
  )[0]!.count;
}
// Reproduces production: 0000-0016 by the full runner, then 0018 appended
// by its scoped command while 0017 stays deferred.
async function productionShape() {
  await runFullMigrations(client, specs.slice(0, 17));
  const english = specs[18]!;
  await client.begin(async (tx) => {
    for (const statement of migrationStatements(english))
      await tx.unsafe(statement);
    await tx`insert into drizzle.__drizzle_migrations(hash,created_at) values(${english.hash},${english.when})`;
  });
}

beforeAll(async () => {
  await admin`do $$begin if not exists(select 1 from pg_roles where rolname='preppy_migration') then create role preppy_migration nologin; end if; if not exists(select 1 from pg_roles where rolname='preppy_runtime') then create role preppy_runtime nologin; end if; end$$`;
  await admin.unsafe(
    "drop database if exists " + quote(name) + " with (force)",
  );
  await admin.unsafe(
    "create database " + quote(name) + " owner preppy_migration",
  );
  client = postgres(url, { max: 1 });
});
beforeEach(async () => {
  resetAccountDeletionReadinessCache();
  await client`reset role`;
  await client`drop schema if exists public cascade`;
  await client`drop schema if exists drizzle cascade`;
  await client`create schema public authorization preppy_migration`;
  await client`set role preppy_migration`;
  await client`alter default privileges in schema public grant select,insert,update,delete on tables to preppy_runtime`;
});
afterAll(async () => {
  await client?.end();
  await admin.unsafe(
    "drop database if exists " + quote(name) + " with (force)",
  );
  await admin.unsafe(
    "drop database if exists " + quote(restoreName) + " with (force)",
  );
  await admin.end();
});

describe("scoped 0017 after a scoped 0018", () => {
  it("dry-runs by default without DDL or ledger writes", async () => {
    await productionShape();
    await makeBackup();
    const before = await ledger();
    await expect(
      runScopedAccountDeletionMigration(client, specs, args({ apply: false })),
    ).resolves.toEqual({
      mode: "DRY_RUN",
      applied: false,
      migration: "0017_account_deletion",
      fullLedgerReady: false,
    });
    expect(await ledger()).toEqual(before);
    expect(await deletionTables()).toBe(0);
  });

  it("applies exactly 0017, keeps the old ledger, and makes every reader whole", async () => {
    await productionShape();
    await makeBackup();
    const before = await ledger();
    await expect(
      runScopedAccountDeletionMigration(client, specs, args()),
    ).resolves.toMatchObject({
      mode: "APPLIED",
      applied: true,
      checksum: ACCOUNT_DELETION_MIGRATION.hash,
      fullLedgerReady: true,
    });
    const after = await ledger();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.map((row) => row.hash).slice(-2)).toEqual([
      ENGLISH_IDENTITY_MIGRATION.hash,
      ACCOUNT_DELETION_MIGRATION.hash,
    ]);
    expect(Number(after.at(-1)!.created_at)).toBe(
      ACCOUNT_DELETION_MIGRATION.when,
    );
    expect(await client.begin((tx) => inspectAccountDeletionSchema(tx))).toBe(
      "EXACT",
    );

    // The full runner accepts the approved 18-then-17 append and has nothing
    // left to do; the admin snapshot and deletion readiness agree.
    expect((await runFullMigrations(client, specs)).applied).toEqual([]);
    const database = drizzle(client, { schema });
    const executor = { raw: database.execute.bind(database) };
    const snapshot = await getOperationalSnapshot(executor as never, {
      now: new Date("2026-10-21T00:00:00.000Z"),
    });
    expect(snapshot.migration).toEqual({
      status: "MATCH",
      latest: "0018_english_session_identity",
    });
    await expect(isAccountDeletionSchemaReady(executor)).resolves.toBe(true);
  });

  it("repeats as a no-op without ledger writes", async () => {
    await productionShape();
    await makeBackup();
    await runScopedAccountDeletionMigration(client, specs, args());
    const applied = await ledger();
    await expect(
      runScopedAccountDeletionMigration(client, specs, args()),
    ).resolves.toMatchObject({ mode: "NO_OP", applied: false });
    expect(await ledger()).toEqual(applied);
  });

  it("refuses a database where 0018 was never applied", async () => {
    await runFullMigrations(client, specs.slice(0, 17));
    await makeBackup();
    await expect(
      runScopedAccountDeletionMigration(client, specs, args()),
    ).rejects.toThrow("SCOPED_USE_FULL_RUNNER");
    expect(await deletionTables()).toBe(0);
  });

  it("refuses a modified checksum and a different environment before DDL", async () => {
    await productionShape();
    await makeBackup();
    await expect(
      runScopedAccountDeletionMigration(client, specs, {
        ...args(),
        expectedSqlChecksum: "f".repeat(64),
      }),
    ).rejects.toThrow("SCOPED_MIGRATION_CHECKSUM_MISMATCH");
    await expect(
      runScopedAccountDeletionMigration(client, specs, {
        ...args(),
        environment: { ...environment, RAILWAY_SERVICE_ID: "other-db" },
      }),
    ).rejects.toThrow("SCOPED_ENVIRONMENT_MISMATCH");
    expect(await deletionTables()).toBe(0);
  });

  it("refuses a backup taken before the ledger changed", async () => {
    await runFullMigrations(client, specs.slice(0, 17));
    await makeBackup();
    const english = specs[18]!;
    await client.begin(async (tx) => {
      for (const statement of migrationStatements(english))
        await tx.unsafe(statement);
      await tx`insert into drizzle.__drizzle_migrations(hash,created_at) values(${english.hash},${english.when})`;
    });
    await expect(
      runScopedAccountDeletionMigration(client, specs, args()),
    ).rejects.toThrow("BACKUP_LEDGER_MISMATCH");
    expect(await deletionTables()).toBe(0);
  });

  it("stops on a partial 0017 schema without repairing it", async () => {
    await productionShape();
    await client`create table kakao_unlink_inbox(subject_fingerprint text primary key)`;
    await makeBackup();
    const before = await ledger();
    await expect(
      runScopedAccountDeletionMigration(client, specs, args()),
    ).rejects.toThrow("SCOPED_SCHEMA_DRIFT");
    expect(await ledger()).toEqual(before);
    expect(
      (
        await client`select to_regclass('public.account_deletion_jobs') as r`
      )[0]!.r,
    ).toBeNull();
  });

  it("rolls back every 0017 object when runtime privileges are missing", async () => {
    await client`alter default privileges in schema public revoke all on tables from preppy_runtime`;
    await productionShape();
    await makeBackup();
    const before = await ledger();
    await expect(
      runScopedAccountDeletionMigration(client, specs, args()),
    ).rejects.toThrow("SCOPED_EXISTING_DEFAULT_ACL_REQUIRED");
    expect(await ledger()).toEqual(before);
    expect(await deletionTables()).toBe(0);
    expect(
      (
        await client`select count(*)::int as count from pg_trigger where tgname='block_deleting_kakao_identity_before_insert'`
      )[0]!.count,
    ).toBe(0);
  });

  it("treats the staging article-tags history as reviewed and fully migrated", async () => {
    await runFullMigrations(client, specs.slice(0, 18));
    await client`alter table articles add column tags text[] default '{}'::text[] not null`;
    await client`insert into drizzle.__drizzle_migrations(hash,created_at) values('c15754b2f47e236cf7f308f5e7a5d7c279eba015369efc4f5ef51c8b1d1120c6',1790477016170)`;
    expect((await runFullMigrations(client, specs)).applied).toEqual([
      "0018_english_session_identity",
    ]);
    expect((await runFullMigrations(client, specs)).applied).toEqual([]);
    const database = drizzle(client, { schema });
    const snapshot = await getOperationalSnapshot(
      { raw: database.execute.bind(database) } as never,
      { now: new Date("2026-10-21T00:00:00.000Z") },
    );
    expect(snapshot.migration.status).toBe("MATCH");
  });

  it("refuses later history beyond 0018", async () => {
    await productionShape();
    await makeBackup();
    const future = {
      identifier: "0019_future",
      hash: createHash("sha256").update("select 1").digest("hex"),
      when: specs[18]!.when + 1,
      source: "select 1",
    };
    await client`insert into drizzle.__drizzle_migrations(hash,created_at) values(${future.hash},${future.when})`;
    await expect(
      runScopedAccountDeletionMigration(client, [...specs, future], args()),
    ).rejects.toThrow();
    expect(await deletionTables()).toBe(0);
  });
});
