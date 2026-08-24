import "server-only";

import type { AnalyticsTracker } from "@/src/analytics/tracker";
import { ValidationError } from "@/src/application/errors";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import type { EmailSender } from "@/src/modules/notification/email-sender";
import type { CacheRevalidationClient } from "@/src/modules/cache/revalidation-client.server";
import { supportedOutboxEventTypes } from "@/src/modules/outbox/events";
import {
  claimOutboxBatch,
  recoverStaleOutboxLeases,
  type ClaimedOutboxEvent,
} from "@/src/modules/outbox/transitions.server";
import { dispatchClaimedOutboxEvent } from "@/src/modules/worker/dispatcher.server";

const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type WorkerRunOnceConfig = Readonly<{
  enabled: boolean;
  emailSendEnabled: boolean;
  workerId: string;
  batchSize: number;
  leaseDurationMs: number;
  now: Date;
}>;

type RecoveryResult = { pending: number; failed: number; deadLettered: number };

export type WorkerRunOnceDependencies = Readonly<{
  transactionManager: Pick<TransactionManager, "run">;
  sender: EmailSender;
  tracker: AnalyticsTracker;
  cacheRevalidator: CacheRevalidationClient;
  appBaseUrl?: string;
  recoverStale?: typeof recoverStaleOutboxLeases;
  claimBatch?: typeof claimOutboxBatch;
  dispatch?: typeof dispatchClaimedOutboxEvent;
}>;

export function parseWorkerRunOnceConfig(
  input: unknown,
): WorkerRunOnceConfig | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort().join("|");
  if (
    keys !==
      "batchSize|emailSendEnabled|enabled|leaseDurationMs|now|workerId" ||
    typeof value.enabled !== "boolean" ||
    typeof value.emailSendEnabled !== "boolean" ||
    typeof value.workerId !== "string" ||
    !WORKER_ID_PATTERN.test(value.workerId) ||
    !Number.isSafeInteger(value.batchSize) ||
    (value.batchSize as number) < 1 ||
    (value.batchSize as number) > 100 ||
    !Number.isSafeInteger(value.leaseDurationMs) ||
    (value.leaseDurationMs as number) < 1_000 ||
    (value.leaseDurationMs as number) > 3_600_000 ||
    !(value.now instanceof Date) ||
    !Number.isFinite(value.now.getTime())
  ) {
    return null;
  }
  return {
    enabled: value.enabled,
    emailSendEnabled: value.emailSendEnabled,
    workerId: value.workerId,
    batchSize: value.batchSize as number,
    leaseDurationMs: value.leaseDurationMs as number,
    now: new Date(value.now),
  };
}

export async function runWorkerOnce(
  config: WorkerRunOnceConfig,
  dependencies: WorkerRunOnceDependencies,
) {
  const parsed = parseWorkerRunOnceConfig(config);
  if (!parsed) throw ValidationError.invalidRequest();
  const emptyRecovery: RecoveryResult = {
    pending: 0,
    failed: 0,
    deadLettered: 0,
  };
  if (!parsed.enabled) {
    return {
      enabled: false,
      recovered: emptyRecovery,
      claimed: 0,
      processed: 0,
      failed: 0,
    };
  }

  const recover = dependencies.recoverStale ?? recoverStaleOutboxLeases;
  const claim = dependencies.claimBatch ?? claimOutboxBatch;
  const dispatch = dependencies.dispatch ?? dispatchClaimedOutboxEvent;
  const recovered = await recover(dependencies.transactionManager, {
    cutoff: new Date(parsed.now.getTime() - parsed.leaseDurationMs),
    now: parsed.now,
    limit: parsed.batchSize,
  });
  const claimed = (await claim(dependencies.transactionManager, {
    eventTypes: supportedOutboxEventTypes,
    limit: parsed.batchSize,
    workerId: parsed.workerId,
    now: parsed.now,
  })) as ClaimedOutboxEvent[];

  let processed = 0;
  let failed = 0;
  for (const event of claimed) {
    try {
      await dispatch(
        event,
        { workerId: parsed.workerId, now: parsed.now },
        {
          transactionManager: dependencies.transactionManager,
          sender: dependencies.sender,
          tracker: dependencies.tracker,
          emailSendEnabled: parsed.emailSendEnabled,
          cacheRevalidator: dependencies.cacheRevalidator,
          ...(dependencies.appBaseUrl === undefined
            ? {}
            : { appBaseUrl: dependencies.appBaseUrl }),
        },
      );
      processed += 1;
    } catch {
      // The owned lease remains durable. Recovery applies event-specific safety.
      failed += 1;
    }
  }

  return {
    enabled: true,
    recovered,
    claimed: claimed.length,
    processed,
    failed,
  };
}
