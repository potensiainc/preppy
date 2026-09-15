import { runInternationalSchoolImportCli } from "../../src/modules/international-school-import/cli.server";

try {
  const result = await runInternationalSchoolImportCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.validation.status !== "PASS" || result.rejects.length > 0) {
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      error:
        error instanceof Error
          ? error.message
          : "Unknown international-school import error",
    })}\n`,
  );
  process.exitCode = 1;
}
