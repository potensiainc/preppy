import "server-only";

import { randomBytes } from "node:crypto";
import { mkdtemp, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildBackupRestoreManifest,
  createBoundedBackupArtifactPath,
  hashBackupArtifact,
  type BackupRestoreManifest,
} from "@/src/modules/production-safety/backup-manifest";
import {
  assertDedicatedBackupSourceDatabaseUrl,
  assertDedicatedRestoreDatabaseUrl,
} from "@/src/modules/production-safety/database-guard";
import {
  createPostgresBackup,
  restorePostgresBackup,
  type PostgresToolMode,
} from "@/src/modules/production-safety/postgres-tools.server";
import {
  assertEmptyRestoreTarget,
  collectRestoreSnapshot,
  validateRestoredDatabase,
  type RestoreSnapshot,
} from "@/src/modules/production-safety/restore-validation.server";

type StageValidation = Readonly<{
  durationMs: number;
  migrationLatest: string;
  criticalTableCountsMatch: boolean;
  invariants: "PASS" | "FAIL";
  readSmoke: "PASS" | "FAIL";
}>;

type RestoreDrillStageDependencies = Readonly<{
  snapshotSource: () => Promise<RestoreSnapshot>;
  backup: () => Promise<{ durationMs: number }>;
  hash: () => Promise<string>;
  assertTargetEmpty: () => Promise<void>;
  restore: () => Promise<{ durationMs: number }>;
  validate: (expected: RestoreSnapshot) => Promise<StageValidation>;
}>;

export type RestoreDrillResult = Readonly<{
  version: 1;
  generatedAt: string;
  drillResult: "PASS";
  productionDatabaseTouched: false;
  externalSideEffectsEnabled: false;
  sourceDatabaseLabel: string;
  artifactPathClass: "OS_TEMP/WP16A";
  artifactSha256: string;
  backupDurationMs: number;
  restoreDurationMs: number;
  verificationDurationMs: number;
  migrationLatest: string;
  criticalTableCountsMatch: true;
  invariants: "PASS";
  readSmoke: "PASS";
  manifest: BackupRestoreManifest;
}>;

export async function executeRestoreDrillStages(
  input: Readonly<{
    sourceDatabaseLabel: string;
    generatedAt: string;
    artifactPath: "OS_TEMP/WP16A";
  }>,
  dependencies: RestoreDrillStageDependencies,
): Promise<RestoreDrillResult> {
  const source = await dependencies.snapshotSource();
  const backup = await dependencies.backup();
  const artifactSha256 = await dependencies.hash();
  await dependencies.assertTargetEmpty();
  const restore = await dependencies.restore();
  const verification = await dependencies.validate(source);
  if (
    verification.migrationLatest !== source.migrationLatest ||
    !verification.criticalTableCountsMatch ||
    verification.invariants !== "PASS" ||
    verification.readSmoke !== "PASS"
  ) {
    throw new Error("Restore validation failed safely.");
  }
  const manifest = buildBackupRestoreManifest({
    generatedAt: input.generatedAt,
    sourceDatabaseLabel: input.sourceDatabaseLabel,
    migrationLatest: source.migrationLatest,
    criticalTableCounts: source.criticalTableCounts,
    artifactSha256,
  });
  return {
    version: 1,
    generatedAt: input.generatedAt,
    drillResult: "PASS",
    productionDatabaseTouched: false,
    externalSideEffectsEnabled: false,
    sourceDatabaseLabel: input.sourceDatabaseLabel,
    artifactPathClass: input.artifactPath,
    artifactSha256,
    backupDurationMs: backup.durationMs,
    restoreDurationMs: restore.durationMs,
    verificationDurationMs: verification.durationMs,
    migrationLatest: verification.migrationLatest,
    criticalTableCountsMatch: true,
    invariants: "PASS",
    readSmoke: "PASS",
    manifest,
  };
}

export async function runRestoreDrill(
  options: Readonly<{
    sourceDatabaseUrl: string;
    targetDatabaseUrl: string;
    productionDatabaseUrl?: string;
    appBaseUrl: string;
    toolMode: PostgresToolMode;
    sideEffects: Readonly<{
      workerEnabled: boolean;
      emailSendEnabled: boolean;
      analyticsEnabled: boolean;
      cacheRevalidationEnabled: boolean;
    }>;
    now?: Date;
  }>,
): Promise<RestoreDrillResult> {
  if (Object.values(options.sideEffects).some(Boolean)) {
    throw new Error(
      "All external side effects must be disabled for a restore drill.",
    );
  }
  const source = assertDedicatedBackupSourceDatabaseUrl(
    options.sourceDatabaseUrl,
    options.productionDatabaseUrl,
  );
  assertDedicatedRestoreDatabaseUrl(options.targetDatabaseUrl, {
    sourceDatabaseUrl: options.sourceDatabaseUrl,
    ...(options.productionDatabaseUrl === undefined
      ? {}
      : { productionDatabaseUrl: options.productionDatabaseUrl }),
  });
  const now = options.now ?? new Date();
  const root = await mkdtemp(join(tmpdir(), "preppy-wp16a-"));
  const runId = `${now.toISOString().replaceAll(/[-:.]/g, "").slice(0, 15)}Z-${randomBytes(4).toString("hex")}`;
  const artifactPath = await createBoundedBackupArtifactPath(root, { runId });
  try {
    return await executeRestoreDrillStages(
      {
        sourceDatabaseLabel: source.databaseName,
        generatedAt: now.toISOString(),
        artifactPath: "OS_TEMP/WP16A",
      },
      {
        snapshotSource: () => collectRestoreSnapshot(options.sourceDatabaseUrl),
        backup: () =>
          createPostgresBackup({
            databaseUrl: options.sourceDatabaseUrl,
            artifactPath,
            mode: options.toolMode,
          }),
        hash: () => hashBackupArtifact(artifactPath),
        assertTargetEmpty: () =>
          assertEmptyRestoreTarget(options.targetDatabaseUrl),
        restore: () =>
          restorePostgresBackup({
            databaseUrl: options.targetDatabaseUrl,
            artifactPath,
            mode: options.toolMode,
          }),
        validate: (expected) =>
          validateRestoredDatabase(options.targetDatabaseUrl, expected, {
            now,
            appBaseUrl: options.appBaseUrl,
          }),
      },
    );
  } finally {
    await unlink(artifactPath).catch(() => undefined);
    await rmdir(root).catch(() => undefined);
  }
}
