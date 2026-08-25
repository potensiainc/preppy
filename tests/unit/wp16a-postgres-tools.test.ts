import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPostgresBackupCommand,
  buildPostgresRestoreCommand,
  sanitizePostgresToolFailure,
} from "@/src/modules/production-safety/postgres-tools.server";

describe("WP-16A PostgreSQL tool safety", () => {
  const url =
    "postgres://rehearsal_user:do-not-print@localhost:55433/preppy_rehearsal";

  it("builds fixed direct argument arrays and keeps credentials out of arguments", () => {
    const backup = buildPostgresBackupCommand(url, { kind: "DIRECT" });
    expect(backup.command).toBe("pg_dump");
    expect(backup.args).toEqual([
      "--format=custom",
      "--no-owner",
      "--no-acl",
      "--host=localhost",
      "--port=55433",
      "--username=rehearsal_user",
      "--dbname=preppy_rehearsal",
    ]);
    expect(backup.args.join(" ")).not.toContain("do-not-print");
    expect(backup.environment.PGPASSWORD).toBe("do-not-print");

    const restore = buildPostgresRestoreCommand(url, { kind: "DIRECT" });
    expect(restore.command).toBe("pg_restore");
    expect(restore.args.slice(0, 4)).toEqual([
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      "--single-transaction",
    ]);
    expect(restore.args.join(" ")).not.toContain("do-not-print");
  });

  it("builds a local Docker Compose command without credentials or shell text", () => {
    const command = buildPostgresBackupCommand(url, {
      kind: "DOCKER_COMPOSE_LOCAL",
      service: "postgres",
      databaseUser: "admissionradar",
    });
    expect(command).toEqual({
      command: "docker",
      args: [
        "compose",
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--username=admissionradar",
        "--dbname=preppy_rehearsal",
      ],
      environment: {},
    });
    expect(command.args.join(" ")).not.toContain("do-not-print");
  });

  it("rejects unsafe Docker identifiers and non-local Docker targets", () => {
    expect(() =>
      buildPostgresBackupCommand(url, {
        kind: "DOCKER_COMPOSE_LOCAL",
        service: "postgres; whoami",
        databaseUser: "admissionradar",
      }),
    ).toThrow(/invalid docker compose tool configuration/i);
    expect(() =>
      buildPostgresBackupCommand(
        "postgres://runner:secret@db.example:5432/preppy_rehearsal",
        {
          kind: "DOCKER_COMPOSE_LOCAL",
          service: "postgres",
          databaseUser: "admissionradar",
        },
      ),
    ).toThrow(/local database/i);
  });

  it("redacts URLs and credential fragments from bounded failures", () => {
    const safe = sanitizePostgresToolFailure(
      `could not connect ${url} password=do-not-print ${"x".repeat(20_000)}`,
    );
    expect(safe).not.toContain("do-not-print");
    expect(safe).not.toContain("postgres://");
    expect(safe.length).toBeLessThanOrEqual(4_096);
  });

  it("uses spawn with shell disabled and contains no exec APIs", async () => {
    const source = await readFile(
      join(
        process.cwd(),
        "src/modules/production-safety/postgres-tools.server.ts",
      ),
      "utf8",
    );
    expect(source).toContain("shell: false");
    expect(source).not.toMatch(/execSync|execFileSync|\bexec\(/);
  });
});
