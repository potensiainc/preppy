import "server-only";

import { sql } from "drizzle-orm";

import type { AnalyticsTracker } from "@/src/analytics/tracker";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/src/application/errors";
import type { NotificationDeliverySuppressReason } from "@/src/db/schema";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import { renderOpportunityChangeEmail } from "@/src/modules/notification/email-renderer.server";
import type {
  EmailSender,
  SendEmailResult,
} from "@/src/modules/notification/email-sender";
import { evaluateDeliveryEligibility } from "@/src/modules/notification/eligibility.server";
import {
  completeOutboxEvent,
  deadLetterOutboxEvent,
  failOutboxEvent,
  rescheduleOutboxEvent,
} from "@/src/modules/outbox/transitions.server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROVIDER_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._:-]{0,127}$/;
const PROVIDER_MESSAGE_ID_PATTERN = /^[\x21-\x7e]{1,255}$/;
const REQUEST_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

type ProcessEmailDeliveryInput = Readonly<{
  eventId: string;
  deliveryId: string;
  workerId: string;
  now: Date;
}>;

type ProcessEmailDeliveryDependencies = Readonly<{
  sender: EmailSender;
  tracker: AnalyticsTracker;
  sendEnabled?: boolean;
  appBaseUrl?: string;
  afterAttemptStarted?: () => Promise<void>;
  afterProviderCall?: (result: SendEmailResult) => Promise<void>;
}>;

type PreparedSend = {
  kind: "SEND";
  attemptId: string;
  attemptNumber: number;
  notificationId: string;
  opportunityId: string;
  message: ReturnType<typeof renderOpportunityChangeEmail>;
};

function validateInput(input: ProcessEmailDeliveryInput) {
  if (
    !UUID_PATTERN.test(input.eventId) ||
    !UUID_PATTERN.test(input.deliveryId) ||
    !WORKER_ID_PATTERN.test(input.workerId) ||
    !(input.now instanceof Date) ||
    !Number.isFinite(input.now.getTime())
  ) {
    throw ValidationError.invalidRequest();
  }
}

function retryDelayMs(attemptCount: number) {
  return attemptCount <= 1 ? 60_000 : 300_000;
}

function safeResult(
  result: SendEmailResult,
  provider: string,
): SendEmailResult {
  if (result.provider === provider) {
    if (result.kind === "ACCEPTED") {
      if (
        result.providerMessageId === undefined ||
        PROVIDER_MESSAGE_ID_PATTERN.test(result.providerMessageId)
      ) {
        return result;
      }
    } else if (
      result.kind === "RESULT_UNKNOWN" &&
      result.errorCode === "PROVIDER_RESULT_UNKNOWN"
    ) {
      return result;
    } else if (
      (result.kind === "RETRYABLE_FAILURE" ||
        result.kind === "TERMINAL_FAILURE") &&
      ERROR_CODE_PATTERN.test(result.errorCode) &&
      (result.kind !== "RETRYABLE_FAILURE" ||
        result.retryAfterMs === undefined ||
        (Number.isSafeInteger(result.retryAfterMs) &&
          result.retryAfterMs >= 1 &&
          result.retryAfterMs <= 300_000))
    ) {
      return result;
    }
  }
  return {
    kind: "RESULT_UNKNOWN",
    provider,
    errorCode: "PROVIDER_RESULT_UNKNOWN",
  };
}

