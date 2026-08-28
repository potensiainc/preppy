import { runHttpCollectorCli } from "@/src/modules/http-collector/cli.server";

try {
  const report = await runHttpCollectorCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "HTTP collector failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
