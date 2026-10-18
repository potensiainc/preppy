import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createAdminCommandContext } from "../../src/application/context";
import {
  getRuntimeDatabase,
  closeRuntimeDatabase,
} from "../../src/infrastructure/db/runtime.server";
import { registerEnglishKindergartenSessions } from "../../src/modules/english-kindergarten/register-sessions.server";
import {
  packageChecksum,
  sessionPackageSchema,
} from "../../src/modules/english-kindergarten/session-package";

// Validation is the default. An operator must supply existing admin identity and DB access.
const { values } = parseArgs({
  options: {
    package: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    "admin-user-id": { type: "string" },
    "backup-dir": { type: "string" },
    "expected-checksum": { type: "string" },
    "cache-consumers-v2-ready": { type: "boolean", default: false },
  },
});
try {
  if (!values.package || (values.apply && values["dry-run"]))
    throw new Error("Supply --package and at most one execution mode.");
  const data = sessionPackageSchema.parse(
    JSON.parse(await readFile(resolve(values.package), "utf8")),
  );
  const checksum = packageChecksum(data);
  if (!values.apply && !values["dry-run"]) {
    process.stdout.write(
      JSON.stringify({
        mode: "VALIDATE_ONLY",
        checksum,
        sessions: data.sessions.length,
        sources: data.sources.length,
      }) + "\n",
    );
  } else {
    if (!values["admin-user-id"] || !values["backup-dir"])
      throw new Error(
        "Execution requires existing --admin-user-id and --backup-dir.",
      );
    if (
      values.apply &&
      (values["expected-checksum"] !== checksum ||
        !values["cache-consumers-v2-ready"])
    )
      throw new Error(
        "Apply requires the reviewed checksum and compatible web/worker cache consumers.",
      );
    if (
      values.apply &&
      (process.env.EMAIL_SEND_ENABLED !== "false" ||
        process.env.WORKER_ENABLED !== "false")
    )
      throw new Error(
        "Bulk apply requires explicit EMAIL_SEND_ENABLED=false and WORKER_ENABLED=false in this command runtime. Separately verify all deployed consumers before applying.",
      );
    const runtime = getRuntimeDatabase();
    const ctx = createAdminCommandContext({
      adminUserId: values["admin-user-id"],
      reason: "CORRECTION_CONTENT_NO_NOTIFY",
    });
    const before = await registerEnglishKindergartenSessions(
      ctx,
      data,
      { apply: false, cacheConsumersV2Ready: false },
      runtime.transactionManager,
    );
    const backup = resolve(
      values["backup-dir"],
      `${Date.now()}-${ctx.correlationId}.json`,
    );
    await mkdir(resolve(values["backup-dir"]), { recursive: true });
    await writeFile(
      backup,
      JSON.stringify({ ctx, package: data, before }, null, 2) + "\n",
      { encoding: "utf8", flag: "wx" },
    );
    if (before.rejects.length) {
      process.stdout.write(JSON.stringify({ ...before, backup }) + "\n");
      process.exitCode = 2;
    } else if (values.apply) {
      const result = await registerEnglishKindergartenSessions(
        ctx,
        data,
        {
          apply: true,
          expectedChecksum: checksum,
          cacheConsumersV2Ready: true,
        },
        runtime.transactionManager,
      );
      const readback = await registerEnglishKindergartenSessions(
        createAdminCommandContext({ adminUserId: ctx.adminUserId }),
        data,
        { apply: false, cacheConsumersV2Ready: false },
        runtime.transactionManager,
      );
      if (
        readback.rejects.length ||
        readback.before.some((row) => row.operation !== "UNCHANGED") ||
        readback.campusBefore.some((row) => row.operation !== "UNCHANGED")
      )
        throw new Error(
          "Post-apply readback mismatch; inspect saved backup and audit.",
        );
      const readbackFile = backup + ".readback.json";
      await writeFile(
        readbackFile,
        JSON.stringify({ ctx, result, readback }, null, 2) + "\n",
        { encoding: "utf8", flag: "wx" },
      );
      process.stdout.write(
        JSON.stringify({
          ...result,
          backup,
          readbackFile,
          readback: "ALL_UNCHANGED",
        }) + "\n",
      );
    } else process.stdout.write(JSON.stringify({ ...before, backup }) + "\n");
  }
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      error:
        error instanceof Error ? error.message : "Session registration failed",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  await closeRuntimeDatabase();
}
