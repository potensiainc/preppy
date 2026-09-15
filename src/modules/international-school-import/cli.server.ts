import "server-only";

import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type RuntimeDatabaseResources,
} from "@/src/infrastructure/db/runtime.server";
import {
  applyInternationalSchoolImport,
  dryRunInternationalSchoolImport,
  type InternationalSchoolImportReport,
} from "./importer.server";
import {
  loadInternationalSchoolPackage,
  validateInternationalSchoolPackage,
} from "./validator";

export type InternationalSchoolCliMode = "validate-only" | "dry-run" | "apply";

export const DEFAULT_INTERNATIONAL_SCHOOL_PACKAGE_DIRECTORY =
  "data/snapshots/preppy/international-school/sg-is-20260915-r01";

export type InternationalSchoolCliOptions = Readonly<{
  packageDirectory: string;
  mode: InternationalSchoolCliMode;
  checksum?: string;
}>;

const USAGE =
  "Usage: npm run data:import-international-school-mvp -- [--package <directory>] [--validate-only|--dry-run|--apply --checksum <sha256>]";

export function parseInternationalSchoolCliArgs(
  arguments_: readonly string[],
): InternationalSchoolCliOptions {
  let packageDirectory: string | undefined;
  let checksum: string | undefined;
  const modes: InternationalSchoolCliMode[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--package" || argument === "--checksum") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${USAGE}: ${argument} requires a value`);
      }
      if (argument === "--package") {
        if (packageDirectory) throw new Error(`${USAGE}: duplicate --package`);
        packageDirectory = value;
      } else {
        if (checksum) throw new Error(`${USAGE}: duplicate --checksum`);
        checksum = value;
      }
      index += 1;
    } else if (argument.startsWith("--package=")) {
      if (packageDirectory) throw new Error(`${USAGE}: duplicate --package`);
      packageDirectory = argument.slice("--package=".length);
    } else if (argument.startsWith("--checksum=")) {
      if (checksum) throw new Error(`${USAGE}: duplicate --checksum`);
      checksum = argument.slice("--checksum=".length);
    } else if (
      argument === "--validate-only" ||
      argument === "--dry-run" ||
      argument === "--apply"
    ) {
      modes.push(argument.slice(2) as InternationalSchoolCliMode);
    } else {
      throw new Error(`${USAGE}: unknown argument ${argument}`);
    }
  }
  if (modes.length > 1) throw new Error(`${USAGE}: choose only one mode`);
  const mode = modes[0] ?? "dry-run";
  if (mode === "apply") {
    if (!checksum || !/^[a-f0-9]{64}$/u.test(checksum)) {
      throw new Error(`${USAGE}: --apply requires a 64-character --checksum`);
    }
  } else if (checksum) {
    throw new Error(`${USAGE}: --checksum is only valid with --apply`);
  }
  return {
    packageDirectory:
      packageDirectory ?? DEFAULT_INTERNATIONAL_SCHOOL_PACKAGE_DIRECTORY,
    mode,
    checksum,
  };
}

function classifyEnvironment(environment: NodeJS.ProcessEnv) {
  if (
    environment.NODE_ENV === "production" ||
    environment.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() === "production"
  ) {
    return "PRODUCTION" as const;
  }
  if (environment.NODE_ENV === "test") return "TEST" as const;
  return "LOCAL" as const;
}

export type InternationalSchoolCliDependencies = Readonly<{
  loadPackage?: typeof loadInternationalSchoolPackage;
  openRuntime?: () => RuntimeDatabaseResources;
  closeRuntime?: typeof closeRuntimeDatabase;
}>;

export type InternationalSchoolCliResult = Readonly<{
  mode: InternationalSchoolCliMode;
  targetEnvironment: "PRODUCTION" | "TEST" | "LOCAL";
  packageId: string;
  packageChecksum: string;
  validation: ReturnType<typeof validateInternationalSchoolPackage>;
  applied: boolean;
  planned: null | InternationalSchoolImportReport["plan"];
  appliedCounts: null | InternationalSchoolImportReport["appliedCounts"];
  rejects: readonly InternationalSchoolImportReport["plan"]["rejects"][number][];
  sideEffects: InternationalSchoolImportReport["sideEffects"];
}>;

const ZERO_SIDE_EFFECTS = {
  outboxEvents: 0,
  notifications: 0,
  notificationDeliveries: 0,
  alerts: 0,
  updates: 0,
  detectedChanges: 0,
  meaningfulChanges: 0,
  opportunityChanges: 0,
} as const;

export async function runInternationalSchoolImportCli(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: InternationalSchoolCliDependencies = {},
): Promise<InternationalSchoolCliResult> {
  const options = parseInternationalSchoolCliArgs(arguments_);
  if (
    options.mode === "apply" &&
    environment.ALLOW_PRODUCTION_INTERNATIONAL_SCHOOL_IMPORT !== "1"
  ) {
    throw new Error(
      "--apply requires ALLOW_PRODUCTION_INTERNATIONAL_SCHOOL_IMPORT=1.",
    );
  }
  const packageValue = await (
    dependencies.loadPackage ?? loadInternationalSchoolPackage
  )(options.packageDirectory);
  const validation = validateInternationalSchoolPackage(packageValue);
  const base = {
    mode: options.mode,
    targetEnvironment: classifyEnvironment(environment),
    packageId: validation.packageId,
    packageChecksum: validation.packageChecksum,
    validation,
  };
  if (
    options.mode === "apply" &&
    options.checksum !== validation.packageChecksum
  ) {
    throw new Error(
      "Expected checksum does not match the reviewed package checksum.",
    );
  }
  if (options.mode === "validate-only" || validation.status === "FAIL") {
    return {
      ...base,
      applied: false,
      planned: null,
      appliedCounts: null,
      rejects: [],
      sideEffects: ZERO_SIDE_EFFECTS,
    };
  }

  const runtime = (dependencies.openRuntime ?? getRuntimeDatabase)();
  try {
    const report =
      options.mode === "apply"
        ? await applyInternationalSchoolImport(
            {
              packageValue,
              expectedChecksum: options.checksum,
            },
            { transactionManager: runtime.transactionManager },
          )
        : await dryRunInternationalSchoolImport(
            { packageValue },
            { transactionManager: runtime.transactionManager },
          );
    return {
      ...base,
      applied: report.applied,
      planned: report.plan,
      appliedCounts: report.appliedCounts,
      rejects: report.plan.rejects,
      sideEffects: report.sideEffects,
    };
  } finally {
    await (dependencies.closeRuntime ?? closeRuntimeDatabase)();
  }
}
