import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_shared";
import { adminUsers } from "./admin";

export const schools = pgTable(
  "schools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    canonicalName: text("canonical_name").notNull(),
    nameEn: text("name_en"),
    schoolType: text("school_type").notNull(),
    lifecycleStatus: text("lifecycle_status").notNull(),
    countryCode: char("country_code", { length: 2 }).notNull().default("KR"),
    region1: text("region1"),
    region2: text("region2"),
    address: text("address"),
    officialWebsiteUrl: text("official_website_url"),
    shortDescription: text("short_description"),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("schools_slug_unique").on(table.slug),
    index("schools_type_region_idx").on(table.schoolType, table.region1),
    index("schools_lifecycle_public_idx").on(
      table.lifecycleStatus,
      table.isPublic,
    ),
    index("schools_normalized_canonical_name_trgm_idx").using(
      "gin",
      sql`(regexp_replace(lower(coalesce(${table.canonicalName}, '')), '[^0-9a-z가-힣]+', '', 'g')) gin_trgm_ops`,
    ),
    index("schools_normalized_name_en_trgm_idx").using(
      "gin",
      sql`(regexp_replace(lower(coalesce(${table.nameEn}, '')), '[^0-9a-z가-힣]+', '', 'g')) gin_trgm_ops`,
    ),
    check(
      "schools_school_type_check",
      sql`${table.schoolType} in ('PRIVATE_ELEMENTARY', 'INTERNATIONAL_SCHOOL', 'FOREIGN_SCHOOL')`,
    ),
    check(
      "schools_lifecycle_status_check",
      sql`${table.lifecycleStatus} in ('ACTIVE', 'PAUSED', 'ARCHIVED')`,
    ),
  ],
);

export const schoolAliases = pgTable(
  "school_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    aliasType: text("alias_type").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("school_aliases_school_normalized_unique").on(
      table.schoolId,
      table.normalizedAlias,
    ),
    index("school_aliases_normalized_idx").on(table.normalizedAlias),
    index("school_aliases_normalized_alias_value_trgm_idx")
      .using(
        "gin",
        sql`(regexp_replace(lower(coalesce(${table.alias}, '')), '[^0-9a-z가-힣]+', '', 'g')) gin_trgm_ops`,
      )
      .where(
        sql`${table.aliasType} in ('KOREAN', 'ENGLISH', 'ABBREVIATION', 'FORMER_NAME', 'COMMON_NAME')`,
      ),
    index("school_aliases_normalized_normalized_alias_trgm_idx")
      .using(
        "gin",
        sql`(regexp_replace(lower(coalesce(${table.normalizedAlias}, '')), '[^0-9a-z가-힣]+', '', 'g')) gin_trgm_ops`,
      )
      .where(
        sql`${table.aliasType} in ('KOREAN', 'ENGLISH', 'ABBREVIATION', 'FORMER_NAME', 'COMMON_NAME')`,
      ),
    check(
      "school_aliases_alias_type_check",
      sql`${table.aliasType} in ('KOREAN', 'ENGLISH', 'ABBREVIATION', 'FORMER_NAME', 'COMMON_NAME', 'OTHER')`,
    ),
  ],
);

export const admissionCycles = pgTable(
  "admission_cycles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    academicYear: smallint("academic_year").notNull(),
    lifecycleStatus: text("lifecycle_status").notNull(),
    admissionMode: text("admission_mode").notNull(),
    isPublicFocus: boolean("is_public_focus").notNull().default(false),
    internalNotes: text("internal_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("cycles_id_school_unique").on(table.id, table.schoolId),
    uniqueIndex("admission_cycles_school_year_unique").on(
      table.schoolId,
      table.academicYear,
    ),
    uniqueIndex("admission_cycles_one_public_focus_per_school")
      .on(table.schoolId)
      .where(sql`${table.isPublicFocus} = true`),
    index("admission_cycles_year_lifecycle_idx").on(
      table.academicYear,
      table.lifecycleStatus,
    ),
    check(
      "admission_cycles_academic_year_check",
      sql`${table.academicYear} between 2020 and 2100`,
    ),
    check(
      "admission_cycles_lifecycle_status_check",
      sql`${table.lifecycleStatus} in ('PLANNED', 'MONITORING', 'ANNOUNCED', 'ACTIVE', 'CLOSED', 'COMPLETED', 'ARCHIVED')`,
    ),
    check(
      "admission_cycles_admission_mode_check",
      sql`${table.admissionMode} in ('FIXED_WINDOW', 'ROLLING', 'MULTI_ROUND', 'HYBRID', 'UNKNOWN')`,
    ),
  ],
);

