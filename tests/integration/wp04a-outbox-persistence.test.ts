import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const sql = postgres(databaseUrl, { max: 4 });
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const prefix = "wp-04a-outbox-";
const upgradeDatabaseName = "admissionradar_wp04a_upgrade_verify20260827";
const upgradeDatabaseUrl = new URL(databaseUrl);
upgradeDatabaseUrl.pathname = `/${upgradeDatabaseName}`;
assertDedicatedTestDatabaseUrl(upgradeDatabaseUrl.toString());
const maintenanceDatabaseUrl = new URL(databaseUrl);
maintenanceDatabaseUrl.pathname = "/postgres";
const migrationDirectory = resolve(process.cwd(), "src/db/migrations");

type OutboxRow = {
  id: string;
  attempt_count: number;
  status: string;
  max_attempts: number | null;
  dedupe_key: string | null;
  locked_at: Date | null;
  locked_by: string | null;
  last_error_code: string | null;
  last_error_at: Date | null;
  processed_at: Date | null;
  dead_lettered_at: Date | null;
};

async function seedPending(
  input: {
    id?: string;
    availableAt?: Date;
    createdAt?: Date;
    dedupeKey?: string | null;
  } = {},
): Promise<string> {
  const id = input.id ?? randomUUID();
  await sql`
    insert into outbox_events (
      id, event_type, aggregate_type, aggregate_id, payload, status,
      available_at, created_at, dedupe_key
    ) values (
      ${id}, ${`${prefix}${id}`}, 'OUTBOX_TEST', ${randomUUID()},
      '{}'::jsonb, 'PENDING', ${input.availableAt ?? new Date()},
      ${input.createdAt ?? new Date()}, ${input.dedupeKey ?? null}
    )
  `;
  return id;
}

async function clearFixtures() {
  await sql`delete from outbox_events where event_type like ${`${prefix}%`}`;
}

async function resetUpgradeDatabase() {
  const maintenanceSql = postgres(maintenanceDatabaseUrl.toString(), {
    max: 1,
  });
  try {
    await maintenanceSql.unsafe(`
      select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = '${upgradeDatabaseName}' and pid <> pg_backend_pid()
    `);
    await maintenanceSql.unsafe(
      `drop database if exists ${upgradeDatabaseName}`,
    );
  } finally {
    await maintenanceSql.end({ timeout: 5 });
  }
}

async function applyMigrationFile(
  migrationSql: postgres.Sql,
  filename: string,
) {
  const contents = await readFile(
    resolve(migrationDirectory, filename),
    "utf8",
  );
  for (const statement of contents.split("--> statement-breakpoint")) {
    const query = statement.trim();
    if (query) await migrationSql.unsafe(query);
  }
}

