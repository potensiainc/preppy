import { pathToFileURL } from "node:url";

import { parseSideEffectEnv } from "../src/config/runtime-env";
import type { PostgresToolMode } from "../src/modules/production-safety/postgres-tools.server";
import { runRestoreDrill } from "../src/modules/production-safety/restore-drill.server";

function toolMode(
  environment: Record<string, string | undefined>,
): PostgresToolMode {
  if (environment.POSTGRES_TOOL_MODE === "direct") return { kind: "DIRECT" };
  if (environment.POSTGRES_TOOL_MODE === "docker-compose-local") {
    return {
      kind: "DOCKER_COMPOSE_LOCAL",
      service: environment.POSTGRES_DOCKER_SERVICE ?? "postgres",
      databaseUser:
        environment.POSTGRES_LOCAL_DATABASE_USER ?? "admissionradar",
    };
  }
  throw new Error("Invalid PostgreSQL restore tool mode.");
}

export async function runBackupRestoreRehearsalCommand(
  arguments_: readonly string[],
  environment: Record<string, string | undefined> = process.env,
) {
  if (arguments_.length !== 0) {
    return {
      exitCode: 4 as const,
      output: { executed: false, reason: "INVALID_ARGUMENTS" },
    };
  }
  const sourceDatabaseUrl = environment.BACKUP_REHEARSAL_SOURCE_DATABASE_URL;
  const targetDatabaseUrl = environment.RESTORE_REHEARSAL_TARGET_DATABASE_URL;
  const appBaseUrl = environment.APP_BASE_URL;
  if (!sourceDatabaseUrl || !targetDatabaseUrl || !appBaseUrl) {
    return {
      exitCode: 4 as const,
      output: { executed: false, reason: "INVALID_CONFIG_OR_TOOLING" },
    };
  }
  try {
    const sideEffects = parseSideEffectEnv(environment);
    const result = await runRestoreDrill({
      sourceDatabaseUrl,
      targetDatabaseUrl,
      ...(environment.PRODUCTION_DATABASE_URL === undefined
        ? {}
        : { productionDatabaseUrl: environment.PRODUCTION_DATABASE_URL }),
      appBaseUrl,
      toolMode: toolMode(environment),
      sideEffects: {
        workerEnabled: sideEffects.WORKER_ENABLED,
        emailSendEnabled: sideEffects.EMAIL_SEND_ENABLED,
        analyticsEnabled: sideEffects.ANALYTICS_ENABLED,
        cacheRevalidationEnabled: sideEffects.CACHE_REVALIDATION_ENABLED,
      },
    });
    return { exitCode: 0 as const, output: { executed: true, result } };
  } catch {
    return {
      exitCode: 4 as const,
      output: { executed: false, reason: "RESTORE_DRILL_FAILED_SAFELY" },
    };
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  const result = await runBackupRestoreRehearsalCommand(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.output, null, 2)}\n`);
  process.exitCode = result.exitCode;
}
