import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_shared";
import { institutions } from "./institutions";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: text("status").notNull().default("PENDING"),
    createdAt: createdAt(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    piiAnonymizedAt: timestamp("pii_anonymized_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("users_status_idx").on(table.status),
    check(
      "users_status_check",
      sql`${table.status} in ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED', 'DELETION_PENDING')`,
    ),
  ],
);

export const authIdentities = pgTable(
  "auth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_unique").on(
      table.provider,
      table.providerSubject,
    ),
    check("auth_identities_provider_check", sql`${table.provider} = 'KAKAO'`),
    check(
      "auth_identities_status_check",
      sql`${table.status} in ('ACTIVE', 'REVOKED')`,
    ),
    check(
      "auth_identities_provider_subject_check",
      sql`length(btrim(${table.providerSubject})) > 0`,
    ),
  ],
);

export const userEmails = pgTable(
  "user_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    emailNormalized: text("email_normalized").notNull(),
    source: text("source").notNull(),
    verificationState: text("verification_state").notNull(),
    deliveryState: text("delivery_state").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastBouncedAt: timestamp("last_bounced_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("user_emails_user_unique").on(table.userId),
    check(
      "user_emails_source_check",
      sql`${table.source} in ('KAKAO', 'USER_INPUT')`,
    ),
    check(
      "user_emails_verification_state_check",
      sql`${table.verificationState} in ('UNVERIFIED', 'VERIFIED')`,
    ),
    check(
      "user_emails_delivery_state_check",
      sql`${table.deliveryState} in ('USABLE', 'BOUNCED', 'SUPPRESSED', 'REMOVED')`,
    ),
  ],
);

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    childBirthYear: smallint("child_birth_year"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "user_profiles_child_birth_year_check",
      sql`${table.childBirthYear} is null or ${table.childBirthYear} between 1900 and 2100`,
    ),
  ],
);

export const userInterestRegions = pgTable(
  "user_interest_regions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    regionCode: text("region_code").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("user_interest_regions_user_region_unique").on(
      table.userId,
      table.regionCode,
    ),
    check(
      "user_interest_regions_region_code_check",
      sql`length(btrim(${table.regionCode})) > 0`,
    ),
  ],
);

export const userInterestCategories = pgTable(
  "user_interest_categories",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    category: text("category").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("user_interest_categories_user_category_unique").on(
      table.userId,
      table.category,
    ),
    check(
      "user_interest_categories_category_check",
      sql`${table.category} in ('ENGLISH_KINDERGARTEN', 'PRIVATE_ELEMENTARY', 'INTERNATIONAL_SCHOOL')`,
    ),
  ],
);

export const consentDecisions = pgTable(
  "consent_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    consentType: text("consent_type").notNull(),
    policyVersion: text("policy_version").notNull(),
    decision: text("decision").notNull(),
    source: text("source"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("consent_decisions_latest_idx").on(
      table.userId,
      table.consentType,
      table.decidedAt.desc(),
      table.id.desc(),
    ),
    check(
      "consent_decisions_type_check",
      sql`${table.consentType} in ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'SERVICE_EMAIL_UPDATES')`,
    ),
    check(
      "consent_decisions_decision_check",
      sql`${table.decision} in ('GRANTED', 'REVOKED')`,
    ),
    check(
      "consent_decisions_policy_version_check",
      sql`length(btrim(${table.policyVersion})) > 0`,
    ),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    channel: text("channel").notNull(),
    state: text("state").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("notification_preferences_user_channel_unique").on(
      table.userId,
      table.channel,
    ),
    check(
      "notification_preferences_channel_check",
      sql`${table.channel} = 'EMAIL'`,
    ),
    check(
      "notification_preferences_state_check",
      sql`${table.state} in ('ENABLED', 'DISABLED')`,
    ),
  ],
);

export const follows = pgTable(
  "follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    status: text("status").notNull(),
    firstActivatedAt: timestamp("first_activated_at", {
      withTimezone: true,
    }).notNull(),
    currentActivatedAt: timestamp("current_activated_at", {
      withTimezone: true,
    }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("follows_user_institution_unique").on(
      table.userId,
      table.institutionId,
    ),
    index("follows_user_status_idx").on(table.userId, table.status),
    index("follows_institution_status_idx").on(
      table.institutionId,
      table.status,
    ),
    check(
      "follows_status_check",
      sql`${table.status} in ('ACTIVE', 'INACTIVE')`,
    ),
    check(
      "follows_state_check",
      sql`(${table.status} = 'ACTIVE' and ${table.currentActivatedAt} is not null and ${table.deactivatedAt} is null)
        or (${table.status} = 'INACTIVE' and ${table.deactivatedAt} is not null)`,
    ),
    check(
      "follows_current_activation_order_check",
      sql`${table.currentActivatedAt} is null or ${table.currentActivatedAt} >= ${table.firstActivatedAt}`,
    ),
    check(
      "follows_deactivation_first_order_check",
      sql`${table.deactivatedAt} is null or ${table.deactivatedAt} >= ${table.firstActivatedAt}`,
    ),
    check(
      "follows_deactivation_current_order_check",
      sql`${table.deactivatedAt} is null or ${table.currentActivatedAt} is null or ${table.deactivatedAt} >= ${table.currentActivatedAt}`,
    ),
  ],
);

export const followEpisodes = pgTable(
  "follow_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    followId: uuid("follow_id")
      .notNull()
      .references(() => follows.id, { onDelete: "restrict" }),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("follow_episodes_one_open_per_follow")
      .on(table.followId)
      .where(sql`${table.deactivatedAt} is null`),
    index("follow_episodes_follow_activated_idx").on(
      table.followId,
      table.activatedAt.desc(),
    ),
    check(
      "follow_episodes_interval_check",
      sql`${table.deactivatedAt} is null or ${table.deactivatedAt} >= ${table.activatedAt}`,
    ),
  ],
);
