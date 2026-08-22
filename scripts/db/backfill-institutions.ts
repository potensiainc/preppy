import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "../../src/infrastructure/db/runtime.server";
import {
  applyInstitutionBackfill,
  preflightInstitutionBackfill,
} from "../../src/infrastructure/db/institution-backfill.server";

const argumentsFromCli = process.argv.slice(2);

if (
  argumentsFromCli.length > 1 ||
  (argumentsFromCli.length === 1 && argumentsFromCli[0] !== "--apply")
) {
  throw new Error("Usage: npm run db:backfill:institutions [--apply]");
}

const runtime = getRuntimeDatabase();

try {
  const result =
    argumentsFromCli[0] === "--apply"
      ? await applyInstitutionBackfill({
          transactionManager: runtime.transactionManager,
        })
      : await preflightInstitutionBackfill(runtime.executor);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await closeRuntimeDatabase();
}
