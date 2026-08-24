import { createHash } from "node:crypto";

import { z } from "zod";

import { parseSecurityJson } from "@/src/modules/admin/auth/security-json.server";

export const RESEND_WEBHOOK_MAX_BODY_BYTES = 64 * 1_024;

const supportedEventTypes = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.failed",
  "email.complained",
  "email.bounced",
  "email.opened",
  "email.clicked",
  "email.suppressed",
] as const;

export type SupportedResendWebhookEventType =
  (typeof supportedEventTypes)[number];

export type ParsedResendWebhookEvent = {
  type: string;
  providerCreatedAt: Date;
  providerMessageId?: string;
  bounceType?: "PERMANENT" | "TRANSIENT" | "UNDETERMINED";
  supported: boolean;
};

const printableIdSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[!-~]+$/);

const rawEventSchema = z
  .object({
    type: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9._-]+$/),
    created_at: z.string().min(1).max(64),
    data: z
      .object({
        email_id: printableIdSchema.optional(),
        bounce: z
          .object({ type: z.enum(["Permanent", "Transient", "Undetermined"]) })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

const supportedTypeSet = new Set<string>(supportedEventTypes);

function parseTimestamp(value: string): Date {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("Resend webhook created_at is invalid");
  }
  return timestamp;
}

export function resendWebhookPayloadHash(body: Uint8Array): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

export function parseResendWebhookEvent(
  body: Uint8Array,
): ParsedResendWebhookEvent {
  if (body.byteLength > RESEND_WEBHOOK_MAX_BODY_BYTES) {
    throw new Error("Resend webhook body exceeds size limit");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new Error("Resend webhook body is not valid UTF-8");
  }

  const parsed = rawEventSchema.parse(
    parseSecurityJson(text, {
      maxBytes: RESEND_WEBHOOK_MAX_BODY_BYTES,
      maxDepth: 20,
      maxObjectMembers: 256,
      maxArrayItems: 256,
      maxStringBytes: 16 * 1_024,
    }),
  );
  const supported = supportedTypeSet.has(parsed.type);
  if (supported && !parsed.data.email_id) {
    throw new Error("Supported Resend webhook is missing email_id");
  }

  const event: ParsedResendWebhookEvent = {
    type: parsed.type,
    providerCreatedAt: parseTimestamp(parsed.created_at),
    ...(parsed.data.email_id
      ? { providerMessageId: parsed.data.email_id }
      : {}),
    supported,
  };
  if (parsed.type === "email.bounced") {
    if (!parsed.data.bounce?.type) {
      throw new Error("Resend bounce event is missing bounce type");
    }
    event.bounceType = parsed.data.bounce.type.toUpperCase() as
      "PERMANENT" | "TRANSIENT" | "UNDETERMINED";
  }
  return event;
}
