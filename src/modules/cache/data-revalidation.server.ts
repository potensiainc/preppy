import "server-only";

import { OutboxWriter } from "@/src/application/outbox-writer.server";
import type { TransactionExecutor } from "@/src/infrastructure/db/runtime.server";
import {
  CACHE_REVALIDATION_EVENT,
  type DataCacheRevalidationPayloadV2,
} from "./revalidation-contract";

export function enqueueDataRevalidation(
  executor: TransactionExecutor,
  payload: DataCacheRevalidationPayloadV2,
) {
  return OutboxWriter.enqueue(
    {
      eventType: CACHE_REVALIDATION_EVENT,
      aggregateType: payload.targetType,
      aggregateId: payload.targetId,
      dedupeKey: `DATA_CACHE:${payload.targetType}:${payload.targetId}:${payload.versionId}`,
      payloadSafe: payload,
    },
    executor,
  );
}
