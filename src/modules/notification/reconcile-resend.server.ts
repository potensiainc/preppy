import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import type { AnalyticsTracker } from "@/src/analytics/tracker";
import { AuditWriter } from "@/src/application/audit-writer.server";
import type { AdminCommandContext } from "@/src/application/context";
import { ConflictError, ValidationError } from "@/src/application/errors";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import { renderOpportunityChangeEmail } from "@/src/modules/notification/email-renderer.server";
import type { EmailSender } from "@/src/modules/notification/email-sender";
import { evaluateDeliveryEligibility } from "@/src/modules/notification/eligibility.server";
import { parseOutboxPayload } from "@/src/modules/outbox/events";

export const RESEND_IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1_000;

const inputSchema = z
  .object({ deliveryId: z.uuid(), expectedAttemptId: z.uuid() })
  .strict();
const contextSchema = z
  .object({
    adminUserId: z.uuid(),
    correlationId: z.uuid(),
    occurredAt: z.date(),
    reason: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{0,63}$/)
      .optional(),
  })
  .strict();

export type ReconcileUnknownResendAttemptDependencies = Readonly<{
  transactionManager: Pick<TransactionManager, "run">;
  sender: EmailSender;
  tracker: AnalyticsTracker;
  appBaseUrl?: string;
}>;

type Preflight = Readonly<{
  attemptId: string;
  attemptNumber: number;
  eventId: string;
  deliveryId: string;
  notificationId: string;
  opportunityId: string;
  message: ReturnType<typeof renderOpportunityChangeEmail>;
}>;

