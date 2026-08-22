import {
  applyOpportunityBackfill,
  preflightOpportunityBackfill,
} from "../../src/infrastructure/db/opportunity-backfill.server";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "../../src/infrastructure/db/runtime.server";

const argumentsFromCli = process.argv.slice(2);

if (
  argumentsFromCli.length > 1 ||
  (argumentsFromCli.length === 1 && argumentsFromCli[0] !== "--apply")
) {
  throw new Error("Usage: npm run db:backfill:opportunities [--apply]");
}

const runtime = getRuntimeDatabase();

try {
  const result =
    argumentsFromCli[0] === "--apply"
      ? await applyOpportunityBackfill({
          transactionManager: runtime.transactionManager,
        })
      : await preflightOpportunityBackfill(runtime.executor);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await closeRuntimeDatabase();
}
