import {
  applySourceBindingBackfill,
  preflightSourceBindingBackfill,
} from "../../src/infrastructure/db/source-binding-backfill.server";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "../../src/infrastructure/db/runtime.server";

const usage = "Usage: npm run db:backfill:source-bindings [--apply]";

async function main(argumentsFromCli: string[]): Promise<void> {
  if (
    argumentsFromCli.length > 1 ||
    (argumentsFromCli.length === 1 && argumentsFromCli[0] !== "--apply")
  ) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 1;
    return;
  }

  const runtime = getRuntimeDatabase();

  try {
    const result =
      argumentsFromCli[0] === "--apply"
        ? await applySourceBindingBackfill({
            transactionManager: runtime.transactionManager,
          })
        : await preflightSourceBindingBackfill(runtime.executor);

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await closeRuntimeDatabase();
  }
}

await main(process.argv.slice(2));
