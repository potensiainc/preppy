import { parseArgs } from "node:util";
import postgres from "postgres";
import {
  loadMigrationSpecs,
  MigrationSafetyError,
} from "../../src/db/migration-plan";
import { runScopedAccountDeletionMigration } from "../../src/db/scoped-account-deletion-migration";
import { SCOPED_TARGETS } from "../../src/db/scoped-english-identity-migration";
const { values } = parseArgs({
  options: {
    target: { type: "string" },
    "backup-receipt": { type: "string" },
    "expected-sql-checksum": { type: "string" },
    apply: { type: "boolean", default: false },
  },
});
let client: ReturnType<typeof postgres> | undefined;
try {
  if (
    !values.target ||
    !Object.hasOwn(SCOPED_TARGETS, values.target) ||
    !values["backup-receipt"] ||
    !values["expected-sql-checksum"] ||
    !process.env.DATABASE_URL
  )
    throw new MigrationSafetyError("SCOPED_ARGUMENTS_REQUIRED");
  const target = SCOPED_TARGETS[values.target as keyof typeof SCOPED_TARGETS];
  const specs = await loadMigrationSpecs();
  client = postgres(process.env.DATABASE_URL, { max: 1 });
  const result = await runScopedAccountDeletionMigration(client, specs, {
    target,
    backupReceiptPath: values["backup-receipt"],
    expectedSqlChecksum: values["expected-sql-checksum"],
    apply: values.apply,
  });
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (e) {
  process.stderr.write(
    JSON.stringify({
      error:
        e instanceof MigrationSafetyError
          ? e.code
          : "SCOPED_MIGRATION_FAILED_NO_DETAILS",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  await client?.end({ timeout: 5 });
}
