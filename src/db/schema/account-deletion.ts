import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./identity";

export const accountDeletionJobs = pgTable(
  "account_deletion_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    subjectFingerprint: text("subject_fingerprint").notNull().unique(),
    encryptedSubject: text("encrypted_subject"),
    status: text("status").notNull().default("PENDING"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    leaseToken: uuid("lease_token"),
    attempts: integer("attempts").notNull().default(0),
    localDeletedAt: timestamp("local_deleted_at", { withTimezone: true }),
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
    externalReviewedAt: timestamp("external_reviewed_at", {
      withTimezone: true,
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    safeErrorCode: text("safe_error_code"),
    reviewReference: text("review_reference"),
  },
  (table) => [
    index("account_deletion_due_idx").on(table.status, table.nextAttemptAt),
    check(
      "account_deletion_review_reference_check",
      sql`${table.status} <> 'COMPLETED' or (${table.reviewReference} is not null and length(${table.reviewReference}) between 3 and 120)`,
    ),
    check(
      "account_deletion_jobs_status_check",
      sql`${table.status} in ('PENDING','EXTERNAL_REVIEW','COMPLETED','ATTENTION_REQUIRED')`,
    ),
    check(
      "account_deletion_jobs_lease_check",
      sql`(${table.leaseUntil} is null) = (${table.leaseToken} is null)`,
    ),
    check(
      "account_deletion_jobs_completion_check",
      sql`${table.status} <> 'COMPLETED' or (${table.localDeletedAt} is not null and ${table.unlinkedAt} is not null and ${table.externalReviewedAt} is not null and ${table.encryptedSubject} is null and ${table.userId} is null)`,
    ),
  ],
);

export const kakaoUnlinkInbox = pgTable(
  "kakao_unlink_inbox",
  {
    subjectFingerprint: text("subject_fingerprint").primaryKey(),
    encryptedSubject: text("encrypted_subject"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("RECEIVED"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "kakao_unlink_inbox_status_check",
      sql`${table.status} in ('RECEIVED','APPLIED','ATTENTION_REQUIRED')`,
    ),
  ],
);

/** Reviewed identity survives rebranding, relocation and session cancellation. */