export const admissionEvents = pgTable(
  "admission_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    admissionCycleId: uuid("admission_cycle_id")
      .notNull()
      .references(() => admissionCycles.id, { onDelete: "restrict" }),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").notNull(),
    occurrenceNo: smallint("occurrence_no").notNull().default(1),
    canonicalTitle: text("canonical_title").notNull(),
    audienceSummary: text("audience_summary"),
    audienceData: jsonb("audience_data").$type<Record<string, unknown>>(),
    importance: text("importance").notNull().default("NORMAL"),
    actionability: text("actionability").notNull().default("INFORMATIONAL"),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("events_id_cycle_unique").on(table.id, table.admissionCycleId),
    uniqueIndex("admission_events_cycle_key_unique").on(
      table.admissionCycleId,
      table.eventKey,
    ),
    index("admission_events_cycle_type_idx").on(
      table.admissionCycleId,
      table.eventType,
    ),
    check(
      "admission_events_event_type_check",
      sql`${table.eventType} in ('BRIEFING', 'OPEN_HOUSE', 'APPLICATION', 'DOCUMENT_SUBMISSION', 'ASSESSMENT', 'INTERVIEW', 'LOTTERY', 'RESULT_ANNOUNCEMENT', 'REGISTRATION', 'ADDITIONAL_RECRUITMENT', 'OTHER')`,
    ),
    check(
      "admission_events_occurrence_no_check",
      sql`${table.occurrenceNo} > 0`,
    ),
    check(
      "admission_events_importance_check",
      sql`${table.importance} in ('CRITICAL', 'HIGH', 'NORMAL', 'LOW')`,
    ),
    check(
      "admission_events_actionability_check",
      sql`${table.actionability} in ('ACTION_REQUIRED', 'ATTENDANCE', 'INFORMATIONAL', 'OUTCOME')`,
    ),
  ],
);

export const admissionEventVersions = pgTable(
  "admission_event_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    admissionEventId: uuid("admission_event_id").notNull(),
    versionNo: integer("version_no").notNull(),
    supersedesVersionId: uuid("supersedes_version_id"),
    isCurrent: boolean("is_current").notNull().default(false),
    verificationStatus: text("verification_status").notNull(),
    knowledgeState: text("knowledge_state").notNull(),
    eventStatus: text("event_status").notNull(),
    displayTitle: text("display_title").notNull(),
    eventStartDate: date("event_start_date"),
    eventStartTime: time("event_start_time"),
    eventEndDate: date("event_end_date"),
    eventEndTime: time("event_end_time"),
    registrationOpenDate: date("registration_open_date"),
    registrationOpenTime: time("registration_open_time"),
    registrationCloseDate: date("registration_close_date"),
    registrationCloseTime: time("registration_close_time"),
    timezone: text("timezone").notNull().default("Asia/Seoul"),
    venue: text("venue"),
    actionUrl: text("action_url"),
    officialNotes: text("official_notes"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByAdminId: uuid("verified_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "event_versions_event_fk",
      columns: [table.admissionEventId],
      foreignColumns: [admissionEvents.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "event_versions_supersedes_fk",
      columns: [table.supersedesVersionId, table.admissionEventId],
      foreignColumns: [table.id, table.admissionEventId],
    }).onDelete("restrict"),
    unique("event_versions_id_event_unique").on(
      table.id,
      table.admissionEventId,
    ),
    uniqueIndex("admission_event_versions_event_version_unique").on(
      table.admissionEventId,
      table.versionNo,
    ),
    uniqueIndex("admission_event_versions_one_current_per_event")
      .on(table.admissionEventId)
      .where(sql`${table.isCurrent} = true`),
    uniqueIndex("event_versions_one_successor")
      .on(table.supersedesVersionId)
      .where(sql`${table.supersedesVersionId} is not null`),
    index("admission_event_versions_current_event_date_idx")
      .on(table.eventStartDate)
      .where(
        sql`${table.isCurrent} = true and ${table.verificationStatus} = 'VERIFIED'`,
      ),
    index("admission_event_versions_current_registration_idx")
      .on(table.registrationOpenDate, table.registrationCloseDate)
      .where(
        sql`${table.isCurrent} = true and ${table.verificationStatus} = 'VERIFIED'`,
      ),
    check(
      "admission_event_versions_version_no_check",
      sql`${table.versionNo} > 0`,
    ),
    check(
      "admission_event_versions_verification_status_check",
      sql`${table.verificationStatus} in ('DRAFT', 'UNVERIFIED', 'VERIFIED', 'REJECTED', 'SUPERSEDED')`,
    ),
    check(
      "admission_event_versions_knowledge_state_check",
      sql`${table.knowledgeState} in ('KNOWN', 'NOT_ANNOUNCED', 'NOT_FOUND', 'SOURCE_ERROR', 'NOT_APPLICABLE')`,
    ),
    check(
      "admission_event_versions_event_status_check",
      sql`${table.eventStatus} in ('SCHEDULED', 'ACTIVE', 'CLOSED', 'COMPLETED', 'CANCELLED')`,
    ),
    check(
      "admission_event_versions_event_date_order_check",
      sql`${table.eventEndDate} is null or ${table.eventStartDate} is null or ${table.eventEndDate} >= ${table.eventStartDate}`,
    ),
    check(
      "admission_event_versions_registration_date_order_check",
      sql`${table.registrationCloseDate} is null or ${table.registrationOpenDate} is null or ${table.registrationCloseDate} >= ${table.registrationOpenDate}`,
    ),
    check(
      "event_versions_not_self_superseding_check",
      sql`${table.supersedesVersionId} is null or ${table.supersedesVersionId} <> ${table.id}`,
    ),
    check(
      "event_versions_current_not_superseded_check",
      sql`not (${table.isCurrent} and ${table.verificationStatus} = 'SUPERSEDED')`,
    ),
  ],
);

