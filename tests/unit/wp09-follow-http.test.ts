import { describe, expect, it, vi } from "vitest";

import {
  ConflictError,
  ForbiddenError,
  NotEligibleError,
  NotFoundError,
  RetryableError,
  UnauthenticatedError,
} from "@/src/application/errors";
import { createUserSessionCookie } from "@/src/modules/auth/session.server";
import {
  createFollowDeleteHandler,
  createFollowPostHandler,
  createFollowStatusHandler,
} from "@/src/modules/follow/http.server";

const appBaseUrl = "https://preppy.example";
const sessionSecret = "session-secret-that-is-at-least-thirty-two-bytes";
const userId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const institutionId = "550e8400-e29b-41d4-a716-446655440000";
const now = new Date("2026-08-23T09:10:11.000Z");
const correlationId = "7ba7b810-9dad-11d1-80b4-00c04fd430c8";

function sessionHeader(id = userId): string {
  const cookie = createUserSessionCookie(id, {
    secret: sessionSecret,
    now,
    production: true,
  });
  return `${cookie.name}=${encodeURIComponent(cookie.value)}`;
}

function mutationRequest(
  path: string,
  options: { method: "POST" | "DELETE"; body?: unknown; cookie?: string },
): Request {
  return new Request(`${appBaseUrl}${path}`, {
    method: options.method,
    headers: {
      origin: appBaseUrl,
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
}

function expectPrivate(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("pragma")).toBe("no-cache");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
}

describe("WP-09 Follow HTTP mutations", () => {
  it("returns the exact activation envelope from a signed-session command context", async () => {
    // Mutation caught: deriving identity/time/correlation from request JSON or dropping CTA result fields.
    const activateFollow = vi.fn().mockResolvedValue({
      followId: "8ba7b810-9dad-11d1-80b4-00c04fd430c8",
      institutionId,
      state: "ACTIVE",
      activatedAt: now.toISOString(),
      created: true,
      reactivated: false,
      activeFollowCount: 1,
    });
    const handler = createFollowPostHandler({
      appBaseUrl,
      sessionSecret,
      activateFollow,
      now: () => now,
      createCorrelationId: () => correlationId,
    });

    const response = await handler(
      mutationRequest("/api/me/follows", {
        method: "POST",
        cookie: sessionHeader(),
        body: { institutionId },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        followId: "8ba7b810-9dad-11d1-80b4-00c04fd430c8",
        institutionId,
        state: "ACTIVE",
        activatedAt: "2026-08-23T09:10:11.000Z",
        created: true,
        reactivated: false,
        activeFollowCount: 1,
      },
    });
    expect(activateFollow).toHaveBeenCalledWith(
      { userId, correlationId, occurredAt: now },
      { institutionId },
    );
    expect(response.headers.get("x-correlation-id")).toBe(correlationId);
    expectPrivate(response);
  });

  it("rejects missing/cross-origin sessions and strict payload client identity", async () => {
    // Mutation caught: allowing CSRF, anonymous mutation, or client-selected user identity.
    const activateFollow = vi.fn();
    const handler = createFollowPostHandler({
      appBaseUrl,
      sessionSecret,
      activateFollow,
      now: () => now,
      createCorrelationId: () => correlationId,
    });
    const requests = [
      mutationRequest("/api/me/follows", {
        method: "POST",
        body: { institutionId },
      }),
      new Request(`${appBaseUrl}/api/me/follows`, {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          cookie: sessionHeader(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ institutionId }),
      }),
      mutationRequest("/api/me/follows", {
        method: "POST",
        cookie: sessionHeader(),
        body: { institutionId, userId: "9ba7b810-9dad-11d1-80b4-00c04fd430c8" },
      }),
    ];

    const responses = [];
    for (const request of requests) responses.push(await handler(request));

    expect(responses.map((response) => response.status)).toEqual([
      401, 403, 400,
    ]);
    expect(activateFollow).not.toHaveBeenCalled();
    for (const response of responses) {
      expectPrivate(response);
      expect(response.headers.get("x-correlation-id")).toBe(correlationId);
    }
  });

  it.each([
    [new UnauthenticatedError(), 401, "USER_NOT_ACTIVE"],
    [new ForbiddenError(), 403, "USER_NOT_ACTIVE"],
    [new NotFoundError(), 404, "INSTITUTION_NOT_FOUND"],
    [new NotEligibleError(), 403, "INSTITUTION_NOT_FOLLOWABLE"],
    [new ConflictError(), 409, "FOLLOW_CONFLICT"],
    [new RetryableError(), 503, "RETRYABLE"],
    [
      new Error("postgres 23505 user@example.test SELECT secret"),
      500,
      "INTERNAL_ERROR",
    ],
  ])("sanitizes Follow command failure %#", async (error, status, code) => {
    // Mutation caught: exposing raw command/driver text or losing typed domain mappings.
    const handler = createFollowPostHandler({
      appBaseUrl,
      sessionSecret,
      activateFollow: vi.fn().mockRejectedValue(error),
      now: () => now,
      createCorrelationId: () => correlationId,
    });

    const response = await handler(
      mutationRequest("/api/me/follows", {
        method: "POST",
        cookie: sessionHeader(),
        body: { institutionId },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body).toEqual({
      error: {
        code,
        message: expect.any(String),
        correlationId,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/postgres|23505|SELECT|@example/i);
  });

  it("maps a request-stream failure to a sanitized retryable error", async () => {
    // Mutation caught: classifying transport failure as client validation or leaking stream details.
    const handler = createFollowPostHandler({
      appBaseUrl,
      sessionSecret,
      activateFollow: vi.fn(),
      now: () => now,
      createCorrelationId: () => correlationId,
    });
    const body = new ReadableStream({
      start(controller) {
        controller.error(new Error("postgres transport secret"));
      },
    });
    const response = await handler(
      new Request(`${appBaseUrl}/api/me/follows`, {
        method: "POST",
        headers: {
          origin: appBaseUrl,
          cookie: sessionHeader(),
          "content-type": "application/json",
        },
        body,
        duplex: "half",
      } as RequestInit),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "RETRYABLE",
        message: expect.any(String),
        correlationId,
      },
    });
  });

  it("deactivates by signed-session identity and returns 204 for every command no-op result", async () => {
    // Mutation caught: hard-delete/result disclosure or treating an idempotent no-op as failure.
    const deactivateFollow = vi
      .fn()
      .mockResolvedValueOnce({
        followId: "8ba7b810-9dad-11d1-80b4-00c04fd430c8",
        institutionId,
        state: "INACTIVE",
        deactivatedAt: now.toISOString(),
        deactivated: true,
      })
      .mockResolvedValueOnce({
        followId: null,
        institutionId,
        state: "INACTIVE",
        deactivatedAt: null,
        deactivated: false,
      });
    const handler = createFollowDeleteHandler({
      appBaseUrl,
      sessionSecret,
      deactivateFollow,
      now: () => now,
      createCorrelationId: () => correlationId,
    });

    const crossOrigin = await handler(
      new Request(`${appBaseUrl}/api/me/follows/${institutionId}`, {
        method: "DELETE",
        headers: {
          origin: "https://evil.example",
          cookie: sessionHeader(),
        },
      }),
      institutionId,
    );

    const first = await handler(
      mutationRequest(`/api/me/follows/${institutionId}`, {
        method: "DELETE",
        cookie: sessionHeader(),
      }),
      institutionId,
    );
    const retry = await handler(
      mutationRequest(`/api/me/follows/${institutionId}`, {
        method: "DELETE",
        cookie: sessionHeader(),
      }),
      institutionId,
    );

    expect([crossOrigin.status, first.status, retry.status]).toEqual([
      403, 204, 204,
    ]);
    expect(await first.text()).toBe("");
    expect(deactivateFollow).toHaveBeenNthCalledWith(
      1,
      { userId, correlationId, occurredAt: now },
      { institutionId },
    );
    expectPrivate(crossOrigin);
    expectPrivate(first);
    expectPrivate(retry);
  });
});

describe("WP-09 private Follow status adapter", () => {
  it.each([
    [null, { authenticated: false, following: false }],
    ["invalid-session", { authenticated: false, following: false }],
  ])("returns anonymous-safe 200 for cookie %s", async (cookie, expected) => {
    // Mutation caught: returning 401 or target/private state to an unauthenticated caller.
    const getStatus = vi.fn().mockResolvedValue(expected);
    const handler = createFollowStatusHandler({ getStatus });
    const response = await handler(
      new Request(
        `${appBaseUrl}/api/me/follows/status?institutionId=${institutionId}`,
        {
          headers: cookie ? { cookie: `preppy_user_session=${cookie}` } : {},
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: expected });
    expectPrivate(response);
  });

  it.each([false, true])(
    "returns authoritative ACTIVE following=%s without a public DTO",
    async (following) => {
      // Mutation caught: flattening the envelope, caching it, or selecting a user from URL input.
      const getStatus = vi.fn().mockResolvedValue({
        authenticated: true,
        following,
      });
      const handler = createFollowStatusHandler({ getStatus });
      const response = await handler(
        new Request(
          `${appBaseUrl}/api/me/follows/status?institutionId=${institutionId}&userId=attacker`,
          { headers: { cookie: sessionHeader() } },
        ),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        data: { authenticated: true, following },
      });
      expect(getStatus).toHaveBeenCalledWith(expect.any(String), institutionId);
      expectPrivate(response);
    },
  );

  it("fails closed with 200 and private headers on malformed input or repository failure", async () => {
    // Mutation caught: throwing a private read failure or returning a cacheable/error-shaped response.
    const getStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("postgres private row"));
    const handler = createFollowStatusHandler({ getStatus });
    const failed = await handler(
      new Request(
        `${appBaseUrl}/api/me/follows/status?institutionId=${institutionId}`,
      ),
    );
    const malformed = await handler(
      new Request(
        `${appBaseUrl}/api/me/follows/status?institutionId=not-a-uuid`,
      ),
    );

    expect(await failed.json()).toEqual({
      data: { authenticated: false, following: false },
    });
    expect(await malformed.json()).toEqual({
      data: { authenticated: false, following: false },
    });
    expect(getStatus).toHaveBeenCalledTimes(1);
    expectPrivate(failed);
    expectPrivate(malformed);
  });
});
