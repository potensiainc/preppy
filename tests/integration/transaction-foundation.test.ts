import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { schoolAliases, schools } from "@/src/db/schema";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  TransactionManager,
  type TransactionExecutor,
} from "@/src/infrastructure/db/runtime.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const config = {
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 3,
  NODE_ENV: "test" as const,
};

const runtime = getRuntimeDatabase(config);

function schoolRecord(id = randomUUID()) {
  return {
    id,
    slug: `phase0-${id}`,
    canonicalName: "Phase 0 School",
    schoolType: "PRIVATE_ELEMENTARY",
    lifecycleStatus: "ACTIVE",
    countryCode: "KR",
    isPublic: false,
  };
}

async function writeSchool(
  executor: TransactionExecutor,
  school = schoolRecord(),
) {
  await executor.drizzle.insert(schools).values(school);
  return school;
}

async function writeAlias(
  executor: TransactionExecutor,
  schoolId: string,
  aliasId = randomUUID(),
) {
  await executor.raw(sql`
    insert into school_aliases (
      id, school_id, alias, normalized_alias, alias_type
    ) values (
      ${aliasId}, ${schoolId}, 'Phase Zero', 'phase zero', 'COMMON_NAME'
    )
  `);
  return aliasId;
}

describe("Phase 0A database runtime", () => {
  beforeAll(async () => {
    await runtime.client`
      select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
    `;
    await migrateDatabase(databaseUrl);
  });

  afterEach(async () => {
    await runtime.client`truncate table schools restart identity cascade`;
  });

  afterAll(async () => {
    await runtime.client`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
    await closeRuntimeDatabase();
  });

  it("reuses one process-local pool and runtime Drizzle instance", () => {
    const reused = getRuntimeDatabase(config);

    expect(reused).toBe(runtime);
    expect(reused.database).toBe(runtime.database);
    expect(reused.client).toBe(runtime.client);
  });

  it("commits Drizzle and raw SQL writes from one transaction executor", async () => {
    const school = schoolRecord();
    const aliasId = randomUUID();

    await runtime.transactionManager.run(async (executor) => {
      await writeSchool(executor, school);
      await writeAlias(executor, school.id, aliasId);
    });

    await expect(
      runtime.database
        .select({ id: schools.id })
        .from(schools)
        .where(eq(schools.id, school.id)),
    ).resolves.toEqual([{ id: school.id }]);
    await expect(
      runtime.database
        .select({ id: schoolAliases.id })
        .from(schoolAliases)
        .where(eq(schoolAliases.id, aliasId)),
    ).resolves.toEqual([{ id: aliasId }]);
  });

  it("rolls back every shared executor write when the command throws", async () => {
    const school = schoolRecord();
    const aliasId = randomUUID();

    await expect(
      runtime.transactionManager.run(async (executor) => {
        await writeSchool(executor, school);
        await writeAlias(executor, school.id, aliasId);
        throw new Error("ROLL_BACK_PHASE_0_TEST");
      }),
    ).rejects.toThrow("ROLL_BACK_PHASE_0_TEST");

    await expect(
      runtime.database
        .select({ id: schools.id })
        .from(schools)
        .where(eq(schools.id, school.id)),
    ).resolves.toEqual([]);
    await expect(
      runtime.database
        .select({ id: schoolAliases.id })
        .from(schoolAliases)
        .where(eq(schoolAliases.id, aliasId)),
    ).resolves.toEqual([]);
  });

  it("passes the same executor identity to nested repository operations", async () => {
    await runtime.transactionManager.run(async (executor) => {
      const seen: TransactionExecutor[] = [];
      const firstOperation = (tx: TransactionExecutor) => seen.push(tx);
      const secondOperation = (tx: TransactionExecutor) => seen.push(tx);

      firstOperation(executor);
      secondOperation(executor);

      expect(seen[0]).toBe(executor);
      expect(seen[1]).toBe(executor);
      expect("transaction" in executor.drizzle).toBe(false);
    });
  });

  it("rejects a nested root transaction before it can commit independently", async () => {
    const outerSchool = schoolRecord();
    const nestedSchool = schoolRecord();

    await runtime.transactionManager.run(async (executor) => {
      await writeSchool(executor, outerSchool);

      await expect(
        runtime.transactionManager.run(async (nestedExecutor) => {
          await writeSchool(nestedExecutor, nestedSchool);
        }),
      ).rejects.toThrow("Nested root database transactions are not allowed");
    });

    await expect(
      runtime.database
        .select({ id: schools.id })
        .from(schools)
        .where(eq(schools.id, outerSchool.id)),
    ).resolves.toEqual([{ id: outerSchool.id }]);
    await expect(
      runtime.database
        .select({ id: schools.id })
        .from(schools)
        .where(eq(schools.id, nestedSchool.id)),
    ).resolves.toEqual([]);
  });

  it("shares the nested-root guard across manager instances", async () => {
    const alternateManager = new TransactionManager(runtime.database);
    const nestedSchool = schoolRecord();

    await runtime.transactionManager.run(async () => {
      await expect(
        alternateManager.run(async (nestedExecutor) => {
          await writeSchool(nestedExecutor, nestedSchool);
        }),
      ).rejects.toThrow("Nested root database transactions are not allowed");
    });

    await expect(
      runtime.database
        .select({ id: schools.id })
        .from(schools)
        .where(eq(schools.id, nestedSchool.id)),
    ).resolves.toEqual([]);
  });

  it("provides two independent pool connections without max-one serialization", async () => {
    const [first, second] = await Promise.all([
      runtime.client.reserve(),
      runtime.client.reserve(),
    ]);

    try {
      const [[firstResult], [secondResult]] = await Promise.all([
        first<{ pid: number }[]>`select pg_backend_pid() as pid`,
        second<{ pid: number }[]>`select pg_backend_pid() as pid`,
      ]);

      expect(firstResult?.pid).toBeTypeOf("number");
      expect(secondResult?.pid).toBeTypeOf("number");
      expect(firstResult?.pid).not.toBe(secondResult?.pid);
    } finally {
      first.release();
      second.release();
    }
  });
});
