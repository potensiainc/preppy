import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { ValidationError } from "@/src/application/errors";
import {
  auditLogs,
  notificationDeliveries,
  notificationDeliveryAttempts,
  outboxEvents,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

import type {
  AdminAuditDTO,
  AdminAuditMetadataDTO,
  AdminDeliveryAttemptDTO,
  AdminDeliveryDTO,
  AdminOutboxDTO,
  AdminPageDTO,
} from "./contracts";

const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 50;
const IDENTIFIER = /^[A-Z][A-Z0-9_]{0,63}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const integerString = /^[1-9][0-9]*$/;
const outboxStatusValues = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
  "CANCELLED",
  "DEAD_LETTER",
] as const;
const deliveryStatusValues = [
  "PENDING",
  "QUEUED",
  "SENT",
  "DELIVERED",
  "OPENED",
  "CLICKED",
  "FAILED",
  "SUPPRESSED",
] as const;

const positiveInteger = (maximum: number) =>
  z.union([
    z.number().int().min(1).max(maximum),
    z
      .string()
      .regex(integerString)
      .transform(Number)
      .pipe(z.number().int().min(1).max(maximum)),
  ]);
const pageShape = {
  page: positiveInteger(MAX_PAGE).optional(),
  pageSize: positiveInteger(MAX_PAGE_SIZE).optional(),
};
const identifier = z.string().regex(IDENTIFIER);

const outboxInputSchema = z
  .object({
    status: z.enum(outboxStatusValues).optional(),
    eventType: identifier.optional(),
    aggregateType: identifier.optional(),
    ...pageShape,
  })
  .strict();
const deliveryInputSchema = z
  .object({
    status: z.enum(deliveryStatusValues).optional(),
    notificationId: z.uuid().optional(),
    ...pageShape,
  })
  .strict();
const auditInputSchema = z
  .object({
    actionType: identifier.optional(),
    entityType: identifier.optional(),
    adminUserId: z.uuid().optional(),
    ...pageShape,
  })
  .strict();

type PageInput<T> = Omit<T, "page" | "pageSize"> & {
  page: number;
  pageSize: number;
};
export type AdminOutboxInput = PageInput<z.output<typeof outboxInputSchema>>;
export type AdminDeliveryInput = PageInput<
  z.output<typeof deliveryInputSchema>
>;
export type AdminAuditInput = PageInput<z.output<typeof auditInputSchema>>;

function parse<T extends { page?: number; pageSize?: number }>(
  schema: z.ZodType<T>,
  value: unknown,
): PageInput<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return {
    ...parsed.data,
    page: parsed.data.page ?? 1,
    pageSize: parsed.data.pageSize ?? 20,
  };
}

export function parseAdminOutboxInput(value: unknown): AdminOutboxInput {
  return parse(outboxInputSchema, value);
}

export function parseAdminDeliveryInput(value: unknown): AdminDeliveryInput {
  return parse(deliveryInputSchema, value);
}

export function parseAdminAuditInput(value: unknown): AdminAuditInput {
  return parse(auditInputSchema, value);
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function safeIdentifierOutput(value: string): string {
  return IDENTIFIER.test(value) ? value : "INVALID_IDENTIFIER";
}

function page<T>(
  items: readonly T[],
  input: Readonly<{ page: number; pageSize: number }>,
  total: number,
): AdminPageDTO<T> {
  return {
    items,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      hasNext: input.page * input.pageSize < total,
    },
  };
}

