import { runInternationalSchoolProductionAudit } from "../../src/modules/international-school-import/production-audit.server";

const packageDirectory =
  process.argv[2] ??
  "data/snapshots/preppy/international-school/sg-is-20260915-r01";

const result = await runInternationalSchoolProductionAudit(
  packageDirectory,
  process.env,
);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode =
  result.reason === "UNSAFE_CONNECTION" ||
  (result.executed && result.blockers.length > 0)
    ? 2
    : 0;
