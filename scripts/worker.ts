import { pathToFileURL } from "node:url";

import { getServerAnalyticsTracker } from "@/src/analytics/runtime.server";
import { getSideEffectEnv } from "@/src/config/runtime-env";
import { getCacheRevalidationConfig } from "@/src/modules/cache/config.server";
import {
  HttpCacheRevalidationClient,
  type CacheRevalidationClient,
} from "@/src/modules/cache/revalidation-client.server";
import { getSeoAppBaseUrl } from "@/src/modules/public/seo";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import type {
  EmailSender,
  EmailSendContext,
  RenderedEmailMessage,
  SendEmailResult,
} from "@/src/modules/notification/email-sender";
import { getResendSendConfig } from "@/src/modules/notification/resend-config.server";
import { ResendEmailSender } from "@/src/modules/notification/resend-email-sender.server";
import {
  parseWorkerCliArguments,
  type FakeWorkerOutcome,
} from "@/src/modules/worker/cli";
import { runWorkerOnce } from "@/src/modules/worker/run-once.server";

class RepeatingFakeEmailSender implements EmailSender {
  readonly provider = "FAKE";

  constructor(private readonly outcome: FakeWorkerOutcome) {}

  async send(
    _message: RenderedEmailMessage,
    context: EmailSendContext,
  ): Promise<SendEmailResult> {
    switch (this.outcome) {
      case "ACCEPTED":
        return {
          kind: "ACCEPTED",
          provider: this.provider,
          providerMessageId: `fake-${context.deliveryId}-${context.attemptNumber}`,
        };
      case "RETRYABLE_FAILURE":
        return {
          kind: "RETRYABLE_FAILURE",
          provider: this.provider,
          errorCode: "FAKE_RETRYABLE_FAILURE",
        };
      case "TERMINAL_FAILURE":
        return {
          kind: "TERMINAL_FAILURE",
          provider: this.provider,
          errorCode: "FAKE_TERMINAL_FAILURE",
        };
      case "RESULT_UNKNOWN":
        return {
          kind: "RESULT_UNKNOWN",
          provider: this.provider,
          errorCode: "PROVIDER_RESULT_UNKNOWN",
        };
    }
  }
}

class DisabledResendEmailSender implements EmailSender {
  readonly provider = "RESEND";

  async send(): Promise<SendEmailResult> {
    throw new Error("Disabled Resend sender must not be called.");
  }
}

const disabledCacheRevalidator: CacheRevalidationClient = {
  async revalidate() {
    throw new Error("Disabled Worker must not process cache events.");
  },
};

export async function runWorkerCommand(arguments_: readonly string[]) {
  const cli = parseWorkerCliArguments(arguments_);
  if (!cli) return { exitCode: 2, output: "Invalid worker arguments." };
  if (process.env.NODE_ENV === "production" && "fakeOutcome" in cli) {
    return {
      exitCode: 2,
      output: "Fake sender mode is forbidden in production.",
    };
  }

  const sideEffects = getSideEffectEnv();
  const runtime = getRuntimeDatabase();
  try {
    const sender: EmailSender =
      "provider" in cli
        ? sideEffects.EMAIL_SEND_ENABLED
          ? new ResendEmailSender(getResendSendConfig())
          : new DisabledResendEmailSender()
        : new RepeatingFakeEmailSender(cli.fakeOutcome);
    const cacheRevalidator = sideEffects.WORKER_ENABLED
      ? new HttpCacheRevalidationClient({
          appBaseUrl: getSeoAppBaseUrl(),
          secret: getCacheRevalidationConfig().secret,
        })
      : disabledCacheRevalidator;
    const result = await runWorkerOnce(
      {
        enabled: sideEffects.WORKER_ENABLED,
        emailSendEnabled: sideEffects.EMAIL_SEND_ENABLED,
        workerId: cli.workerId,
        batchSize: cli.batchSize,
        leaseDurationMs: cli.leaseDurationMs,
        now: new Date(),
      },
      {
        transactionManager: runtime.transactionManager,
        sender,
        tracker: getServerAnalyticsTracker(),
        cacheRevalidator,
        ...(process.env.APP_BASE_URL === undefined
          ? {}
          : { appBaseUrl: process.env.APP_BASE_URL }),
      },
    );
    return { exitCode: 0, output: JSON.stringify(result) };
  } finally {
    await closeRuntimeDatabase();
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (invokedPath === import.meta.url) {
  const result = await runWorkerCommand(process.argv.slice(2));
  const stream = result.exitCode === 0 ? process.stdout : process.stderr;
  stream.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
}
