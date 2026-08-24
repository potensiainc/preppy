import "server-only";

import { sql } from "drizzle-orm";

import { ConflictError, ValidationError } from "@/src/application/errors";
import type {
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import {
  isSupportedOutboxEventType,
  supportedOutboxEventTypes,
  type SupportedOutboxEventType,
} from "@/src/modules/outbox/events";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ERROR_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._:-]{0,127}$/;
const MAX_BATCH_SIZE = 100;

export type ClaimedOutboxEvent = Readonly<{
  id: string;
  eventType: SupportedOutboxEventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number | null;
  availableAt: Date;
  createdAt: Date;
  lockedAt: Date;
  lockedBy: string;
}>;

export type ClaimOutboxBatchInput = Readonly<{
  eventTypes: readonly SupportedOutboxEventType[];
  limit: number;
  workerId: string;
  now: Date;
}>;

export type OutboxTransitionInput = Readonly<{
  eventId: string;
  workerId: string;
  now: Date;
  errorCode?: string;
}>;

export type RescheduleOutboxEventInput = OutboxTransitionInput &
  Readonly<{ availableAt: Date; errorCode: string }>;

export type RecoverStaleOutboxLeasesInput = Readonly<{
  cutoff: Date;
  now: Date;
  limit: number;
}>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  const keys = Object.keys(value);
  return keys.every((key) => allowed.includes(key));
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function validWorkerId(value: unknown): value is string {
  return typeof value === "string" && WORKER_ID_PATTERN.test(value);
}

function validErrorCode(value: unknown): value is string {
  return typeof value === "string" && ERROR_CODE_PATTERN.test(value);
}

export function parseClaimOutboxBatchInput(
  input: unknown,
): ClaimOutboxBatchInput | null {
  if (
    !isPlainRecord(input) ||
    !hasOnlyKeys(input, ["eventTypes", "limit", "workerId", "now"]) ||
    !Array.isArray(input.eventTypes) ||
    input.eventTypes.length === 0 ||
    input.eventTypes.length > supportedOutboxEventTypes.length ||
    new Set(input.eventTypes).size !== input.eventTypes.length ||
    !input.eventTypes.every(isSupportedOutboxEventType) ||
    !Number.isSafeInteger(input.limit) ||
    (input.limit as number) < 1 ||
    (input.limit as number) > MAX_BATCH_SIZE ||
    !validWorkerId(input.workerId) ||
    !validDate(input.now)
  ) {
    return null;
  }
  return {
    eventTypes: [...input.eventTypes],
    limit: input.limit as number,
    workerId: input.workerId,
    now: new Date(input.now),
  };
}

export function parseOutboxTransitionInput(
  input: unknown,
): OutboxTransitionInput | null {
  if (
    !isPlainRecord(input) ||
    !hasOnlyKeys(input, ["eventId", "workerId", "now", "errorCode"]) ||
    typeof input.eventId !== "string" ||
    !UUID_PATTERN.test(input.eventId) ||
    !validWorkerId(input.workerId) ||
    !validDate(input.now) ||
    (input.errorCode !== undefined && !validErrorCode(input.errorCode))
  ) {
    return null;
  }
  return {
    eventId: input.eventId,
    workerId: input.workerId,
    now: new Date(input.now),
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
  };
}

function parseRescheduleInput(
  input: unknown,
): RescheduleOutboxEventInput | null {
  if (
    !isPlainRecord(input) ||
    !hasOnlyKeys(input, [
      "eventId",
      "workerId",
      "now",
      "errorCode",
      "availableAt",
    ]) ||
    !validDate(input.availableAt)
  ) {
    return null;
  }
  const transition = parseOutboxTransitionInput({
    eventId: input.eventId,
    workerId: input.workerId,
    now: input.now,
    errorCode: input.errorCode,
  });
  if (!transition?.errorCode) return null;
  return {
    eventId: transition.eventId,
    workerId: transition.workerId,
    now: transition.now,
    errorCode: transition.errorCode,
    availableAt: new Date(input.availableAt),
  };
}

