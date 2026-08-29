import { toSafeProductionRolloutFailure } from "../../src/modules/live-admissions/production-contract";
import { runProductionFiveSchoolCli } from "../../src/modules/live-admissions/production-rollout.server";

try {
  const report = await runProductionFiveSchoolCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(toSafeProductionRolloutFailure(error))}\n`,
  );
  process.exitCode = 1;
}