export async function listAdminOutbox(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<AdminOutboxDTO>> {
  const input = parseAdminOutboxInput(rawInput);
  const conditions = [
    input.status === undefined
      ? undefined
      : eq(outboxEvents.status, input.status),
    input.eventType === undefined
      ? undefined
      : eq(outboxEvents.eventType, input.eventType),
    input.aggregateType === undefined
      ? undefined
      : eq(outboxEvents.aggregateType, input.aggregateType),
  ].filter((condition) => condition !== undefined);
  const where = conditions.length === 0 ? undefined : and(...conditions);
  const [rows, totals] = await Promise.all([
    executor.drizzle
      .select({
        id: outboxEvents.id,
        eventType: sql<string>`left(${outboxEvents.eventType}, 65)`,
        aggregateType: sql<string>`left(${outboxEvents.aggregateType}, 65)`,
        aggregateId: outboxEvents.aggregateId,
        status: outboxEvents.status,
        availableAt: outboxEvents.availableAt,
        processedAt: outboxEvents.processedAt,
        attemptCount: outboxEvents.attemptCount,
        maxAttempts: outboxEvents.maxAttempts,
        lastErrorCode: outboxEvents.lastErrorCode,
        lastErrorAt: outboxEvents.lastErrorAt,
        deadLetteredAt: outboxEvents.deadLetteredAt,
        createdAt: outboxEvents.createdAt,
      })
      .from(outboxEvents)
      .where(where)
      .orderBy(desc(outboxEvents.createdAt), desc(outboxEvents.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(outboxEvents)
      .where(where),
  ]);
  const items = rows.map((row) => ({
    id: row.id,
    eventType: safeIdentifierOutput(row.eventType),
    aggregateType: safeIdentifierOutput(row.aggregateType),
    aggregateId: row.aggregateId,
    status: row.status as AdminOutboxDTO["status"],
    availableAt: iso(row.availableAt)!,
    processedAt: iso(row.processedAt),
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    errorCode: row.lastErrorCode,
    lastErrorAt: iso(row.lastErrorAt),
    deadLetteredAt: iso(row.deadLetteredAt),
    createdAt: iso(row.createdAt)!,
  }));
  return page(items, input, totals[0]?.total ?? 0);
}

function errorCategory(
  status: AdminDeliveryAttemptDTO["status"],
): AdminDeliveryAttemptDTO["errorCategory"] {
  if (status === "FAILED_RETRYABLE") return "RETRYABLE";
  if (status === "FAILED_TERMINAL") return "TERMINAL";
  return "NONE";
}

function safeErrorCode(value: string | null): string | null {
  if (value === null) return null;
  return /^[A-Z0-9][A-Z0-9._:-]{0,127}$/.test(value) ? value : null;
}

async function deliveryAttempts(
  executor: DatabaseExecutor,
  deliveryIds: readonly string[],
): Promise<{
  counts: ReadonlyMap<string, number>;
  latest: ReadonlyMap<string, AdminDeliveryAttemptDTO>;
}> {
  if (deliveryIds.length === 0) {
    return { counts: new Map(), latest: new Map() };
  }
  const latestNumbers = executor.drizzle
    .select({
      deliveryId: notificationDeliveryAttempts.notificationDeliveryId,
      latestAttemptNumber:
        sql<number>`max(${notificationDeliveryAttempts.attemptNumber})::int`.as(
          "latest_attempt_number",
        ),
    })
    .from(notificationDeliveryAttempts)
    .where(
      inArray(notificationDeliveryAttempts.notificationDeliveryId, deliveryIds),
    )
    .groupBy(notificationDeliveryAttempts.notificationDeliveryId)
    .as("latest_delivery_attempt_numbers");
  const [countRows, latestRows] = await Promise.all([
    executor.drizzle
      .select({
        deliveryId: notificationDeliveryAttempts.notificationDeliveryId,
        count: sql<number>`count(*)::int`,
      })
      .from(notificationDeliveryAttempts)
      .where(
        inArray(
          notificationDeliveryAttempts.notificationDeliveryId,
          deliveryIds,
        ),
      )
      .groupBy(notificationDeliveryAttempts.notificationDeliveryId),
    executor.drizzle
      .select({
        deliveryId: notificationDeliveryAttempts.notificationDeliveryId,
        id: notificationDeliveryAttempts.id,
        attemptNumber: notificationDeliveryAttempts.attemptNumber,
        status: notificationDeliveryAttempts.attemptStatus,
        errorCode: notificationDeliveryAttempts.errorCode,
        attemptedAt: notificationDeliveryAttempts.attemptedAt,
        completedAt: notificationDeliveryAttempts.completedAt,
      })
      .from(notificationDeliveryAttempts)
      .innerJoin(
        latestNumbers,
        and(
          eq(
            latestNumbers.deliveryId,
            notificationDeliveryAttempts.notificationDeliveryId,
          ),
          eq(
            latestNumbers.latestAttemptNumber,
            notificationDeliveryAttempts.attemptNumber,
          ),
        ),
      ),
  ]);
  return {
    counts: new Map(countRows.map((row) => [row.deliveryId, row.count])),
    latest: new Map(
      latestRows.map((row) => [
        row.deliveryId,
        {
          id: row.id,
          attemptNumber: row.attemptNumber,
          status: row.status,
          errorCategory: errorCategory(row.status),
          errorCode: safeErrorCode(row.errorCode),
          attemptedAt: iso(row.attemptedAt)!,
          completedAt: iso(row.completedAt),
        },
      ]),
    ),
  };
}

export async function listAdminDeliveries(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<AdminDeliveryDTO>> {
  const input = parseAdminDeliveryInput(rawInput);
  const conditions = [
    input.status === undefined
      ? undefined
      : eq(notificationDeliveries.status, input.status),
    input.notificationId === undefined
      ? undefined
      : eq(notificationDeliveries.notificationId, input.notificationId),
  ].filter((condition) => condition !== undefined);
  const where = conditions.length === 0 ? undefined : and(...conditions);
  const [rows, totals] = await Promise.all([
    executor.drizzle
      .select({
        deliveryId: notificationDeliveries.id,
        notificationId: notificationDeliveries.notificationId,
        channel: notificationDeliveries.channel,
        status: notificationDeliveries.status,
        suppressReason: notificationDeliveries.suppressReason,
        createdAt: notificationDeliveries.createdAt,
        sentAt: notificationDeliveries.sentAt,
        deliveredAt: notificationDeliveries.deliveredAt,
        openedAt: notificationDeliveries.openedAt,
        clickedAt: notificationDeliveries.clickedAt,
        failedAt: notificationDeliveries.failedAt,
        suppressedAt: notificationDeliveries.suppressedAt,
      })
      .from(notificationDeliveries)
      .where(where)
      .orderBy(
        desc(notificationDeliveries.createdAt),
        desc(notificationDeliveries.id),
      )
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(notificationDeliveries)
      .where(where),
  ]);
  const attempts = await deliveryAttempts(
    executor,
    rows.map((row) => row.deliveryId),
  );
  const items = rows.map((row) => ({
    deliveryId: row.deliveryId,
    notificationId: row.notificationId,
    channel: row.channel,
    status: row.status,
    suppressReason: row.suppressReason,
    createdAt: iso(row.createdAt)!,
    terminalAt: iso(
      row.clickedAt ??
        row.openedAt ??
        row.deliveredAt ??
        row.sentAt ??
        row.failedAt ??
        row.suppressedAt,
    ),
    attemptCount: attempts.counts.get(row.deliveryId) ?? 0,
    latestAttempt: attempts.latest.get(row.deliveryId) ?? null,
  }));
  return page(items, input, totals[0]?.total ?? 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown, pattern: RegExp): string | null {
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function boundedVersion(value: string | null): number | undefined {
  if (value === null || !/^\d{1,10}$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= 2_147_483_647
    ? parsed
    : undefined;
}

function auditMetadata(value: unknown): AdminAuditMetadataDTO {
  if (!isRecord(value)) return {};
  const result: {
    expectedVersion?: number;
    actualVersion?: number;
    sourceId?: string;
    observationId?: string;
    changedFields?: string[];
    outcomeCode?: string;
    moveMode?: string;
    targetId?: string;
    versionId?: string;
    changeId?: string;
  } = {};
  for (const key of ["expectedVersion", "actualVersion"] as const) {
    const candidate = value[key];
    if (
      typeof candidate === "number" &&
      Number.isSafeInteger(candidate) &&
      candidate >= 0 &&
      candidate <= 2_147_483_647
    ) {
      result[key] = candidate;
    }
  }
  for (const key of [
    "sourceId",
    "targetId",
    "versionId",
    "changeId",
  ] as const) {
    const candidate = safeString(value[key], UUID);
    if (candidate !== null) result[key] = candidate;
  }
  const observationId = value.observationId;
  if (
    typeof observationId === "string" &&
    (UUID.test(observationId) || /^[1-9]\d{0,18}$/.test(observationId))
  ) {
    result.observationId = observationId;
  }
  for (const key of ["outcomeCode", "moveMode"] as const) {
    const candidate = safeString(value[key], IDENTIFIER);
    if (candidate !== null) result[key] = candidate;
  }
  if (
    Array.isArray(value.changedFields) &&
    value.changedFields.length <= 20 &&
    value.changedFields.every(
      (candidate) =>
        typeof candidate === "string" && IDENTIFIER.test(candidate),
    )
  ) {
    result.changedFields = [...value.changedFields];
  }
  return result;
}

function auditContext(value: unknown): Readonly<{
  correlationId: string | null;
  reason: string | null;
  metadata: AdminAuditMetadataDTO;
}> {
  if (!isRecord(value)) {
    return { correlationId: null, reason: null, metadata: {} };
  }
  return {
    correlationId: safeString(value.correlationId, UUID),
    reason: safeString(value.reason, IDENTIFIER),
    metadata: auditMetadata(value.metadata),
  };
}

export async function listAdminAudit(
  executor: DatabaseExecutor,
  rawInput: unknown,
): Promise<AdminPageDTO<AdminAuditDTO>> {
  const input = parseAdminAuditInput(rawInput);
  const conditions = [
    input.actionType === undefined
      ? undefined
      : eq(auditLogs.actionType, input.actionType),
    input.entityType === undefined
      ? undefined
      : eq(auditLogs.entityType, input.entityType),
    input.adminUserId === undefined
      ? undefined
      : eq(auditLogs.adminUserId, input.adminUserId),
  ].filter((condition) => condition !== undefined);
  const where = conditions.length === 0 ? undefined : and(...conditions);
  const [rows, totals] = await Promise.all([
    executor.drizzle
      .select({
        id: auditLogs.id,
        adminUserId: auditLogs.adminUserId,
        actionType: sql<string>`left(${auditLogs.actionType}, 65)`,
        entityType: sql<string>`left(${auditLogs.entityType}, 65)`,
        entityId: auditLogs.entityId,
        correlationId: sql<
          string | null
        >`left(${auditLogs.afterData} ->> 'correlationId', 37)`,
        reason: sql<
          string | null
        >`left(${auditLogs.afterData} ->> 'reason', 65)`,
        expectedVersion: sql<
          string | null
        >`left(${auditLogs.afterData} #>> '{metadata,expectedVersion}', 11)`,
        actualVersion: sql<
          string | null
        >`left(${auditLogs.afterData} #>> '{metadata,actualVersion}', 11)`,
        sourceId: sql<
          string | null
        >`left(${auditLogs.afterData} #>> '{metadata,sourceId}', 37)`,
        observationId: sql<
          string | null
        >`left(${auditLogs.afterData} #>> '{metadata,observationId}', 37)`,
        changedFields: sql<unknown>`case
          when jsonb_typeof(${auditLogs.afterData} #> '{metadata,changedFields}') = 'array'
          then case
            when jsonb_array_length(${auditLogs.afterData} #> '{metadata,changedFields}') <= 20
            then (
              select coalesce(
                jsonb_agg(left(element.value #>> '{}', 65) order by element.ordinality),
                '[]'::jsonb
              )
              from jsonb_array_elements(
                ${auditLogs.afterData} #> '{metadata,changedFields}'
              ) with ordinality as element(value, ordinality)
            )
            else null
          end
          else null
        end`,
        outcomeCode: sql<
          string | null
        >`left(${auditLogs.afterData} #>> '{metadata,outcomeCode}', 65)`,
        moveMode: sql<
          string | null
        >`left(${auditLogs.afterData} #>> '{metadata,moveMode}', 65)`,
        targetId: sql<
          string | null
        >`left(${auditLogs.afterData} #>> '{metadata,targetId}', 37)`,
        versionId: sql<
          string | null
        >`left(${auditLogs.afterData} #>> '{metadata,versionId}', 37)`,
        changeId: sql<
          string | null
        >`left(${auditLogs.afterData} #>> '{metadata,changeId}', 37)`,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    executor.drizzle
      .select({ total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where),
  ]);
  const items = rows.map((row) => {
    const context = auditContext({
      correlationId: row.correlationId,
      reason: row.reason,
      metadata: {
        expectedVersion: boundedVersion(row.expectedVersion),
        actualVersion: boundedVersion(row.actualVersion),
        sourceId: row.sourceId,
        observationId: row.observationId,
        changedFields: row.changedFields,
        outcomeCode: row.outcomeCode,
        moveMode: row.moveMode,
        targetId: row.targetId,
        versionId: row.versionId,
        changeId: row.changeId,
      },
    });
    return {
      id: String(row.id),
      actor: { adminUserId: row.adminUserId },
      action: safeIdentifierOutput(row.actionType),
      entityType: safeIdentifierOutput(row.entityType),
      entityId: row.entityId,
      reason: context.reason,
      correlationId: context.correlationId,
      metadata: context.metadata,
      createdAt: iso(row.createdAt)!,
    };
  });
  return page(items, input, totals[0]?.total ?? 0);
}
