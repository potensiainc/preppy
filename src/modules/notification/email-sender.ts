export type SendEmailResult =
  | {
      readonly kind: "ACCEPTED";
      readonly provider: string;
      readonly providerMessageId?: string;
    }
  | {
      readonly kind: "RETRYABLE_FAILURE";
      readonly provider: string;
      readonly errorCode: string;
      readonly retryAfterMs?: number;
    }
  | {
      readonly kind: "TERMINAL_FAILURE";
      readonly provider: string;
      readonly errorCode: string;
    }
  | {
      readonly kind: "RESULT_UNKNOWN";
      readonly provider: string;
      readonly errorCode: "PROVIDER_RESULT_UNKNOWN";
    };

export type RenderedEmailMessage = Readonly<{
  to: string;
  subject: string;
  text: string;
  notificationId: string;
  deliveryId: string;
}>;

export type EmailSendContext = Readonly<{
  deliveryId: string;
  attemptNumber: number;
}>;

export type EmailProviderRequestIdentity = Readonly<{
  provider: string;
  version: number;
  idempotencyKey: string;
  payloadHash: string;
  recipientHash: string;
}>;

export interface EmailSender {
  readonly provider: string;
  describeRequest?(
    message: RenderedEmailMessage,
    context: EmailSendContext,
  ): EmailProviderRequestIdentity;
  send(
    message: RenderedEmailMessage,
    context: EmailSendContext,
  ): Promise<SendEmailResult>;
}