function parseRecoveryInput(
  input: unknown,
): RecoverStaleOutboxLeasesInput | null {
  if (
    !isPlainRecord(input) ||
    !hasOnlyKeys(input, ["cutoff", "now", "limit"]) ||
    !validDate(input.cutoff) ||
    !validDate(input.now) ||
    !Number.isSafeInteger(input.limit) ||
    (input.limit as number) < 1 ||
    (input.limit as number) > MAX_BATCH_SIZE
  ) {
    return null;
  }
  return {
    cutoff: new Date(input.cutoff),
    now: new Date(input.now),
    limit: input.limit as number,
  };
}

function requireTransition(input: unknown): OutboxTransitionInput {
  const parsed = parseOutboxTransitionInput(input);
  if (!parsed) throw ValidationError.invalidRequest();
  return parsed;
}

async function requireOwnedProcessingUpdate(
  executor: TransactionExecutor,
  query: ReturnType<typeof sql>,
) {
  const rows = (await executor.raw(query)) as unknown as Array<{ id: string }>;
  if (rows.length !== 1) throw new ConflictError();
  return rows[0]!;
}

export async function claimOutboxBatch(
  transactionManager: Pick<TransactionManager, "run">,
  input: ClaimOutboxBatchInput,
): Promise<ClaimedOutboxEvent[]> {
  const parsed = parseClaimOutboxBatchInput(input);
  if (!parsed) throw ValidationError.invalidRequest();
  const eventTypes = sql.join(
    parsed.eventTypes.map((eventType) => sql`${eventType}`),
    sql`, `,
  );
  const nowIso = parsed.now.toISOString();

  return transactionManager.run(async (executor) => {
    const rows = (await executor.raw(sql`
      with due as (
        select id
        from outbox_events
        where status = 'PENDING'
          and available_at <= ${nowIso}::timestamptz
          and event_type in (${eventTypes})
        order by available_at asc, created_at asc, id asc
        for update skip locked
        limit ${parsed.limit}
      ), claimed as (
        update outbox_events as event
        set status = 'PROCESSING',
            locked_at = ${nowIso}::timestamptz,
            locked_by = ${parsed.workerId},
            attempt_count = event.attempt_count + 1
        from due
        where event.id = due.id
        returning event.id,
          event.event_type as "eventType",
          event.aggregate_type as "aggregateType",
          event.aggregate_id as "aggregateId",
          event.payload,
          event.attempt_count as "attemptCount",
          event.max_attempts as "maxAttempts",
          event.available_at as "availableAt",
          event.created_at as "createdAt",
          event.locked_at as "lockedAt",
          event.locked_by as "lockedBy"
      )
      select * from claimed
      order by "availableAt" asc, "createdAt" asc, id asc
    `)) as unknown as ClaimedOutboxEvent[];
    return rows;
  });
}

export async function completeOutboxEvent(
  executor: TransactionExecutor,
  input: OutboxTransitionInput,
) {
  const parsed = requireTransition(input);
  const nowIso = parsed.now.toISOString();
  return requireOwnedProcessingUpdate(
    executor,
    sql`
      update outbox_events
      set status='PROCESSED', processed_at=${nowIso}::timestamptz, locked_at=null,
          locked_by=null, last_error_code=null, last_error_at=null,
          dead_lettered_at=null
      where id=${parsed.eventId} and status='PROCESSING'
        and locked_by=${parsed.workerId}
      returning id
    `,
  );
}

export async function rescheduleOutboxEvent(
  executor: TransactionExecutor,
  input: RescheduleOutboxEventInput,
) {
  const parsed = parseRescheduleInput(input);
  if (!parsed) throw ValidationError.invalidRequest();
  const nowIso = parsed.now.toISOString();
  const availableAtIso = parsed.availableAt.toISOString();
  return requireOwnedProcessingUpdate(
    executor,
    sql`
      update outbox_events
      set status='PENDING', available_at=${availableAtIso}::timestamptz, processed_at=null,
          locked_at=null, locked_by=null, last_error_code=${parsed.errorCode},
          last_error_at=${nowIso}::timestamptz, dead_lettered_at=null
      where id=${parsed.eventId} and status='PROCESSING'
        and locked_by=${parsed.workerId}
        and max_attempts is not null
        and attempt_count < max_attempts
      returning id
    `,
  );
}

