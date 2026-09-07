import "server-only";

import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type RuntimeDatabaseResources,
} from "@/src/infrastructure/db/runtime.server";
import {
  applyEnglishKindergartenImport,
  dryRunEnglishKindergartenImport,
  type EnglishKindergartenImportReport,
} from "@/src/modules/english-kindergarten-import/importer.server";
import {
  loadEnglishKindergartenPackage,
  validateEnglishKindergartenPackage,
} from "@/src/modules/english-kindergarten-import/validator";

export type EnglishKindergartenCliMode = "validate-only" | "dry-run" | "apply";

export type EnglishKindergartenCliOptions = Readonly<{
  packageDirectory: string;
  mode: EnglishKindergartenCliMode;
  expectedChecksum?: string;
}>;

const USAGE =
  "Usage: npm run data:import-english-kindergarten-mvp -- --package <directory> [--validate-only|--dry-run|--apply --expected-checksum <sha256>]";

export function parseEnglishKindergartenCliArgs(
  arguments_: readonly string[],
): EnglishKindergartenCliOptions {
  let packageDirectory: string | undefined;
  let expectedChecksum: string | undefined;
  const modes: EnglishKindergartenCliMode[] = [];

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--package" || argument === "--expected-checksum") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${USAGE}: ${argument} requires a value`);
      }
      if (argument === "--package") {
        if (packageDirectory) throw new Error(`${USAGE}: duplicate --package`);
        packageDirectory = value;
      } else {
        if (expectedChecksum) {
          throw new Error(`${USAGE}: duplicate --expected-checksum`);
        }
        expectedChecksum = value;
      }
      index += 1;
    } else if (argument.startsWith("--package=")) {
      if (packageDirectory) throw new Error(`${USAGE}: duplicate --package`);
      packageDirectory = argument.slice("--package=".length);
    } else if (argument.startsWith("--expected-checksum=")) {
      if (expectedChecksum) {
        throw new Error(`${USAGE}: duplicate --expected-checksum`);
      }
      expectedChecksum = argument.slice("--expected-checksum=".length);
    } else if (
      argument === "--validate-only" ||
      argument === "--dry-run" ||
      argument === "--apply"
    ) {
      modes.push(argument.slice(2) as EnglishKindergartenCliMode);
    } else {
      throw new Error(`${USAGE}: unknown argument ${argument}`);
    }
  }

  if (!packageDirectory) throw new Error(`${USAGE}: --package is required`);
  if (modes.length > 1) throw new Error(`${USAGE}: choose only one mode`);
  const mode = modes[0] ?? "dry-run";
  if (mode === "apply") {
    if (!expectedChecksum || !/^[a-f0-9]{64}$/u.test(expectedChecksum)) {
      throw new Error(
        `${USAGE}: --apply requires a 64-character --expected-checksum`,
      );
    }
  } else if (expectedChecksum) {
    throw new Error(`${USAGE}: --expected-checksum is only valid with --apply`);
  }
  return { packageDirectory, mode, expectedChecksum };
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

type CliDependencies = Readonly<{
  loadPackage?: typeof loadEnglishKindergartenPackage;
  openRuntime?: () => RuntimeDatabaseResources;
  closeRuntime?: typeof closeRuntimeDatabase;
}>;

export type EnglishKindergartenCliResult = Readonly<{
  mode: EnglishKindergartenCliMode;
  targetEnvironment: "PRODUCTION" | "TEST" | "LOCAL";
  packageId: string;
  packageChecksum: string;
  validation: Readonly<{
    status: "PASS" | "FAIL";
    reportChecksum: string;
    counts: {
      campuses: number;
      evidence: number;
      districts: Readonly<Record<string, number>>;
      legalDongs: Readonly<Record<string, number>>;
    };
    errors: readonly string[];
  }>;
  applied: boolean;
  planned: null | EnglishKindergartenImportReport["plan"];
  appliedCounts: null | EnglishKindergartenImportReport["appliedCounts"];
  rejects: readonly EnglishKindergartenImportReport["plan"]["rejects"][number][];
  sideEffects: EnglishKindergartenImportReport["sideEffects"];
}>;

export async function runEnglishKindergartenImportCli(
  arguments_: readonly string[],
  dependencies: CliDependencies = {},
  environment: NodeJS.ProcessEnv = process.env,
): Promise<EnglishKindergartenCliResult> {
  const options = parseEnglishKindergartenCliArgs(arguments_);
  if (
    options.mode === "apply" &&
    environment.ALLOW_PRODUCTION_ENGLISH_KINDERGARTEN_IMPORT !== "1"
  ) {
    throw new Error(
      "--apply requires ALLOW_PRODUCTION_ENGLISH_KINDERGARTEN_IMPORT=1.",
    );
  }
  const packageValue = await (
    dependencies.loadPackage ?? loadEnglishKindergartenPackage
  )(options.packageDirectory);
  const report = validateEnglishKindergartenPackage(packageValue);
  const base = {
    mode: options.mode,
    targetEnvironment: classifyEnvironment(environment),
    packageId: report.packageId,
    packageChecksum: report.packageChecksum,
    validation: {
      status: report.status,
      reportChecksum: report.reportChecksum,
      counts: report.counts,
      errors: report.errors,
    },
  };
  const zeroSideEffects = {
    outboxEvents: 0,
    notifications: 0,
    deliveries: 0,
    meaningfulChanges: 0,
  };
  if (options.mode === "validate-only" || report.status === "FAIL") {
    return {
      ...base,
      applied: false,
      planned: null,
      appliedCounts: null,
      rejects: [],
      sideEffects: zeroSideEffects,
    };
  }

  const runtime = (dependencies.openRuntime ?? getRuntimeDatabase)();
  try {
    const importReport =
      options.mode === "apply"
        ? await applyEnglishKindergartenImport(
            {
              packageValue,
              expectedChecksum: options.expectedChecksum,
            },
            { transactionManager: runtime.transactionManager },
          )
        : await dryRunEnglishKindergartenImport(
            { packageValue },
            { transactionManager: runtime.transactionManager },
          );
    return {
      ...base,
      applied: importReport.applied,
      planned: importReport.plan,
      appliedCounts: importReport.appliedCounts,
      rejects: importReport.plan.rejects,
      sideEffects: importReport.sideEffects,
    };
  } finally {
    await (dependencies.closeRuntime ?? closeRuntimeDatabase)();
  }
}
