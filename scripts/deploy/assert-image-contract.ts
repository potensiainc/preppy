import { lstat, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requiredPaths = [
  "package.json",
  "proxy.ts",
  ".next/BUILD_ID",
  "node_modules/.bin/tsx",
  "scripts/worker.ts",
  "src/db/migrations/meta/_journal.json",
] as const;

const forbiddenRootPaths = [
  "docs",
  "data",
  ".git",
  ".env",
  ".env.example",
  ".env.production",
  "AGENTS.md",
  "CLAUDE.md",
] as const;

const sourceFolders = ["app", "src", "scripts", "public", "types"] as const;

function forbiddenName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized.startsWith(".env") ||
    normalized === "agents.md" ||
    normalized === "claude.md" ||
    normalized.startsWith("production_baseline_audit") ||
    normalized.startsWith("production_evidence_role_correction_review") ||
    normalized.startsWith("production-evidence-role-review")
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function assertNoNestedPrivateFiles(root: string, folder: string) {
  const path = join(root, folder);
  if (!(await exists(path))) return;

  for (const entry of await readdir(path, { withFileTypes: true })) {
    const nested = join(path, entry.name);
    if (forbiddenName(entry.name)) {
      throw new Error(
        "Forbidden file in release image: " + relative(root, nested),
      );
    }
    if (entry.isDirectory()) {
      await assertNoNestedPrivateFiles(root, relative(root, nested));
    }
  }
}

export async function assertRuntimeImageContract(root: string): Promise<void> {
  const resolvedRoot = resolve(root);
  for (const path of requiredPaths) {
    if (!(await exists(join(resolvedRoot, path)))) {
      throw new Error("Required release image file is missing: " + path);
    }
  }
  for (const path of forbiddenRootPaths) {
    if (await exists(join(resolvedRoot, path))) {
      throw new Error("Forbidden file in release image: " + path);
    }
  }
  for (const entry of await readdir(resolvedRoot, { withFileTypes: true })) {
    if (forbiddenName(entry.name)) {
      throw new Error("Forbidden file in release image: " + entry.name);
    }
  }
  for (const folder of sourceFolders) {
    await assertNoNestedPrivateFiles(resolvedRoot, folder);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  await assertRuntimeImageContract(process.cwd());
  process.stdout.write("Runtime image contract passed.\n");
}
