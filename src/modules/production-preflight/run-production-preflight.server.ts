import "server-only";

import { existsSync } from "node:fs";

import { collectBackfillDryRun } from "@/src/modules/production-preflight/backfill-dry-run.server";
import type {
  MigrationInventory,
  PreflightCheck,
  PreflightReport,
} from "@/src/modules/production-preflight/contracts";
import { collectProductionInventory } from "@/src/modules/production-preflight/inventory.server";
import { collectInvariantChecks } from "@/src/modules/production-preflight/invariant-checks.server";
import {
  compareMigrationLedgers,
  loadRepositoryMigrationManifest,
} from "@/src/modules/production-preflight/migrations";
import { runWithProductionReadOnlyDatabase } from "@/src/modules/production-preflight/read-only-database.server";
import {
  buildPreflightReport,
  exitCodeForPreflight,
} from "@/src/modules/production-preflight/report";

type Environment = Record<string, string | undefined>;

export type ProductionPreflightConfig =
  | {
      status: "SKIPPED_CREDENTIALS_UNAVAILABLE";
      appBaseUrl: string;
    }
  | {
      status: "READY";
      productionDatabaseUrl: string;
      appBaseUrl: string;
    };

function canonicalOrigin(value: string | undefined): string {
  if (!value) throw new Error("APP_BASE_URL must be configured as an origin.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("APP_BASE_URL must be configured as an origin.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("APP_BASE_URL must be configured as an origin.");
  }
  return parsed.origin;
}

export function productionPreflightConfig(
  environment: Environment,
): ProductionPreflightConfig {
  const productionDatabaseUrl = environment.PRODUCTION_DATABASE_URL?.trim();
  if (!productionDatabaseUrl) {
    return {
      status: "SKIPPED_CREDENTIALS_UNAVAILABLE",
      appBaseUrl: environment.APP_BASE_URL
        ? canonicalOrigin(environment.APP_BASE_URL)
        : "NOT_EXECUTED",
    };
  }
  const appBaseUrl = canonicalOrigin(environment.APP_BASE_URL);
  const parsed = new URL(productionDatabaseUrl);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("PRODUCTION_DATABASE_URL must be a PostgreSQL URL.");
  }
  return { status: "READY", productionDatabaseUrl, appBaseUrl };
}

export function skippedProductionPreflight(): {
  executed: false;
  reason: "CREDENTIALS_UNAVAILABLE";
  exitCode: 0;
  finalGate: "READY_FOR_WP16A";
} {
  return {
    executed: false,
    reason: "CREDENTIALS_UNAVAILABLE",
    exitCode: 0,
    finalGate: "READY_FOR_WP16A",
  };
}