export async function failOutboxEvent(
  executor: TransactionExecutor,
  input: OutboxTransitionInput & { readonly errorCode: string },
) {
  const parsed = requireTransition(input);
  if (!parsed.errorCode) throw ValidationError.invalidRequest();
  const nowIso = parsed.now.toISOString();
  return requireOwnedProcessingUpdate(
    executor,
    sql`
      update outbox_events
      set status='FAILED', processed_at=null, locked_at=null, locked_by=null,
          last_error_code=${parsed.errorCode}, last_error_at=${nowIso}::timestamptz,
          dead_lettered_at=null
      where id=${parsed.eventId} and status='PROCESSING'
        and locked_by=${parsed.workerId}
      returning id
    `,
  );
}

export async function deadLetterOutboxEvent(
  executor: TransactionExecutor,
  input: OutboxTransitionInput & { readonly errorCode: string },
) {
  const parsed = requireTransition(input);
  if (!parsed.errorCode) throw ValidationError.invalidRequest();
  const nowIso = parsed.now.toISOString();
  return requireOwnedProcessingUpdate(
    executor,
    sql`
      update outbox_events
      set status='DEAD_LETTER', processed_at=null, locked_at=null,
          locked_by=null, last_error_code=${parsed.errorCode},
          last_error_at=${nowIso}::timestamptz,
          dead_lettered_at=${nowIso}::timestamptz
      where id=${parsed.eventId} and status='PROCESSING'
        and locked_by=${parsed.workerId}
      returning id
    `,
  );
}

export async function recoverStaleOutboxLeases(
  transactionManager: Pick<TransactionManager, "run">,
  input: RecoverStaleOutboxLeasesInput,
): Promise<{ pending: number; failed: number; deadLettered: number }> {
  const parsed = parseRecoveryInput(input);
  if (!parsed) throw ValidationError.invalidRequest();
  const cutoffIso = parsed.cutoff.toISOString();
  const nowIso = parsed.now.toISOString();
  const eventTypes = sql.join(
    supportedOutboxEventTypes.map((eventType) => sql`${eventType}`),
    sql`, `,
  );

  return transactionManager.run(async (executor) => {
    const [counts] = (await executor.raw(sql`
      with stale as (
        select event.id, event.event_type, event.aggregate_id,
          event.attempt_count, event.max_attempts,
          exists (
            select 1
            from notification_delivery_attempts as attempt
            where attempt.notification_delivery_id = event.aggregate_id
              and attempt.attempt_status = 'STARTED'
          ) as unresolved_attempt
        from outbox_events as event
        where event.status = 'PROCESSING'
          and event.locked_at < ${cutoffIso}::timestamptz
          and event.event_type in (${eventTypes})
        order by event.locked_at asc, event.id asc
        for update of event skip locked
        limit ${parsed.limit}
      ), recovered as (
        update outbox_events as event
        set status = case
              when stale.event_type = 'DELIVERY_EMAIL_SEND'
                and stale.unresolved_attempt then 'FAILED'
              when stale.max_attempts is not null
                and stale.attempt_count >= stale.max_attempts then 'DEAD_LETTER'
              else 'PENDING'
            end,
            available_at = case
              when stale.event_type = 'DELIVERY_EMAIL_SEND'
                and stale.unresolved_attempt then event.available_at
              else ${nowIso}::timestamptz
            end,
            processed_at = null,
            locked_at = null,
            locked_by = null,
            last_error_code = case
              when stale.event_type = 'DELIVERY_EMAIL_SEND'
                and stale.unresolved_attempt
                then 'UNRESOLVED_DELIVERY_ATTEMPT'
              else 'WORKER_LEASE_EXPIRED'
            end,
            last_error_at = ${nowIso}::timestamptz,
            dead_lettered_at = case
              when not (
                stale.event_type = 'DELIVERY_EMAIL_SEND'
                and stale.unresolved_attempt
              ) and stale.max_attempts is not null
                and stale.attempt_count >= stale.max_attempts
                then ${nowIso}::timestamptz
              else null
            end
        from stale
        where event.id = stale.id
        returning event.status
      )
      select
        count(*) filter (where status='PENDING')::int as pending,
        count(*) filter (where status='FAILED')::int as failed,
        count(*) filter (where status='DEAD_LETTER')::int as "deadLettered"
      from recovered
    `)) as unknown as Array<{
      pending: number;
      failed: number;
      deadLettered: number;
    }>;
    return counts ?? { pending: 0, failed: 0, deadLettered: 0 };
  });
}
