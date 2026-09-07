import { describe, expect, it, vi } from "vitest";

import {
  parseEnglishKindergartenCliArgs,
  runEnglishKindergartenImportCli,
} from "@/src/modules/english-kindergarten-import/cli.server";

const packageDirectory =
  "data/snapshots/preppy/english-kindergarten/sg-ek-20260901-r01";

describe("English-kindergarten import CLI", () => {
  it("defaults to dry-run and requires an exact checksum for apply", () => {
    expect(
      parseEnglishKindergartenCliArgs(["--package", packageDirectory]),
    ).toMatchObject({ mode: "dry-run", packageDirectory });
    expect(() =>
      parseEnglishKindergartenCliArgs([
        "--package",
        packageDirectory,
        "--apply",
      ]),
    ).toThrow(/expected-checksum/i);
    expect(() =>
      parseEnglishKindergartenCliArgs([
        "--package",
        packageDirectory,
        "--dry-run",
        "--validate-only",
      ]),
    ).toThrow(/only one mode/i);
  });

  it("validates without opening a database", async () => {
    const openRuntime = vi.fn();
    const result = await runEnglishKindergartenImportCli(
      ["--package", packageDirectory, "--validate-only"],
      { openRuntime: openRuntime as never },
      { NODE_ENV: "test" },
    );
    expect(result).toMatchObject({
      mode: "validate-only",
      targetEnvironment: "TEST",
      validation: { status: "PASS", counts: { campuses: 25 } },
      applied: false,
    });
    expect(openRuntime).not.toHaveBeenCalled();
  });

  it("keeps apply behind the explicit environment gate", async () => {
    await expect(
      runEnglishKindergartenImportCli(
        [
          "--package",
          packageDirectory,
          "--apply",
          "--expected-checksum",
          "0".repeat(64),
        ],
        {},
        { NODE_ENV: "test" },
      ),
    ).rejects.toThrow("ALLOW_PRODUCTION_ENGLISH_KINDERGARTEN_IMPORT=1");
  });
});
