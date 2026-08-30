import {
  runPrivateElementaryBootstrapCli,
  toSafePrivateElementaryBootstrapFailure,
} from "../../src/modules/institution-detail-bootstrap/cli.server";

try {
  const report = await runPrivateElementaryBootstrapCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.exitCode;
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(toSafePrivateElementaryBootstrapFailure(error))}\n`,
  );
  process.exitCode = 1;
}
