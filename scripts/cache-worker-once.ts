import {
  getRuntimeDatabase,
  closeRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { getCacheRevalidationConfig } from "@/src/modules/cache/config.server";
import { HttpCacheRevalidationClient } from "@/src/modules/cache/revalidation-client.server";
import { getSeoAppBaseUrl } from "@/src/modules/public/seo";
import { runCacheOnlyOnce } from "@/src/modules/cache/run-cache-only.server";
try {
  if (
    process.argv.length !== 2 ||
    process.env.WORKER_ENABLED !== "false" ||
    process.env.EMAIL_SEND_ENABLED !== "false" ||
    process.env.CACHE_REVALIDATION_ENABLED !== "true"
  )
    throw new Error(
      "Cache-only command requires no arguments, WORKER_ENABLED=false, EMAIL_SEND_ENABLED=false and CACHE_REVALIDATION_ENABLED=true",
    );
  const result = await runCacheOnlyOnce(
    {
      workerId: "cache-only-once",
      batchSize: 10,
      leaseDurationMs: 300000,
      now: new Date(),
    },
    {
      transactionManager: getRuntimeDatabase().transactionManager,
      client: new HttpCacheRevalidationClient({
        appBaseUrl: getSeoAppBaseUrl(),
        secret: getCacheRevalidationConfig().secret,
      }),
    },
  );
  process.stdout.write(JSON.stringify(result) + "\n");
} catch {
  process.stderr.write(
    "Cache-only execution failed; inspect durable queue before retry.\n",
  );
  process.exitCode = 1;
} finally {
  await closeRuntimeDatabase();
}