export const admissionFacts = pgTable(
  "admission_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    admissionCycleId: uuid("admission_cycle_id")
      .notNull()
      .references(() => admissionCycles.id, { onDelete: "restrict" }),
    admissionEventId: uuid("admission_event_id"),
    factKey: text("fact_key").notNull(),
    factType: text("fact_type").notNull(),
    scope: text("scope").notNull(),
    isCritical: boolean("is_critical").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "facts_event_cycle_fk",
      columns: [table.admissionEventId, table.admissionCycleId],
      foreignColumns: [admissionEvents.id, admissionEvents.admissionCycleId],
    }).onDelete("restrict"),
    unique("facts_id_cycle_unique").on(table.id, table.admissionCycleId),
    uniqueIndex("admission_facts_cycle_key_unique").on(
      table.admissionCycleId,
      table.factKey,
    ),
    check(
      "admission_facts_scope_check",
      sql`(${table.scope} = 'CYCLE' and ${table.admissionEventId} is null) or (${table.scope} = 'EVENT' and ${table.admissionEventId} is not null)`,
    ),
  ],
);

export const admissionFactVersions = pgTable(
  "admission_fact_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    admissionFactId: uuid("admission_fact_id")
      .notNull()
      .references(() => admissionFacts.id, { onDelete: "restrict" }),
    versionNo: integer("version_no").notNull(),
    supersedesVersionId: uuid("supersedes_version_id"),
    isCurrent: boolean("is_current").notNull().default(false),
    verificationStatus: text("verification_status").notNull(),
    knowledgeState: text("knowledge_state").notNull(),
    valueKind: text("value_kind").notNull(),
    valueText: text("value_text"),
    valueNumber: numeric("value_number"),
    valueBoolean: boolean("value_boolean"),
    valueDate: date("value_date"),
    valueJson: jsonb("value_json").$type<unknown>(),
    displayValue: text("display_value"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByAdminId: uuid("verified_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "fact_versions_supersedes_fk",
      columns: [table.supersedesVersionId, table.admissionFactId],
      foreignColumns: [table.id, table.admissionFactId],
    }).onDelete("restrict"),
    unique("fact_versions_id_fact_unique").on(table.id, table.admissionFactId),
    uniqueIndex("admission_fact_versions_fact_version_unique").on(
      table.admissionFactId,
      table.versionNo,
    ),
    uniqueIndex("admission_fact_versions_one_current_per_fact")
      .on(table.admissionFactId)
      .where(sql`${table.isCurrent} = true`),
    uniqueIndex("fact_versions_one_successor")
      .on(table.supersedesVersionId)
      .where(sql`${table.supersedesVersionId} is not null`),
    check(
      "admission_fact_versions_version_no_check",
      sql`${table.versionNo} > 0`,
    ),
    check(
      "admission_fact_versions_verification_status_check",
      sql`${table.verificationStatus} in ('DRAFT', 'UNVERIFIED', 'VERIFIED', 'REJECTED', 'SUPERSEDED')`,
    ),
    check(
      "admission_fact_versions_knowledge_state_check",
      sql`${table.knowledgeState} in ('KNOWN', 'NOT_ANNOUNCED', 'NOT_FOUND', 'SOURCE_ERROR', 'NOT_APPLICABLE')`,
    ),
    check(
      "admission_fact_versions_value_kind_check",
      sql`${table.valueKind} in ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'JSON')`,
    ),
    check(
      "admission_fact_versions_typed_value_check",
      sql`(
        ${table.knowledgeState} <> 'KNOWN'
        and ${table.valueText} is null
        and ${table.valueNumber} is null
        and ${table.valueBoolean} is null
        and ${table.valueDate} is null
        and ${table.valueJson} is null
      ) or (
        ${table.knowledgeState} = 'KNOWN'
        and (
          (${table.valueKind} = 'TEXT' and ${table.valueText} is not null and ${table.valueNumber} is null and ${table.valueBoolean} is null and ${table.valueDate} is null and ${table.valueJson} is null)
          or (${table.valueKind} = 'NUMBER' and ${table.valueText} is null and ${table.valueNumber} is not null and ${table.valueBoolean} is null and ${table.valueDate} is null and ${table.valueJson} is null)
          or (${table.valueKind} = 'BOOLEAN' and ${table.valueText} is null and ${table.valueNumber} is null and ${table.valueBoolean} is not null and ${table.valueDate} is null and ${table.valueJson} is null)
          or (${table.valueKind} = 'DATE' and ${table.valueText} is null and ${table.valueNumber} is null and ${table.valueBoolean} is null and ${table.valueDate} is not null and ${table.valueJson} is null)
          or (${table.valueKind} = 'JSON' and ${table.valueText} is null and ${table.valueNumber} is null and ${table.valueBoolean} is null and ${table.valueDate} is null and ${table.valueJson} is not null)
        )
      )`,
    ),
    check(
      "fact_versions_not_self_superseding_check",
      sql`${table.supersedesVersionId} is null or ${table.supersedesVersionId} <> ${table.id}`,
    ),
    check(
      "fact_versions_current_not_superseded_check",
      sql`not (${table.isCurrent} and ${table.verificationStatus} = 'SUPERSEDED')`,
    ),
  ],
);

