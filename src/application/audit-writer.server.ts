import "server-only";

import { ValidationError } from "@/src/application/errors";
import { auditLogs } from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_CHANGED_FIELDS = 20;

const ENTRY_KEYS = new Set([
  "adminUserId",
  "actionType",
  "entityType",
  "entityId",
  "correlationId",
  "reason",
  "occurredAt",
  "metadata",
]);
const METADATA_KEYS = new Set([
  "expectedVersion",
  "actualVersion",
  "sourceId",
  "observationId",
  "changedFields",
  "outcomeCode",
]);

export type AuditSafeMetadata = Readonly<{
  expectedVersion?: number;
  actualVersion?: number;
  sourceId?: string;
  observationId?: string;
  changedFields?: readonly string[];
  outcomeCode?: string;
}>;

export type AuditEntry = Readonly<{
  adminUserId?: string | null;
  actionType: string;
  entityType: string;
  entityId?: string | null;
  correlationId: string;
  reason?: string;
  occurredAt: Date;
  metadata?: AuditSafeMetadata;
}>;

type PersistedAuditData = {
  correlationId: string;
  reason?: string;
  metadata?: AuditSafeMetadata;
};

type ValidAuditEntry = {
  adminUserId: string | null;
  actionType: string;
  entityType: string;
  entityId: string | null;
  correlationId: string;
  reason?: string;
  occurredAt: Date;
  metadata?: AuditSafeMetadata;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isCanonicalIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

function cloneDate(value: unknown): Date | null {
  if (!(value instanceof Date)) return null;
  const timestamp = Date.prototype.getTime.call(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readOwnEnumerableDataObject(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;

  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedKeys.has(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      return null;
    }
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      value: descriptor.value,
      writable: true,
    });
  }

  return result;
}

function isBoundedVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 2_147_483_647
  );
}

function cloneChangedFields(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_CHANGED_FIELDS) return null;

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== value.length + 1 || !ownKeys.includes("length")) {
    return null;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor)) return null;

  const fields: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const key = String(index);
    if (!ownKeys.includes(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      !isCanonicalIdentifier(descriptor.value)
    ) {
      return null;
    }
    fields.push(descriptor.value);
  }

  return fields;
}

function cloneMetadata(value: unknown): AuditSafeMetadata | null {
  const metadata = readOwnEnumerableDataObject(value, METADATA_KEYS);
  if (!metadata) return null;

  const result: {
    expectedVersion?: number;
    actualVersion?: number;
    sourceId?: string;
    observationId?: string;
    changedFields?: string[];
    outcomeCode?: string;
  } = {};
  for (const [key, candidate] of Object.entries(metadata)) {
    switch (key) {
      case "expectedVersion":
      case "actualVersion":
        if (!isBoundedVersion(candidate)) return null;
        result[key] = candidate;
        break;
      case "sourceId":
      case "observationId":
        if (!isUuid(candidate)) return null;
        result[key] = candidate;
        break;
      case "changedFields": {
        const changedFields = cloneChangedFields(candidate);
        if (!changedFields) return null;
        result.changedFields = changedFields;
        break;
      }
      case "outcomeCode":
        if (!isCanonicalIdentifier(candidate)) return null;
        result.outcomeCode = candidate;
        break;
      default:
        return null;
    }
  }

  return result;
}

function parseEntry(entry: unknown): ValidAuditEntry | null {
  const values = readOwnEnumerableDataObject(entry, ENTRY_KEYS);
  if (!values) return null;

  const occurredAt = cloneDate(values.occurredAt);
  if (
    !isCanonicalIdentifier(values.actionType) ||
    !isCanonicalIdentifier(values.entityType) ||
    !isUuid(values.correlationId) ||
    !occurredAt
  ) {
    return null;
  }

  const adminUserId = values.adminUserId;
  if (
    adminUserId !== undefined &&
    adminUserId !== null &&
    !isUuid(adminUserId)
  ) {
    return null;
  }
  const entityId = values.entityId;
  if (entityId !== undefined && entityId !== null && !isUuid(entityId)) {
    return null;
  }
  const reason = values.reason;
  if (reason !== undefined && !isCanonicalIdentifier(reason)) return null;

  let metadata: AuditSafeMetadata | undefined;
  if (values.metadata !== undefined) {
    const clonedMetadata = cloneMetadata(values.metadata);
    if (!clonedMetadata) return null;
    metadata = clonedMetadata;
  }

  return {
    adminUserId: adminUserId ?? null,
    actionType: values.actionType,
    entityType: values.entityType,
    entityId: entityId ?? null,
    correlationId: values.correlationId,
    ...(reason === undefined ? {} : { reason }),
    occurredAt,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export const AuditWriter = {
  async write(entry: AuditEntry, executor: DatabaseExecutor) {
    const validated = parseEntry(entry);
    if (!validated) throw ValidationError.invalidRequest();

    const afterData: PersistedAuditData = {
      correlationId: validated.correlationId,
      ...(validated.reason === undefined ? {} : { reason: validated.reason }),
      ...(validated.metadata === undefined
        ? {}
        : { metadata: validated.metadata }),
    };
    const [auditLog] = await executor.drizzle
      .insert(auditLogs)
      .values({
        adminUserId: validated.adminUserId,
        actionType: validated.actionType,
        entityType: validated.entityType,
        entityId: validated.entityId,
        beforeData: null,
        afterData,
        createdAt: validated.occurredAt,
      })
      .returning();

    return auditLog!;
  },
};
