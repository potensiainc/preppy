import "server-only";

import postgres from "postgres";

import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { restoreCriticalTableNames } from "@/src/modules/production-safety/backup-manifest";
import { collectInvariantChecks } from "@/src/modules/production-preflight/invariant-checks.server";
import { loadRepositoryMigrationManifest } from "@/src/modules/production-preflight/migrations";
import { runWithRehearsalReadOnlyDatabase } from "@/src/modules/production-preflight/read-only-database.server";
import { runRehearsalSmoke } from "@/src/modules/production-preflight/rehearsal-smoke.server";

export type RestoreSnapshot = Readonly<{
  migrationLatest: string;
  criticalTableCounts: Readonly<Record<string, number>>;
}>;

export async function collectRestoreSnapshot(
  databaseUrl: string,
): Promise<RestoreSnapshot> {
  const repository = await loadRepositoryMigrationManifest("src/db/migrations");
  const client = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5,
    connection: {
      application_name: "preppy-wp16a-restore-snapshot",
      statement_timeout: 10_000,
    },
  });
  try {
    return await client.begin(
      "isolation level repeatable read read only",
      async (transaction) => {
        const rows = await transaction<
          Array<{ hash: string; createdAt: string }>
        >`
          select hash, created_at::text as "createdAt"
          from drizzle.__drizzle_migrations
          order by created_at, id
        `;
        const ledgerMatches =
          rows.length === repository.length &&
          rows.every((row, index) => row.hash === repository[index]?.hash);
        const latest = repository.at(-1)?.identifier;
        if (!ledgerMatches || !latest) {
          throw new Error(
            "Restore source migration ledger does not match the repository.",
          );
        }

        const counts: Record<string, number> = {};
        for (const tableName of restoreCriticalTableNames) {
          const [presence] = await transaction<
            Array<{ relationName: string | null }>
          >`select to_regclass(${`public.${tableName}`})::text as "relationName"`;
          if (!presence?.relationName) {
            throw new Error(`Critical restore table is missing: ${tableName}.`);
          }
          const [row] = await transaction.unsafe<Array<{ count: number }>>(
            `select count(*)::int as count from "${tableName}"`,
          );
          if (!row || !Number.isSafeInteger(row.count) || row.count < 0) {
            throw new Error(
              `Critical restore count is unavailable: ${tableName}.`,
            );
          }
          counts[tableName] = row.count;
        }
        return { migrationLatest: latest, criticalTableCounts: counts };
      },
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function assertEmptyRestoreTarget(
  databaseUrl: string,
): Promise<void> {
  const client = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    const [row] = await client<Array<{ count: number }>>`
      select count(*)::int as count
      from information_schema.tables
      where table_schema not in ('pg_catalog', 'information_schema')
    `;
    if (!row || row.count !== 0) {
      throw new Error("Restore target must be an empty dedicated database.");
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function validateRestoredDatabase(
  databaseUrl: string,
  expected: RestoreSnapshot,
  options: Readonly<{ now: Date; appBaseUrl: string }>,
): Promise<{
  durationMs: number;
  migrationLatest: string;
  criticalTableCountsMatch: boolean;
  invariants: "PASS" | "FAIL";
  readSmoke: "PASS" | "FAIL";
}> {
  const startedAt = performance.now();
  const actual = await collectRestoreSnapshot(databaseUrl);
  const criticalTableCountsMatch =
    JSON.stringify(actual.criticalTableCounts) ===
    JSON.stringify(expected.criticalTableCounts);
  const invariantChecks = await runWithRehearsalReadOnlyDatabase(
    databaseUrl,
    ({ session }) =>
      collectInvariantChecks(session, {
        now: options.now,
        staleLeaseSeconds: 900,
        appBaseUrl: options.appBaseUrl,
      }),
  );
  const invariants = invariantChecks.some(
    (check) => check.severity === "BLOCKER",
  )
    ? "FAIL"
    : "PASS";
  let readSmoke: "PASS" | "FAIL" = "FAIL";
  try {
    const runtime = getRuntimeDatabase({
      DATABASE_URL: databaseUrl,
      DATABASE_MAX_CONNECTIONS: 4,
      NODE_ENV: "test",
    });
    const smoke = await runRehearsalSmoke(runtime, options);
    readSmoke = smoke.result;
  } finally {
    await closeRuntimeDatabase();
  }
  return {
    durationMs: Math.max(0, performance.now() - startedAt),
    migrationLatest: actual.migrationLatest,
    criticalTableCountsMatch,
    invariants,
    readSmoke,
  };
}
