import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { AuditWriter } from "@/src/application/audit-writer.server";
import type { AdminCommandContext } from "@/src/application/context";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/src/application/errors";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import { RESEND_IDEMPOTENCY_RETENTION_MS } from "@/src/modules/notification/reconcile-resend.server";
import { parseOutboxPayload } from "@/src/modules/outbox/events";

const statusValues = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
  "CANCELLED",
  "DEAD_LETTER",
] as const;

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
const inputSchema = z
  .object({
    eventId: z.uuid(),
    expectedStatus: z.enum(statusValues),
    expectedAttemptCount: z.number().int().min(0).max(2_147_483_647),
  })
  .strict();

type AdminOutboxCommandInput = z.output<typeof inputSchema>;
type AdminOutboxCommandDependencies = Readonly<{
  transactionManager: Pick<TransactionManager, "run">;
}>;

type LockedEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  status: string;
  attemptCount: number;
  lockedAt: Date | string | null;
  lockedBy: string | null;
  deliveryStatus: string | null;
  startedAttempts: number;
  acceptedAttempts: number;
  latestAttemptStatus: string | null;
  latestAttemptProvider: string | null;
  latestAttemptedAt: Date | string | null;
};

function parseCommand(
  rawContext: AdminCommandContext,
  rawInput: unknown,
): { context: z.output<typeof contextSchema>; input: AdminOutboxCommandInput } {
  const context = contextSchema.safeParse(rawContext);
  const input = inputSchema.safeParse(rawInput);
  if (!context.success || !input.success) {
    throw ValidationError.invalidRequest();
  }
  return { context: context.data, input: input.data };
}

async function lockEvent(
  executor: Parameters<Parameters<TransactionManager["run"]>[0]>[0],
  input: AdminOutboxCommandInput,
): Promise<LockedEvent> {
  const [event] = (await executor.raw(sql`
    select event.id, event.event_type as "eventType",
      event.aggregate_type as "aggregateType",
      event.aggregate_id as "aggregateId", event.payload, event.status,
      event.attempt_count as "attemptCount", event.locked_at as "lockedAt",
      event.locked_by as "lockedBy", delivery.status as "deliveryStatus",
      coalesce(attempts.started, 0)::int as "startedAttempts",
      coalesce(attempts.accepted, 0)::int as "acceptedAttempts",
      latest.attempt_status as "latestAttemptStatus",
      latest.provider as "latestAttemptProvider",
      latest.attempted_at as "latestAttemptedAt"
    from outbox_events event
    left join notification_deliveries delivery
      on event.event_type='DELIVERY_EMAIL_SEND'
      and delivery.id=event.aggregate_id
    left join lateral (
      select count(*) filter (where attempt_status='STARTED') as started,
        count(*) filter (where attempt_status='ACCEPTED') as accepted
      from notification_delivery_attempts
      where notification_delivery_id=delivery.id
    ) attempts on true
    left join lateral (
      select attempt_status, provider, attempted_at
      from notification_delivery_attempts
      where notification_delivery_id=delivery.id
      order by attempt_number desc limit 1
    ) latest on true
    where event.id=${input.eventId}
    for update of event
  `)) as unknown as LockedEvent[];
  if (!event) throw new NotFoundError();
  if (
    event.status !== input.expectedStatus ||
    event.attemptCount !== input.expectedAttemptCount
  ) {
    throw new ConflictError();
  }
  return event;
}

async function writeAudit(
  executor: Parameters<Parameters<TransactionManager["run"]>[0]>[0],
  context: z.output<typeof contextSchema>,
  input: AdminOutboxCommandInput,
  actionType: "WP12B_RETRY_OUTBOX" | "WP12B_CANCEL_OUTBOX",
  outcomeCode: "RETRIED" | "CANCELLED",
) {
  await AuditWriter.write(
    {
      adminUserId: context.adminUserId,
      actionType,
      entityType: "OUTBOX_EVENT",
      entityId: input.eventId,
      correlationId: context.correlationId,
      ...(context.reason === undefined ? {} : { reason: context.reason }),
      occurredAt: context.occurredAt,
      metadata: {
        expectedVersion: input.expectedAttemptCount,
        outcomeCode,
      },
    },
    executor,
  );
}