export async function reconcileUnknownResendAttempt(
  rawContext: AdminCommandContext,
  rawInput: unknown,
  dependencies: ReconcileUnknownResendAttemptDependencies,
) {
  const contextResult = contextSchema.safeParse(rawContext);
  const inputResult = inputSchema.safeParse(rawInput);
  if (!contextResult.success || !inputResult.success) {
    throw ValidationError.invalidRequest();
  }
  const context = contextResult.data;
  const input = inputResult.data;
  if (
    dependencies.sender.provider !== "RESEND" ||
    dependencies.sender.describeRequest === undefined
  ) {
    throw new ConflictError();
  }

  const preflight = await dependencies.transactionManager.run(
    async (executor): Promise<Preflight> => {
      const [row] = (await executor.raw(sql`
        select attempt.id as "attemptId", attempt.attempt_number as "attemptNumber",
          attempt.attempted_at as "attemptedAt",
          attempt.provider, attempt.attempt_status as "attemptStatus",
          attempt.error_code as "attemptErrorCode",
          delivery.id as "deliveryId", delivery.status as "deliveryStatus",
          delivery.recipient_hash as "recipientHash",
          event.id as "eventId", event.status as "eventStatus",
          event.last_error_code as "eventErrorCode", event.payload
        from notification_delivery_attempts attempt
        join notification_deliveries delivery
          on delivery.id=attempt.notification_delivery_id
        join outbox_events event
          on event.event_type='DELIVERY_EMAIL_SEND'
          and event.aggregate_type='NOTIFICATION_DELIVERY'
          and event.aggregate_id=delivery.id
        where delivery.id=${input.deliveryId}
          and attempt.id=${input.expectedAttemptId}
        for update of attempt, delivery, event
      `)) as unknown as Array<{
        attemptId: string;
        attemptNumber: number;
        attemptedAt: Date | string;
        provider: string;
        attemptStatus: string;
        attemptErrorCode: string | null;
        deliveryId: string;
        deliveryStatus: string;
        recipientHash: string | null;
        eventId: string;
        eventStatus: string;
        eventErrorCode: string | null;
        payload: unknown;
      }>;
      if (
        !row ||
        row.provider !== "RESEND" ||
        row.attemptStatus !== "STARTED" ||
        row.attemptErrorCode !== "PROVIDER_RESULT_UNKNOWN" ||
        row.deliveryStatus !== "QUEUED" ||
        row.eventStatus !== "FAILED" ||
        row.eventErrorCode !== "PROVIDER_RESULT_UNKNOWN"
      ) {
        throw new ConflictError();
      }
      const attemptedAt = new Date(row.attemptedAt);
      if (
        !Number.isFinite(attemptedAt.getTime()) ||
        context.occurredAt.getTime() < attemptedAt.getTime() ||
        context.occurredAt.getTime() >=
          attemptedAt.getTime() + RESEND_IDEMPOTENCY_RETENTION_MS
      ) {
        throw new ConflictError();
      }
      const payload = parseOutboxPayload("DELIVERY_EMAIL_SEND", row.payload);
      if (
        !payload?.providerRequest ||
        payload.deliveryId !== input.deliveryId ||
        payload.providerRequest.provider !== "RESEND"
      ) {
        throw new ConflictError();
      }
      const eligibility = await evaluateDeliveryEligibility(
        executor,
        input.deliveryId,
      );
      if (!eligibility?.eligible) throw new ConflictError();
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
      const identity = dependencies.sender.describeRequest!(message, {
        deliveryId: input.deliveryId,
        attemptNumber: row.attemptNumber,
      });
      if (
        identity.provider !== "RESEND" ||
        identity.version !== payload.providerRequest.version ||
        identity.idempotencyKey !== payload.providerRequest.idempotencyKey ||
        identity.payloadHash !== payload.providerRequest.payloadHash ||
        identity.recipientHash !== row.recipientHash
      ) {
        throw new ConflictError();
      }
      return {
        attemptId: row.attemptId,
        attemptNumber: row.attemptNumber,
        eventId: row.eventId,
        deliveryId: row.deliveryId,
        notificationId: eligibility.notificationId,
        opportunityId: eligibility.opportunityId,
        message,
      };
    },
  );

  const providerResult = await dependencies.sender
    .send(preflight.message, {
      deliveryId: preflight.deliveryId,
      attemptNumber: preflight.attemptNumber,
    })
    .catch(() => undefined);

  if (
    providerResult?.kind === "ACCEPTED" &&
    providerResult.provider === "RESEND" &&
    providerResult.providerMessageId !== undefined &&
    /^[\x21-\x7e]{1,255}$/.test(providerResult.providerMessageId)
  ) {
    await dependencies.transactionManager.run(async (executor) => {
      const completedAt = context.occurredAt.toISOString();
      const updatedAttempts = (await executor.raw(sql`
        update notification_delivery_attempts
        set attempt_status='ACCEPTED',
          provider_message_id=${providerResult.providerMessageId},
          error_code=null, error_message_safe=null,
          completed_at=${completedAt}::timestamptz
        where id=${preflight.attemptId}
          and notification_delivery_id=${preflight.deliveryId}
          and provider='RESEND' and attempt_status='STARTED'
          and error_code='PROVIDER_RESULT_UNKNOWN'
        returning id
      `)) as unknown as Array<{ id: string }>;
      const updatedDeliveries = (await executor.raw(sql`
        update notification_deliveries
        set status='SENT', sent_at=${completedAt}::timestamptz
        where id=${preflight.deliveryId} and status='QUEUED'
        returning id
      `)) as unknown as Array<{ id: string }>;
      const updatedEvents = (await executor.raw(sql`
        update outbox_events
        set status='PROCESSED', processed_at=${completedAt}::timestamptz,
          locked_at=null, locked_by=null, last_error_code=null,
          last_error_at=null, dead_lettered_at=null
        where id=${preflight.eventId} and status='FAILED'
          and last_error_code='PROVIDER_RESULT_UNKNOWN'
        returning id
      `)) as unknown as Array<{ id: string }>;
      if (
        updatedAttempts.length !== 1 ||
        updatedDeliveries.length !== 1 ||
        updatedEvents.length !== 1
      ) {
        throw new ConflictError();
      }
      await AuditWriter.write(
        {
          adminUserId: context.adminUserId,
          actionType: "WP12B_RECONCILE_RESEND",
          entityType: "NOTIFICATION_DELIVERY",
          entityId: preflight.deliveryId,
          correlationId: context.correlationId,
          ...(context.reason === undefined ? {} : { reason: context.reason }),
          occurredAt: context.occurredAt,
          metadata: {
            targetId: preflight.attemptId,
            outcomeCode: "RECONCILED",
          },
        },
        executor,
      );
    });
    try {
      await dependencies.tracker.track("notification_sent", {
        notificationId: preflight.notificationId,
        opportunityId: preflight.opportunityId,
      });
    } catch {
      // Analytics remains best-effort after canonical settlement commits.
    }
    return {
      kind: "RECONCILED",
      deliveryId: preflight.deliveryId,
      attemptId: preflight.attemptId,
      providerMessageId: providerResult.providerMessageId,
    } as const;
  }

  await dependencies.transactionManager.run((executor) =>
    AuditWriter.write(
      {
        adminUserId: context.adminUserId,
        actionType: "WP12B_RECONCILE_RESEND",
        entityType: "NOTIFICATION_DELIVERY",
        entityId: preflight.deliveryId,
        correlationId: context.correlationId,
        ...(context.reason === undefined ? {} : { reason: context.reason }),
        occurredAt: context.occurredAt,
        metadata: {
          targetId: preflight.attemptId,
          outcomeCode: "STILL_UNRESOLVED",
        },
      },
      executor,
    ),
  );
  return {
    kind: "STILL_UNRESOLVED",
    deliveryId: preflight.deliveryId,
    attemptId: preflight.attemptId,
  } as const;
}
