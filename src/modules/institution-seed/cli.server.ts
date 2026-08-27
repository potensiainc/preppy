import "server-only";

import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type RuntimeDatabaseResources,
} from "@/src/infrastructure/db/runtime.server";
import { loadAndValidateSeedPackage } from "@/src/modules/institution-seed/contract";
import {
  applyInstitutionSeedImport,
  dryRunInstitutionSeedImport,
} from "@/src/modules/institution-seed/importer.server";
import type {
  SeedImportMode,
  SeedImportReport,
} from "@/src/modules/institution-seed/report";

export type SeedImportCliOptions = {
  filePath: string;
  mode: SeedImportMode;
};

const USAGE =
  "Usage: npm run data:import-institution-seed -- --file <json> [--dry-run|--apply]";

export function parseSeedImportCliArgs(
  arguments_: string[],
): SeedImportCliOptions {
  let filePath: string | undefined;
  let dryRun = false;
  let apply = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--file") {
      if (filePath !== undefined) throw new Error(`${USAGE}: duplicate --file`);
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${USAGE}: --file requires a path`);
      }
      filePath = value;
      index += 1;
    } else if (argument.startsWith("--file=")) {
      if (filePath !== undefined) throw new Error(`${USAGE}: duplicate --file`);
      filePath = argument.slice("--file=".length);
      if (!filePath) throw new Error(`${USAGE}: --file requires a path`);
    } else if (argument === "--dry-run") {
      if (dryRun) throw new Error(`${USAGE}: duplicate --dry-run`);
      dryRun = true;
    } else if (argument === "--apply") {
      if (apply) throw new Error(`${USAGE}: duplicate --apply`);
      apply = true;
    } else {
      throw new Error(`${USAGE}: unknown argument ${argument}`);
    }
  }

  if (!filePath) throw new Error(`${USAGE}: --file is required`);
  if (dryRun && apply) {
    throw new Error(`${USAGE}: --dry-run and --apply are mutually exclusive`);
  }
  return { filePath, mode: apply ? "apply" : "dry-run" };
}

type CliDependencies = {
  loadPackage?: typeof loadAndValidateSeedPackage;
  openRuntime?: () => RuntimeDatabaseResources;
  closeRuntime?: typeof closeRuntimeDatabase;
};

export async function runSeedImportCli(
  arguments_: string[],
  dependencies: CliDependencies = {},
): Promise<SeedImportReport> {
  const options = parseSeedImportCliArgs(arguments_);
  const validated = await (
    dependencies.loadPackage ?? loadAndValidateSeedPackage
  )(options.filePath);
  const runtime = (dependencies.openRuntime ?? getRuntimeDatabase)();

  try {
    const input = { validated };
    const importerDependencies = {
      transactionManager: runtime.transactionManager,
    };
    return options.mode === "apply"
      ? await applyInstitutionSeedImport(input, importerDependencies)
      : await dryRunInstitutionSeedImport(input, importerDependencies);
  } finally {
    await (dependencies.closeRuntime ?? closeRuntimeDatabase)();
  }
}
