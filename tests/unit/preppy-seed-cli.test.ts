import { describe, expect, it, vi } from "vitest";

import {
  parseSeedImportCliArgs,
  runSeedImportCli,
} from "@/src/modules/institution-seed/cli.server";

describe("PREPPY seed import CLI", () => {
  it("defaults to dry-run and requires an explicit file", () => {
    expect(parseSeedImportCliArgs(["--file", "seed.json"])).toEqual({
      filePath: "seed.json",
      mode: "dry-run",
    });
    expect(parseSeedImportCliArgs(["--file=seed.json", "--dry-run"])).toEqual({
      filePath: "seed.json",
      mode: "dry-run",
    });
    expect(parseSeedImportCliArgs(["--file", "seed.json", "--apply"])).toEqual({
      filePath: "seed.json",
      mode: "apply",
    });
  });

  it("rejects missing, duplicated, unknown, and mutually exclusive arguments", () => {
    expect(() => parseSeedImportCliArgs([])).toThrow(/--file/i);
    expect(() =>
      parseSeedImportCliArgs(["--file", "a.json", "--file", "b.json"]),
    ).toThrow(/--file/i);
    expect(() =>
      parseSeedImportCliArgs(["--file", "seed.json", "--dry-run", "--apply"]),
    ).toThrow(/mutually exclusive/i);
    expect(() =>
      parseSeedImportCliArgs(["--file", "seed.json", "--force"]),
    ).toThrow(/unknown/i);
  });

  it("validates checksums and package semantics before opening a database", async () => {
    // Mutation caught: malformed or tampered input reaches runtime credentials/connection setup.
    const validationError = new Error("checksum mismatch");
    const loadPackage = vi.fn(async () => {
      throw validationError;
    });
    const openRuntime = vi.fn();

    await expect(
      runSeedImportCli(["--file", "seed.json", "--apply"], {
        loadPackage,
        openRuntime,
      }),
    ).rejects.toBe(validationError);
    expect(loadPackage).toHaveBeenCalledWith("seed.json");
    expect(openRuntime).not.toHaveBeenCalled();
  });
});
