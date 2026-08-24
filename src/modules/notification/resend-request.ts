import "server-only";

import { createHash } from "node:crypto";

import { ValidationError } from "@/src/application/errors";
import type {
  EmailProviderRequestIdentity,
  EmailSendContext,
  RenderedEmailMessage,
} from "@/src/modules/notification/email-sender";
import type { ResendSendConfig } from "@/src/modules/notification/resend-config.server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function resendIdempotencyKey(deliveryId: string): string {
  if (!UUID_PATTERN.test(deliveryId)) throw ValidationError.invalidRequest();
  return `preppy-delivery/${deliveryId}/v1`;
}

export type PreparedResendRequest = Readonly<{
  body: string;
  idempotencyKey: string;
  payloadHash: string;
  recipientHash: string;
}>;

export function prepareResendRequest(
  message: RenderedEmailMessage,
  context: EmailSendContext,
  config: ResendSendConfig,
): PreparedResendRequest {
  if (
    message.deliveryId !== context.deliveryId ||
    !UUID_PATTERN.test(message.deliveryId)
  ) {
    throw ValidationError.invalidRequest();
  }
  const body = JSON.stringify({
    from: config.from,
    to: [message.to],
    subject: message.subject,
    text: message.text,
  });
  return {
    body,
    idempotencyKey: resendIdempotencyKey(context.deliveryId),
    payloadHash: sha256(body),
    recipientHash: sha256(message.to),
  };
}

export function resendRequestIdentity(
  request: PreparedResendRequest,
): EmailProviderRequestIdentity {
  return {
    provider: "RESEND",
    version: 1,
    idempotencyKey: request.idempotencyKey,
    payloadHash: request.payloadHash,
    recipientHash: request.recipientHash,
  };
}
