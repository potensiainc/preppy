import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ConflictError,
  ValidationError,
  mapApplicationErrorToHttp,
} from "@/src/application/errors";
import { createBaseCommandContext } from "@/src/application/context";

describe("application error mapping", () => {
  it("maps a known application error to its stable safe HTTP shape", () => {
    const result = mapApplicationErrorToHttp(
      new ConflictError(),
      "correlation-id",
    );

    expect(result).toEqual({
      status: 409,
      body: {
        error: {
          code: "CONFLICT",
          message: "The requested state conflicts with existing data.",
          correlationId: "correlation-id",
        },
      },
    });
  });

  it("never exposes unknown error messages or database details", () => {
    const result = mapApplicationErrorToHttp(
      new Error("SELECT password FROM users WHERE email = secret@example.com"),
      "correlation-id",
    );

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        correlationId: "correlation-id",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret@example.com");
    expect(JSON.stringify(result)).not.toContain("SELECT");
  });

  it("does not trust mutated application error messages or details", () => {
    const error = new ConflictError();
    Object.assign(error, {
      message: "email secret@example.com",
      details: { sql: "SELECT password FROM users" },
    });

    const result = mapApplicationErrorToHttp(error, "correlation-id");
    const serialized = JSON.stringify(result);

    expect(result.body.error).toEqual({
      code: "CONFLICT",
      message: "The requested state conflicts with existing data.",
      correlationId: "correlation-id",
    });
    expect(serialized).not.toContain("secret@example.com");
    expect(serialized).not.toContain("SELECT");
  });

  it("serializes Zod issues without echoing rejected raw values", () => {
    const schema = z.object({
      password: z.string().min(20),
    });
    const parsed = schema.safeParse({ password: "sensitive-secret" });
    if (parsed.success) {
      throw new Error("Expected validation to fail");
    }

    const result = mapApplicationErrorToHttp(
      ValidationError.fromZodError(parsed.error),
      "correlation-id",
    );
    const serialized = JSON.stringify(result);

    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.details).toEqual({
      issues: [
        {
          path: "password",
          type: "too_small",
          message: "Invalid value.",
        },
      ],
    });
    expect(serialized).not.toContain("sensitive-secret");
  });

  it("redacts user-controlled Zod record keys from issue paths", () => {
    const parsed = z
      .record(z.string(), z.number())
      .safeParse({ "secret@example.com": "not-a-number" });
    if (parsed.success) {
      throw new Error("Expected validation to fail");
    }

    const result = mapApplicationErrorToHttp(
      ValidationError.fromZodError(parsed.error),
      "correlation-id",
    );
    const serialized = JSON.stringify(result);

    expect(result.body.error.details).toEqual({
      issues: [
        {
          path: "[redacted]",
          type: "invalid_type",
          message: "Invalid value.",
        },
      ],
    });
    expect(serialized).not.toContain("secret@example.com");
    expect(serialized).not.toContain("not-a-number");
  });
});

describe("base command context", () => {
  it("creates a distinct server-generated UUID and ignores a client hint", () => {
    const occurredAt = new Date("2026-08-22T00:00:00.000Z");
    const first = createBaseCommandContext({
      occurredAt,
      clientCorrelationId: "client-controlled-value",
    });
    const second = createBaseCommandContext({ occurredAt });

    expect(first.occurredAt).toBe(occurredAt);
    expect(first.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(first.correlationId).not.toBe("client-controlled-value");
    expect(second.correlationId).not.toBe(first.correlationId);
  });
});
