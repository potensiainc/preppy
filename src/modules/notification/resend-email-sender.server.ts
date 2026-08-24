import "server-only";

import { z } from "zod";

import { parseSecurityJson } from "@/src/modules/admin/auth/security-json.server";
import type {
  EmailProviderRequestIdentity,
  EmailSender,
  EmailSendContext,
  RenderedEmailMessage,
  SendEmailResult,
} from "@/src/modules/notification/email-sender";
import type { ResendSendConfig } from "@/src/modules/notification/resend-config.server";
import {
  prepareResendRequest,
  resendRequestIdentity,
} from "@/src/modules/notification/resend-request";

export const RESEND_PROVIDER = "RESEND";
const DEFAULT_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 16_384;
const PROVIDER_MESSAGE_ID = /^[\x21-\x7e]{1,255}$/;
const MAX_RETRY_AFTER_MS = 300_000;

const successSchema = z
  .object({ id: z.string().regex(PROVIDER_MESSAGE_ID) })
  .strict();
const errorSchema = z
  .object({
    name: z.string().min(1).max(100),
    message: z.string().max(2_000),
    statusCode: z.number().int().min(400).max(599).optional(),
  })
  .passthrough();

export type ResendEmailSenderOptions = Readonly<{
  endpoint?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  fetchImplementation?: typeof fetch;
}>;

async function readBoundedResponse(response: Response, maximum: number) {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("RESEND_RESPONSE_LIMIT");
    }
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel().catch(() => undefined);
        throw new Error("RESEND_RESPONSE_LIMIT");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function parseJson(bytes: Uint8Array, maximum: number): unknown {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return parseSecurityJson(text, {
    maxBytes: maximum,
    maxDepth: 5,
    maxObjectMembers: 20,
    maxArrayItems: 20,
    maxStringBytes: 2_000,
  });
}

function retryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (value === null || !/^\d{1,6}$/.test(value)) return undefined;
  const milliseconds = Number(value) * 1_000;
  return milliseconds >= 1 && milliseconds <= MAX_RETRY_AFTER_MS
    ? milliseconds
    : undefined;
}

function unknownResult(): SendEmailResult {
  return {
    kind: "RESULT_UNKNOWN",
    provider: RESEND_PROVIDER,
    errorCode: "PROVIDER_RESULT_UNKNOWN",
  };
}

function classifyError(response: Response, value: unknown): SendEmailResult {
  const parsed = errorSchema.safeParse(value);
  const name = parsed.success ? parsed.data.name : null;
  if (name === "invalid_idempotency_key") {
    return {
      kind: "TERMINAL_FAILURE",
      provider: RESEND_PROVIDER,
      errorCode: "RESEND_INVALID_IDEMPOTENCY_KEY",
    };
  }
  if (name === "invalid_idempotent_request") {
    return {
      kind: "TERMINAL_FAILURE",
      provider: RESEND_PROVIDER,
      errorCode: "RESEND_IDEMPOTENCY_CONFLICT",
    };
  }
  if (name === "concurrent_idempotent_requests") {
    return {
      kind: "RETRYABLE_FAILURE",
      provider: RESEND_PROVIDER,
      errorCode: "RESEND_IDEMPOTENCY_IN_PROGRESS",
    };
  }
  if (response.status === 429) {
    const retryAfterMs = retryAfter(response);
    return {
      kind: "RETRYABLE_FAILURE",
      provider: RESEND_PROVIDER,
      errorCode: "RESEND_RATE_LIMITED",
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    };
  }
  if (response.status >= 500) {
    return {
      kind: "RETRYABLE_FAILURE",
      provider: RESEND_PROVIDER,
      errorCode: "RESEND_SERVER_ERROR",
    };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      kind: "TERMINAL_FAILURE",
      provider: RESEND_PROVIDER,
      errorCode: "RESEND_AUTH_REJECTED",
    };
  }
  return {
    kind: "TERMINAL_FAILURE",
    provider: RESEND_PROVIDER,
    errorCode: "RESEND_VALIDATION_REJECTED",
  };
}

export class ResendEmailSender implements EmailSender {
  readonly provider = RESEND_PROVIDER;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly fetchImplementation: typeof fetch;

  constructor(
    private readonly config: ResendSendConfig,
    options: ResendEmailSenderOptions = {},
  ) {
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  describeRequest(
    message: RenderedEmailMessage,
    context: EmailSendContext,
  ): EmailProviderRequestIdentity {
    return resendRequestIdentity(
      prepareResendRequest(message, context, this.config),
    );
  }

  async send(
    message: RenderedEmailMessage,
    context: EmailSendContext,
  ): Promise<SendEmailResult> {
    const request = prepareResendRequest(message, context, this.config);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": request.idempotencyKey,
        },
        body: request.body,
        signal: controller.signal,
      });
      let value: unknown;
      try {
        value = parseJson(
          await readBoundedResponse(response, this.maxResponseBytes),
          this.maxResponseBytes,
        );
      } catch {
        return response.ok ? unknownResult() : classifyError(response, null);
      }
      if (response.ok) {
        const parsed = successSchema.safeParse(value);
        return parsed.success
          ? {
              kind: "ACCEPTED",
              provider: RESEND_PROVIDER,
              providerMessageId: parsed.data.id,
            }
          : unknownResult();
      }
      return classifyError(response, value);
    } catch {
      return unknownResult();
    } finally {
      clearTimeout(timeout);
    }
  }
}
