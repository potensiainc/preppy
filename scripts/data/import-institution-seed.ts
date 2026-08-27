import { runSeedImportCli } from "../../src/modules/institution-seed/cli.server";

try {
  const report = await runSeedImportCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.plan.applyAllowed) process.exitCode = 2;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      error:
        error instanceof Error ? error.message : "Unknown seed import error",
    })}\n`,
  );
  process.exitCode = 1;
}
