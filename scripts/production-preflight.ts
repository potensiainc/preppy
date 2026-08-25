import {
  productionPreflightConfig,
  runProductionPreflight,
  skippedProductionPreflight,
} from "../src/modules/production-preflight/run-production-preflight.server";
import { PREFLIGHT_EXIT_CODES } from "../src/modules/production-preflight/report";
import { UnsafeProductionConnectionError } from "../src/modules/production-preflight/read-only-database.server";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    process.stdout.write(
      `${JSON.stringify({ executed: false, reason: "INVALID_ARGUMENTS", exitCode: PREFLIGHT_EXIT_CODES.INVALID_CONFIG_OR_TOOLING })}\n`,
    );
    process.exitCode = PREFLIGHT_EXIT_CODES.INVALID_CONFIG_OR_TOOLING;
    return;
  }
  try {
    const config = productionPreflightConfig(process.env);
    if (config.status === "SKIPPED_CREDENTIALS_UNAVAILABLE") {
      process.stdout.write(
        `${JSON.stringify(skippedProductionPreflight(), null, 2)}\n`,
      );
      return;
    }
    const result = await runProductionPreflight({
      productionDatabaseUrl: config.productionDatabaseUrl,
      appBaseUrl: config.appBaseUrl,
      ga4Configured: Boolean(
        process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET,
      ),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    const unsafe = error instanceof UnsafeProductionConnectionError;
    const exitCode = unsafe
      ? PREFLIGHT_EXIT_CODES.UNSAFE_PRODUCTION_CONNECTION
      : PREFLIGHT_EXIT_CODES.INVALID_CONFIG_OR_TOOLING;
    process.stdout.write(
      `${JSON.stringify({ executed: false, reason: unsafe ? "UNSAFE_PRODUCTION_CONNECTION" : "INVALID_CONFIG_OR_TOOLING", exitCode })}\n`,
    );
    process.exitCode = exitCode;
  }
}

await main();
