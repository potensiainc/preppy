import "server-only";

import {
  mapApplicationErrorToHttp,
  type HttpErrorMapping,
} from "@/src/application/errors";
import { OriginMismatchError } from "@/src/modules/auth/origin.server";

const PRIVATE_NO_STORE_HEADERS = {
  "cache-control": "private, no-store",
  "content-type": "application/json; charset=utf-8",
} as const;

const KOREAN_CONFLICT_GUIDANCE =
  "다른 운영자가 먼저 변경했을 수 있습니다. 최신 데이터를 다시 확인한 뒤 변경 여부를 판단해주세요.";

const SAFE_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: "요청 형식이 올바르지 않습니다.",
  UNAUTHENTICATED: "인증이 필요합니다.",
  FORBIDDEN: "요청을 수행할 권한이 없습니다.",
  NOT_FOUND: "요청한 대상을 찾을 수 없습니다.",
  CONFLICT: KOREAN_CONFLICT_GUIDANCE,
  CONSENT_POLICY_UPDATED: KOREAN_CONFLICT_GUIDANCE,
  NOT_ELIGIBLE: "현재 상태에서는 이 작업을 수행할 수 없습니다.",
  RETRYABLE: "일시적으로 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.",
  EXTERNAL_PROVIDER_ERROR:
    "외부 서비스 요청을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.",
  INTERNAL_ERROR: "요청을 처리하지 못했습니다.",
};

function mappingForError(
  error: unknown,
  correlationId: string,
): HttpErrorMapping {
  if (error instanceof OriginMismatchError) {
    return {
      status: 403,
      body: {
        error: {
          code: "FORBIDDEN",
          message: "",
          correlationId,
        },
      },
    };
  }
  return mapApplicationErrorToHttp(error, correlationId);
}

export function privateNoStoreJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

export function createAdminErrorResponse(
  error: unknown,
  correlationId: string,
): Response {
  const mapped = mappingForError(error, correlationId);
  const safeMessage =
    SAFE_MESSAGES[mapped.body.error.code] ?? SAFE_MESSAGES.INTERNAL_ERROR!;
  return privateNoStoreJson(
    {
      error: {
        code: mapped.body.error.code,
        message: safeMessage,
        correlationId,
        ...(mapped.body.error.details === undefined
          ? {}
          : { details: mapped.body.error.details }),
      },
    },
    mapped.status,
  );
}