function migrationInventory(
  repository: Awaited<ReturnType<typeof loadRepositoryMigrationManifest>>,
  rows: Awaited<
    ReturnType<
      import("@/src/modules/production-preflight/read-only-database.server").ReadOnlyPreflightSession["getAppliedMigrationRows"]
    >
  >,
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

function addMigrationChecks(
  checks: PreflightCheck[],
  inventory: MigrationInventory,
): void {
  if (inventory.identifierStatus === "MATCH") {
    checks.push({
      code: "MIGRATION_LEDGER_MATCH",
      severity: "INFO",
      message: "Database migration ledger matches the repository manifest.",
    });
    return;
  }
  checks.push({
    code:
      inventory.identifierStatus === "UNKNOWN"
        ? "MIGRATION_LEDGER_MISSING"
        : "MIGRATION_LEDGER_MISMATCH",
    severity: "BLOCKER",
    count:
      inventory.missing.length +
      inventory.unexpected.length +
      inventory.hashMismatches.length,
    message:
      "Database migration ledger is absent or differs from the repository.",
  });
}

export async function runProductionPreflight(options: {
  productionDatabaseUrl: string;
  appBaseUrl: string;
  generatedAt?: Date;
  ga4Configured?: boolean;
}): Promise<{ executed: true; report: PreflightReport; exitCode: 0 | 2 }> {
  const repositoryMigrations =
    await loadRepositoryMigrationManifest("src/db/migrations");
  return runWithProductionReadOnlyDatabase(
    options.productionDatabaseUrl,
    async ({ metadata, session }) => {
      const [inventory, appliedRows] = await Promise.all([
        collectProductionInventory(session),
        session.getAppliedMigrationRows(),
      ]);
      const migrations = migrationInventory(repositoryMigrations, appliedRows);
      const checks: PreflightCheck[] = [];
      addMigrationChecks(checks, migrations);

      const schemaProblems =
        Object.values(inventory.schema.tables).filter(
          (status) => status !== "PRESENT",
        ).length +
        inventory.schema.missingColumns.length +
        inventory.schema.missingIndexes.length +
        inventory.schema.missingConstraints.length;
      if (schemaProblems > 0) {
        checks.push({
          code: "SCHEMA_INCOMPATIBLE",
          severity: "BLOCKER",
          count: schemaProblems,
          message:
            "Critical repository schema objects are missing or incompatible.",
        });
      } else {
        checks.push(
          ...(await collectInvariantChecks(session, {
            now: options.generatedAt ?? new Date(),
            staleLeaseSeconds: 900,
            appBaseUrl: options.appBaseUrl,
          })),
        );
      }

      const backfillTables = [
        "schools",
        "admission_cycles",
        "admission_events",
        "admission_event_versions",
        "sources",
        "source_bindings",
        "source_observations",
        "source_snapshots",
        "event_version_evidence",
        "institutions",
        "institution_school_links",
        "opportunities",
        "opportunity_admission_event_links",
        "opportunity_versions",
        "opportunity_version_evidence",
        "institution_source_bindings",
        "opportunity_source_bindings",
      ] as const;
      const backfillReady = backfillTables.every(
        (table) => inventory.schema.tables[table] === "PRESENT",
      );
      const backfills = backfillReady
        ? await collectBackfillDryRun(session)
        : { status: "NOT_EXECUTED_SCHEMA_INCOMPATIBLE" };
      if ("institution" in backfills) {
        for (const [scope, dryRun] of [
          ["INSTITUTION", backfills.institution],
          ["OPPORTUNITY", backfills.opportunity],
          ["SOURCE_BINDING", backfills.sourceBindings],
        ] as const) {
          if (dryRun.wouldBlock > 0) {
            checks.push({
              code: `${scope}_BACKFILL_BLOCKED`,
              severity: "BLOCKER",
              count: dryRun.wouldBlock,
              message: `${scope} deterministic backfill has blocking preconditions.`,
            });
          }
        }
        if (backfills.sourceBindings.notImported > 0) {
          checks.push({
            code: "SOURCE_BINDING_NOT_IMPORTED",
            severity: "INFO",
            count: backfills.sourceBindings.notImported,
            message:
              "Source binding candidates were intentionally not imported by policy.",
          });
        }
      }

      checks.push({
        code: options.ga4Configured
          ? "GA4_CONFIGURED"
          : "OPTIONAL_GA4_CONFIG_MISSING",
        severity: options.ga4Configured ? "INFO" : "WARNING",
        message: options.ga4Configured
          ? "GA4 configuration is present."
          : "Optional GA4 production configuration is missing.",
      });

      const report = buildPreflightReport({
        mode: "PRODUCTION_READ_ONLY",
        generatedAt: (options.generatedAt ?? new Date()).toISOString(),
        database: {
          name: metadata.databaseName,
          user: metadata.databaseUser,
          serverVersion: metadata.serverVersion,
          snapshotConsistency: metadata.snapshotConsistency,
        },
        migrations,
        inventory: {
          ...inventory,
          configured: {
            ga4: options.ga4Configured ?? false,
            gscDocumentation: existsSync("docs/14_ANALYTICS_MEASUREMENT.md"),
          },
        },
        backfills,
        checks,
      });
      return {
        executed: true as const,
        report,
        exitCode: exitCodeForPreflight(report),
      };
    },
  );
}
