import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildBackupRestoreManifest,
  createBoundedBackupArtifactPath,
  hashBackupArtifact,
} from "@/src/modules/production-safety/backup-manifest";

describe("WP-16A backup manifest", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((root) =>
        rm(root, {
          recursive: true,
          force: true,
        }),
      ),
    );
  });

  it("creates a bounded non-overwriting artifact path", async () => {
    const root = await mkdtemp(join(tmpdir(), "preppy-wp16a-test-"));
    temporaryRoots.push(root);
    const artifact = await createBoundedBackupArtifactPath(root, {
      runId: "20260825T010203Z-a1b2c3d4",
    });

    expect(dirname(artifact)).toBe(root);
    expect(basename(artifact)).toBe(
      "preppy-wp16a-20260825T010203Z-a1b2c3d4.dump",
    );
    await writeFile(artifact, "existing");
    await expect(
      createBoundedBackupArtifactPath(root, {
        runId: "20260825T010203Z-a1b2c3d4",
      }),
    ).rejects.toThrow(/already exists/i);
    await expect(
      createBoundedBackupArtifactPath(root, { runId: "../escape" }),
    ).rejects.toThrow(/invalid backup run id/i);
  });

  it("hashes the artifact and exposes only safe manifest fields", async () => {
    const root = await mkdtemp(join(tmpdir(), "preppy-wp16a-hash-"));
    temporaryRoots.push(root);
    const artifact = join(root, "fixture.dump");
    await writeFile(artifact, "synthetic non-production backup");
    const artifactSha256 = await hashBackupArtifact(artifact);
    expect(artifactSha256).toMatch(/^[a-f0-9]{64}$/);

    const manifest = buildBackupRestoreManifest({
      generatedAt: "2026-08-25T01:02:03.000Z",
      sourceDatabaseLabel: "preppy_rehearsal",
      migrationLatest: "0010",
      criticalTableCounts: { institutions: 1, outbox_events: 2 },
      artifactSha256,
    });
    expect(manifest).toEqual({
      version: 1,
      generatedAt: "2026-08-25T01:02:03.000Z",
      sourceEnvironment: "NON_PRODUCTION",
      sourceDatabaseLabel: "preppy_rehearsal",
      migrationLatest: "0010",
      criticalTableCounts: { institutions: 1, outbox_events: 2 },
      artifactSha256,
    });
    expect(JSON.stringify(manifest)).not.toMatch(
      /password|databaseUrl|email|displayName|raw|html|payload/i,
    );
  });

  it("rejects unsafe labels, count keys, and hashes", () => {
    const base = {
      generatedAt: "2026-08-25T01:02:03.000Z",
      sourceDatabaseLabel: "preppy_rehearsal",
      migrationLatest: "0010",
      criticalTableCounts: { institutions: 1 },
      artifactSha256: "a".repeat(64),
    };
    expect(() =>
      buildBackupRestoreManifest({
        ...base,
        sourceDatabaseLabel: "postgres://user:secret@localhost/preppy_test",
      }),
    ).toThrow(/safe backup manifest/i);
    expect(() =>
      buildBackupRestoreManifest({
        ...base,
        criticalTableCounts: { user_email: 1 },
      }),
    ).toThrow(/safe backup manifest/i);
    expect(() =>
      buildBackupRestoreManifest({ ...base, artifactSha256: "not-a-hash" }),
    ).toThrow(/safe backup manifest/i);
  });
});
