import "server-only";

import type { AnalyticsTracker } from "@/src/analytics/tracker";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import type { EmailSender } from "@/src/modules/notification/email-sender";
import { resolveOpportunityChangeEvent } from "@/src/modules/notification/resolver.server";
import { processEmailDelivery } from "@/src/modules/notification/send-delivery.server";
import {
  parseOutboxPayload,
  type SupportedOutboxEventType,
} from "@/src/modules/outbox/events";
import {
  failOutboxEvent,
  type ClaimedOutboxEvent,
} from "@/src/modules/outbox/transitions.server";

export type WorkerDispatchDependencies = Readonly<{
  transactionManager: Pick<TransactionManager, "run">;
  sender: EmailSender;
  tracker: AnalyticsTracker;
  emailSendEnabled: boolean;
  appBaseUrl?: string;
}>;

async function failMalformed(
  event: ClaimedOutboxEvent,
  workerId: string,
  now: Date,
  transactionManager: Pick<TransactionManager, "run">,
) {
  await transactionManager.run((executor) =>
    failOutboxEvent(executor, {
      eventId: event.id,
      workerId,
      now,
      errorCode: "INVALID_OUTBOX_PAYLOAD",
    }),
  );
  return { kind: "INVALID_OUTBOX_PAYLOAD" } as const;
}

export async function dispatchClaimedOutboxEvent(
  event: ClaimedOutboxEvent,
  input: { readonly workerId: string; readonly now: Date },
  dependencies: WorkerDispatchDependencies,
) {
  if (event.eventType === "OPPORTUNITY_CHANGE_PUBLISHED") {
    const payload = parseOutboxPayload(event.eventType, event.payload);
    if (!payload || payload.opportunityChangeId !== event.aggregateId) {
      return failMalformed(
        event,
        input.workerId,
        input.now,
        dependencies.transactionManager,
      );
    }
    return resolveOpportunityChangeEvent(dependencies.transactionManager, {
      eventId: event.id,
      opportunityChangeId: event.aggregateId,
      workerId: input.workerId,
      now: input.now,
    });
  }

  const eventType: SupportedOutboxEventType = event.eventType;
  const payload = parseOutboxPayload(eventType, event.payload);
  if (!payload || payload.deliveryId !== event.aggregateId) {
    return failMalformed(
      event,
      input.workerId,
      input.now,
      dependencies.transactionManager,
    );
  }
  return processEmailDelivery(
    dependencies.transactionManager,
    {
      eventId: event.id,
      deliveryId: event.aggregateId,
      workerId: input.workerId,
      now: input.now,
    },
    {
      sender: dependencies.sender,
      tracker: dependencies.tracker,
      sendEnabled: dependencies.emailSendEnabled,
      ...(dependencies.appBaseUrl === undefined
        ? {}
        : { appBaseUrl: dependencies.appBaseUrl }),
    },
  );
}