export const expectedWindows = pgTable(
  "expected_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    admissionCycleId: uuid("admission_cycle_id")
      .notNull()
      .references(() => admissionCycles.id, { onDelete: "restrict" }),
    eventType: text("event_type"),
    predictionType: text("prediction_type").notNull(),
    windowStartDate: date("window_start_date").notNull(),
    windowEndDate: date("window_end_date").notNull(),
    precision: text("precision").notNull(),
    methodology: text("methodology").notNull(),
    sampleSize: smallint("sample_size").notNull(),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 4 }),
    isCurrent: boolean("is_current").notNull().default(true),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByAdminId: uuid("reviewed_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (table) => [
    index("expected_windows_cycle_current_idx").on(
      table.admissionCycleId,
      table.isCurrent,
    ),
    check(
      "expected_windows_prediction_type_check",
      sql`${table.predictionType} in ('ANNOUNCEMENT_WINDOW', 'EVENT_WINDOW', 'APPLICATION_WINDOW')`,
    ),
    check(
      "expected_windows_precision_check",
      sql`${table.precision} in ('EARLY_MONTH', 'MID_MONTH', 'LATE_MONTH', 'DATE_RANGE', 'MONTH', 'MONTH_RANGE')`,
    ),
    check(
      "expected_windows_date_order_check",
      sql`${table.windowEndDate} >= ${table.windowStartDate}`,
    ),
    check("expected_windows_sample_size_check", sql`${table.sampleSize} > 0`),
    check(
      "expected_windows_confidence_score_check",
      sql`${table.confidenceScore} is null or (${table.confidenceScore} >= 0 and ${table.confidenceScore} <= 1)`,
    ),
  ],
);
