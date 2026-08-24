import "server-only";

import { z } from "zod";

const resendApiKey = z
  .string()
  .min(4)
  .max(512)
  .regex(/^re_[\x21-\x7e]+$/);
const emailFrom = z
  .string()
  .min(3)
  .max(320)
  .refine(
    (value) =>
      /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) ||
      /^[^\r\n<>]{1,200}<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/.test(value),
  );
const webhookSecret = z
  .string()
  .min(7)
  .max(512)
  .regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/);

const sendSchema = z
  .object({
    RESEND_API_KEY: resendApiKey,
    EMAIL_FROM: emailFrom,
  })
  .transform((value) => ({
    apiKey: value.RESEND_API_KEY,
    from: value.EMAIL_FROM,
  }));

const webhookSchema = z
  .object({ RESEND_WEBHOOK_SECRET: webhookSecret })
  .transform((value) => ({ webhookSecret: value.RESEND_WEBHOOK_SECRET }));

export type ResendSendConfig = z.infer<typeof sendSchema>;
export type ResendWebhookConfig = z.infer<typeof webhookSchema>;

export function parseResendSendConfig(
  environment: Record<string, string | undefined>,
): ResendSendConfig {
  return sendSchema.parse(environment);
}

export function getResendSendConfig(): ResendSendConfig {
  return parseResendSendConfig(process.env);
}

export function parseResendWebhookConfig(
  environment: Record<string, string | undefined>,
): ResendWebhookConfig {
  return webhookSchema.parse(environment);
}

export function getResendWebhookConfig(): ResendWebhookConfig {
  return parseResendWebhookConfig(process.env);
}
