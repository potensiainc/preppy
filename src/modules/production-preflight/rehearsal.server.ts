import "server-only";

import postgres from "postgres";

import { migrateDatabase } from "@/src/db/migrate";
import { applyInstitutionBackfill } from "@/src/infrastructure/db/institution-backfill.server";
import { applyOpportunityBackfill } from "@/src/infrastructure/db/opportunity-backfill.server";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { applySourceBindingBackfill } from "@/src/infrastructure/db/source-binding-backfill.server";
import { collectBackfillDryRun } from "@/src/modules/production-preflight/backfill-dry-run.server";
import type {
  MigrationInventory,
  PreflightCheck,
  PreflightReport,
} from "@/src/modules/production-preflight/contracts";
import { assertDedicatedRehearsalDatabaseUrl } from "@/src/modules/production-preflight/database-guard";
import { collectProductionInventory } from "@/src/modules/production-preflight/inventory.server";
import { collectInvariantChecks } from "@/src/modules/production-preflight/invariant-checks.server";
import {
  compareMigrationLedgers,
  loadRepositoryMigrationManifest,
} from "@/src/modules/production-preflight/migrations";
import { runWithRehearsalReadOnlyDatabase } from "@/src/modules/production-preflight/read-only-database.server";
import { runRehearsalSmoke } from "@/src/modules/production-preflight/rehearsal-smoke.server";
import {
  buildPreflightReport,
  exitCodeForPreflight,
} from "@/src/modules/production-preflight/report";

export type ProductSignalSnapshot = {
  opportunityChanges: number;
  notifications: number;
  deliveries: number;
  customerOutbox: number;
};

export type RehearsalBackfillPass = {
  institution: { created: number; linked: number; skipped: number };
  opportunity: { created: number; linked: number; skipped: number };
  sourceBindings: {
    institution: { inserted: number; skipped: number };
    opportunity: { inserted: number; skipped: number };
    notImported: number;
  };
};

export type RehearsalStageDependencies = {
  baseline: () => Promise<{ appliedMigrations: number }>;
  migrate: () => Promise<void>;
  institution: (pass: 1 | 2) => Promise<RehearsalBackfillPass["institution"]>;
  opportunity: (pass: 1 | 2) => Promise<RehearsalBackfillPass["opportunity"]>;
  sourceBindings: (
    pass: 1 | 2,
  ) => Promise<RehearsalBackfillPass["sourceBindings"]>;
  productSignals: (point: "before" | "after") => Promise<ProductSignalSnapshot>;
  smoke: () => Promise<{ result: "PASS" }>;
};

export type RehearsalStageResult = {
  baseline: { appliedMigrations: number };
  firstPass: RehearsalBackfillPass;
  secondPass: RehearsalBackfillPass;
  signalsBefore: ProductSignalSnapshot;
  signalsAfter: ProductSignalSnapshot;
  productSignalsUnchanged: boolean;
  smoke: { result: "PASS" };
};

export function isSecondPassIdempotent(pass: RehearsalBackfillPass): boolean {
  return (
    pass.institution.created === 0 &&
    pass.institution.linked === 0 &&
    pass.opportunity.created === 0 &&
    pass.opportunity.linked === 0 &&
    pass.sourceBindings.institution.inserted === 0 &&
    pass.sourceBindings.opportunity.inserted === 0
  );
}

export async function executeRehearsalStages(
  dependencies: RehearsalStageDependencies,
): Promise<RehearsalStageResult> {
  const baseline = await dependencies.baseline();
  await dependencies.migrate();
  const signalsBefore = await dependencies.productSignals("before");
  const firstPass: RehearsalBackfillPass = {
    institution: await dependencies.institution(1),
    opportunity: await dependencies.opportunity(1),
    sourceBindings: await dependencies.sourceBindings(1),
  };
  const secondPass: RehearsalBackfillPass = {
    institution: await dependencies.institution(2),
    opportunity: await dependencies.opportunity(2),
    sourceBindings: await dependencies.sourceBindings(2),
  };
  const signalsAfter = await dependencies.productSignals("after");
  const smoke = await dependencies.smoke();
  return {
    baseline,
    firstPass,
    secondPass,
    signalsBefore,
    signalsAfter,
    productSignalsUnchanged:
      JSON.stringify(signalsBefore) === JSON.stringify(signalsAfter),
    smoke,
  };
}

