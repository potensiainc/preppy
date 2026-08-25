import "server-only";

import { createHash } from "node:crypto";

import { sql } from "drizzle-orm";

import type { AnalyticsTracker } from "@/src/analytics/tracker";
import { ValidationError } from "@/src/application/errors";
import type { TransactionManager } from "@/src/infrastructure/db/runtime.server";
import type { ParsedResendWebhookEvent } from "@/src/modules/notification/resend-webhook-event.server";

const PROVIDER_EVENT_ID_PATTERN = /^[\x21-\x7e]{1,255}$/;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

type ProcessResendProviderEventInput = Readonly<{
  providerEventId: string;
  payloadHash: string;
  receivedAt: Date;
  event: ParsedResendWebhookEvent;
}>;

type ProcessResendProviderEventDependencies = Readonly<{
  tracker: AnalyticsTracker;
}>;

function sha256(value: string) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function validateInput(input: ProcessResendProviderEventInput) {
  if (
    !PROVIDER_EVENT_ID_PATTERN.test(input.providerEventId) ||
    !HASH_PATTERN.test(input.payloadHash) ||
    !(input.receivedAt instanceof Date) ||
    !Number.isFinite(input.receivedAt.getTime()) ||
    !(input.event.providerCreatedAt instanceof Date) ||
    !Number.isFinite(input.event.providerCreatedAt.getTime()) ||
    input.event.type.length < 1 ||
    input.event.type.length > 128 ||
    !/^[a-z0-9._-]+$/.test(input.event.type) ||
    (input.event.providerMessageId !== undefined &&
      !PROVIDER_EVENT_ID_PATTERN.test(input.event.providerMessageId))
  ) {
    throw ValidationError.invalidRequest();
  }
}

function latestSuccessfulAt(delivery: {
  deliveredAt: Date | string | null;
  openedAt: Date | string | null;
  clickedAt: Date | string | null;
}): Date | null {
  const values = [
    delivery.deliveredAt,
    delivery.openedAt,
    delivery.clickedAt,
  ].filter((value): value is Date | string => value !== null);
  if (values.length === 0) return null;
  return new Date(
    Math.max(...values.map((value) => new Date(value).getTime())),
  );
}

