import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt } from "./_shared";
import { users } from "./identity";
import { opportunities, opportunityChanges } from "./opportunities";

export const notificationStatusValues = [
  "PENDING",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;

export type NotificationStatus = (typeof notificationStatusValues)[number];

export const notificationSignalTypeValues = [
  "OPPORTUNITY_PUBLISHED",
  "OPPORTUNITY_CHANGED",
] as const;

export type NotificationSignalType =
  (typeof notificationSignalTypeValues)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "restrict" }),
    opportunityChangeId: uuid("opportunity_change_id"),
    signalType: text("signal_type").$type<NotificationSignalType>().notNull(),
    policyVersion: text("policy_version").notNull(),
    status: text("status").$type<NotificationStatus>().notNull(),
    signalPublishedAt: timestamp("signal_published_at", {
      withTimezone: true,
    }).notNull(),
    titleSnapshot: text("title_snapshot").notNull(),
    bodyContextJson: jsonb("body_context_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    deepLinkPath: text("deep_link_path").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: createdAt(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "notifications_opportunity_change_opportunity_fk",
      columns: [table.opportunityChangeId, table.opportunityId],
      foreignColumns: [opportunityChanges.id, opportunityChanges.opportunityId],
    }).onDelete("restrict"),
    uniqueIndex("notifications_change_policy_unique")
      .on(table.opportunityChangeId, table.policyVersion)
      .where(sql`${table.signalType} = 'OPPORTUNITY_CHANGED'`),
    uniqueIndex("notifications_published_policy_unique")
      .on(table.opportunityId, table.policyVersion)
      .where(sql`${table.signalType} = 'OPPORTUNITY_PUBLISHED'`),
    uniqueIndex("notifications_dedupe_key_unique").on(table.dedupeKey),
    index("notifications_opportunity_status_idx").on(
      table.opportunityId,
      table.status,
    ),
    index("notifications_status_signal_published_idx").on(
      table.status,
      table.signalPublishedAt,
    ),
    check(
      "notifications_signal_type_check",
      sql`${table.signalType} in ('OPPORTUNITY_PUBLISHED', 'OPPORTUNITY_CHANGED')`,
    ),
    check(
      "notifications_status_check",
      sql`${table.status} in ('PENDING', 'READY', 'COMPLETED', 'CANCELLED')`,
    ),
    check(
      "notifications_signal_origin_check",
      sql`(${table.signalType} = 'OPPORTUNITY_CHANGED' and ${table.opportunityChangeId} is not null)
        or (${table.signalType} = 'OPPORTUNITY_PUBLISHED' and ${table.opportunityChangeId} is null)`,
    ),
    check(
      "notifications_policy_version_check",
      sql`length(btrim(${table.policyVersion})) > 0`,
    ),
    check(
      "notifications_title_snapshot_check",
      sql`length(btrim(${table.titleSnapshot})) > 0`,
    ),
    check(
      "notifications_body_context_object_check",
      sql`jsonb_typeof(${table.bodyContextJson}) = 'object'`,
    ),
    check(
      "notifications_deep_link_path_check",
      sql`length(btrim(${table.deepLinkPath})) > 0`,
    ),
    check(
      "notifications_dedupe_key_check",
      sql`length(btrim(${table.dedupeKey})) > 0`,
    ),
  ],
);

export const notificationDeliveryChannelValues = ["EMAIL"] as const;

export type NotificationDeliveryChannel =
  (typeof notificationDeliveryChannelValues)[number];

export const notificationDeliveryStatusValues = [
  "PENDING",
  "QUEUED",
  "SENT",
  "DELIVERED",
  "OPENED",
  "CLICKED",
  "FAILED",
  "SUPPRESSED",
] as const;

export type NotificationDeliveryStatus =
  (typeof notificationDeliveryStatusValues)[number];

export const notificationDeliverySuppressReasonValues = [
  "USER_INACTIVE",
  "FOLLOW_INACTIVE",
  "PREFERENCE_DISABLED",
  "CONSENT_REVOKED",
  "EMAIL_UNAVAILABLE",
  "EMAIL_SUPPRESSED",
  "DUPLICATE",
  "OTHER",
] as const;

export type NotificationDeliverySuppressReason =
  (typeof notificationDeliverySuppressReasonValues)[number];

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    channel: text("channel").$type<NotificationDeliveryChannel>().notNull(),
    status: text("status").$type<NotificationDeliveryStatus>().notNull(),
    suppressReason:
      text("suppress_reason").$type<NotificationDeliverySuppressReason>(),
    recipientHash: text("recipient_hash"),
    createdAt: createdAt(),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("notification_deliveries_logical_unique").on(
      table.notificationId,
      table.userId,
      table.channel,
    ),
    index("notification_deliveries_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("notification_deliveries_user_created_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    check(
      "notification_deliveries_channel_check",
      sql`${table.channel} = 'EMAIL'`,
    ),
    check(
      "notification_deliveries_status_check",
      sql`${table.status} in ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'FAILED', 'SUPPRESSED')`,
    ),
    check(
      "notification_deliveries_suppress_reason_check",
      sql`${table.suppressReason} is null or ${table.suppressReason} in ('USER_INACTIVE', 'FOLLOW_INACTIVE', 'PREFERENCE_DISABLED', 'CONSENT_REVOKED', 'EMAIL_UNAVAILABLE', 'EMAIL_SUPPRESSED', 'DUPLICATE', 'OTHER')`,
    ),
    check(
      "notification_deliveries_suppression_check",
      sql`(${table.status} = 'SUPPRESSED' and ${table.suppressReason} is not null and ${table.suppressedAt} is not null)
        or (${table.status} <> 'SUPPRESSED' and ${table.suppressReason} is null and ${table.suppressedAt} is null)`,
    ),
    check(
      "notification_deliveries_recipient_hash_check",
      sql`${table.recipientHash} is null or length(btrim(${table.recipientHash})) > 0`,
    ),
  ],
);