async function countAppliedMigrations(databaseUrl: string): Promise<number> {
  const client = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    const [relation] = await client<{ relationName: string | null }[]>`
      select to_regclass('drizzle.__drizzle_migrations')::text as "relationName"
    `;
    if (!relation?.relationName) return 0;
    const [row] = await client<{ count: number }[]>`
      select count(*)::int as count from drizzle.__drizzle_migrations
    `;
    return row?.count ?? 0;
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function readProductSignals(
  databaseUrl: string,
): Promise<ProductSignalSnapshot> {
  const client = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    const [row] = await client<ProductSignalSnapshot[]>`
      select
        (select count(*)::int from opportunity_changes) as "opportunityChanges",
        (select count(*)::int from notifications) as notifications,
        (select count(*)::int from notification_deliveries) as deliveries,
        (select count(*)::int from outbox_events where event_type in (
          'OPPORTUNITY_CHANGE_PUBLISHED',
          'OPPORTUNITY_PUBLISHED',
          'NOTIFICATION_RECIPIENT_RESOLUTION_REQUESTED',
          'NOTIFICATION_DELIVERY_REQUESTED'
        )) as "customerOutbox"
    `;
    if (!row)
      throw new Error("Rehearsal product signal counts are unavailable.");
    return row;
  } finally {
    await client.end({ timeout: 5 });
  }
}

function compareAppliedRows(
  repository: Awaited<ReturnType<typeof loadRepositoryMigrationManifest>>,
  rows: Array<{ id: number; hash: string; createdAt: number }> | null,
): MigrationInventory {
  if (rows === null) {
    return {
      expected: repository.map((row) => row.identifier),
      applied: [],
      latestApplied: null,
      missing: repository.map((row) => row.identifier),
      unexpected: [],
      hashMismatches: [],
      identifierStatus: "UNKNOWN",
    };
  }
  return compareMigrationLedgers(
    repository,
    rows.map((row, index) => ({
      identifier: repository[index]?.identifier ?? `database_only_${row.id}`,
      hash: row.hash,
      appliedOrder: index,
    })),
  );
}