export async function processResendProviderEvent(
  transactionManager: Pick<TransactionManager, "run">,
  input: ProcessResendProviderEventInput,
  dependencies: ProcessResendProviderEventDependencies,
) {
  validateInput(input);
  const eventAt = input.event.providerCreatedAt.toISOString();
  const receivedAt = input.receivedAt.toISOString();

  const result = await transactionManager.run(async (executor) => {
    const [receipt] = (await executor.raw(sql`
      insert into email_provider_events(
        provider, provider_event_id, provider_message_id, event_type,
        provider_created_at, received_at, processing_status, payload_hash
      ) values (
        'RESEND', ${input.providerEventId},
        ${input.event.providerMessageId ?? null}, ${input.event.type},
        ${eventAt}::timestamptz, ${receivedAt}::timestamptz, 'RECEIVED',
        ${input.payloadHash}
      )
      on conflict (provider, provider_event_id) do nothing
      returning id
    `)) as unknown as Array<{ id: string }>;
    if (!receipt) return { kind: "DUPLICATE" } as const;

    async function ignore(reason: string) {
      await executor.raw(sql`
        update email_provider_events
        set processing_status='IGNORED', processed_at=${receivedAt}::timestamptz,
          safe_error_code=${reason}
        where id=${receipt.id} and processing_status='RECEIVED'
      `);
      return { kind: "IGNORED", reason } as const;
    }

    if (!input.event.supported) {
      return ignore("UNSUPPORTED_EVENT_TYPE");
    }
    if (!input.event.providerMessageId) {
      return ignore("MISSING_PROVIDER_MESSAGE_ID");
    }

    const [delivery] = (await executor.raw(sql`
      select delivery.id, delivery.user_id as "userId",
        delivery.status, delivery.recipient_hash as "recipientHash",
        delivery.delivered_at as "deliveredAt",
        delivery.opened_at as "openedAt",
        delivery.clicked_at as "clickedAt"
      from notification_delivery_attempts attempt
      join notification_deliveries delivery
        on delivery.id=attempt.notification_delivery_id
      where attempt.provider='RESEND'
        and attempt.provider_message_id=${input.event.providerMessageId}
        and attempt.attempt_status='ACCEPTED'
      for update of attempt, delivery
    `)) as unknown as Array<{
      id: string;
      userId: string;
      status: string;
      recipientHash: string | null;
      deliveredAt: Date | string | null;
      openedAt: Date | string | null;
      clickedAt: Date | string | null;
    }>;
    if (!delivery) return ignore("UNMATCHED_PROVIDER_MESSAGE");

    let mutateCurrentEmail: "BOUNCED" | "SUPPRESSED" | undefined;
    switch (input.event.type) {
      case "email.sent":
      case "email.delivery_delayed":
        break;
      case "email.delivered":
        await executor.raw(sql`
          update notification_deliveries
          set status=case when status='SENT' then 'DELIVERED' else status end,
            delivered_at=case
              when delivered_at is null then ${eventAt}::timestamptz
              else least(delivered_at, ${eventAt}::timestamptz)
            end
          where id=${delivery.id}
            and status in ('SENT', 'DELIVERED', 'OPENED', 'CLICKED')
        `);
        break;
      case "email.opened":
        await executor.raw(sql`
          update notification_deliveries
          set status=case
              when status in ('SENT', 'DELIVERED', 'OPENED') then 'OPENED'
              else status
            end,
            opened_at=case
              when opened_at is null then ${eventAt}::timestamptz
              else least(opened_at, ${eventAt}::timestamptz)
            end
          where id=${delivery.id}
            and status in ('SENT', 'DELIVERED', 'OPENED', 'CLICKED')
        `);
        break;
      case "email.clicked":
        await executor.raw(sql`
          update notification_deliveries
          set status='CLICKED',
            clicked_at=case
              when clicked_at is null then ${eventAt}::timestamptz
              else least(clicked_at, ${eventAt}::timestamptz)
            end
          where id=${delivery.id}
            and status in ('SENT', 'DELIVERED', 'OPENED', 'CLICKED')
        `);
        break;
      case "email.failed":
      case "email.bounced": {
        const successfulAt = latestSuccessfulAt(delivery);
        const failureIsOlder =
          successfulAt !== null &&
          successfulAt.getTime() > input.event.providerCreatedAt.getTime();
        if (!failureIsOlder && delivery.status !== "SUPPRESSED") {
          await executor.raw(sql`
            update notification_deliveries
            set status='FAILED', failed_at=${eventAt}::timestamptz
            where id=${delivery.id}
              and status in ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'FAILED')
          `);
          if (
            input.event.type === "email.bounced" &&
            input.event.bounceType === "PERMANENT"
          ) {
            mutateCurrentEmail = "BOUNCED";
          }
        }
        break;
      }
      case "email.complained":
      case "email.suppressed":
        await executor.raw(sql`
          update notification_deliveries
          set status='SUPPRESSED', suppress_reason='EMAIL_SUPPRESSED',
            suppressed_at=${eventAt}::timestamptz
          where id=${delivery.id} and status <> 'SUPPRESSED'
        `);
        mutateCurrentEmail = "SUPPRESSED";
        break;
    }

    if (mutateCurrentEmail && delivery.recipientHash) {
      const [currentEmail] = (await executor.raw(sql`
        select email_normalized as "emailNormalized"
        from user_emails where user_id=${delivery.userId}
        for update
      `)) as unknown as Array<{ emailNormalized: string }>;
      if (
        currentEmail &&
        sha256(currentEmail.emailNormalized) === delivery.recipientHash
      ) {
        await executor.raw(sql`
          update user_emails
          set delivery_state=${mutateCurrentEmail}, updated_at=${receivedAt}::timestamptz
          where user_id=${delivery.userId}
            and email_normalized=${currentEmail.emailNormalized}
        `);
      }
    }

    await executor.raw(sql`
      update email_provider_events
      set processing_status='PROCESSED', processed_at=${receivedAt}::timestamptz,
        safe_error_code=null
      where id=${receipt.id} and processing_status='RECEIVED'
    `);
    return {
      kind: "PROCESSED",
      deliveryId: delivery.id,
      analyticsEvent:
        input.event.type === "email.opened"
          ? ("notification_open" as const)
          : input.event.type === "email.clicked"
            ? ("notification_click" as const)
            : undefined,
    } as const;
  });

  if (result.kind === "PROCESSED" && result.analyticsEvent) {
    try {
      await dependencies.tracker.track(result.analyticsEvent, {
        deliveryId: result.deliveryId,
      });
    } catch {
      // Product analytics remains best-effort and runs only after commit.
    }
  }
  if (result.kind === "PROCESSED") {
    return { kind: result.kind, deliveryId: result.deliveryId } as const;
  }
  return result;
}