export const notificationDeliveryAttemptStatusValues = [
  "STARTED",
  "ACCEPTED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
] as const;

export type NotificationDeliveryAttemptStatus =
  (typeof notificationDeliveryAttemptStatusValues)[number];

export const notificationDeliveryAttempts = pgTable(
  "notification_delivery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationDeliveryId: uuid("notification_delivery_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    attemptStatus: text("attempt_status")
      .$type<NotificationDeliveryAttemptStatus>()
      .notNull(),
    errorCode: text("error_code"),
    errorMessageSafe: text("error_message_safe"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "notification_attempts_delivery_fk",
      columns: [table.notificationDeliveryId],
      foreignColumns: [notificationDeliveries.id],
    }).onDelete("restrict"),
    uniqueIndex("notification_delivery_attempts_number_unique").on(
      table.notificationDeliveryId,
      table.attemptNumber,
    ),
    uniqueIndex("notification_delivery_attempts_provider_message_unique")
      .on(table.provider, table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    index("notification_delivery_attempts_status_idx").on(table.attemptStatus),
    check(
      "notification_delivery_attempts_number_check",
      sql`${table.attemptNumber} > 0`,
    ),
    check(
      "notification_delivery_attempts_provider_check",
      sql`length(btrim(${table.provider})) > 0`,
    ),
    check(
      "notification_delivery_attempts_status_check",
      sql`${table.attemptStatus} in ('STARTED', 'ACCEPTED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL')`,
    ),
    check(
      "notification_delivery_attempts_completion_check",
      sql`(${table.attemptStatus} = 'STARTED' and ${table.completedAt} is null)
        or (${table.attemptStatus} <> 'STARTED' and ${table.completedAt} is not null)`,
    ),
  ],
);

export const emailProviderEventProcessingStatusValues = [
  "RECEIVED",
  "PROCESSED",
  "IGNORED",
  "FAILED",
] as const;

export type EmailProviderEventProcessingStatus =
  (typeof emailProviderEventProcessingStatusValues)[number];

export const emailProviderEvents = pgTable(
  "email_provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerMessageId: text("provider_message_id"),
    eventType: text("event_type").notNull(),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processingStatus: text("processing_status")
      .$type<EmailProviderEventProcessingStatus>()
      .notNull()
      .default("RECEIVED"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    payloadHash: text("payload_hash").notNull(),
    safeErrorCode: text("safe_error_code"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("email_provider_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    index("email_provider_events_provider_message_idx").on(
      table.provider,
      table.providerMessageId,
    ),
    index("email_provider_events_status_received_idx").on(
      table.processingStatus,
      table.receivedAt,
    ),
    check(
      "email_provider_events_provider_check",
      sql`length(${table.provider}) between 1 and 32 and ${table.provider} ~ '^[A-Z0-9_]+$'`,
    ),
    check(
      "email_provider_events_provider_event_id_check",
      sql`length(${table.providerEventId}) between 1 and 255 and ${table.providerEventId} ~ '^[!-~]+$'`,
    ),
    check(
      "email_provider_events_provider_message_id_check",
      sql`${table.providerMessageId} is null or (length(${table.providerMessageId}) between 1 and 255 and ${table.providerMessageId} ~ '^[!-~]+$')`,
    ),
    check(
      "email_provider_events_event_type_check",
      sql`length(${table.eventType}) between 1 and 128 and ${table.eventType} ~ '^[a-z0-9._-]+$'`,
    ),
    check(
      "email_provider_events_processing_status_check",
      sql`${table.processingStatus} in ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED')`,
    ),
    check(
      "email_provider_events_processing_lifecycle_check",
      sql`(${table.processingStatus} = 'RECEIVED' and ${table.processedAt} is null)
        or (${table.processingStatus} <> 'RECEIVED' and ${table.processedAt} is not null)`,
    ),
    check(
      "email_provider_events_payload_hash_check",
      sql`${table.payloadHash} ~ '^sha256:[a-f0-9]{64}$'`,
    ),
    check(
      "email_provider_events_safe_error_code_check",
      sql`${table.safeErrorCode} is null or (length(${table.safeErrorCode}) between 1 and 128 and ${table.safeErrorCode} ~ '^[A-Z0-9._:-]+$')`,
    ),
  ],
);
