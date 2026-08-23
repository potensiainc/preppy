import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { UserCommandContext } from "@/src/application/context";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  NotEligibleError,
  NotFoundError,
  UnauthenticatedError,
} from "@/src/application/errors";
import { assertSameOriginForMutation } from "@/src/modules/auth/origin.server";
import {
  readUserSession,
  USER_SESSION_COOKIE_NAME,
} from "@/src/modules/auth/session.server";
import type { ActivateFollowResult } from "@/src/modules/follow/activate-follow.server";
import type { DeactivateFollowResult } from "@/src/modules/follow/deactivate-follow.server";

const MAX_BODY_BYTES = 16 * 1_024;
const ANONYMOUS_STATUS: FollowStatus = {
  authenticated: false,
  following: false,
};

const activateInputSchema = z
  .object({
    institutionId: z.uuid().transform((value) => value.toLowerCase()),
  })
  .strict();
const institutionIdSchema = z.uuid().transform((value) => value.toLowerCase());

type Clock = () => Date;
type CorrelationIdFactory = () => string;

export type FollowStatus = {
  authenticated: boolean;
  following: boolean;
};

type FollowMutationDependencies = {
  appBaseUrl: string;
  sessionSecret: string;
  now?: Clock;
  createCorrelationId?: CorrelationIdFactory;
};

type FollowErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "USER_NOT_ACTIVE"
  | "INSTITUTION_NOT_FOUND"
  | "INSTITUTION_NOT_FOLLOWABLE"
  | "FOLLOW_CONFLICT"
  | "RETRYABLE"
  | "INTERNAL_ERROR";

class BodyReadError extends Error {
  constructor(readonly status: 400 | 413 | 503) {
    super("Request body could not be read safely");
  }
}

function privateHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set("cache-control", "private, no-store");
  headers.set("pragma", "no-cache");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

function readCookie(request: Request, name: string): string | null {
  const serialized = request.headers.get("cookie");
  if (!serialized) return null;
  for (const pair of serialized.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") throw new BodyReadError(400);

  const declaredLength = request.headers.get("content-length")?.trim();
  if (declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) throw new BodyReadError(400);
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength)) throw new BodyReadError(400);
    if (parsedLength > MAX_BODY_BYTES) throw new BodyReadError(413);
  }

  if (!request.body) throw new BodyReadError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new BodyReadError(413);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BodyReadError) throw error;
    try {
      await reader.cancel();
    } catch {
      // The response deliberately hides stream implementation details.
    }
    throw new BodyReadError(503);
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(
      Buffer.concat(
        chunks.map((chunk) => Buffer.from(chunk)),
        totalBytes,
      ).toString("utf8"),
    ) as unknown;
  } catch {
    throw new BodyReadError(400);
  }
}

function mutationJson(
  value: unknown,
  status: number,
  correlationId: string,
): Response {
  return Response.json(value, {
    status,
    headers: privateHeaders({
      "content-type": "application/json",
      "x-correlation-id": correlationId,
    }),
  });
}

function followError(error: unknown): {
  status: number;
  code: FollowErrorCode;
  message: string;
} {
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "요청 형식이 올바르지 않습니다.",
    };
  }
  if (error instanceof BodyReadError) {
    return {
      status: error.status,
      code: error.status === 503 ? "RETRYABLE" : "VALIDATION_ERROR",
      message:
        error.status === 413
          ? "요청 본문이 너무 큽니다."
          : error.status === 503
            ? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : "요청 형식이 올바르지 않습니다.",
    };
  }
  if (error instanceof UnauthenticatedError) {
    return {
      status: 401,
      code: "USER_NOT_ACTIVE",
      message: "현재 활성화된 계정으로 로그인해 주세요.",
    };
  }
  if (error instanceof ForbiddenError) {
    return {
      status: 403,
      code: "USER_NOT_ACTIVE",
      message: "현재 계정 상태에서는 관심기관을 변경할 수 없습니다.",
    };
  }
  if (error instanceof NotFoundError) {
    return {
      status: 404,
      code: "INSTITUTION_NOT_FOUND",
      message: "관심기관을 확인할 수 없습니다.",
    };
  }
  if (error instanceof NotEligibleError) {
    return {
      status: 403,
      code: "INSTITUTION_NOT_FOLLOWABLE",
      message: "이 기관은 현재 업데이트 받기를 신청할 수 없습니다.",
    };
  }
  if (error instanceof ConflictError) {
    return {
      status: 409,
      code: "FOLLOW_CONFLICT",
      message: "관심기관 상태를 확인한 뒤 다시 시도해 주세요.",
    };
  }
  if (error instanceof ApplicationError) {
    const retryable = error.code === "RETRYABLE";
    return {
      status: error.status,
      code:
        error.code === "VALIDATION_ERROR"
          ? "VALIDATION_ERROR"
          : retryable
            ? "RETRYABLE"
            : "INTERNAL_ERROR",
      message:
        error.code === "VALIDATION_ERROR"
          ? "요청 형식이 올바르지 않습니다."
          : retryable
            ? "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : "요청을 처리하지 못했습니다.",
    };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "요청을 처리하지 못했습니다.",
  };
}

