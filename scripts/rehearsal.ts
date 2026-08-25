import { runRehearsal } from "../src/modules/production-preflight/rehearsal.server";
import { PREFLIGHT_EXIT_CODES } from "../src/modules/production-preflight/report";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    process.stdout.write(
      `${JSON.stringify({ executed: false, reason: "INVALID_ARGUMENTS", exitCode: PREFLIGHT_EXIT_CODES.INVALID_CONFIG_OR_TOOLING })}\n`,
    );
    process.exitCode = PREFLIGHT_EXIT_CODES.INVALID_CONFIG_OR_TOOLING;
    return;
  }
  const rehearsalDatabaseUrl = process.env.REHEARSAL_DATABASE_URL;
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!rehearsalDatabaseUrl || !appBaseUrl) {
    process.stdout.write(
      `${JSON.stringify({ executed: false, reason: "INVALID_CONFIG_OR_TOOLING", exitCode: PREFLIGHT_EXIT_CODES.INVALID_CONFIG_OR_TOOLING })}\n`,
    );
    process.exitCode = PREFLIGHT_EXIT_CODES.INVALID_CONFIG_OR_TOOLING;
    return;
  }
  try {
    const result = await runRehearsal({
      rehearsalDatabaseUrl,
      productionDatabaseUrl: process.env.PRODUCTION_DATABASE_URL,
      appBaseUrl,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.exitCode;
  } catch {
    process.stdout.write(
      `${JSON.stringify({ executed: false, reason: "INVALID_CONFIG_OR_TOOLING", exitCode: PREFLIGHT_EXIT_CODES.INVALID_CONFIG_OR_TOOLING })}\n`,
    );
    process.exitCode = PREFLIGHT_EXIT_CODES.INVALID_CONFIG_OR_TOOLING;
  }
}

await main();
