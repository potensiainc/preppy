import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_shared";
import { admissionCycles, schools } from "./legacy-admissions";
import { meaningfulChanges } from "./sources";

export const updates = pgTable(
  "updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    schoolId: uuid("school_id").references(() => schools.id, {
      onDelete: "restrict",
    }),
    admissionCycleId: uuid("admission_cycle_id").references(
      () => admissionCycles.id,
      { onDelete: "restrict" },
    ),
    status: text("status").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    seoTitle: text("seo_title"),
    metaDescription: text("meta_description"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("updates_slug_unique").on(table.slug),
    index("updates_status_published_idx").on(table.status, table.publishedAt),
    check(
      "updates_status_check",
      sql`${table.status} in ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED')`,
    ),
  ],
);

export const updateChanges = pgTable(
  "update_changes",
  {
    updateId: uuid("update_id")
      .notNull()
      .references(() => updates.id, { onDelete: "restrict" }),
    meaningfulChangeId: uuid("meaningful_change_id")
      .notNull()
      .references(() => meaningfulChanges.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({
      name: "update_changes_pk",
      columns: [table.updateId, table.meaningfulChangeId],
    }),
  ],
);

export const guides = pgTable(
  "guides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    status: text("status").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    seoTitle: text("seo_title"),
    metaDescription: text("meta_description"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("guides_slug_unique").on(table.slug),
    index("guides_status_published_idx").on(table.status, table.publishedAt),
    check(
      "guides_status_check",
      sql`${table.status} in ('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED')`,
    ),
  ],
);

export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    status: text("status").notNull(),
    firstVerifiedAt: timestamp("first_verified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("subscribers_email_normalized_unique").on(
      table.emailNormalized,
    ),
    check(
      "subscribers_status_check",
      sql`${table.status} in ('ACTIVE', 'BOUNCED', 'SUPPRESSED')`,
    ),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "restrict" }),
    admissionCycleId: uuid("admission_cycle_id")
      .notNull()
      .references(() => admissionCycles.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    consentVersion: text("consent_version").notNull(),
    consentSource: text("consent_source").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("subscriptions_id_subscriber_unique").on(
      table.id,
      table.subscriberId,
    ),
    uniqueIndex("subscriptions_subscriber_cycle_unique").on(
      table.subscriberId,
      table.admissionCycleId,
    ),
    index("subscriptions_cycle_status_idx").on(
      table.admissionCycleId,
      table.status,
    ),
    index("subscriptions_subscriber_status_idx").on(
      table.subscriberId,
      table.status,
    ),
    check(
      "subscriptions_status_check",
      sql`${table.status} in ('PENDING', 'VERIFIED', 'UNSUBSCRIBED', 'BOUNCED', 'SUPPRESSED')`,
    ),
  ],
);

export const subscriptionActionTokens = pgTable(
  "subscription_action_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("subscription_action_tokens_hash_unique").on(table.tokenHash),
    index("subscription_action_tokens_subscription_idx").on(
      table.subscriptionId,
    ),
    check(
      "subscription_action_tokens_purpose_check",
      sql`${table.purpose} in ('VERIFY', 'UNSUBSCRIBE')`,
    ),
  ],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    admissionCycleId: uuid("admission_cycle_id")
      .notNull()
      .references(() => admissionCycles.id, { onDelete: "restrict" }),
    meaningfulChangeId: uuid("meaningful_change_id"),
    alertType: text("alert_type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").notNull(),
    subjectTemplateData: jsonb("subject_template_data").$type<
      Record<string, unknown>
    >(),
    bodyTemplateData:
      jsonb("body_template_data").$type<Record<string, unknown>>(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "alerts_change_cycle_fk",
      columns: [table.meaningfulChangeId, table.admissionCycleId],
      foreignColumns: [
        meaningfulChanges.id,
        meaningfulChanges.admissionCycleId,
      ],
    }).onDelete("restrict"),
    uniqueIndex("alerts_dedupe_key_unique").on(table.dedupeKey),
    index("alerts_status_generated_idx").on(table.status, table.generatedAt),
    check(
      "alerts_type_check",
      sql`${table.alertType} in ('NEW_ANNOUNCEMENT', 'REGISTRATION_OPEN', 'DATE_CHANGED', 'DEADLINE_CHANGED', 'ADDITIONAL_RECRUITMENT', 'IMPORTANT_ELIGIBILITY_CHANGE', 'RESULT_PUBLISHED', 'EVENT_CANCELLED', 'CORRECTION')`,
    ),
    check(
      "alerts_status_check",
      sql`${table.status} in ('DRAFT', 'READY', 'DISPATCHING', 'COMPLETED', 'CANCELLED')`,
    ),
  ],
);

export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id").notNull(),
    subscriberId: uuid("subscriber_id").notNull(),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    providerMessageId: text("provider_message_id"),
    attemptCount: smallint("attempt_count").notNull().default(0),
    firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "alert_deliveries_subscription_subscriber_fk",
      columns: [table.subscriptionId, table.subscriberId],
      foreignColumns: [subscriptions.id, subscriptions.subscriberId],
    }).onDelete("restrict"),
    uniqueIndex("alert_deliveries_logical_unique").on(
      table.alertId,
      table.subscriptionId,
      table.channel,
    ),
    index("alert_deliveries_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("alert_deliveries_subscriber_created_idx").on(
      table.subscriberId,
      table.createdAt,
    ),
    check("alert_deliveries_channel_check", sql`${table.channel} in ('EMAIL')`),
    check(
      "alert_deliveries_status_check",
      sql`${table.status} in ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'SUPPRESSED', 'CANCELLED')`,
    ),
    check(
      "alert_deliveries_attempt_count_check",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
);
