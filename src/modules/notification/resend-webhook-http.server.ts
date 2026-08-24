import "server-only";

import { NoopAnalyticsTracker } from "@/src/analytics/tracker";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { processResendProviderEvent } from "@/src/modules/notification/process-resend-provider-event.server";
import { getResendWebhookConfig } from "@/src/modules/notification/resend-config.server";
import {
  parseResendWebhookEvent,
  RESEND_WEBHOOK_MAX_BODY_BYTES,
  resendWebhookPayloadHash,
} from "@/src/modules/notification/resend-webhook-event.server";
import { verifyResendWebhookSignature } from "@/src/modules/notification/resend-webhook-signature.server";

type ProcessEventInput = Parameters<typeof processResendProviderEvent>[1];

type ResendWebhookHttpDependencies = Readonly<{
  webhookSecret: string;
  now?: () => Date;
  processEvent: (input: ProcessEventInput) => Promise<unknown>;
}>;

const tracker = new NoopAnalyticsTracker();

class ResendWebhookBodyTooLargeError extends Error {}

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store, max-age=0" },
  });
}

function runtimeDependencies(): ResendWebhookHttpDependencies {
  const config = getResendWebhookConfig();
  const transactionManager = getRuntimeDatabase().transactionManager;
  return {
    webhookSecret: config.webhookSecret,
    processEvent: (input) =>
      processResendProviderEvent(transactionManager, input, { tracker }),
  };
}

async function readBoundedRawBody(request: Request): Promise<Uint8Array> {
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const result = new Uint8Array(RESEND_WEBHOOK_MAX_BODY_BYTES);
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (
        !(value instanceof Uint8Array) ||
        value.byteLength > RESEND_WEBHOOK_MAX_BODY_BYTES - length
      ) {
        throw new ResendWebhookBodyTooLargeError();
      }
      result.set(value, length);
      length += value.byteLength;
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Response classification does not depend on transport cancellation.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  return result.slice(0, length);
}

export async function handleResendWebhookRequest(
  request: Request,
  dependencies?: ResendWebhookHttpDependencies,
): Promise<Response> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType?.trim().toLowerCase() !== "application/json") {
    return json(415, { received: false });
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > RESEND_WEBHOOK_MAX_BODY_BYTES
    ) {
      return json(413, { received: false });
    }
  }

  try {
    const activeDependencies = dependencies ?? runtimeDependencies();
    const body = await readBoundedRawBody(request);
    const verified = verifyResendWebhookSignature({
      body,
      headers: request.headers,
      secret: activeDependencies.webhookSecret,
      now: activeDependencies.now?.(),
    });
    const event = parseResendWebhookEvent(body);
    await activeDependencies.processEvent({
      providerEventId: verified.providerEventId,
      payloadHash: resendWebhookPayloadHash(body),
      receivedAt: activeDependencies.now?.() ?? new Date(),
      event,
    });
    return json(200, { received: true });
  } catch (error) {
    if (error instanceof ResendWebhookBodyTooLargeError) {
      return json(413, { received: false });
    }
    const isClientFailure =
      error instanceof SyntaxError ||
      (error instanceof Error &&
        (error.name === "SecurityJsonError" ||
          error.name === "ZodError" ||
          error.name === "ResendWebhookVerificationError" ||
          error.message.startsWith("Resend webhook")));
    return json(isClientFailure ? 400 : 500, { received: false });
  }
}
