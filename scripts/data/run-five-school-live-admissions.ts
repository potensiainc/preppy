import { runFiveSchoolLiveAdmissionCli } from "../../src/modules/live-admissions/cli.server";

try {
  const report = await runFiveSchoolLiveAdmissionCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      error:
        error instanceof Error ? error.message : "Unknown live admission error",
      code:
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined,
    })}\n`,
  );
  process.exitCode = 1;
}