describe("WP-04A PostgreSQL Outbox persistence hardening", () => {
  beforeAll(async () => {
    await schemaLockSql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(clearFixtures);

  afterAll(async () => {
    await schemaLockSql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await schemaLockSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
  });

  it("exposes the hardened Outbox columns, indexes, statuses, and staged lifecycle constraints", async () => {
    const columns = await sql<
      { column_name: string; column_default: string | null }[]
    >`
      select column_name, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'outbox_events'
    `;
    const columnNames = new Set(columns.map((column) => column.column_name));
    expect([...columnNames]).toEqual(
      expect.arrayContaining([
        "id",
        "event_type",
        "aggregate_type",
        "aggregate_id",
        "payload",
        "status",
        "available_at",
        "processed_at",
        "attempt_count",
        "created_at",
        "dedupe_key",
        "max_attempts",
        "locked_at",
        "locked_by",
        "last_error_code",
        "last_error_at",
        "dead_lettered_at",
      ]),
    );
    expect(
      columns.find((column) => column.column_name === "max_attempts"),
    ).toMatchObject({ column_default: expect.stringContaining("3") });

    const indexes = await sql<{ indexname: string; indexdef: string }[]>`
      select indexname, indexdef
      from pg_indexes
      where schemaname = 'public' and tablename = 'outbox_events'
    `;
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexname: "outbox_events_status_available_idx",
        }),
        expect.objectContaining({
          indexname: "outbox_events_due_claim_idx",
          indexdef: expect.stringContaining(
            "(status, available_at, created_at)",
          ),
        }),
        expect.objectContaining({
          indexname: "outbox_events_stale_recovery_idx",
          indexdef: expect.stringContaining("(status, locked_at)"),
        }),
        expect.objectContaining({
          indexname: "outbox_events_dedupe_key_unique",
          indexdef: expect.stringContaining("WHERE (dedupe_key IS NOT NULL)"),
        }),
      ]),
    );

    const constraints = await sql<
      { conname: string; convalidated: boolean; definition: string }[]
    >`
      select con.conname, con.convalidated, pg_get_constraintdef(con.oid) as definition
      from pg_constraint as con
      join pg_class as relation on relation.oid = con.conrelid
      join pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = 'outbox_events'
    `;
    expect(constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conname: "outbox_events_status_check",
          definition: expect.stringContaining("'DEAD_LETTER'"),
        }),
        expect.objectContaining({
          conname: "outbox_events_attempt_count_check",
        }),
        expect.objectContaining({
          conname: "outbox_events_max_attempts_check",
        }),
        expect.objectContaining({ conname: "outbox_events_locked_pair_check" }),
        expect.objectContaining({
          conname: "outbox_events_processing_lock_check",
          convalidated: false,
        }),
        expect.objectContaining({
          conname: "outbox_events_processed_at_check",
          convalidated: false,
        }),
        expect.objectContaining({
          conname: "outbox_events_dead_lettered_at_check",
          convalidated: false,
        }),
      ]),
    );
  });

  it("claims exactly four due PENDING rows once across two SKIP LOCKED clients", async () => {
    const cutoff = new Date("2026-08-22T00:03:00.000Z");
    const base = new Date("2026-08-22T00:04:00.000Z");
    const firstId = "00000000-0000-0000-0000-000000000001";
    const tiedLowerId = "00000000-0000-0000-0000-000000000002";
    const tiedHigherId = "00000000-0000-0000-0000-000000000003";
    const finalId = "00000000-0000-0000-0000-000000000004";
    const ids = [firstId, tiedLowerId, tiedHigherId, finalId];
    await seedPending({
      id: firstId,
      availableAt: new Date("2026-08-22T00:00:00.000Z"),
      createdAt: new Date("2026-08-22T00:02:00.000Z"),
    });
    await seedPending({
      id: tiedLowerId,
      availableAt: new Date("2026-08-22T00:01:00.000Z"),
      createdAt: new Date("2026-08-22T00:02:00.000Z"),
    });
    await seedPending({
      id: tiedHigherId,
      availableAt: new Date("2026-08-22T00:01:00.000Z"),
      createdAt: new Date("2026-08-22T00:02:00.000Z"),
    });
    await seedPending({
      id: finalId,
      availableAt: new Date("2026-08-22T00:02:00.000Z"),
      createdAt: new Date("2026-08-22T00:00:00.000Z"),
    });
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    let releaseA!: () => void;
    const holdA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    let claimedA!: () => void;
    const aReady = new Promise<void>((resolve) => {
      claimedA = resolve;
    });
    let firstClaim: string[] = [];

    try {
      const transactionA = a.begin(async (transaction) => {
        const rows = await transaction<{ id: string }[]>`
          with due as (
            select id from outbox_events
            where event_type like ${`${prefix}%`} and status = 'PENDING'
              and available_at <= ${cutoff}
            order by available_at, created_at, id
            for update skip locked
            limit 2
          )
          update outbox_events as event
          set status = 'PROCESSING', locked_at = ${base}, locked_by = 'worker-a',
              attempt_count = event.attempt_count + 1
          from due
          where event.id = due.id
          returning event.id
        `;
        firstClaim = rows.map((row) => row.id);
        claimedA();
        await holdA;
      });

      await aReady;
      const secondClaim = await b<{ id: string }[]>`
        with due as (
          select id from outbox_events
          where event_type like ${`${prefix}%`} and status = 'PENDING'
            and available_at <= ${cutoff}
          order by available_at, created_at, id
          for update skip locked
          limit 2
        )
        update outbox_events as event
        set status = 'PROCESSING', locked_at = ${base}, locked_by = 'worker-b',
            attempt_count = event.attempt_count + 1
        from due
        where event.id = due.id
        returning event.id
      `;
      releaseA();
      await transactionA;

      const secondIds = secondClaim.map((row) => row.id);
      expect(firstClaim).toHaveLength(2);
      expect(secondIds).toHaveLength(2);
      expect(new Set(firstClaim)).toEqual(new Set([firstId, tiedLowerId]));
      expect(new Set(secondIds)).toEqual(new Set([tiedHigherId, finalId]));
      expect(new Set([...firstClaim, ...secondIds])).toEqual(new Set(ids));
      const rows = await sql<
        Pick<
          OutboxRow,
          "id" | "status" | "attempt_count" | "locked_at" | "locked_by"
        >[]
      >`
        select id, status, attempt_count, locked_at, locked_by
        from outbox_events where id in ${sql(ids)}
      `;
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(row).toMatchObject({ status: "PROCESSING", attempt_count: 1 });
        expect(row.locked_at).toEqual(base);
        expect(row.locked_by).toBe(
          firstClaim.includes(row.id) ? "worker-a" : "worker-b",
        );
      }
      expect(rows.map((row) => row.id)).toEqual(expect.arrayContaining(ids));
    } finally {
      releaseA();
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("selects an old PROCESSING lease while excluding a fresh lease", async () => {
    const cutoff = new Date("2026-08-22T00:00:00.000Z");
    const oldId = randomUUID();
    const freshId = randomUUID();
    await sql`
      insert into outbox_events (
        id, event_type, aggregate_type, aggregate_id, payload, status, locked_at,
        locked_by
      ) values
        (${oldId}, ${`${prefix}old-lease`}, 'OUTBOX_TEST', ${randomUUID()},
          '{}'::jsonb, 'PROCESSING', ${new Date(cutoff.getTime() - 1)}, 'worker-a'),
        (${freshId}, ${`${prefix}fresh-lease`}, 'OUTBOX_TEST', ${randomUUID()},
          '{}'::jsonb, 'PROCESSING', ${new Date(cutoff.getTime() + 1)}, 'worker-b')
    `;
    const stale = await sql<{ id: string }[]>`
      select id from outbox_events
      where event_type like ${`${prefix}%`} and status = 'PROCESSING'
        and locked_at < ${cutoff}
      order by id
    `;
    expect(stale.map((row) => row.id)).toEqual([oldId]);
  });

  it("enforces non-NULL dedupe uniqueness while keeping NULL keys and legacy rows nullable", async () => {
    const key = `${prefix}dedupe`;
    await seedPending({ dedupeKey: key });
    await expect(seedPending({ dedupeKey: key })).rejects.toMatchObject({
      code: "23505",
    });
    await seedPending({ dedupeKey: null });
    await seedPending({ dedupeKey: null });
    const [legacy] = await sql<OutboxRow[]>`
      insert into outbox_events (event_type, aggregate_type, aggregate_id, payload)
      values (${`${prefix}legacy-dedupe`}, 'OUTBOX_TEST', ${randomUUID()}, '{}'::jsonb)
      returning id, attempt_count, status, max_attempts, dedupe_key, locked_at,
        locked_by, processed_at, dead_lettered_at
    `;
    expect(legacy).toMatchObject({
      status: "PENDING",
      attempt_count: 0,
      max_attempts: 3,
      dedupe_key: null,
      locked_at: null,
      locked_by: null,
      processed_at: null,
      dead_lettered_at: null,
    });
  });

  it("preserves a pre-migration old-shape Outbox row through the additive upgrade", async () => {
    await resetUpgradeDatabase();
    const maintenanceSql = postgres(maintenanceDatabaseUrl.toString(), {
      max: 1,
    });
    let upgradeSql: ReturnType<typeof postgres> | undefined;

    try {
      await maintenanceSql.unsafe(`create database ${upgradeDatabaseName}`);
      upgradeSql = postgres(upgradeDatabaseUrl.toString(), { max: 1 });
      for (const filename of [
        "0000_absent_shen.sql",
        "0001_productive_morph.sql",
        "0002_spicy_starbolt.sql",
        "0003_stormy_mach_iv.sql",
        "0004_panoramic_vindicator.sql",
        "0005_canonical_identity_follow.sql",
      ]) {
        await applyMigrationFile(upgradeSql, filename);
      }

      const [legacy] = await upgradeSql<{ id: string }[]>`
        insert into outbox_events (event_type, aggregate_type, aggregate_id, payload)
        values (${`${prefix}upgrade-legacy`}, 'OUTBOX_TEST', ${randomUUID()}, '{}'::jsonb)
        returning id
      `;
      await applyMigrationFile(upgradeSql, "0006_bright_garia.sql");

      const [preserved] = await upgradeSql<
        Pick<
          OutboxRow,
          | "dedupe_key"
          | "max_attempts"
          | "locked_at"
          | "locked_by"
          | "last_error_code"
          | "last_error_at"
          | "dead_lettered_at"
        >[]
      >`
        select dedupe_key, max_attempts, locked_at, locked_by, last_error_code,
          last_error_at, dead_lettered_at
        from outbox_events where id = ${legacy!.id}
      `;
      expect(preserved).toEqual({
        dedupe_key: null,
        max_attempts: null,
        locked_at: null,
        locked_by: null,
        last_error_code: null,
        last_error_at: null,
        dead_lettered_at: null,
      });

      const [postUpgrade] = await upgradeSql<Pick<OutboxRow, "max_attempts">[]>`
        insert into outbox_events (event_type, aggregate_type, aggregate_id, payload)
        values (${`${prefix}upgrade-new`}, 'OUTBOX_TEST', ${randomUUID()}, '{}'::jsonb)
        returning max_attempts
      `;
      expect(postUpgrade).toEqual({ max_attempts: 3 });
    } finally {
      await upgradeSql?.end({ timeout: 5 });
      await maintenanceSql.end({ timeout: 5 });
      await resetUpgradeDatabase();
    }
  });

  it("only claims due PENDING rows", async () => {
    const now = new Date("2026-08-22T00:00:00.000Z");
    const past = await seedPending({
      availableAt: new Date(now.getTime() - 1),
    });
    const current = await seedPending({ availableAt: now });
    await seedPending({ availableAt: new Date(now.getTime() + 1) });
    const processedId = randomUUID();
    const deadLetterId = randomUUID();
    await sql`
      insert into outbox_events (
        id, event_type, aggregate_type, aggregate_id, payload, status, processed_at
      ) values (
        ${processedId}, ${`${prefix}processed`}, 'OUTBOX_TEST', ${randomUUID()},
        '{}'::jsonb, 'PROCESSED', ${now}
      )
    `;
    await sql`
      insert into outbox_events (
        id, event_type, aggregate_type, aggregate_id, payload, status, dead_lettered_at
      ) values (
        ${deadLetterId}, ${`${prefix}dead-letter`}, 'OUTBOX_TEST', ${randomUUID()},
        '{}'::jsonb, 'DEAD_LETTER', ${now}
      )
    `;
    const eligible = await sql<{ id: string }[]>`
      select id from outbox_events
      where event_type like ${`${prefix}%`} and status = 'PENDING'
        and available_at <= ${now}
      order by available_at, created_at, id
    `;
    expect(eligible.map((row) => row.id)).toEqual([past, current]);
  });

  it("enforces bounded retry, lifecycle, lock, worker, and safe error-code invariants", async () => {
    const insert = (values: string) =>
      sql.unsafe(`insert into outbox_events ${values}`);
    const standard = () =>
      `('${prefix}validation-${randomUUID()}','OUTBOX_TEST','${randomUUID()}','{}'::jsonb)`;
    const processingWorker = (lockedBy: string) => sql`
      insert into outbox_events (
        event_type, aggregate_type, aggregate_id, payload, status, locked_at,
        locked_by
      ) values (
        ${`${prefix}worker-${randomUUID()}`}, 'OUTBOX_TEST', ${randomUUID()},
        '{}'::jsonb, 'PROCESSING', now(), ${lockedBy}
      )
    `;

    await expect(
      insert(
        `(event_type,aggregate_type,aggregate_id,payload,attempt_count) values ${standard().slice(0, -1)},-1)`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert(
        `(event_type,aggregate_type,aggregate_id,payload,max_attempts) values ${standard().slice(0, -1)},0)`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert(
        `(event_type,aggregate_type,aggregate_id,payload,max_attempts) values ${standard().slice(0, -1)},11)`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert(
        `(event_type,aggregate_type,aggregate_id,payload,status) values ${standard().slice(0, -1)},'PROCESSED')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert(
        `(event_type,aggregate_type,aggregate_id,payload,status) values ${standard().slice(0, -1)},'PROCESSING')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert(
        `(event_type,aggregate_type,aggregate_id,payload,locked_at) values ${standard().slice(0, -1)},now())`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert(
        `(event_type,aggregate_type,aggregate_id,payload,status) values ${standard().slice(0, -1)},'DEAD_LETTER')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(processingWorker("")).rejects.toMatchObject({ code: "23514" });
    await expect(processingWorker("   ")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(processingWorker("\t")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(processingWorker("\n")).rejects.toMatchObject({
      code: "23514",
    });
    await expect(
      insert(
        `(event_type,aggregate_type,aggregate_id,payload,locked_at,locked_by) values ${standard().slice(0, -1)},now(),'${"w".repeat(129)}')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert(
        `(event_type,aggregate_type,aggregate_id,payload,last_error_code) values ${standard().slice(0, -1)},'raw error message')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      insert(
        `(event_type,aggregate_type,aggregate_id,payload,last_error_code) values ${standard().slice(0, -1)},'${"A".repeat(129)}')`,
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await insert(
      `(event_type,aggregate_type,aggregate_id,payload,status,processed_at) values ${standard().slice(0, -1)},'PROCESSED',now())`,
    );
    await insert(
      `(event_type,aggregate_type,aggregate_id,payload,status,locked_at,locked_by) values ${standard().slice(0, -1)},'PROCESSING',now(),'worker-1')`,
    );
    await insert(
      `(event_type,aggregate_type,aggregate_id,payload,status,dead_lettered_at,last_error_code,last_error_at) values ${standard().slice(0, -1)},'DEAD_LETTER',now(),'EMAIL:TIMEOUT-1',now())`,
    );
    await insert(
      `(event_type,aggregate_type,aggregate_id,payload,status) values ${standard().slice(0, -1)},'PENDING')`,
    );
    await insert(
      `(event_type,aggregate_type,aggregate_id,payload,status) values ${standard().slice(0, -1)},'FAILED')`,
    );
    await insert(
      `(event_type,aggregate_type,aggregate_id,payload,status) values ${standard().slice(0, -1)},'CANCELLED')`,
    );
  });
});
