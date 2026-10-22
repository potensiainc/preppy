import { parseArgs } from "node:util";
import postgres from "postgres";

import {
  AdminProvisioningError,
  provisionAdminUser,
} from "../../src/modules/admin/provisioning";

const { values } = parseArgs({
  options: {
    subject: { type: "string" },
    email: { type: "string" },
    "display-name": { type: "string" },
    disable: { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
  },
});
let client: ReturnType<typeof postgres> | undefined;
try {
  if (!values.subject || !process.env.DATABASE_URL)
    throw new AdminProvisioningError("ARGUMENTS_REQUIRED");
  client = postgres(process.env.DATABASE_URL, { max: 1 });
  const result = await provisionAdminUser(
    client,
    values.disable
      ? { mode: "DISABLE", subject: values.subject, apply: values.apply }
      : {
          mode: "ACTIVATE",
          subject: values.subject,
          email: values.email ?? "",
          displayName: values["display-name"] ?? "",
          apply: values.apply,
        },
  );
  process.stdout.write(JSON.stringify(result) + "\n");
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      error:
        error instanceof AdminProvisioningError
          ? error.code
          : error instanceof Error && error.name === "ZodError"
            ? "INVALID_ARGUMENTS"
            : "ADMIN_PROVISIONING_FAILED",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  await client?.end({ timeout: 5 });
}
