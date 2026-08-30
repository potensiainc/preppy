import "server-only";

import { resolve } from "node:path";

import { parseRuntimeDatabaseEnv } from "@/src/config/runtime-env";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
  type RuntimeDatabaseResources,
} from "@/src/infrastructure/db/runtime.server";

import {
  PRIVATE_ELEMENTARY_SEED_PATH,
  PrivateElementaryBootstrapError,
  assertPrivateElementaryBootstrapEnvironment,
  loadPrivateElementaryBootstrapTargets,
  parsePrivateElementaryBootstrapCliArgs,
} from "./contracts";
import {
  runPrivateElementaryBootstrap,
  type PrivateElementaryBootstrapReport,
} from "./runner.server";

export async function runPrivateElementaryBootstrapCli(
  arguments_: readonly string[],
  dependencies: Readonly<{
    environment?: Readonly<Record<string, string | undefined>>;
    seedPath?: string;
    openRuntime?: () => RuntimeDatabaseResources;
    closeRuntime?: typeof closeRuntimeDatabase;
  }> = {},
): Promise<PrivateElementaryBootstrapReport> {
  const options = parsePrivateElementaryBootstrapCliArgs(arguments_);
  const environment = dependencies.environment ?? process.env;
  assertPrivateElementaryBootstrapEnvironment(options, environment);
  const loaded = await loadPrivateElementaryBootstrapTargets(
    dependencies.seedPath ?? resolve(PRIVATE_ELEMENTARY_SEED_PATH),
  );
  const runtime =
    dependencies.openRuntime?.() ??
    getRuntimeDatabase(parseRuntimeDatabaseEnv({ ...environment }));
  try {
    return await runPrivateElementaryBootstrap(options, {
      executor: runtime.executor,
      transactionManager: runtime.transactionManager,
      allowlist: loaded.targets,
    });
  } finally {
    await (dependencies.closeRuntime ?? closeRuntimeDatabase)();
  }
}

export function toSafePrivateElementaryBootstrapFailure(
  error: unknown,
): Readonly<{
  status: "FAILED";
  errorCode: string;
}> {
  return Object.freeze({
    status: "FAILED" as const,
    errorCode:
      error instanceof PrivateElementaryBootstrapError
        ? error.code
        : "UNEXPECTED_FAILURE",
  });
}