export async function runRehearsal(options: {
  rehearsalDatabaseUrl: string;
  productionDatabaseUrl?: string;
  appBaseUrl: string;
  now?: Date;
}): Promise<{
  executed: true;
  stages: RehearsalStageResult | null;
  report: PreflightReport;
  exitCode: 0 | 2;
}> {
  assertDedicatedRehearsalDatabaseUrl(
    options.rehearsalDatabaseUrl,
    options.productionDatabaseUrl,
  );
  const now = options.now ?? new Date();
  const repositoryMigrations =
    await loadRepositoryMigrationManifest("src/db/migrations");
  let runtime: ReturnType<typeof getRuntimeDatabase> | undefined;
  let stageFailure = false;
  let stages: RehearsalStageResult | null = null;
  try {
    stages = await executeRehearsalStages({
      baseline: async () => ({
        appliedMigrations: await countAppliedMigrations(
          options.rehearsalDatabaseUrl,
        ),
      }),
      migrate: () => migrateDatabase(options.rehearsalDatabaseUrl),
      institution: async () => {
        runtime ??= getRuntimeDatabase({
          DATABASE_URL: options.rehearsalDatabaseUrl,
          DATABASE_MAX_CONNECTIONS: 4,
          NODE_ENV: "test",
        });
        return applyInstitutionBackfill({
          transactionManager: runtime.transactionManager,
        });
      },
      opportunity: async () => {
        if (!runtime) throw new Error("Rehearsal runtime is unavailable.");
        return applyOpportunityBackfill({
          transactionManager: runtime.transactionManager,
        });
      },
      sourceBindings: async () => {
        if (!runtime) throw new Error("Rehearsal runtime is unavailable.");
        return applySourceBindingBackfill({
          transactionManager: runtime.transactionManager,
        });
      },
      productSignals: () => readProductSignals(options.rehearsalDatabaseUrl),
      smoke: async () => {
        if (!runtime) throw new Error("Rehearsal runtime is unavailable.");
        return runRehearsalSmoke(runtime, {
          now,
          appBaseUrl: options.appBaseUrl,
        });
      },
    });
  } catch {
    stageFailure = true;
  } finally {
    await closeRuntimeDatabase();
  }

  return runWithRehearsalReadOnlyDatabase(
    options.rehearsalDatabaseUrl,
    async ({ metadata, session }) => {
      const [inventory, appliedRows, dryRun] = await Promise.all([
        collectProductionInventory(session),
        session.getAppliedMigrationRows(),
        collectBackfillDryRun(session),
      ]);
      const migrations = compareAppliedRows(repositoryMigrations, appliedRows);
      const checks: PreflightCheck[] = [];
      if (migrations.identifierStatus !== "MATCH") {
        checks.push({
          code: "REHEARSAL_MIGRATION_MISMATCH",
          severity: "BLOCKER",
          message: "Rehearsal migration ledger differs from the repository.",
        });
      } else {
        checks.push({
          code: "REHEARSAL_MIGRATIONS_MATCH",
          severity: "INFO",
          message:
            "Rehearsal migrated through the repository latest migration.",
        });
      }
      const schemaProblems =
        Object.values(inventory.schema.tables).filter(
          (status) => status !== "PRESENT",
        ).length +
        inventory.schema.missingColumns.length +
        inventory.schema.missingIndexes.length +
        inventory.schema.missingConstraints.length;
      if (schemaProblems > 0) {
        checks.push({
          code: "REHEARSAL_SCHEMA_INCOMPATIBLE",
          severity: "BLOCKER",
          count: schemaProblems,
          message:
            "Rehearsal critical schema objects are missing or incompatible.",
        });
      }
      checks.push(
        ...(await collectInvariantChecks(session, {
          now,
          staleLeaseSeconds: 900,
          appBaseUrl: options.appBaseUrl,
        })),
      );
      for (const [scope, result] of [
        ["INSTITUTION", dryRun.institution],
        ["OPPORTUNITY", dryRun.opportunity],
        ["SOURCE_BINDING", dryRun.sourceBindings],
      ] as const) {
        if (result.wouldBlock > 0) {
          checks.push({
            code: `${scope}_BACKFILL_BLOCKED`,
            severity: "BLOCKER",
            count: result.wouldBlock,
            message: `${scope} backfill remains blocked after rehearsal.`,
          });
        }
      }
      if (stageFailure) {
        checks.push({
          code: "REHEARSAL_STAGE_FAILED",
          severity: "BLOCKER",
          message: "A migration, backfill, or smoke stage failed safely.",
        });
      }
      if (stages && !isSecondPassIdempotent(stages.secondPass)) {
        checks.push({
          code: "BACKFILL_NOT_IDEMPOTENT",
          severity: "BLOCKER",
          message: "Second backfill pass created rows or relationship drift.",
        });
      }
      if (stages && !stages.productSignalsUnchanged) {
        checks.push({
          code: "BACKFILL_PRODUCT_SIGNAL_DRIFT",
          severity: "BLOCKER",
          message: "Backfill changed customer Product signal counts.",
        });
      }
      if (stages?.smoke.result === "PASS") {
        checks.push({
          code: "REHEARSAL_QUERY_SMOKE_PASS",
          severity: "INFO",
          message:
            "Canonical public, private, Admin, monitoring, operations, KPI, and sitemap reads passed.",
        });
      }

      const report = buildPreflightReport({
        mode: "REHEARSAL",
        generatedAt: now.toISOString(),
        database: {
          name: metadata.databaseName,
          user: metadata.databaseUser,
          serverVersion: metadata.serverVersion,
          snapshotConsistency: metadata.snapshotConsistency,
        },
        migrations,
        inventory,
        backfills: { stages, postRehearsalDryRun: dryRun },
        checks,
      });
      return {
        executed: true as const,
        stages,
        report,
        exitCode: exitCodeForPreflight(report),
      };
    },
  );
}
