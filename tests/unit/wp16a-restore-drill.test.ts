import { describe, expect, it, vi } from "vitest";

import { executeRestoreDrillStages } from "@/src/modules/production-safety/restore-drill.server";
import { runBackupRestoreRehearsalCommand } from "@/scripts/backup-restore-rehearsal";

describe("WP-16A restore drill orchestration", () => {
  const sourceSnapshot = {
    migrationLatest: "0010_colorful_randall_flagg",
    criticalTableCounts: { institutions: 1, outbox_events: 1 },
  } as const;

  it("backs up, hashes, restores, and verifies in locked order", async () => {
    const order: string[] = [];
    const result = await executeRestoreDrillStages(
      {
        sourceDatabaseLabel: "preppy_rehearsal",
        generatedAt: "2026-08-25T01:02:03.000Z",
        artifactPath: "OS_TEMP/WP16A",
      },
      {
        snapshotSource: async () => {
          order.push("snapshot-source");
          return sourceSnapshot;
        },
        backup: async () => {
          order.push("backup");
          return { durationMs: 101 };
        },
        hash: async () => {
          order.push("hash");
          return "a".repeat(64);
        },
        assertTargetEmpty: async () => {
          order.push("target-empty");
        },
        restore: async () => {
          order.push("restore");
          return { durationMs: 202 };
        },
        validate: async (expected) => {
          order.push("validate");
          expect(expected).toEqual(sourceSnapshot);
          return {
            durationMs: 303,
            migrationLatest: "0010_colorful_randall_flagg",
            criticalTableCountsMatch: true,
            invariants: "PASS" as const,
            readSmoke: "PASS" as const,
          };
        },
      },
    );

    expect(order).toEqual([
      "snapshot-source",
      "backup",
      "hash",
      "target-empty",
      "restore",
      "validate",
    ]);
    expect(result).toMatchObject({
      drillResult: "PASS",
      productionDatabaseTouched: false,
      externalSideEffectsEnabled: false,
      artifactPathClass: "OS_TEMP/WP16A",
      artifactSha256: "a".repeat(64),
      backupDurationMs: 101,
      restoreDurationMs: 202,
      verificationDurationMs: 303,
    });
    expect(result).not.toHaveProperty("finalGate");
    expect(JSON.stringify(result)).not.toMatch(
      /databaseUrl|password|"email"\s*:|@/i,
    );
  });

  it("fails closed before restore when backup or hashing fails", async () => {
    const restore = vi.fn();
    await expect(
      executeRestoreDrillStages(
        {
          sourceDatabaseLabel: "preppy_rehearsal",
          generatedAt: "2026-08-25T01:02:03.000Z",
          artifactPath: "OS_TEMP/WP16A",
        },
        {
          snapshotSource: async () => sourceSnapshot,
          backup: async () => {
            throw new Error("BACKUP_FAILED");
          },
          hash: async () => "a".repeat(64),
          assertTargetEmpty: async () => undefined,
          restore,
          validate: vi.fn(),
        },
      ),
    ).rejects.toThrow("BACKUP_FAILED");
    expect(restore).not.toHaveBeenCalled();
  });

  it("rejects a validation result that does not exactly match", async () => {
    await expect(
      executeRestoreDrillStages(
        {
          sourceDatabaseLabel: "preppy_rehearsal",
          generatedAt: "2026-08-25T01:02:03.000Z",
          artifactPath: "OS_TEMP/WP16A",
        },
        {
          snapshotSource: async () => sourceSnapshot,
          backup: async () => ({ durationMs: 1 }),
          hash: async () => "a".repeat(64),
          assertTargetEmpty: async () => undefined,
          restore: async () => ({ durationMs: 1 }),
          validate: async () => ({
            durationMs: 1,
            migrationLatest: "0009",
            criticalTableCountsMatch: false,
            invariants: "FAIL" as const,
            readSmoke: "PASS" as const,
          }),
        },
      ),
    ).rejects.toThrow(/restore validation failed/i);
  });

  it("uses deterministic safe CLI failures without echoing configuration", async () => {
    await expect(
      runBackupRestoreRehearsalCommand(["--arbitrary-flag"], {}),
    ).resolves.toEqual({
      exitCode: 4,
      output: { executed: false, reason: "INVALID_ARGUMENTS" },
    });
    const result = await runBackupRestoreRehearsalCommand([], {
      BACKUP_REHEARSAL_SOURCE_DATABASE_URL:
        "postgres://runner:source-secret@localhost:55433/preppy_rehearsal",
      RESTORE_REHEARSAL_TARGET_DATABASE_URL:
        "postgres://runner:target-secret@localhost:55433/preppy_restore",
      APP_BASE_URL: "https://preppy.example",
      POSTGRES_TOOL_MODE: "direct",
      WORKER_ENABLED: "true",
    });
    expect(result).toEqual({
      exitCode: 4,
      output: { executed: false, reason: "RESTORE_DRILL_FAILED_SAFELY" },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /source-secret|target-secret|postgres:\/\//,
    );
  });
});
