import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import postgres from "postgres";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
import {
  loadMigrationSpecs,
  ENGLISH_IDENTITY_MIGRATION,
} from "@/src/db/migration-plan";
import { runFullMigrations, type MigrationSql } from "@/src/db/migrate";
import {
  ledgerFingerprint,
  runScopedEnglishIdentityMigration,
} from "@/src/db/scoped-english-identity-migration";
const sharedUrl = process.env.TEST_DATABASE_URL!;
assertDedicatedTestDatabaseUrl(sharedUrl);
if (new URL(sharedUrl).hostname !== "127.0.0.1")
  throw Error("LOCAL_MIGRATION_TEST_ONLY");
// This suite creates and drops its whole database, so it must never reuse the
// shared TEST_DATABASE_URL database that other suites depend on.
const ownUrl = new URL(sharedUrl);
ownUrl.pathname = ownUrl.pathname + "_scoped_test";
const url = ownUrl.toString();
assertDedicatedTestDatabaseUrl(url);
const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
const name = new URL(url).pathname.slice(1),
  restoreName = name + "_restore_test",
  adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1 });
let client: MigrationSql;
const specs = await loadMigrationSpecs();
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
const args = () => ({
  target,
  environment,
  backupReceiptPath: receiptPath,
  apply: true,
  expectedSqlChecksum: ENGLISH_IDENTITY_MIGRATION.hash,
  acknowledgeDeferred0017: true,
});
async function tool(command: string, args: string[]) {
  const r = spawnSync(command, args, { stdio: "ignore", timeout: 30000 });
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
  const dir = await mkdtemp(join(tmpdir(), "preppy-scoped-backup-"));
  const dumpPath = join(dir, "source.dump");
  await tool("pg_dump", [
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
  await tool("pg_restore", [
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
  const before = await fingerprints(client),
    after = await fingerprints(restored);
  await restored.end();
  expect(after).toBe(before);
  const beforeTablesPath = join(dir, "before.jsonl"),
    restoredTablesPath = join(dir, "restored.jsonl");
  await writeFile(beforeTablesPath, before);
  await writeFile(restoredTablesPath, after);
  const ledgerSha256 = await client.begin((tx) => ledgerFingerprint(tx));
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
async function identityTables() {
  return (
    await client`select count(*)::int as count from pg_tables where schemaname='public' and tablename in ('english_campus_identities','english_campus_aliases','english_session_identities')`
  )[0]!.count;
}
beforeAll(async () => {
  await admin`do $$begin if not exists(select 1 from pg_roles where rolname='preppy_migration') then create role preppy_migration nologin; end if; if not exists(select 1 from pg_roles where rolname='preppy_runtime') then create role preppy_runtime nologin; end if; end$$`;
  await admin.unsafe(
    "create database " + quote(name) + " owner preppy_migration",
  );
  client = postgres(url, { max: 1 });
});
beforeEach(async () => {
  await client`reset role`;
  await client`drop schema if exists public cascade`;
  await client`drop schema if exists drizzle cascade`;
  await client`create schema public authorization preppy_migration`;
  await client`set role preppy_migration`;
  await client`alter default privileges in schema public grant select,insert,update,delete on tables to preppy_runtime`;
  await runFullMigrations(client, specs.slice(0, 17));
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
describe("serialized migration execution against backed-up/restored isolated databases", () => {
  it("runs an ordinary complete prefix in order and repeats without writes", async () => {
    expect((await runFullMigrations(client, specs)).applied).toEqual([
      "0017_account_deletion",
      "0018_english_session_identity",
    ]);
    const before = await ledger();
    expect((await runFullMigrations(client, specs)).applied).toEqual([]);
    expect(await ledger()).toEqual(before);
  });
  it("rejects an unknown historical article-tags hash before any pending DDL", async () => {
    await client`insert into drizzle.__drizzle_migrations(hash,created_at) values('c15754b2f47e236cf7f308f5e7a5d7c279eba015369efc4f5ef51c8b1d1120c6',1790477016170)`;
    const before = await ledger();
    await expect(runFullMigrations(client, specs)).rejects.toThrow(
      "UNKNOWN_MIGRATION_HASH",
    );
    expect(await ledger()).toEqual(before);
    expect(await identityTables()).toBe(0);
  });
  it("applies only0018, keeps0017 pending, repeats idempotently and blocks every later full run", async () => {
    await makeBackup();
    const before = await ledger();
    const first = await runScopedEnglishIdentityMigration(
      client,
      specs,
      args(),
    );
    expect(first).toMatchObject({
      applied: true,
      deferred0017: true,
      fullLedgerReady: false,
    });
    expect(await identityTables()).toBe(3);
    expect(
      (await ledger()).filter(
        (x) => x.hash !== ENGLISH_IDENTITY_MIGRATION.hash,
      ),
    ).toEqual(before);
    expect((await ledger()).some((x) => x.hash === specs[17]!.hash)).toBe(
      false,
    );
    const applied = await ledger();
    expect(
      await runScopedEnglishIdentityMigration(client, specs, args()),
    ).toMatchObject({ mode: "NO_OP", applied: false });
    expect(await ledger()).toEqual(applied);
    await expect(runFullMigrations(client, specs)).rejects.toThrow(
      "MIGRATION_GAP_REQUIRES_REVIEW",
    );
    const future = {
      identifier: "0019_test",
      hash: createHash("sha256")
        .update("create table must_not_run(id int)")
        .digest("hex"),
      when: specs[18]!.when + 1,
      source: "create table must_not_run(id int)",
    };
    await expect(runFullMigrations(client, [...specs, future])).rejects.toThrow(
      "MIGRATION_GAP_REQUIRES_REVIEW",
    );
    expect(
      (await client`select to_regclass('public.must_not_run') as r`)[0]!.r,
    ).toBeNull();
  });
  it("rolls back all three scoped tables if ledger recording fails midway", async () => {
    await makeBackup();
    const before = await ledger();
    await client`create function fail_scoped_ledger() returns trigger language plpgsql as $$begin if new.hash='6782c831e6d28b646aca6edc92e7b086406f7b973e29621bac4d77d303e6fcf8' then raise exception 'ISOLATED_FAILURE'; end if; return new; end$$`;
    await client`create trigger fail_scoped before insert on drizzle.__drizzle_migrations for each row execute function fail_scoped_ledger()`;
    await expect(
      runScopedEnglishIdentityMigration(client, specs, args()),
    ).rejects.toThrow("ISOLATED_FAILURE");
    expect(await ledger()).toEqual(before);
    expect(await identityTables()).toBe(0);
  });
  it("rolls back a full0017/0018 sequence when a later ledger write fails", async () => {
    const before = await ledger();
    await client`create function fail_full_ledger() returns trigger language plpgsql as $$begin if new.hash='6782c831e6d28b646aca6edc92e7b086406f7b973e29621bac4d77d303e6fcf8' then raise exception 'ISOLATED_FAILURE'; end if; return new; end$$`;
    await client`create trigger fail_full before insert on drizzle.__drizzle_migrations for each row execute function fail_full_ledger()`;
    await expect(runFullMigrations(client, specs)).rejects.toThrow(
      "ISOLATED_FAILURE",
    );
    expect(await ledger()).toEqual(before);
    expect(await identityTables()).toBe(0);
    expect(
      (
        await client`select to_regclass('public.account_deletion_jobs') as r`
      )[0]!.r,
    ).toBeNull();
  });
  it("rejects target, dump and SQL tampering before scoped DDL", async () => {
    await makeBackup();
    await expect(
      runScopedEnglishIdentityMigration(client, specs, {
        ...args(),
        environment: {},
      }),
    ).rejects.toThrow("ENVIRONMENT");
    await expect(
      runScopedEnglishIdentityMigration(client, specs, {
        ...args(),
        expectedSqlChecksum: "f".repeat(64),
      }),
    ).rejects.toThrow("CHECKSUM");
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    await writeFile(receipt.dumpPath, "not the verified archive");
    await expect(
      runScopedEnglishIdentityMigration(client, specs, args()),
    ).rejects.toThrow("BACKUP_ARTIFACT_CHECKSUM_MISMATCH");
    expect(await identityTables()).toBe(0);
  });
  it("serializes two scoped attempts and records exactly one true0018 row", async () => {
    await makeBackup();
    const other = postgres(url, { max: 1 });
    await other`set role preppy_migration`;
    try {
      const results = await Promise.all([
        runScopedEnglishIdentityMigration(client, specs, args()),
        runScopedEnglishIdentityMigration(other, specs, args()),
      ]);
      expect(results.filter((r) => r.applied)).toHaveLength(1);
      expect(
        (await ledger()).filter(
          (r) => r.hash === ENGLISH_IDENTITY_MIGRATION.hash,
        ),
      ).toHaveLength(1);
    } finally {
      await other.end();
    }
  });
  it("rejects exact-hash replay when live schema has drifted", async () => {
    await makeBackup();
    await runScopedEnglishIdentityMigration(client, specs, args());
    await client`alter table english_campus_aliases add column unexpected text`;
    const before = await ledger();
    await expect(
      runScopedEnglishIdentityMigration(client, specs, args()),
    ).rejects.toThrow("SCOPED_SCHEMA_DRIFT");
    expect(await ledger()).toEqual(before);
  });
});
