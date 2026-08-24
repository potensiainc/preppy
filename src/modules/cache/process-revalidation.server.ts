import "server-only";

import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import type { CacheRevalidationClient } from "@/src/modules/cache/revalidation-client.server";
import { parseArticleCacheRevalidationPayload } from "@/src/modules/cache/revalidation-contract";
import {
  completeOutboxEvent,
  deadLetterOutboxEvent,
  rescheduleOutboxEvent,
  type ClaimedOutboxEvent,
} from "@/src/modules/outbox/transitions.server";

export type CacheRevalidationProcessResult =
  | Readonly<{ kind: "PROCESSED" }>
  | Readonly<{ kind: "RESCHEDULED" }>
  | Readonly<{ kind: "DEAD_LETTERED" }>;

function retryAt(now: Date, attemptCount: number): Date {
  const delayMs = Math.min(
    3_600_000,
    30_000 * 2 ** Math.max(0, attemptCount - 1),
  );
  return new Date(now.getTime() + delayMs);
}

export async function processCacheRevalidationEvent(
  transactionManager: Pick<TransactionManager, "run">,
  claimedEvent: ClaimedOutboxEvent,
  workerContext: Readonly<{ workerId: string; now: Date }>,
  dependencies: Readonly<{ client: CacheRevalidationClient }>,
): Promise<CacheRevalidationProcessResult> {
  const payload = parseArticleCacheRevalidationPayload(claimedEvent.payload);
  if (!payload || payload.articleId !== claimedEvent.aggregateId) {
    throw new TypeError("Invalid claimed cache revalidation event");
  }
  const result = await dependencies.client.revalidate({
    eventId: claimedEvent.id,
    payload,
  });
  if (result.kind === "SUCCEEDED") {
    await transactionManager.run((executor) =>
      completeOutboxEvent(executor, {
        eventId: claimedEvent.id,
        workerId: workerContext.workerId,
        now: workerContext.now,
      }),
    );
    return { kind: "PROCESSED" };
  }
  const exhausted =
    claimedEvent.maxAttempts === null ||
    claimedEvent.attemptCount >= claimedEvent.maxAttempts;
  if (result.kind === "RETRYABLE_FAILURE" && !exhausted) {
    await transactionManager.run((executor) =>
      rescheduleOutboxEvent(executor, {
        eventId: claimedEvent.id,
        workerId: workerContext.workerId,
        now: workerContext.now,
        availableAt: retryAt(workerContext.now, claimedEvent.attemptCount),
        errorCode: result.errorCode,
      }),
    );
    return { kind: "RESCHEDULED" };
  }
  await transactionManager.run((executor) =>
    deadLetterOutboxEvent(executor, {
      eventId: claimedEvent.id,
      workerId: workerContext.workerId,
      now: workerContext.now,
      errorCode: result.errorCode,
    }),
  );
  return { kind: "DEAD_LETTERED" };
}
