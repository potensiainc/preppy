import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { migrateDatabase } from "../../src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "../../tests/support/test-database";
import {
  getRuntimeDatabase,
  closeRuntimeDatabase,
} from "../../src/infrastructure/db/runtime.server";
import { createAdminCommandContext } from "../../src/application/context";
import { registerEnglishKindergartenSessions } from "../../src/modules/english-kindergarten/register-sessions.server";
import {
  packageChecksum,
  sessionPackageSchema,
} from "../../src/modules/english-kindergarten/session-package";
import { normalizeCampusLocation } from "../../src/modules/english-kindergarten/campus-location";
const url = process.env.TEST_DATABASE_URL!;
assertDedicatedTestDatabaseUrl(url);
if (
  new URL(url).hostname !== "127.0.0.1" ||
  !new URL(url).pathname.includes("ek_rehearsal_test")
)
  throw new Error("Dedicated localhost rehearsal database required");
if (
  process.env.EMAIL_SEND_ENABLED !== "false" ||
  process.env.WORKER_ENABLED !== "false"
)
  throw new Error("Explicit no-send runtime required");
const path = "data/review/english-kindergarten-20261018";
const runPath = path + "/local-rehearsal/" + Date.now();
const directory = z
  .object({
    records: z.array(
      z.object({
        institutionId: z.uuid(),
        slug: z.string(),
        name: z.string(),
        address: z.string(),
        region: z.string(),
      }),
    ),
  })
  .parse(JSON.parse(await readFile(path + "/public-directory.json", "utf8")));
const data = sessionPackageSchema.parse(
  JSON.parse(
    await readFile(path + "/session-registration-package.json", "utf8"),
  ),
);
await migrateDatabase(url);
const runtime = getRuntimeDatabase({
  DATABASE_URL: url,
  NODE_ENV: "test",
  DATABASE_MAX_CONNECTIONS: 4,
});
const admin = randomUUID();
try {
  await runtime.client`insert into admin_users(id,external_auth_subject,email,display_name,status) values(${admin},${"rehearsal-" + admin},${admin + "@example.test"},'Local Rehearsal Only','ACTIVE')`;
  for (const row of directory.records) {
    const location = normalizeCampusLocation(row.address, "서울 " + row.region);
    await runtime.client`insert into institutions(id,slug,display_name,category,publication_state,operational_state,region_code,district,address_line,published_at) values(${row.institutionId},${row.slug},${row.name},'ENGLISH_KINDERGARTEN','PUBLISHED','UNKNOWN',${location.regionCode},${location.district},${row.address},now()) on conflict do nothing`;
  }
  const ctx = createAdminCommandContext({
    adminUserId: admin,
    reason: "CORRECTION_CONTENT_NO_NOTIFY",
  });
  const before = await registerEnglishKindergartenSessions(
    ctx,
    data,
    { apply: false, cacheConsumersV2Ready: false },
    runtime.transactionManager,
  );
  const counts = {
    campusOperations: count(before.campusBefore.map((r) => r.operation)),
    sessionOperations: count(before.before.map((r) => r.operation)),
    rejects: before.rejects,
  };
  await mkdir(runPath, { recursive: true });
  await writeFile(
    runPath + "/dry-run.json",
    JSON.stringify(
      {
        localOnly: true,
        productionDryRun: false,
        checksum: packageChecksum(data),
        counts,
        before,
      },
      null,
      2,
    ) + "\n",
  );
  if (before.rejects.length) {
    console.log(JSON.stringify({ localOnly: true, ...counts }));
    process.exitCode = 2;
  } else {
    const baseline = await queueCounts();
    const applied = await registerEnglishKindergartenSessions(
      ctx,
      data,
      {
        apply: true,
        expectedChecksum: packageChecksum(data),
        cacheConsumersV2Ready: true,
      },
      runtime.transactionManager,
    );
    const readback = await registerEnglishKindergartenSessions(
      createAdminCommandContext({ adminUserId: admin }),
      data,
      { apply: false, cacheConsumersV2Ready: false },
      runtime.transactionManager,
    );
    const queues = await queueCounts();
    if (
      readback.rejects.length ||
      readback.before.some((r) => r.operation !== "UNCHANGED") ||
      readback.campusBefore.some((r) => r.operation !== "UNCHANGED")
    )
      throw new Error("Readback mismatch");
    if (
      queues.notifications !== baseline.notifications ||
      queues.deliveries !== baseline.deliveries ||
      queues.notificationEvents !== baseline.notificationEvents
    )
      throw new Error("Notification side effect");
    const result = {
      artifactPath: runPath,
      localOnly: true,
      productionApplied: false,
      productionDryRun: false,
      checksum: packageChecksum(data),
      counts,
      applied: {
        createdCampuses: applied.createdCampuses,
        updatedCampuses: applied.updatedCampuses,
        changedSessions: applied.changed,
      },
      readback: "ALL_UNCHANGED",
      baselineQueues: baseline,
      afterQueues: queues,
    };
    await writeFile(
      runPath + "/result.json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(JSON.stringify(result));
  }
} finally {
  await closeRuntimeDatabase();
}
function count(values: string[]) {
  return Object.fromEntries(
    [...new Set(values)].map((v) => [v, values.filter((x) => x === v).length]),
  );
}
async function queueCounts() {
  const [r] =
    await runtime.client`select (select count(*)::int from notifications) as notifications,(select count(*)::int from notification_deliveries) as deliveries,(select count(*)::int from outbox_events where event_type<>'CACHE_REVALIDATION_REQUESTED') as "notificationEvents",(select count(*)::int from outbox_events where event_type='CACHE_REVALIDATION_REQUESTED') as "cacheEvents"`;
  return r!;
}
