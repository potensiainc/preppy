import "server-only";
import { ValidationError } from "@/src/application/errors";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import type { CacheRevalidationClient } from "./revalidation-client.server";
import { processCacheRevalidationEvent } from "./process-revalidation.server";
import {
  claimOutboxBatch,
  recoverStaleOutboxLeases,
} from "@/src/modules/outbox/transitions.server";
import { z } from "zod";

/** Fixed event allowlist applies to BOTH stale-lease recovery and claiming.
 * Never imports a notification dispatcher, resolver, sender or analytics runtime. */
export async function runCacheOnlyOnce(
  input: {
    workerId: string;
    batchSize: number;
    leaseDurationMs: number;
    now: Date;
  },
  dependencies: {
    transactionManager: Pick<TransactionManager, "run">;
    client: CacheRevalidationClient;
  },
) {
  const parsed = z
    .object({
      workerId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
      batchSize: z.number().int().min(1).max(100),
      leaseDurationMs: z.number().int().min(1000).max(3600000),
      now: z.date(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) throw ValidationError.invalidRequest();
  const config = parsed.data;
  const eventTypes = ["CACHE_REVALIDATION_REQUESTED"] as const;
  const recovered = await recoverStaleOutboxLeases(
    dependencies.transactionManager,
    {
      eventTypes,
      cutoff: new Date(config.now.getTime() - config.leaseDurationMs),
      now: config.now,
      limit: config.batchSize,
    },
  );
  const claimed = await claimOutboxBatch(dependencies.transactionManager, {
    eventTypes,
    limit: config.batchSize,
    workerId: config.workerId,
    now: config.now,
  });
  const results = [];
  for (const event of claimed) {
    try {
      results.push(
        await processCacheRevalidationEvent(
          dependencies.transactionManager,
          event,
          config,
          { client: dependencies.client },
        ),
      );
    } catch {
      results.push({ kind: "LEASE_RETAINED" as const });
    }
  }
  return { recovered, claimed: claimed.length, results };
}
