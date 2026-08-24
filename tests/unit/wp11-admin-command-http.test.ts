import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { AdminCommandContext } from "@/src/application/context";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RetryableError,
  ValidationError,
} from "@/src/application/errors";
import {
  runAdminCommandRequest,
  type AdminCommandRequestDependencies,
} from "@/src/modules/admin/http/command-handler.server";
import { createAdminErrorResponse } from "@/src/modules/admin/http/error-response.server";
import { handleAdminNoChangeRequest } from "@/src/modules/admin/http/no-change.server";

const appBaseUrl = "https://preppy.example";
const adminUserId = "550e8400-e29b-41d4-a716-446655440000";
const sourceId = "550e8400-e29b-41d4-a716-446655440001";
const occurredAt = new Date("2026-08-24T09:10:11.000Z");
const correlationId = "550e8400-e29b-41d4-a716-446655440002";

function request(body: string, origin = appBaseUrl): Request {
  return new Request(`${appBaseUrl}/api/admin/example`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body,
  });
}

function streamingRequest(
  chunks: readonly Uint8Array[],
  headers: Record<string, string> = {},
): {
  request: Request;
  pulls: () => number;
  cancelled: () => boolean;
} {
  let index = 0;
  let pullCount = 0;
  let wasCancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pullCount += 1;
      const chunk = chunks[index];
      index += 1;
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      wasCancelled = true;
    },
  });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    duplex: "half",
    headers: {
      "content-type": "application/json; charset=utf-8",
      origin: appBaseUrl,
      ...headers,
    },
    body,
  };
  return {
    request: new Request(`${appBaseUrl}/api/admin/example`, init),
    pulls: () => pullCount,
    cancelled: () => wasCancelled,
  };
}

function dependencies(
  overrides: Partial<AdminCommandRequestDependencies> = {},
): AdminCommandRequestDependencies {
  return {
    requireCurrentAdmin: vi.fn(async () => ({
      adminUserId,
      displayName: "WP-11 Operator",
    })),
    getAppBaseUrl: vi.fn(() => appBaseUrl),
    createContext: vi.fn(
      ({ adminUserId: principalId, reason }): AdminCommandContext => ({
        adminUserId: principalId,
        reason,
        occurredAt,
        correlationId,
      }),
    ),
    createErrorCorrelationId: vi.fn(() => randomUUID()),
    ...overrides,
  };
}

async function bodyOf(response: Response): Promise<unknown> {
  return response.json();
}