export async function processEmailDelivery(
  transactionManager: Pick<TransactionManager, "run">,
  input: ProcessEmailDeliveryInput,
  dependencies: ProcessEmailDeliveryDependencies,
) {
  validateInput(input);
  if (!PROVIDER_PATTERN.test(dependencies.sender.provider)) {
    throw ValidationError.invalidRequest();
  }
  const nowIso = input.now.toISOString();

  const prepared = await transactionManager.run(async (executor) => {
    const [event] = (await executor.raw(sql`
      select attempt_count as "attemptCount", max_attempts as "maxAttempts"
      from outbox_events
      where id=${input.eventId}
        and event_type='DELIVERY_EMAIL_SEND'
        and aggregate_type='NOTIFICATION_DELIVERY'
        and aggregate_id=${input.deliveryId}
        and status='PROCESSING'
        and locked_by=${input.workerId}
      for update
    `)) as unknown as Array<{
      attemptCount: number;
      maxAttempts: number | null;
    }>;
    if (!event) throw new ConflictError();

    const [delivery] = (await executor.raw(sql`
      select id, status from notification_deliveries
      where id=${input.deliveryId}
      for update
    `)) as unknown as Array<{ id: string; status: string }>;
    if (!delivery) throw new NotFoundError();

    const [unresolved] = (await executor.raw(sql`
      select id from notification_delivery_attempts
      where notification_delivery_id=${input.deliveryId}
        and attempt_status='STARTED'
      order by attempt_number desc limit 1
      for update
    `)) as unknown as Array<{ id: string }>;
    if (unresolved) {
      await executor.raw(sql`
        update notification_delivery_attempts
        set error_code=coalesce(error_code, 'UNRESOLVED_DELIVERY_ATTEMPT')
        where id=${unresolved.id}
      `);
      await failOutboxEvent(executor, {
        eventId: input.eventId,
        workerId: input.workerId,
        now: input.now,
        errorCode: "UNRESOLVED_DELIVERY_ATTEMPT",
      });
      return { kind: "QUARANTINED" } as const;
    }
    if (delivery.status !== "QUEUED") throw new ConflictError();

    if (dependencies.sendEnabled === false) {
      await executor.raw(sql`
        update notification_deliveries
        set status='SUPPRESSED', suppress_reason='OTHER',
          suppressed_at=${nowIso}::timestamptz
        where id=${input.deliveryId} and status='QUEUED'
      `);
      await completeOutboxEvent(executor, {
        eventId: input.eventId,
        workerId: input.workerId,
        now: input.now,
      });
      return { kind: "SUPPRESSED", reason: "OTHER" } as const;
    }

    const eligibility = await evaluateDeliveryEligibility(
      executor,
      input.deliveryId,
    );
    if (!eligibility) throw new NotFoundError();
    if (!eligibility.eligible) {
      await executor.raw(sql`
        update notification_deliveries
        set status='SUPPRESSED', suppress_reason=${eligibility.reason},
          suppressed_at=${nowIso}::timestamptz
        where id=${input.deliveryId} and status='QUEUED'
      `);
      await completeOutboxEvent(executor, {
        eventId: input.eventId,
        workerId: input.workerId,
        now: input.now,
      });
      return {
        kind: "SUPPRESSED",
        reason: eligibility.reason,
      } as const;
    }

    const [number] = (await executor.raw(sql`
      select coalesce(max(attempt_number), 0)::int + 1 as "attemptNumber"
      from notification_delivery_attempts
      where notification_delivery_id=${input.deliveryId}
    `)) as unknown as Array<{ attemptNumber: number }>;
    const attemptNumber = number?.attemptNumber ?? 1;
    const message = renderOpportunityChangeEmail(
      {
        to: eligibility.emailNormalized,
        notificationId: eligibility.notificationId,
        deliveryId: input.deliveryId,
        institutionName: eligibility.institutionName,
        opportunityTitle: eligibility.opportunityTitle,
        changeSummary: eligibility.changeSummary,
        deepLinkPath: eligibility.deepLinkPath,
      },
      dependencies.appBaseUrl === undefined
        ? {}
        : { appBaseUrl: dependencies.appBaseUrl },
    );
    const sendContext = { deliveryId: input.deliveryId, attemptNumber };
    const requestIdentity = dependencies.sender.describeRequest?.(
      message,
      sendContext,
    );
    if (requestIdentity !== undefined) {
      if (
        requestIdentity.provider !== dependencies.sender.provider ||
        requestIdentity.version !== 1 ||
        requestIdentity.idempotencyKey.length > 256 ||
        !REQUEST_HASH_PATTERN.test(requestIdentity.payloadHash) ||
        !REQUEST_HASH_PATTERN.test(requestIdentity.recipientHash)
      ) {
        throw ValidationError.invalidRequest();
      }
      const safePayload = JSON.stringify({
        deliveryId: input.deliveryId,
        providerRequest: {
          provider: requestIdentity.provider,
          version: requestIdentity.version,
          idempotencyKey: requestIdentity.idempotencyKey,
          payloadHash: requestIdentity.payloadHash,
        },
      });
      const [deliveryIdentity] = (await executor.raw(sql`
        update notification_deliveries
        set recipient_hash=${requestIdentity.recipientHash}
        where id=${input.deliveryId}
          and (recipient_hash is null or recipient_hash=${requestIdentity.recipientHash})
        returning id
      `)) as unknown as Array<{ id: string }>;
      const [eventIdentity] = (await executor.raw(sql`
        update outbox_events
        set payload=${safePayload}::jsonb
        where id=${input.eventId}
          and (
            payload=${JSON.stringify({ deliveryId: input.deliveryId })}::jsonb
            or payload=${safePayload}::jsonb
          )
        returning id
      `)) as unknown as Array<{ id: string }>;
      if (!deliveryIdentity || !eventIdentity) throw new ConflictError();
    }
    const [attempt] = (await executor.raw(sql`
      insert into notification_delivery_attempts(
        notification_delivery_id, attempt_number, provider, attempt_status,
        attempted_at, created_at
      ) values (
        ${input.deliveryId}, ${attemptNumber}, ${dependencies.sender.provider},
        'STARTED', ${nowIso}::timestamptz, ${nowIso}::timestamptz
      ) returning id
    `)) as unknown as Array<{ id: string }>;
    if (!attempt) throw new ConflictError();

    return {
      kind: "SEND",
      attemptId: attempt.id,
      attemptNumber,
      notificationId: eligibility.notificationId,
      opportunityId: eligibility.opportunityId,
      message,
    } satisfies PreparedSend;
  });

  if (prepared.kind !== "SEND") return prepared;
  await dependencies.afterAttemptStarted?.();

  let providerResult: SendEmailResult;
  try {
    providerResult = safeResult(
      await dependencies.sender.send(prepared.message, {
        deliveryId: input.deliveryId,
        attemptNumber: prepared.attemptNumber,
      }),
      dependencies.sender.provider,
    );
  } catch {
    providerResult = {
      kind: "RESULT_UNKNOWN",
      provider: dependencies.sender.provider,
      errorCode: "PROVIDER_RESULT_UNKNOWN",
    };
  }
  await dependencies.afterProviderCall?.(providerResult);

  const settled = await transactionManager.run(async (executor) => {
    const [event] = (await executor.raw(sql`
      select attempt_count as "attemptCount", max_attempts as "maxAttempts"
      from outbox_events
      where id=${input.eventId} and status='PROCESSING'
        and locked_by=${input.workerId}
      for update
    `)) as unknown as Array<{
      attemptCount: number;
      maxAttempts: number | null;
    }>;
    if (!event) throw new ConflictError();
    const [attempt] = (await executor.raw(sql`
      select id from notification_delivery_attempts
      where id=${prepared.attemptId} and attempt_status='STARTED'
      for update
    `)) as unknown as Array<{ id: string }>;
    if (!attempt) throw new ConflictError();

    if (providerResult.kind === "ACCEPTED") {
      await executor.raw(sql`
        update notification_delivery_attempts
        set attempt_status='ACCEPTED',
          provider_message_id=${providerResult.providerMessageId ?? null},
          completed_at=${nowIso}::timestamptz, error_code=null,
          error_message_safe=null
        where id=${prepared.attemptId}
      `);
      await executor.raw(sql`
        update notification_deliveries
        set status='SENT', sent_at=${nowIso}::timestamptz
        where id=${input.deliveryId} and status='QUEUED'
      `);
      await completeOutboxEvent(executor, {
        eventId: input.eventId,
        workerId: input.workerId,
        now: input.now,
      });
      return { kind: "ACCEPTED" } as const;
    }

    if (providerResult.kind === "RETRYABLE_FAILURE") {
      await executor.raw(sql`
        update notification_delivery_attempts
        set attempt_status='FAILED_RETRYABLE',
          error_code=${providerResult.errorCode},
          completed_at=${nowIso}::timestamptz
        where id=${prepared.attemptId}
      `);
      const exhausted =
        event.maxAttempts !== null && event.attemptCount >= event.maxAttempts;
      if (exhausted) {
        await executor.raw(sql`
          update notification_deliveries
          set status='FAILED', failed_at=${nowIso}::timestamptz
          where id=${input.deliveryId} and status='QUEUED'
        `);
        await deadLetterOutboxEvent(executor, {
          eventId: input.eventId,
          workerId: input.workerId,
          now: input.now,
          errorCode: "EMAIL_RETRY_EXHAUSTED",
        });
      } else {
        await rescheduleOutboxEvent(executor, {
          eventId: input.eventId,
          workerId: input.workerId,
          now: input.now,
          availableAt: new Date(
            input.now.getTime() +
              (providerResult.retryAfterMs ?? retryDelayMs(event.attemptCount)),
          ),
          errorCode: providerResult.errorCode,
        });
      }
      return { kind: "RETRYABLE_FAILURE" } as const;
    }

    if (providerResult.kind === "TERMINAL_FAILURE") {
      await executor.raw(sql`
        update notification_delivery_attempts
        set attempt_status='FAILED_TERMINAL',
          error_code=${providerResult.errorCode},
          completed_at=${nowIso}::timestamptz
        where id=${prepared.attemptId}
      `);
      await executor.raw(sql`
        update notification_deliveries
        set status='FAILED', failed_at=${nowIso}::timestamptz
        where id=${input.deliveryId} and status='QUEUED'
      `);
      await deadLetterOutboxEvent(executor, {
        eventId: input.eventId,
        workerId: input.workerId,
        now: input.now,
        errorCode: providerResult.errorCode,
      });
      return { kind: "TERMINAL_FAILURE" } as const;
    }

    await executor.raw(sql`
      update notification_delivery_attempts
      set error_code='PROVIDER_RESULT_UNKNOWN'
      where id=${prepared.attemptId} and attempt_status='STARTED'
    `);
    await failOutboxEvent(executor, {
      eventId: input.eventId,
      workerId: input.workerId,
      now: input.now,
      errorCode: "PROVIDER_RESULT_UNKNOWN",
    });
    return { kind: "RESULT_UNKNOWN" } as const;
  });

  if (settled.kind === "ACCEPTED") {
    try {
      await dependencies.tracker.track("notification_sent", {
        notificationId: prepared.notificationId,
        opportunityId: prepared.opportunityId,
      });
    } catch {
      // Analytics is best-effort after the delivery transaction commits.
    }
  }
  return settled;
}

export type DeliverySuppressionReason = NotificationDeliverySuppressReason;
