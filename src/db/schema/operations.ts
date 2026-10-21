import { sql } from "drizzle-orm";
import {
  bigint,
  check,
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
import { adminUsers } from "./admin";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "bigint" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, {
      onDelete: "restrict",
    }),
    actionType: text("action_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    beforeData: jsonb("before_data").$type<Record<string, unknown>>(),
    afterData: jsonb("after_data").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_entity_created_idx").on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("PENDING"),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
    dedupeKey: text("dedupe_key"),
    maxAttempts: integer("max_attempts").default(3),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastErrorCode: text("last_error_code"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("outbox_events_status_available_idx").on(
      table.status,
      table.availableAt,
    ),
    index("outbox_events_due_claim_idx").on(
      table.status,
      table.availableAt,
      table.createdAt,
    ),
    index("outbox_events_stale_recovery_idx")
      .on(table.status, table.lockedAt)
      .where(sql`${table.status} = 'PROCESSING'`),
    uniqueIndex("outbox_events_dedupe_key_unique")
      .on(table.dedupeKey)
      .where(sql`${table.dedupeKey} is not null`),
    check(
      "outbox_events_status_check",
      sql`${table.status} in ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'CANCELLED', 'DEAD_LETTER')`,
    ),
    check("outbox_events_attempt_count_check", sql`${table.attemptCount} >= 0`),
    check(
      "outbox_events_max_attempts_check",
      sql`${table.maxAttempts} is null or ${table.maxAttempts} between 1 and 10`,
    ),
    check(
      "outbox_events_locked_by_check",
      sql`${table.lockedBy} is null or (length(${table.lockedBy}) <= 128 and ${table.lockedBy} ~ '[^[:space:]]')`,
    ),
    check(
      "outbox_events_last_error_code_check",
      sql`${table.lastErrorCode} is null or (length(${table.lastErrorCode}) <= 128 and ${table.lastErrorCode} ~ '^[A-Z0-9._:-]+$')`,
    ),
    check(
      "outbox_events_locked_pair_check",
      sql`(${table.lockedAt} is null) = (${table.lockedBy} is null)`,
    ),
    check(
      "outbox_events_processing_lock_check",
      sql`${table.status} <> 'PROCESSING' or (${table.lockedAt} is not null and ${table.lockedBy} is not null)`,
    ),
    check(
      "outbox_events_processed_at_check",
      sql`${table.status} <> 'PROCESSED' or ${table.processedAt} is not null`,
    ),
    check(
      "outbox_events_dead_lettered_at_check",
      sql`${table.status} <> 'DEAD_LETTER' or ${table.deadLetteredAt} is not null`,
    ),
  ],
);
