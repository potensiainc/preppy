import "server-only";

import { z } from "zod";

import { ValidationError } from "@/src/application/errors";
import {
  institutionSourceBindingRoleValues,
  opportunitySourceBindingRoleValues,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import {
  monitoringDueStateValues,
  monitoringPriorityValues,
  monitoringQueueFilterSchema,
  monitoringTargetTypeValues,
  type MonitoringDueState,
  type MonitoringPriority,
  type MonitoringQueueFilter,
  type MonitoringTargetType,
  type MonitoringTruthSummary,
} from "@/src/modules/monitoring/contracts";
import {
  getMonitoringQueuePage,
  MONITORING_QUEUE_MAX_PAGE_SIZE,
  type MonitoringQueueSortCursor,
} from "@/src/modules/monitoring/queue-query.server";
import { createBindingKey } from "@/src/modules/monitoring/policy";

import { safeAbsoluteHttpUrl } from "./source-query.server";

const sourceLifecycleValues = [
  "DISCOVERED",
  "ACTIVE",
  "PAUSED",
  "RETIRED",
] as const;
const monitoringRoleValues = [
  ...institutionSourceBindingRoleValues,
  ...opportunitySourceBindingRoleValues,
] as const;
const DEFAULT_MONITORING_PAGE_SIZE = 25;
const MAX_CURSOR_LENGTH = 512;
const MAX_CURSOR_BYTES = 384;
const canonicalUuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const canonicalBindingCoordinateSchema = z.discriminatedUnion("targetType", [
  z
    .object({
      targetType: z.literal("INSTITUTION"),
      targetId: canonicalUuidSchema,
      sourceId: canonicalUuidSchema,
      role: z.enum(institutionSourceBindingRoleValues),
    })
    .strict(),
  z
    .object({
      targetType: z.literal("OPPORTUNITY"),
      targetId: canonicalUuidSchema,
      sourceId: canonicalUuidSchema,
      role: z.enum(opportunitySourceBindingRoleValues),
    })
    .strict(),
]);

function isCanonicalBindingId(value: string): boolean {
  const [targetType, targetId, sourceId, role, ...extra] = value.split(":");
  if (extra.length > 0) return false;
  const coordinate = canonicalBindingCoordinateSchema.safeParse({
    targetType,
    targetId,
    sourceId,
    role,
  });
  return coordinate.success && createBindingKey(coordinate.data) === value;
}

function oneOrMany<T extends readonly [string, ...string[]]>(values: T) {
  const value = z.enum(values);
  return z
    .union([value, z.array(value)])
    .transform((candidate) =>
      Array.isArray(candidate) ? candidate : [candidate],
    );
}

const monitoringQueueQuerySchema = z
  .object({
    dueState: oneOrMany(monitoringDueStateValues).optional(),
    priority: oneOrMany(monitoringPriorityValues).optional(),
    targetType: oneOrMany(monitoringTargetTypeValues).optional(),
    role: oneOrMany(monitoringRoleValues).optional(),
    sourceLifecycle: oneOrMany(sourceLifecycleValues).optional(),
    pageSize: z
      .union([z.number(), z.string().regex(/^[1-9][0-9]?$/)])
      .optional()
      .transform((value) =>
        value === undefined ? DEFAULT_MONITORING_PAGE_SIZE : Number(value),
      )
      .pipe(z.number().int().min(1).max(MONITORING_QUEUE_MAX_PAGE_SIZE)),
    cursor: z
      .union([
        z
          .string()
          .min(1)
          .max(MAX_CURSOR_LENGTH)
          .regex(/^[A-Za-z0-9_-]+$/),
        z.null(),
      ])
      .optional()
      .transform((value) => value ?? null),
  })
  .strict();

const queueCursorPayloadSchema = z
  .object({
    v: z.literal(1),
    dueState: z.enum(monitoringDueStateValues),
    priority: z.enum(monitoringPriorityValues),
    nextDueAt: z.string().datetime({ offset: true }).nullable(),
    bindingId: z.string().min(1).max(250).refine(isCanonicalBindingId),
  })
  .strict();

const monitoringDetailInputSchema = z.discriminatedUnion("targetType", [
  z
    .object({
      targetType: z.literal("INSTITUTION"),
      targetId: z.uuid(),
      sourceId: z.uuid(),
      role: z.enum(institutionSourceBindingRoleValues),
    })
    .strict(),
  z
    .object({
      targetType: z.literal("OPPORTUNITY"),
      targetId: z.uuid(),
      sourceId: z.uuid(),
      role: z.enum(opportunitySourceBindingRoleValues),
    })
    .strict(),
]);

export type MonitoringAdminQueueInput = MonitoringQueueFilter &
  Readonly<{
    pageSize: number;
    cursor: string | null;
  }>;
export type MonitoringAdminDetailInput = z.output<
  typeof monitoringDetailInputSchema
>;

export type AdminMonitoringSourceDTO = Readonly<{
  id: string;
  sourceName: string;
  canonicalUrl: string;
  safeUrl: string | null;
  sourceType: string;
  authorityLevel: string;
  lifecycleStatus: string;
}>;

export type AdminMonitoringQueueRowDTO = Readonly<{
  bindingId: string;
  targetType: MonitoringTargetType;
  targetId: string;
  detailHref: string;
  institution: Readonly<{
    id: string;
    displayName: string;
    category: string;
  }>;
  opportunity: Readonly<{
    id: string;
    slug: string;
    kind: string;
    truthMode: "NATIVE" | "LEGACY_BACKED";
  }> | null;
  source: AdminMonitoringSourceDTO;
  role: string;
  isPrimary: boolean;
  priority: MonitoringPriority;
  lastCheckedAt: string | null;
  nextDueAt: string | null;
  dueState: MonitoringDueState;
  dueReason: string;
  currentTruthSummary: MonitoringTruthSummary;
}>;

export type AdminMonitoringQueueDTO = Readonly<{
  items: readonly AdminMonitoringQueueRowDTO[];
  pageSize: number;
  hasNext: boolean;
  nextCursor: string | null;
}>;

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

export function parseMonitoringAdminQueueInput(
  value: unknown,
): MonitoringAdminQueueInput {
  const urlShape = parse(monitoringQueueQuerySchema, value);
  const { pageSize, cursor, ...rawFilter } = urlShape;
  const filter = parse(monitoringQueueFilterSchema, rawFilter);
  if (cursor !== null) decodeMonitoringQueueCursor(cursor);
  return { ...filter, pageSize, cursor };
}

export function parseMonitoringAdminDetailInput(
  value: unknown,
): MonitoringAdminDetailInput {
  return parse(monitoringDetailInputSchema, value);
}

function detailHref(row: {
  targetType: string;
  targetId: string;
  sourceId: string;
  role: string;
}): string {
  return `/admin/monitoring/${encodeURIComponent(row.targetType)}/${encodeURIComponent(
    row.targetId,
  )}/${encodeURIComponent(row.sourceId)}/${encodeURIComponent(row.role)}`;
}

function decodeMonitoringQueueCursor(
  encoded: string,
): MonitoringQueueSortCursor {
  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (
      bytes.length === 0 ||
      bytes.length > MAX_CURSOR_BYTES ||
      bytes.toString("base64url") !== encoded
    ) {
      throw new Error("Invalid cursor encoding");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const payload = queueCursorPayloadSchema.parse(JSON.parse(text));
    if (
      payload.nextDueAt !== null &&
      new Date(payload.nextDueAt).toISOString() !== payload.nextDueAt
    ) {
      throw new Error("Cursor timestamp is not canonical");
    }
    if (
      Buffer.from(JSON.stringify(payload), "utf8").toString("base64url") !==
      encoded
    ) {
      throw new Error("Cursor is not canonical");
    }
    return payload;
  } catch {
    throw ValidationError.invalidRequest();
  }
}

function encodeMonitoringQueueCursor(
  cursor: MonitoringQueueSortCursor,
): string {
  return Buffer.from(JSON.stringify({ v: 1, ...cursor }), "utf8").toString(
    "base64url",
  );
}

export async function listAdminMonitoringQueue(
  rawInput: unknown,
  dependencies: Readonly<{ executor: DatabaseExecutor; now: Date }>,
): Promise<AdminMonitoringQueueDTO> {
  const input = parseMonitoringAdminQueueInput(rawInput);
  const { pageSize, cursor, ...filter } = input;
  const page = await getMonitoringQueuePage(
    filter,
    {
      pageSize,
      after: cursor === null ? null : decodeMonitoringQueueCursor(cursor),
    },
    dependencies,
  );
  return {
    items: page.items.map((row) => ({
      bindingId: row.bindingId,
      targetType: row.targetType,
      targetId: row.targetId,
      detailHref: detailHref({
        targetType: row.targetType,
        targetId: row.targetId,
        sourceId: row.source.id,
        role: row.role,
      }),
      institution: {
        id: row.institution.id,
        displayName: row.institution.displayName,
        category: row.institution.category,
      },
      opportunity:
        row.opportunity === null
          ? null
          : {
              id: row.opportunity.id,
              slug: row.opportunity.slug,
              kind: row.opportunity.kind,
              truthMode: row.opportunity.truthMode,
            },
      source: {
        id: row.source.id,
        sourceName: row.source.sourceName,
        canonicalUrl: row.source.canonicalUrl,
        safeUrl: safeAbsoluteHttpUrl(row.source.canonicalUrl),
        sourceType: row.source.sourceType,
        authorityLevel: row.source.authorityLevel,
        lifecycleStatus: row.source.lifecycleStatus,
      },
      role: row.role,
      isPrimary: row.isPrimary,
      priority: row.priority,
      lastCheckedAt: row.lastCheckedAt,
      nextDueAt: row.nextDueAt,
      dueState: row.dueState,
      dueReason: row.dueReason,
      currentTruthSummary: row.currentTruthSummary,
    })),
    pageSize,
    hasNext: page.hasNext,
    nextCursor:
      page.nextSortCursor === null
        ? null
        : encodeMonitoringQueueCursor(page.nextSortCursor),
  };
}
