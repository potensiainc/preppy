import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_INTERNATIONAL_SCHOOL_PACKAGE_DIRECTORY,
  parseInternationalSchoolCliArgs,
  runInternationalSchoolImportCli,
} from "@/src/modules/international-school-import/cli.server";
import { writeValidInternationalSchoolPackage } from "@/tests/fixtures/international-school/minimal-valid-package";

let packageDirectory: string;

beforeAll(async () => {
  packageDirectory = await mkdtemp(join(tmpdir(), "preppy-is-cli-"));
  await writeValidInternationalSchoolPackage(packageDirectory);
});

afterAll(async () => {
  await rm(packageDirectory, { recursive: true, force: true });
});

describe("international-school import CLI", () => {
  it("defaults to dry-run with the canonical package directory", () => {
    expect(parseInternationalSchoolCliArgs([])).toEqual({
      mode: "dry-run",
      packageDirectory: DEFAULT_INTERNATIONAL_SCHOOL_PACKAGE_DIRECTORY,
    });
  });

  it("accepts validate-only and rejects unknown or conflicting arguments", () => {
    expect(
      parseInternationalSchoolCliArgs([
        "--package",
        "fixture",
        "--validate-only",
      ]),
    ).toEqual({
      mode: "validate-only",
      packageDirectory: "fixture",
    });
    expect(() => parseInternationalSchoolCliArgs(["--unknown"])).toThrow(
      /unknown argument/i,
    );
    expect(() =>
      parseInternationalSchoolCliArgs(["--dry-run", "--validate-only"]),
    ).toThrow(/only one mode/i);
  });

  it("validates without opening a database", async () => {
    const openRuntime = vi.fn();
    const result = await runInternationalSchoolImportCli(
      ["--package", packageDirectory, "--validate-only"],
      { NODE_ENV: "test" },
      { openRuntime: openRuntime as never },
    );
    expect(result).toMatchObject({
      mode: "validate-only",
      targetEnvironment: "TEST",
      applied: false,
      validation: {
        status: "PASS",
        counts: {
          officialActive: 22,
          specialAccess: 7,
          candidates: 60,
        },
      },
    });
    expect(openRuntime).not.toHaveBeenCalled();
  });

  it("requires a checksum and explicit environment gate for apply", async () => {
    expect(() => parseInternationalSchoolCliArgs(["--apply"])).toThrow(
      /checksum/i,
    );
    await expect(
      runInternationalSchoolImportCli(
        ["--package", packageDirectory, "--apply", "--checksum", "0".repeat(64)],
        { NODE_ENV: "test" },
        {},
      ),
    ).rejects.toThrow("ALLOW_PRODUCTION_INTERNATIONAL_SCHOOL_IMPORT=1");
  });

  it("rejects a checksum that differs from the reviewed manifest", async () => {
    const openRuntime = vi.fn();
    await expect(
      runInternationalSchoolImportCli(
        ["--package", packageDirectory, "--apply", "--checksum", "0".repeat(64)],
        {
          NODE_ENV: "test",
          ALLOW_PRODUCTION_INTERNATIONAL_SCHOOL_IMPORT: "1",
        },
        { openRuntime: openRuntime as never },
      ),
    ).rejects.toThrow(/checksum/i);
    expect(openRuntime).not.toHaveBeenCalled();
  });
});