export async function retryAdminOutboxEvent(
  rawContext: AdminCommandContext,
  rawInput: unknown,
  dependencies: AdminOutboxCommandDependencies,
) {
  const { context, input } = parseCommand(rawContext, rawInput);
  return dependencies.transactionManager.run(async (executor) => {
    const event = await lockEvent(executor, input);
    if (
      !["FAILED", "DEAD_LETTER"].includes(event.status) ||
      event.lockedAt !== null ||
      event.lockedBy !== null
    ) {
      throw new ConflictError();
    }

    if (event.eventType === "DELIVERY_EMAIL_SEND") {
      const payload = parseOutboxPayload(event.eventType, event.payload);
      const attemptedAt =
        event.latestAttemptedAt === null
          ? null
          : new Date(event.latestAttemptedAt);
      if (
        event.aggregateType !== "NOTIFICATION_DELIVERY" ||
        !payload?.providerRequest ||
        payload.providerRequest.provider !== "RESEND" ||
        event.startedAttempts !== 0 ||
        event.acceptedAttempts !== 0 ||
        event.latestAttemptStatus !== "FAILED_RETRYABLE" ||
        event.latestAttemptProvider !== "RESEND" ||
        attemptedAt === null ||
        !Number.isFinite(attemptedAt.getTime()) ||
        context.occurredAt.getTime() < attemptedAt.getTime() ||
        context.occurredAt.getTime() >=
          attemptedAt.getTime() + RESEND_IDEMPOTENCY_RETENTION_MS ||
        !["QUEUED", "FAILED"].includes(event.deliveryStatus ?? "")
      ) {
        throw new ConflictError();
      }
      await executor.raw(sql`
        update notification_deliveries
        set status='QUEUED', failed_at=null
        where id=${event.aggregateId} and status in ('QUEUED', 'FAILED')
      `);
    } else if (
      event.eventType !== "OPPORTUNITY_CHANGE_PUBLISHED" ||
      event.aggregateType !== "OPPORTUNITY_CHANGE"
    ) {
      throw new ConflictError();
    }

    const now = context.occurredAt.toISOString();
    const updated = (await executor.raw(sql`
      update outbox_events
      set status='PENDING', available_at=${now}::timestamptz,
        processed_at=null, locked_at=null, locked_by=null,
        last_error_code=null, last_error_at=null, dead_lettered_at=null
      where id=${input.eventId} and status=${event.status}
        and attempt_count=${input.expectedAttemptCount}
      returning id
    `)) as unknown as Array<{ id: string }>;
    if (updated.length !== 1) throw new ConflictError();
    await writeAudit(executor, context, input, "WP12B_RETRY_OUTBOX", "RETRIED");
    return { kind: "RETRIED", eventId: input.eventId } as const;
  });
}

export async function cancelAdminOutboxEvent(
  rawContext: AdminCommandContext,
  rawInput: unknown,
  dependencies: AdminOutboxCommandDependencies,
) {
  const { context, input } = parseCommand(rawContext, rawInput);
  return dependencies.transactionManager.run(async (executor) => {
    const event = await lockEvent(executor, input);
    if (
      !["PENDING", "FAILED", "DEAD_LETTER"].includes(event.status) ||
      event.lockedAt !== null ||
      event.lockedBy !== null
    ) {
      throw new ConflictError();
    }
    if (
      event.eventType === "DELIVERY_EMAIL_SEND" &&
      (event.aggregateType !== "NOTIFICATION_DELIVERY" ||
        event.startedAttempts !== 0 ||
        event.acceptedAttempts !== 0)
    ) {
      throw new ConflictError();
    }
    if (
      event.eventType !== "DELIVERY_EMAIL_SEND" &&
      (event.eventType !== "OPPORTUNITY_CHANGE_PUBLISHED" ||
        event.aggregateType !== "OPPORTUNITY_CHANGE")
    ) {
      throw new ConflictError();
    }

    const now = context.occurredAt.toISOString();
    if (event.eventType === "DELIVERY_EMAIL_SEND") {
      await executor.raw(sql`
        update notification_deliveries
        set status='SUPPRESSED', suppress_reason='OTHER',
          suppressed_at=${now}::timestamptz
        where id=${event.aggregateId} and status in ('PENDING', 'QUEUED')
      `);
    }
    const updated = (await executor.raw(sql`
      update outbox_events
      set status='CANCELLED', processed_at=${now}::timestamptz,
        locked_at=null, locked_by=null, last_error_code=null,
        last_error_at=null, dead_lettered_at=null
      where id=${input.eventId} and status=${event.status}
        and attempt_count=${input.expectedAttemptCount}
      returning id
    `)) as unknown as Array<{ id: string }>;
    if (updated.length !== 1) throw new ConflictError();
    await writeAudit(
      executor,
      context,
      input,
      "WP12B_CANCEL_OUTBOX",
      "CANCELLED",
    );
    return { kind: "CANCELLED", eventId: input.eventId } as const;
  });
}