describe("WP-11 strict Admin command HTTP pipeline", () => {
  it("runs ACTIVE revalidation, Origin, path, body, server context, and exactly one command in order", async () => {
    // Mutation caught: Origin/input work before the ACTIVE DB recheck, or HTTP-owned writes/duplicate command delegation.
    const order: string[] = [];
    const pathSchema = z
      .object({ sourceId: z.uuid() })
      .strict()
      .transform((value) => {
        order.push("path");
        return value;
      });
    const bodySchema = z
      .object({ note: z.string().max(500).optional() })
      .strict()
      .transform((value) => {
        order.push("body");
        return value;
      });
    const execute = vi.fn(async ({ context }) => {
      order.push("command");
      return { observationId: "42", context };
    });
    const deps = dependencies({
      requireCurrentAdmin: vi.fn(async () => {
        order.push("active-admin");
        return { adminUserId, displayName: "WP-11 Operator" };
      }),
      getAppBaseUrl: vi.fn(() => {
        order.push("origin-config");
        return appBaseUrl;
      }),
      createContext: vi.fn((input) => {
        order.push("context");
        return {
          adminUserId: input.adminUserId,
          reason: input.reason,
          occurredAt,
          correlationId,
        };
      }),
    });

    const response = await runAdminCommandRequest({
      request: request(JSON.stringify({ note: "checked" })),
      rawPath: { sourceId },
      pathSchema,
      bodySchema,
      reason: "ADMIN_CONFIRM_NO_CHANGE",
      execute,
      dependencies: deps,
    });

    expect(order).toEqual([
      "active-admin",
      "origin-config",
      "path",
      "body",
      "context",
      "command",
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      principal: { adminUserId, displayName: "WP-11 Operator" },
      path: { sourceId },
      body: { note: "checked" },
      context: {
        adminUserId,
        reason: "ADMIN_CONFIRM_NO_CHANGE",
        occurredAt,
        correlationId,
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await bodyOf(response)).toEqual({
      data: {
        observationId: "42",
        context: {
          adminUserId,
          reason: "ADMIN_CONFIRM_NO_CHANGE",
          occurredAt: occurredAt.toISOString(),
          correlationId,
        },
      },
      correlationId,
    });
  });

  it("never creates command context or calls the command when auth, Origin, path, or body fails", async () => {
    // Mutation caught: validation after command/context creation or command execution on pre-command failure.
    const stages = [
      {
        name: "auth",
        request: request("{}"),
        rawPath: { sourceId },
        overrides: {
          requireCurrentAdmin: vi.fn(async () => {
            throw new ForbiddenError();
          }),
        },
      },
      {
        name: "origin",
        request: request("{}", "https://evil.example"),
        rawPath: { sourceId },
        overrides: {},
      },
      {
        name: "path",
        request: request("{}"),
        rawPath: { sourceId: "not-a-uuid" },
        overrides: {},
      },
      {
        name: "body",
        request: request("{"),
        rawPath: { sourceId },
        overrides: {},
      },
    ] as const;

    for (const stage of stages) {
      const execute = vi.fn();
      const deps = dependencies(stage.overrides);
      const response = await runAdminCommandRequest({
        request: stage.request,
        rawPath: stage.rawPath,
        pathSchema: z.object({ sourceId: z.uuid() }).strict(),
        bodySchema: z.object({}).strict(),
        reason: "ADMIN_CONFIRM_NO_CHANGE",
        execute,
        dependencies: deps,
      });

      expect(execute, stage.name).not.toHaveBeenCalled();
      expect(deps.createContext, stage.name).not.toHaveBeenCalled();
      expect(response.status, stage.name).toBeGreaterThanOrEqual(400);
      expect(response.headers.get("cache-control"), stage.name).toBe(
        "private, no-store",
      );
    }
  });

  it("rejects arrays, malformed JSON, path-owned IDs, server policy fields, and unknown fields", async () => {
    // Mutation caught: client injection of identity, truth, signal, clock, correlation, or path authority.
    const forbiddenBodies: unknown[] = [
      [],
      { sourceId },
      { adminUserId },
      { truthMode: "NATIVE" },
      { changeType: "MAJOR" },
      { actor: "ADMIN" },
      { reason: "CLIENT_REASON" },
      { occurredAt: occurredAt.toISOString() },
      { correlationId },
      { emitProductSignals: true },
      { emitCustomerOutbox: true },
      { notifyCustomers: true },
      { outboxPolicy: "SEND" },
      { unknown: "field" },
      { note: "x".repeat(501) },
    ];

    for (const body of forbiddenBodies) {
      const command = vi.fn();
      const response = await handleAdminNoChangeRequest(
        request(JSON.stringify(body)),
        { sourceId },
        {
          ...dependencies(),
          confirmNoChange: command,
        },
      );
      expect(response.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(command).not.toHaveBeenCalled();
    }

    const malformedCommand = vi.fn();
    const malformed = await handleAdminNoChangeRequest(
      request("{"),
      { sourceId },
      { ...dependencies(), confirmNoChange: malformedCommand },
    );
    expect(malformed.status).toBe(400);
    expect(malformedCommand).not.toHaveBeenCalled();

    const duplicateCommand = vi.fn();
    const duplicate = await handleAdminNoChangeRequest(
      request('{"note":"first","note":"second"}'),
      { sourceId },
      { ...dependencies(), confirmNoChange: duplicateCommand },
    );
    expect(duplicate.status).toBe(400);
    expect(duplicateCommand).not.toHaveBeenCalled();

    for (const rawBody of [
      '{"__proto__":{"polluted":true}}',
      '{"nested":[{"constructor":{"polluted":true}}]}',
      '{"nested":{"prototype":{"polluted":true}}}',
    ]) {
      const execute = vi.fn();
      const deps = dependencies();
      const response = await runAdminCommandRequest({
        request: request(rawBody),
        rawPath: { sourceId },
        pathSchema: z.object({ sourceId: z.uuid() }).strict(),
        bodySchema: z.object({ nested: z.unknown().optional() }).strict(),
        reason: "ADMIN_CONFIRM_NO_CHANGE",
        execute,
        dependencies: deps,
      });
      expect(response.status).toBe(400);
      expect(deps.createContext).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    }
  });

  it("accepts exactly 64 KiB but rejects one byte over before command context creation", async () => {
    // Mutation caught: off-by-one limits or post-materialization body checks.
    const padding = Array.from({ length: 1_000 }, () => "");
    const empty = JSON.stringify({ padding });
    let remaining = 65_536 - Buffer.byteLength(empty, "utf8");
    for (let index = 0; index < padding.length && remaining > 0; index += 1) {
      const availableSlots = padding.length - index;
      const length = Math.ceil(remaining / availableSlots);
      padding[index] = "x".repeat(length);
      remaining -= length;
    }
    const exactBody = JSON.stringify({
      padding,
    });
    expect(Buffer.byteLength(exactBody, "utf8")).toBe(65_536);
    const bodySchema = z.object({ padding: z.array(z.string()) }).strict();

    const exactExecute = vi.fn(async () => ({ accepted: true }));
    const exact = await runAdminCommandRequest({
      request: request(exactBody),
      rawPath: { sourceId },
      pathSchema: z.object({ sourceId: z.uuid() }).strict(),
      bodySchema,
      reason: "ADMIN_CONFIRM_NO_CHANGE",
      execute: exactExecute,
      dependencies: dependencies(),
    });
    expect(exact.status).toBe(200);
    expect(exactExecute).toHaveBeenCalledTimes(1);

    const overExecute = vi.fn();
    const overDependencies = dependencies();
    const over = await runAdminCommandRequest({
      request: request(`${exactBody} `),
      rawPath: { sourceId },
      pathSchema: z.object({ sourceId: z.uuid() }).strict(),
      bodySchema,
      reason: "ADMIN_CONFIRM_NO_CHANGE",
      execute: overExecute,
      dependencies: overDependencies,
    });
    expect(over.status).toBe(400);
    expect(overExecute).not.toHaveBeenCalled();
    expect(overDependencies.createContext).not.toHaveBeenCalled();
  });

  it.each([undefined, "1"])(
    "stops and cancels an oversized stream with declared length %s",
    async (declaredLength) => {
      // Mutation caught: request.arrayBuffer() consumes every chunk before applying the 64 KiB limit.
      const stream = streamingRequest(
        Array.from({ length: 100 }, () => new Uint8Array(4_096).fill(0x20)),
        declaredLength === undefined
          ? {}
          : { "content-length": declaredLength },
      );
      const execute = vi.fn();
      const deps = dependencies();

      const response = await runAdminCommandRequest({
        request: stream.request,
        rawPath: { sourceId },
        pathSchema: z.object({ sourceId: z.uuid() }).strict(),
        bodySchema: z.object({}).strict(),
        reason: "ADMIN_CONFIRM_NO_CHANGE",
        execute,
        dependencies: deps,
      });

      expect(response.status).toBe(400);
      expect(stream.cancelled()).toBe(true);
      expect(stream.pulls()).toBeLessThan(25);
      expect(execute).not.toHaveBeenCalled();
      expect(deps.createContext).not.toHaveBeenCalled();
    },
  );

  it("rejects null body, malformed UTF-8, and non-JSON media types before command context creation", async () => {
    // Mutation caught: permissive body decoding/media type behavior reaches the command.
    const nullBody = new Request(`${appBaseUrl}/api/admin/example`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: appBaseUrl },
    });
    const malformedUtf8 = streamingRequest([
      new Uint8Array([0x7b, 0x22, 0x6e, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
    ]).request;
    const nonJson = new Request(`${appBaseUrl}/api/admin/example`, {
      method: "POST",
      headers: { "content-type": "text/plain", origin: appBaseUrl },
      body: "{}",
    });
    const erroredBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("transport read failure must stay private"));
      },
    });
    const readError = new Request(`${appBaseUrl}/api/admin/example`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: appBaseUrl },
      body: erroredBody,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    for (const candidate of [nullBody, malformedUtf8, nonJson, readError]) {
      const execute = vi.fn();
      const deps = dependencies();
      const response = await runAdminCommandRequest({
        request: candidate,
        rawPath: { sourceId },
        pathSchema: z.object({ sourceId: z.uuid() }).strict(),
        bodySchema: z.object({}).strict(),
        reason: "ADMIN_CONFIRM_NO_CHANGE",
        execute,
        dependencies: deps,
      });
      expect(response.status).toBe(400);
      expect(execute).not.toHaveBeenCalled();
      expect(deps.createContext).not.toHaveBeenCalled();
    }
  });

  it("maps only safe error envelopes and uses generic Korean reload guidance for 409", async () => {
    const cases = [
      [ValidationError.invalidRequest(), 400, "VALIDATION_ERROR"],
      [new ForbiddenError(), 403, "FORBIDDEN"],
      [new NotFoundError(), 404, "NOT_FOUND"],
      [new ConflictError(), 409, "CONFLICT"],
      [new RetryableError(), 503, "RETRYABLE"],
      [
        new Error(
          "duplicate key violates unique constraint admin_secret raw-token stack SQL",
        ),
        500,
        "INTERNAL_ERROR",
      ],
    ] as const;

    for (const [error, status, code] of cases) {
      const response = createAdminErrorResponse(error, correlationId);
      const serialized = JSON.stringify(await bodyOf(response));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(JSON.parse(serialized)).toMatchObject({
        error: { code, correlationId },
      });
      expect(serialized).not.toMatch(
        /constraint|admin_secret|raw-token|stack|SQL|duplicate key/i,
      );
      if (status === 409) {
        expect(serialized).toContain(
          "다른 운영자가 먼저 변경했을 수 있습니다.",
        );
        expect(serialized).toContain(
          "최신 데이터를 다시 확인한 뒤 변경 여부를 판단해주세요.",
        );
      }
    }
  });
});
