import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import { queryOne } from "@/src/infrastructure/db/typed-query";

export type WorkerRunCounts = Readonly<{ failed: number }>;

export type WorkerRunHealth = Readonly<{
  deadLettered: number;
  failedEvents: number;
  held: Readonly<{ emailDelivery: number; cacheRevalidation: number }>;
}>;

export const WORKER_EXIT_OK = 0;
export const WORKER_EXIT_PARTIAL_FAILURE = 3;

// Dead letters and FAILED transitions stamped at or after the run start
// belong to this run, because every transition of a run uses its own `now`.
export async function readWorkerRunHealth(
  transactionManager: Pick<TransactionManager, "run">,
  input: Readonly<{
    runStartedAt: Date;
    emailSendEnabled: boolean;
    cacheRevalidationEnabled: boolean;
  }>,
): Promise<WorkerRunHealth> {
  const since = input.runStartedAt.toISOString();
  const row = await transactionManager.run((executor) =>
    queryOne(
      executor,
      sql`
      select
        count(*) filter (where dead_lettered_at >= ${since}::timestamptz)::int
          as "deadLettered",
        count(*) filter (
          where status='FAILED' and last_error_at >= ${since}::timestamptz
        )::int as "failedEvents",
        count(*) filter (
          where status='PENDING' and event_type='DELIVERY_EMAIL_SEND'
        )::int as "heldEmail",
        count(*) filter (
          where status='PENDING' and event_type='CACHE_REVALIDATION_REQUESTED'
        )::int as "heldCache"
      from outbox_events
    `,
      z.object({
        deadLettered: z.number().int(),
        failedEvents: z.number().int(),
        heldEmail: z.number().int(),
        heldCache: z.number().int(),
      }),
    ),
  );
  return {
    deadLettered: row?.deadLettered ?? 0,
    failedEvents: row?.failedEvents ?? 0,
    held: {
      emailDelivery: input.emailSendEnabled ? 0 : (row?.heldEmail ?? 0),
      cacheRevalidation: input.cacheRevalidationEnabled
        ? 0
        : (row?.heldCache ?? 0),
    },
  };
}

// A run that leaves failed or dead-lettered work exits non-zero so Railway
// records it as a failed cron execution instead of a silent success.
export function workerExitDecision(
  counts: WorkerRunCounts,
  health: Pick<WorkerRunHealth, "deadLettered" | "failedEvents">,
): Readonly<{
  exitCode: number;
  exitReason: "OK" | "EVENT_FAILED" | "DEAD_LETTERED";
}> {
  if (counts.failed > 0 || health.failedEvents > 0) {
    return {
      exitCode: WORKER_EXIT_PARTIAL_FAILURE,
      exitReason: "EVENT_FAILED",
    };
  }
  if (health.deadLettered > 0) {
    return {
      exitCode: WORKER_EXIT_PARTIAL_FAILURE,
      exitReason: "DEAD_LETTERED",
    };
  }
  return { exitCode: WORKER_EXIT_OK, exitReason: "OK" };
}
