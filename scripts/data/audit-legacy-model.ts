import postgres from "postgres";

import { auditLegacyModel } from "../../src/modules/legacy-audit/legacy-model-audit";

const url = process.env.DATABASE_URL;
if (!url) {
  process.stderr.write('{"error":"DATABASE_URL_REQUIRED"}\n');
  process.exit(1);
}
const client = postgres(url, { max: 1 });
try {
  process.stdout.write(
    `${JSON.stringify(await auditLegacyModel(client), null, 2)}\n`,
  );
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      error:
        error instanceof Error && error.message === "LEGACY_AUDIT_NOT_READ_ONLY"
          ? error.message
          : "LEGACY_AUDIT_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
