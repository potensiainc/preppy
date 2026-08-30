import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseArtifactCliArgs,
  assertArtifactEnvironment,
  runBootstrapArtifactCli,
} from "@/src/modules/institution-detail-bootstrap/artifact-cli.server";
import { PRIVATE_ELEMENTARY_BOOTSTRAP_ACKNOWLEDGEMENT } from "@/src/modules/institution-detail-bootstrap/contracts";
import {
  artifactTestCollection,
  artifactTestTime,
} from "@/tests/support/private-elementary-artifact";

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});
const railway = {
  NODE_ENV: "production",
  RAILWAY_SERVICE_NAME: "preppy-web",
  RAILWAY_ENVIRONMENT_NAME: "production",
  RAILWAY_SERVICE_ID: "service",
  RAILWAY_ENVIRONMENT_ID: "environment",
  DATABASE_URL: "postgresql://test:test@postgres.railway.internal/preppy",
};
describe("offline bootstrap CLI boundary", () => {
  it("refuses apply without the separately approved artifact checksum", () => {
    expect(() =>
      assertArtifactEnvironment(
        parseArtifactCliArgs([
          "--apply-artifact=x",
          "--production",
          `--acknowledge-production-write=${PRIVATE_ELEMENTARY_BOOTSTRAP_ACKNOWLEDGEMENT}`,
        ]),
        railway,
      ),
    ).toThrow();
  });
  it.each(
    [
      ["--collect-only"],
      ["--collect-only", "--output=x", "--production"],
      ["--collect-only", "--output=x", "--apply-artifact=y"],
      ["--apply-artifact=x", "--output=y"],
      ["--apply-artifact=x", "--facts-only"],
      ["--apply-artifact=x", "--apply-artifact=y"],
      ["--surprise"],
    ].map((args) => ({ args })),
  )("rejects incompatible invocation $args", ({ args }) => {
    expect(() => parseArtifactCliArgs(args)).toThrow();
  });

  it("requires Railway runtime and internal DB even when production acknowledgement is supplied", () => {
    const options = parseArtifactCliArgs([
      "--apply-artifact=x",
      "--production",
      `--expected-artifact-checksum=${"a".repeat(64)}`,
      `--acknowledge-production-write=${PRIVATE_ELEMENTARY_BOOTSTRAP_ACKNOWLEDGEMENT}`,
    ]);
    expect(() => assertArtifactEnvironment(options, railway)).not.toThrow();
    expect(() =>
      assertArtifactEnvironment(options, {
        NODE_ENV: "production",
        DATABASE_URL: railway.DATABASE_URL,
      }),
    ).toThrow();
    expect(() =>
      assertArtifactEnvironment(options, {
        ...railway,
        DATABASE_URL: "postgresql://test:test@public.proxy.rlwy.net/preppy",
      }),
    ).toThrow();
    expect(() =>
      assertArtifactEnvironment(options, {
        ...railway,
        RAILWAY_SERVICE_NAME: "other",
      }),
    ).toThrow();
    expect(() =>
      assertArtifactEnvironment(
        parseArtifactCliArgs(["--apply-artifact=x", "--production"]),
        railway,
      ),
    ).toThrow();
    expect(() =>
      assertArtifactEnvironment(
        parseArtifactCliArgs([
          "--apply-artifact=x",
          "--dry-run",
          "--production",
        ]),
        railway,
      ),
    ).not.toThrow();
  });

  it("collects without opening any database and refuses to overwrite an artifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "preppy-artifact-cli-"));
    directories.push(dir);
    const output = join(dir, "school.json");
    let databaseOpened = false;
    const run = () =>
      runBootstrapArtifactCli(
        ["--collect-only", "--slug=kyonggi", `--output=${output}`],
        {
          environment: {},
          now: () => artifactTestTime,
          collect: async (input) => artifactTestCollection(input.target),
          openRuntime: () => {
            databaseOpened = true;
            throw new Error("A collector must not open a DB");
          },
        },
      );
    const report = await run();
    expect(report.exitCode).toBe(0);
    expect(databaseOpened).toBe(false);
    const body = await readFile(output, "utf8");
    expect(JSON.parse(body).target.slug).toBe("kyonggi");
    expect((await stat(output)).size).toBeGreaterThan(0);
    await expect(run()).rejects.toThrow();
    expect(await readFile(output, "utf8")).toBe(body);
  });
});
