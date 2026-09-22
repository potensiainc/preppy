import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertRuntimeImageContract } from "@/scripts/deploy/assert-image-contract";

describe("release image contract", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  async function imageRoot() {
    const root = await mkdtemp(join(tmpdir(), "preppy-image-contract-"));
    roots.push(root);
    for (const file of [
      "package.json",
      "proxy.ts",
      ".next/BUILD_ID",
      "node_modules/.bin/tsx",
      "scripts/worker.ts",
      "scripts/support/server-only.ts",
      "src/db/migrations/meta/_journal.json",
    ]) {
      const path = join(root, file);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, "fixture");
    }
    return root;
  }

  it("accepts the files needed by the web, worker, and migration commands", async () => {
    await expect(
      assertRuntimeImageContract(await imageRoot()),
    ).resolves.toBeUndefined();
  });

  it("rejects audit documents and datasets accidentally copied into the image", async () => {
    const root = await imageRoot();
    await mkdir(join(root, "docs", "data"), { recursive: true });
    await writeFile(
      join(root, "docs", "data", "PRODUCTION_BASELINE_AUDIT.md"),
      "private",
    );
    await expect(assertRuntimeImageContract(root)).rejects.toThrow(/docs/);
    await rm(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "data"), { recursive: true });
    await expect(assertRuntimeImageContract(root)).rejects.toThrow(/data/);
  });

  it("rejects environment files nested inside an otherwise allowed source folder", async () => {
    const root = await imageRoot();
    await mkdir(join(root, "scripts", "deploy"), { recursive: true });
    await writeFile(
      join(root, "scripts", "deploy", ".env.production"),
      "secret",
    );
    await expect(assertRuntimeImageContract(root)).rejects.toThrow(
      /\.env\.production/,
    );
  });

  it("rejects any root environment file variant", async () => {
    const root = await imageRoot();
    await writeFile(join(root, ".env.local"), "secret");
    await expect(assertRuntimeImageContract(root)).rejects.toThrow(
      /\.env\.local/,
    );
  });

  it("rejects known production audit files inside an allowed public folder", async () => {
    const root = await imageRoot();
    await mkdir(join(root, "public"), { recursive: true });
    await writeFile(
      join(root, "public", "production-evidence-role-review-2026-09-20.ndjson"),
      "private",
    );
    await expect(assertRuntimeImageContract(root)).rejects.toThrow(
      /production-evidence-role-review/,
    );
  });

  it("rejects images that omit the worker runtime or database migrations", async () => {
    const root = await imageRoot();
    await rm(join(root, "node_modules", ".bin", "tsx"));
    await expect(assertRuntimeImageContract(root)).rejects.toThrow(/tsx/);
  });

  it("rejects an image that cannot resolve the server-only CLI shim", async () => {
    const root = await imageRoot();
    await rm(join(root, "scripts", "support", "server-only.ts"), {
      force: true,
    });
    await expect(assertRuntimeImageContract(root)).rejects.toThrow(
      /server-only\.ts/,
    );
  });

  it("rejects an image without the staging indexing proxy", async () => {
    const root = await imageRoot();
    await rm(join(root, "proxy.ts"));
    await expect(assertRuntimeImageContract(root)).rejects.toThrow(/proxy\.ts/);
  });
});
