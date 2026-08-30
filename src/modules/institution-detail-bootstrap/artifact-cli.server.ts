import "server-only";
import { mkdir, open, readFile, readdir, lstat, chmod } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { parseRuntimeDatabaseEnv } from "@/src/config/runtime-env";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type RuntimeDatabaseResources,
} from "@/src/infrastructure/db/runtime.server";
import {
  PRIVATE_ELEMENTARY_BOOTSTRAP_ACKNOWLEDGEMENT,
  PRIVATE_ELEMENTARY_SEED_PATH,
  PrivateElementaryBootstrapError,
  loadPrivateElementaryBootstrapTargets,
} from "./contracts";
import type { collectPrivateElementarySchool } from "./discovery.server";
import { buildRegistryBaselineFacts } from "./fact-extractor";
import {
  createBootstrapArtifact,
  validateBootstrapArtifact,
} from "./artifact.server";
import { MAX_BOOTSTRAP_ARTIFACT_BYTES } from "./artifact-schema";
import { runBootstrapArtifacts } from "./artifact-runner.server";
import { resolvePrivateElementaryProductionTargetsFromInventory } from "./runner.server";

type ArtifactOptions = {
  mode: "collect" | "dry-run" | "apply";
  slug: string | null;
  output: string | null;
  artifactPath: string | null;
  inventoryPath: string | null;
  production: boolean;
  acknowledgement: string | null;
  expectedArtifactChecksum: string | null;
};
function invocation(): never {
  throw new PrivateElementaryBootstrapError(
    "INVOCATION_REJECTED",
    "Offline bootstrap invocation rejected",
  );
}
export function parseArtifactCliArgs(args: readonly string[]): ArtifactOptions {
  const options: ArtifactOptions = {
    mode: "apply",
    slug: null,
    output: null,
    artifactPath: null,
    inventoryPath: null,
    production: false,
    acknowledgement: null,
    expectedArtifactChecksum: null,
  };
  const seen = new Set<string>();
  let collect = false;
  let dry = false;
  for (let i = 0; i < args.length; i++) {
    const [key, ...rest] = args[i]!.split("=");
    if (!key || seen.has(key)) invocation();
    seen.add(key);
    if (["--collect-only", "--dry-run", "--production"].includes(key)) {
      if (rest.length) invocation();
      if (key === "--collect-only") collect = true;
      if (key === "--dry-run") dry = true;
      if (key === "--production") options.production = true;
      continue;
    }
    const names = {
      "--slug": "slug",
      "--output": "output",
      "--apply-artifact": "artifactPath",
      "--inventory": "inventoryPath",
      "--acknowledge-production-write": "acknowledgement",
      "--expected-artifact-checksum": "expectedArtifactChecksum",
    } as const;
    const field = names[key as keyof typeof names];
    if (!field) invocation();
    const value = rest.length ? rest.join("=") : args[++i];
    if (!value || value.startsWith("--")) invocation();
    options[field] = value;
  }
  if (
    options.slug !== null &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(options.slug)
  )
    invocation();
  if (collect) {
    if (
      !options.output ||
      options.artifactPath ||
      dry ||
      options.production ||
      options.acknowledgement ||
      options.expectedArtifactChecksum
    )
      invocation();
    options.mode = "collect";
  } else {
    if (
      !options.artifactPath ||
      options.output ||
      options.inventoryPath ||
      options.slug
    )
      invocation();
    options.mode = dry ? "dry-run" : "apply";
  }
  return options;
}
export function assertArtifactEnvironment(
  options: ArtifactOptions,
  env: Readonly<Record<string, string | undefined>>,
): void {
  if (options.mode === "collect") {
    if (env.RAILWAY_SERVICE_ID)
      throw new PrivateElementaryBootstrapError(
        "ENVIRONMENT_REJECTED",
        "Collection must execute locally",
      );
    return;
  }
  if (
    options.mode === "apply" &&
    !/^[a-f0-9]{64}$/u.test(options.expectedArtifactChecksum ?? "")
  )
    throw new PrivateElementaryBootstrapError(
      "ENVIRONMENT_REJECTED",
      "Apply requires the approved artifact checksum",
    );
  let database: URL;
  try {
    database = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new PrivateElementaryBootstrapError(
      "ENVIRONMENT_REJECTED",
      "Internal PostgreSQL required",
    );
  }
  if (
    env.NODE_ENV !== "production" ||
    !options.production ||
    env.RAILWAY_SERVICE_NAME !== "preppy-web" ||
    env.RAILWAY_ENVIRONMENT_NAME !== "production" ||
    !env.RAILWAY_SERVICE_ID ||
    !env.RAILWAY_ENVIRONMENT_ID ||
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname.endsWith(".railway.internal") ||
    (options.mode === "apply" &&
      options.acknowledgement !== PRIVATE_ELEMENTARY_BOOTSTRAP_ACKNOWLEDGEMENT)
  ) {
    throw new PrivateElementaryBootstrapError(
      "ENVIRONMENT_REJECTED",
      "Artifact persistence requires Railway preppy-web Production and explicit write acknowledgement",
    );
  }
}
async function readBoundedJson(path: string): Promise<unknown> {
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > MAX_BOOTSTRAP_ARTIFACT_BYTES
  )
    invocation();
  const body = await readFile(path, "utf8");
  if (Buffer.byteLength(body) > MAX_BOOTSTRAP_ARTIFACT_BYTES) invocation();
  return JSON.parse(body);
}
export async function runBootstrapArtifactCli(
  args: readonly string[],
  dependencies: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    seedPath?: string;
    openRuntime?: () => RuntimeDatabaseResources;
    closeRuntime?: typeof closeRuntimeDatabase;
    collect?: typeof collectPrivateElementarySchool;
    now?: () => Date;
  }> = {},
) {
  const options = parseArtifactCliArgs(args);
  const env = dependencies.environment ?? process.env;
  assertArtifactEnvironment(options, env);
  const loaded = await loadPrivateElementaryBootstrapTargets(
    dependencies.seedPath ?? resolve(PRIVATE_ELEMENTARY_SEED_PATH),
  );
  if (options.mode === "collect") {
    let targets = loaded.targets;
    if (options.inventoryPath) {
      const inventory = z
        .array(
          z
            .object({
              id: z.string().uuid(),
              slug: z.string(),
              displayName: z.string(),
              category: z.string(),
              publicationState: z.string(),
            })
            .strict(),
        )
        .length(41)
        .parse(await readBoundedJson(options.inventoryPath));
      targets = resolvePrivateElementaryProductionTargetsFromInventory(
        targets,
        inventory,
      );
    }
    const selected = options.slug
      ? targets.filter((t) => t.slug === options.slug)
      : targets;
    if (selected.length === 0 || selected.some((t) => t.institutionId === null))
      throw new PrivateElementaryBootstrapError(
        "ALLOWLIST_REJECTED",
        "Unresolved Institution IDs require a read-only Production inventory export",
      );
    const collectionModule = await import("./discovery.server");
    const collect =
      dependencies.collect ?? collectionModule.collectPrivateElementarySchool;
    const collectionRuntime =
      collectionModule.createPrivateElementaryCollectionRuntime();
    const records = [];
    for (const target of selected) {
      const path =
        selected.length === 1
          ? resolve(options.output!)
          : resolve(options.output!, `${target.slug}.json`);
      // Reserve the destination before any network work. Never overwrite an approved artifact.
      await mkdir(dirname(path), { recursive: true });
      const file = await open(path, "wx", 0o600);
      try {
        const collected = await collect(
          { target, work: "both" },
          {
            runtime: collectionRuntime,
            ...(dependencies.now ? { now: dependencies.now } : {}),
          },
        );
        const baseline = buildRegistryBaselineFacts(target);
        const baselineTypes = new Set(baseline.map((f) => f.factType));
        const collection = {
          ...collected,
          facts: [
            ...baseline,
            ...collected.facts.filter((f) => !baselineTypes.has(f.factType)),
          ],
        };
        const generatedAt = dependencies.now?.() ?? new Date();
        const artifact = createBootstrapArtifact(
          collection,
          loaded.seedSha256,
          generatedAt,
        );
        validateBootstrapArtifact(
          artifact,
          targets,
          loaded.seedSha256,
          generatedAt,
        );
        await file.writeFile(`${JSON.stringify(artifact, null, 2)}\n`, "utf8");
        await file.sync();
        records.push({
          slug: target.slug,
          path,
          artifactChecksum: artifact.artifactChecksum,
          classification: artifact.classification,
          websiteCollection: artifact.collection.websiteCollection,
          facts: artifact.facts.map((f) => f.factType),
          admission: artifact.admission,
        });
      } finally {
        await file.close();
      }
      await chmod(path, 0o444);
    }
    return {
      mode: "collect" as const,
      selected: selected.length,
      artifactsCreated: records.length,
      databaseWrites: 0,
      records,
      exitCode: 0 as const,
    };
  }
  const info = await lstat(options.artifactPath!);
  if (info.isSymbolicLink()) invocation();
  const paths = info.isDirectory()
    ? (await readdir(options.artifactPath!))
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => join(options.artifactPath!, name))
    : [options.artifactPath!];
  if (paths.length === 0 || paths.length > 41) invocation();
  // Parse failures are per-school rejections; other valid artifacts may still persist after approval.
  const values = await Promise.all(
    paths.map((path) => readBoundedJson(path).catch(() => null)),
  );
  const runtime =
    dependencies.openRuntime?.() ??
    getRuntimeDatabase(parseRuntimeDatabaseEnv({ ...env }));
  try {
    return await runBootstrapArtifacts(values, {
      mode: options.mode,
      executor: runtime.executor,
      transactionManager: runtime.transactionManager,
      allowlist: loaded.targets,
      seedSha256: loaded.seedSha256,
      expectedArtifactChecksum: options.expectedArtifactChecksum ?? undefined,
      ...(dependencies.now ? { now: dependencies.now } : {}),
    });
  } finally {
    await (dependencies.closeRuntime ?? closeRuntimeDatabase)();
  }
}
