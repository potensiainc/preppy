import "server-only";

import { randomUUID } from "node:crypto";

import type { ZodType } from "zod";

import type { AdminCommandContext } from "@/src/application/context";
import { ValidationError } from "@/src/application/errors";
import { getAdminLogoutConfig } from "@/src/modules/admin/auth/config.server";
import { requireCurrentAdmin } from "@/src/modules/admin/auth/current-admin.server";
import type { AdminPrincipal } from "@/src/modules/admin/auth/repository.server";
import { assertSameOriginForMutation } from "@/src/modules/auth/origin.server";
import { createServerAdminCommandContext } from "@/src/modules/admin/http/command-context.server";
import { parseSecurityJson } from "@/src/modules/admin/auth/security-json.server";
import type {
  AdminCommandExecutionInput,
  AdminCommandSuccessEnvelope,
} from "@/src/modules/admin/http/contracts";
import {
  createAdminErrorResponse,
  privateNoStoreJson,
} from "@/src/modules/admin/http/error-response.server";

const ADMIN_COMMAND_MAX_BODY_BYTES = 64 * 1024;
const ADMIN_COMMAND_MAX_STRING_BYTES = 16 * 1024;
const ADMIN_COMMAND_HARD_MAX_BODY_BYTES = 192 * 1024;
const ADMIN_COMMAND_HARD_MAX_STRING_BYTES = 128 * 1024;

export type AdminCommandRequestDependencies = Readonly<{
  requireCurrentAdmin: () => Promise<AdminPrincipal>;
  getAppBaseUrl: () => string;
  createContext: (input: {
    adminUserId: string;
    reason: string;
  }) => AdminCommandContext;
  createErrorCorrelationId: () => string;
}>;

export type RunAdminCommandRequestOptions<TPath, TBody, TResult> = Readonly<{
  request: Request;
  rawPath: unknown;
  pathSchema: ZodType<TPath>;
  bodySchema: ZodType<TBody>;
  reason: string | ((input: Readonly<{ path: TPath; body: TBody }>) => string);
  execute: (
    input: AdminCommandExecutionInput<TPath, TBody>,
  ) => Promise<TResult>;
  dependencies?: Partial<AdminCommandRequestDependencies>;
  maxBodyBytes?: number;
  maxStringBytes?: number;
}>;

function resolveAdminJsonLimits(
  maxBodyBytes = ADMIN_COMMAND_MAX_BODY_BYTES,
  maxStringBytes = ADMIN_COMMAND_MAX_STRING_BYTES,
): Readonly<{ maxBodyBytes: number; maxStringBytes: number }> {
  if (
    !Number.isSafeInteger(maxBodyBytes) ||
    maxBodyBytes < 1 ||
    maxBodyBytes > ADMIN_COMMAND_HARD_MAX_BODY_BYTES ||
    !Number.isSafeInteger(maxStringBytes) ||
    maxStringBytes < 1 ||
    maxStringBytes > ADMIN_COMMAND_HARD_MAX_STRING_BYTES ||
    maxStringBytes > maxBodyBytes
  ) {
    throw new RangeError("Invalid trusted Admin JSON limit profile");
  }
  return { maxBodyBytes, maxStringBytes };
}

async function readBoundedAdminJson(
  request: Request,
  limits: Readonly<{ maxBodyBytes: number; maxStringBytes: number }>,
): Promise<unknown> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw ValidationError.invalidRequest();
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (
      !Number.isSafeInteger(parsed) ||
      parsed < 0 ||
      parsed > limits.maxBodyBytes
    ) {
      try {
        await request.body?.cancel();
      } catch {
        // The validation response must not expose transport cancellation errors.
      }
      throw ValidationError.invalidRequest();
    }
  }

  const body = request.body;
  if (body === null) throw ValidationError.invalidRequest();

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    throw ValidationError.invalidRequest();
  }

  const bounded = new Uint8Array(limits.maxBodyBytes);
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw ValidationError.invalidRequest();
      }
      const remaining = limits.maxBodyBytes - byteLength;
      if (value.byteLength > remaining) {
        throw ValidationError.invalidRequest();
      }
      bounded.set(value, byteLength);
      byteLength += value.byteLength;
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // The safe validation response is independent of stream cancellation.
    }
    throw ValidationError.invalidRequest();
  } finally {
    reader.releaseLock();
  }
  if (byteLength === 0) throw ValidationError.invalidRequest();
  const bytes = bounded.subarray(0, byteLength);

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw ValidationError.invalidRequest();
  }
  try {
    return parseSecurityJson(text, {
      maxBytes: limits.maxBodyBytes,
      maxStringBytes: limits.maxStringBytes,
    });
  } catch {
    throw ValidationError.invalidRequest();
  }
}

function parseWithSchema<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

const PROTOTYPE_SENSITIVE_ADMIN_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function assertSafeAdminJsonOwnKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertSafeAdminJsonOwnKeys(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || PROTOTYPE_SENSITIVE_ADMIN_KEYS.has(key)) {
      throw ValidationError.invalidRequest();
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw ValidationError.invalidRequest();
    }
    assertSafeAdminJsonOwnKeys(descriptor.value);
  }
}

export async function runAdminCommandRequest<TPath, TBody, TResult>(
  options: RunAdminCommandRequestOptions<TPath, TBody, TResult>,
): Promise<Response> {
  const dependencies: AdminCommandRequestDependencies = {
    requireCurrentAdmin: () => requireCurrentAdmin(),
    getAppBaseUrl: () => getAdminLogoutConfig().APP_BASE_URL,
    createContext: createServerAdminCommandContext,
    createErrorCorrelationId: randomUUID,
    ...options.dependencies,
  };
  let context: AdminCommandContext | undefined;

  try {
    const jsonLimits = resolveAdminJsonLimits(
      options.maxBodyBytes,
      options.maxStringBytes,
    );
    const principal = await dependencies.requireCurrentAdmin();
    assertSameOriginForMutation(options.request, dependencies.getAppBaseUrl());
    const path = parseWithSchema(options.pathSchema, options.rawPath);
    const rawBody = await readBoundedAdminJson(options.request, jsonLimits);
    assertSafeAdminJsonOwnKeys(rawBody);
    const body = parseWithSchema(options.bodySchema, rawBody);
    const reason =
      typeof options.reason === "function"
        ? options.reason({ path, body })
        : options.reason;
    context = dependencies.createContext({
      adminUserId: principal.adminUserId,
      reason,
    });
    const result = await options.execute({ principal, path, body, context });
    const envelope: AdminCommandSuccessEnvelope<TResult> = {
      data: result,
      correlationId: context.correlationId,
    };
    return privateNoStoreJson(envelope, 200);
  } catch (error) {
    return createAdminErrorResponse(
      error,
      context?.correlationId ?? dependencies.createErrorCorrelationId(),
    );
  }
}
