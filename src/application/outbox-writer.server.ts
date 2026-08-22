import "server-only";

import { ValidationError } from "@/src/application/errors";
import { outboxEvents } from "@/src/db/schema";
import { mapDatabaseError } from "@/src/infrastructure/db/errors";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_DEDUPE_KEY_LENGTH = 256;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_NODES = 200;
const MAX_JSON_KEYS = 50;
const MAX_JSON_ARRAY_LENGTH = 50;
const MAX_JSON_KEY_LENGTH = 64;
const MAX_JSON_STRING_LENGTH = 1_000;

const INPUT_KEYS = new Set([
  "eventType",
  "aggregateType",
  "aggregateId",
  "payloadSafe",
  "dedupeKey",
  "availableAt",
  "maxAttempts",
]);

export type SafeJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly SafeJsonValue[]
  | { readonly [key: string]: SafeJsonValue };

export type SafeJsonObject = {
  readonly [key: string]: SafeJsonValue;
};

export type EnqueueOutboxEvent = Readonly<{
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payloadSafe: SafeJsonObject;
  dedupeKey: string;
  availableAt?: Date;
  maxAttempts?: number;
}>;

type ValidOutboxInput = {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payloadSafe: SafeJsonObject;
  dedupeKey: string;
  availableAt?: Date;
  maxAttempts?: number;
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

function cloneSafeJsonObject(value: unknown): SafeJsonObject | null {
  if (!isPlainObject(value)) return null;

  let nodeCount = 0;
  const ancestors = new Set<object>();

  const visit = (
    candidate: unknown,
    depth: number,
  ): SafeJsonValue | undefined => {
    nodeCount += 1;
    if (nodeCount > MAX_JSON_NODES || depth > MAX_JSON_DEPTH) return undefined;

    if (candidate === null || typeof candidate === "boolean") return candidate;
    if (typeof candidate === "string") {
      return candidate.length <= MAX_JSON_STRING_LENGTH ? candidate : undefined;
    }
    if (typeof candidate === "number") {
      return Number.isFinite(candidate) ? candidate : undefined;
    }
    if (typeof candidate !== "object" || ancestors.has(candidate)) {
      return undefined;
    }

    if (Array.isArray(candidate)) {
      if (candidate.length > MAX_JSON_ARRAY_LENGTH) return undefined;
      const ownKeys = Reflect.ownKeys(candidate);
      if (
        ownKeys.length !== candidate.length + 1 ||
        !ownKeys.includes("length") ||
        ownKeys.some((key) => typeof key !== "string")
      ) {
        return undefined;
      }
      const lengthDescriptor = Object.getOwnPropertyDescriptor(
        candidate,
        "length",
      );
      if (!lengthDescriptor || !("value" in lengthDescriptor)) return undefined;

      ancestors.add(candidate);
      const cloned: SafeJsonValue[] = [];
      for (let index = 0; index < candidate.length; index += 1) {
        const key = String(index);
        if (!ownKeys.includes(key)) {
          ancestors.delete(candidate);
          return undefined;
        }
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          ancestors.delete(candidate);
          return undefined;
        }
        const item = visit(descriptor.value, depth + 1);
        if (item === undefined) {
          ancestors.delete(candidate);
          return undefined;
        }
        cloned.push(item);
      }
      ancestors.delete(candidate);
      return cloned;
    }

    if (!isPlainObject(candidate)) return undefined;
    const ownKeys = Reflect.ownKeys(candidate);
    if (
      ownKeys.length > MAX_JSON_KEYS ||
      ownKeys.some(
        (key) =>
          typeof key !== "string" ||
          key.length === 0 ||
          key.length > MAX_JSON_KEY_LENGTH,
      )
    ) {
      return undefined;
    }

    ancestors.add(candidate);
    const cloned: Record<string, SafeJsonValue> = {};
    for (const key of ownKeys) {
      if (typeof key !== "string") {
        ancestors.delete(candidate);
        return undefined;
      }
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        ancestors.delete(candidate);
        return undefined;
      }
      const item = visit(descriptor.value, depth + 1);
      if (item === undefined) {
        ancestors.delete(candidate);
        return undefined;
      }
      Object.defineProperty(cloned, key, {
        configurable: true,
        enumerable: true,
        value: item,
        writable: true,
      });
    }
    ancestors.delete(candidate);
    return cloned;
  };

  const cloned = visit(value, 0);
  return cloned && !Array.isArray(cloned) && typeof cloned === "object"
    ? (cloned as SafeJsonObject)
    : null;
}

function parseInput(input: unknown): ValidOutboxInput | null {
  const values = readOwnEnumerableDataObject(input, INPUT_KEYS);
  if (
    !values ||
    !isCanonicalIdentifier(values.eventType) ||
    !isCanonicalIdentifier(values.aggregateType) ||
    !isUuid(values.aggregateId) ||
    typeof values.dedupeKey !== "string" ||
    values.dedupeKey.trim().length === 0 ||
    values.dedupeKey.length > MAX_DEDUPE_KEY_LENGTH
  ) {
    return null;
  }
  const payloadSafe = cloneSafeJsonObject(values.payloadSafe);
  if (!payloadSafe) return null;

  let availableAt: Date | undefined;
  if (values.availableAt !== undefined) {
    const clonedAvailableAt = cloneDate(values.availableAt);
    if (!clonedAvailableAt) return null;
    availableAt = clonedAvailableAt;
  }
  let maxAttempts: number | undefined;
  if (values.maxAttempts !== undefined) {
    if (
      typeof values.maxAttempts !== "number" ||
      !Number.isSafeInteger(values.maxAttempts) ||
      values.maxAttempts < 1 ||
      values.maxAttempts > 10
    ) {
      return null;
    }
    maxAttempts = values.maxAttempts;
  }

  return {
    eventType: values.eventType,
    aggregateType: values.aggregateType,
    aggregateId: values.aggregateId,
    payloadSafe,
    dedupeKey: values.dedupeKey,
    ...(availableAt === undefined ? {} : { availableAt }),
    ...(maxAttempts === undefined ? {} : { maxAttempts }),
  };
}

export const OutboxWriter = {
  async enqueue(input: EnqueueOutboxEvent, executor: DatabaseExecutor) {
    const validated = parseInput(input);
    if (!validated) throw ValidationError.invalidRequest();

    try {
      const [event] = await executor.drizzle
        .insert(outboxEvents)
        .values({
          eventType: validated.eventType,
          aggregateType: validated.aggregateType,
          aggregateId: validated.aggregateId,
          payload: validated.payloadSafe,
          dedupeKey: validated.dedupeKey,
          ...(validated.availableAt === undefined
            ? {}
            : { availableAt: validated.availableAt }),
          ...(validated.maxAttempts === undefined
            ? {}
            : { maxAttempts: validated.maxAttempts }),
        })
        .returning();

      return event!;
    } catch (error) {
      const cause =
        typeof error === "object" && error !== null && "cause" in error
          ? error.cause
          : error;
      throw mapDatabaseError(cause);
    }
  },
};