function errorResponse(error: unknown, correlationId: string): Response {
  const mapped = followError(error);
  return mutationJson(
    {
      error: {
        code: mapped.code,
        message: mapped.message,
        correlationId,
      },
    },
    mapped.status,
    correlationId,
  );
}

function unauthenticatedResponse(correlationId: string): Response {
  return mutationJson(
    {
      error: {
        code: "UNAUTHENTICATED",
        message: "로그인이 필요합니다.",
        correlationId,
      },
    },
    401,
    correlationId,
  );
}

function createMutationContext(
  request: Request,
  dependencies: FollowMutationDependencies,
  correlationId: string,
): UserCommandContext | Response {
  const now = dependencies.now?.() ?? new Date();
  const session = readUserSession(
    readCookie(request, USER_SESSION_COOKIE_NAME),
    { secret: dependencies.sessionSecret, now },
  );
  if (!session) return unauthenticatedResponse(correlationId);
  return { userId: session.userId, correlationId, occurredAt: now };
}

export function createFollowPostHandler(
  dependencies: FollowMutationDependencies & {
    activateFollow(
      context: UserCommandContext,
      input: { institutionId: string },
    ): Promise<ActivateFollowResult>;
  },
): (request: Request) => Promise<Response> {
  return async (request) => {
    const correlationId = dependencies.createCorrelationId?.() ?? randomUUID();
    try {
      assertSameOriginForMutation(request, dependencies.appBaseUrl);
    } catch {
      return mutationJson(
        {
          error: {
            code: "FORBIDDEN",
            message: "요청을 확인할 수 없습니다.",
            correlationId,
          },
        },
        403,
        correlationId,
      );
    }

    const context = createMutationContext(request, dependencies, correlationId);
    if (context instanceof Response) return context;

    try {
      const input = activateInputSchema.parse(await readBoundedJson(request));
      const result = await dependencies.activateFollow(context, input);
      return mutationJson({ data: result }, 200, correlationId);
    } catch (error) {
      return errorResponse(error, correlationId);
    }
  };
}

export function createFollowDeleteHandler(
  dependencies: FollowMutationDependencies & {
    deactivateFollow(
      context: UserCommandContext,
      input: { institutionId: string },
    ): Promise<DeactivateFollowResult>;
  },
): (request: Request, institutionId: string) => Promise<Response> {
  return async (request, rawInstitutionId) => {
    const correlationId = dependencies.createCorrelationId?.() ?? randomUUID();
    try {
      assertSameOriginForMutation(request, dependencies.appBaseUrl);
    } catch {
      return mutationJson(
        {
          error: {
            code: "FORBIDDEN",
            message: "요청을 확인할 수 없습니다.",
            correlationId,
          },
        },
        403,
        correlationId,
      );
    }

    const context = createMutationContext(request, dependencies, correlationId);
    if (context instanceof Response) return context;

    try {
      const institutionId = institutionIdSchema.parse(rawInstitutionId);
      await dependencies.deactivateFollow(context, { institutionId });
      return new Response(null, {
        status: 204,
        headers: privateHeaders({ "x-correlation-id": correlationId }),
      });
    } catch (error) {
      return errorResponse(error, correlationId);
    }
  };
}

export function createFollowStatusHandler(dependencies: {
  getStatus(
    sessionCookie: string | null,
    institutionId: string,
  ): Promise<FollowStatus>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const institutionId = institutionIdSchema.safeParse(
      new URL(request.url).searchParams.get("institutionId"),
    );
    let status = ANONYMOUS_STATUS;
    if (institutionId.success) {
      try {
        status = await dependencies.getStatus(
          readCookie(request, USER_SESSION_COOKIE_NAME),
          institutionId.data,
        );
      } catch {
        status = ANONYMOUS_STATUS;
      }
    }
    return Response.json(
      { data: status },
      {
        status: 200,
        headers: privateHeaders({
          "content-type": "application/json",
          vary: "Cookie",
        }),
      },
    );
  };
}

export function createFollowMutationRuntimeHandler<
  Runtime,
  Args extends unknown[],
>(
  getRuntime: () => Runtime,
  createHandler: (
    runtime: Runtime,
  ) => (request: Request, ...args: Args) => Promise<Response>,
): (request: Request, ...args: Args) => Promise<Response> {
  return async (request, ...args) => {
    try {
      return await createHandler(getRuntime())(request, ...args);
    } catch (error) {
      return errorResponse(error, randomUUID());
    }
  };
}

export function createFollowStatusRuntimeHandler<Runtime>(
  getRuntime: () => Runtime,
  createHandler: (runtime: Runtime) => (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      return await createHandler(getRuntime())(request);
    } catch {
      return Response.json(
        { data: ANONYMOUS_STATUS },
        {
          status: 200,
          headers: privateHeaders({
            "content-type": "application/json",
            vary: "Cookie",
          }),
        },
      );
    }
  };
}
