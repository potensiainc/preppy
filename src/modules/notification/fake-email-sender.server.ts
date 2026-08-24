import "server-only";

import type {
  EmailSender,
  EmailSendContext,
  RenderedEmailMessage,
  SendEmailResult,
} from "@/src/modules/notification/email-sender";

export class FakeEmailSender implements EmailSender {
  readonly provider = "FAKE";
  private readonly calls: Array<{
    message: RenderedEmailMessage;
    context: EmailSendContext;
  }> = [];
  private cursor = 0;

  constructor(private readonly outcomes: readonly SendEmailResult[]) {}

  async send(
    message: RenderedEmailMessage,
    context: EmailSendContext,
  ): Promise<SendEmailResult> {
    const outcome = this.outcomes[this.cursor];
    if (!outcome) {
      throw new Error("FakeEmailSender has no configured outcome.");
    }
    this.cursor += 1;
    this.calls.push({
      message: { ...message },
      context: { ...context },
    });
    return { ...outcome };
  }

  snapshot() {
    return this.calls.map((call) => ({
      message: { ...call.message },
      context: { ...call.context },
    }));
  }
}
