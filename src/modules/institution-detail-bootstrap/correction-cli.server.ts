import "server-only";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseRuntimeDatabaseEnv } from "@/src/config/runtime-env";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  PRIVATE_ELEMENTARY_SEED_PATH,
  loadPrivateElementaryBootstrapTargets,
  PrivateElementaryBootstrapError,
} from "./contracts";
import { assertArtifactEnvironment } from "./artifact-cli.server";
import {
  CORRECTION_SOURCE_MANIFEST_PATH,
  MAX_CORRECTION_BYTES,
  validateCorrectionBundle,
} from "./correction.server";
import { runCorrectionBundle } from "./correction-runner.server";

type CorrectionOptions = {
  mode: "dry-run" | "apply";
  artifactPath: string;
  production: boolean;
  expectedArtifactChecksum: string | null;
  acknowledgement: string | null;
};
function reject(): never {
  throw new PrivateElementaryBootstrapError(
    "INVOCATION_REJECTED",
    "Correction invocation rejected",
  );
}
export function parseCorrectionCliArgs(
  args: readonly string[],
): CorrectionOptions {
  let mode: CorrectionOptions["mode"] | null = null;
  let artifactPath: string | null = null;
  let production = false;
  let expectedArtifactChecksum: string | null = null;
  let acknowledgement: string | null = null;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const [key, ...rest] = args[i]!.split("=");
    if (!key || seen.has(key)) reject();
    seen.add(key);
    if (["--apply", "--dry-run", "--production"].includes(key)) {
      if (rest.length) reject();
      if (key === "--production") production = true;
      else {
        if (mode) reject();
        mode = key === "--apply" ? "apply" : "dry-run";
      }
      continue;
    }
    if (
      ![
        "--artifact",
        "--expected-artifact-checksum",
        "--acknowledge-production-write",
      ].includes(key)
    )
      reject();
    const value = rest.length ? rest.join("=") : args[++i];
    if (!value || value.startsWith("--")) reject();
    if (key === "--artifact") artifactPath = value;
    if (key === "--expected-artifact-checksum")
      expectedArtifactChecksum = value;
    if (key === "--acknowledge-production-write") acknowledgement = value;
  }
  if (!artifactPath || !mode) reject();
  return {
    mode,
    artifactPath,
    production,
    expectedArtifactChecksum,
    acknowledgement,
  };
}
export function assertCorrectionEnvironment(
  options: CorrectionOptions,
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
): void {
  if (cwd !== "/app")
    throw new PrivateElementaryBootstrapError(
      "ENVIRONMENT_REJECTED",
      "Correction requires deployed /app runtime",
    );
  assertArtifactEnvironment(
    { ...options, slug: null, output: null, inventoryPath: null },
    env,
  );
}
async function readBounded(path: string) {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > MAX_CORRECTION_BYTES
  )
    reject();
  const body = await readFile(path, "utf8");
  if (Buffer.byteLength(body) > MAX_CORRECTION_BYTES) reject();
  return JSON.parse(body) as unknown;
}
export async function runCorrectionCli(args: readonly string[]) {
  const options = parseCorrectionCliArgs(args);
  assertCorrectionEnvironment(options, process.env, process.cwd());
  const loaded = await loadPrivateElementaryBootstrapTargets(
    resolve(PRIVATE_ELEMENTARY_SEED_PATH),
  );
  const manifest = await readBounded(resolve(CORRECTION_SOURCE_MANIFEST_PATH));
  const value = await readBounded(resolve(options.artifactPath));
  const bundle = validateCorrectionBundle(
    value,
    loaded.targets,
    loaded.seedSha256,
    manifest,
  );
  if (
    options.mode === "apply" &&
    options.expectedArtifactChecksum !== bundle.artifactChecksum
  )
    reject();
  const runtime = getRuntimeDatabase(
    parseRuntimeDatabaseEnv({ ...process.env }),
  );
  try {
    return await runCorrectionBundle(bundle, {
      mode: options.mode,
      executor: runtime.executor,
      transactionManager: runtime.transactionManager,
      allowlist: loaded.targets,
      seedSha256: loaded.seedSha256,
      trustedManifest: manifest,
      expectedArtifactChecksum: options.expectedArtifactChecksum ?? undefined,
    });
  } finally {
    await closeRuntimeDatabase();
  }
}
