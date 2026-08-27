import { sql } from "drizzle-orm";
import {
  bigint,
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
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalAuthSubject: text("external_auth_subject").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("admin_users_external_auth_subject_unique").on(
      table.externalAuthSubject,
    ),
    check(
      "admin_users_status_check",
      sql`${table.status} in ('ACTIVE', 'DISABLED')`,
    ),
  ],
);

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

export const sourceTypeValues = [
  "OFFICIAL_ADMISSION_PAGE",
  "OFFICIAL_NOTICE_BOARD",
  "OFFICIAL_DOCUMENT",
  "OFFICIAL_APPLICATION_PORTAL",
  "OFFICIAL_SCHOOL_PAGE",
  "OFFICIAL_REGISTRY",
  "OFFICIAL_SOCIAL",
  "THIRD_PARTY_DISCOVERY",
  "OTHER",
] as const;

export type SourceType = (typeof sourceTypeValues)[number];

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalUrl: text("canonical_url").notNull(),
    sourceType: text("source_type").notNull(),
    authorityLevel: text("authority_level").notNull(),
    lifecycleStatus: text("lifecycle_status").notNull(),
    sourceName: text("source_name").notNull(),
    requiresJs: boolean("requires_js").notNull().default(false),
    contentTypeHint: text("content_type_hint"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("sources_canonical_url_unique").on(table.canonicalUrl),
    check(
      "sources_source_type_check",
      sql`${table.sourceType} in ('OFFICIAL_ADMISSION_PAGE', 'OFFICIAL_NOTICE_BOARD', 'OFFICIAL_DOCUMENT', 'OFFICIAL_APPLICATION_PORTAL', 'OFFICIAL_SCHOOL_PAGE', 'OFFICIAL_REGISTRY', 'OFFICIAL_SOCIAL', 'THIRD_PARTY_DISCOVERY', 'OTHER')`,
    ),
    check(
      "sources_authority_level_check",
      sql`${table.authorityLevel} in ('PRIMARY', 'SECONDARY_OFFICIAL', 'DISCOVERY_ONLY')`,
    ),
    check(
      "sources_lifecycle_status_check",
      sql`${table.lifecycleStatus} in ('DISCOVERED', 'ACTIVE', 'PAUSED', 'RETIRED')`,
    ),
  ],
);

export const sourceBindings = pgTable(
  "source_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    admissionCycleId: uuid("admission_cycle_id"),
    sourceRole: text("source_role").notNull(),
    priority: smallint("priority").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "source_bindings_cycle_school_fk",
      columns: [table.admissionCycleId, table.schoolId],
      foreignColumns: [admissionCycles.id, admissionCycles.schoolId],
    }).onDelete("restrict"),
    unique("source_bindings_logical_unique")
      .on(
        table.sourceId,
        table.schoolId,
        table.admissionCycleId,
        table.sourceRole,
      )
      .nullsNotDistinct(),
    index("source_bindings_school_active_idx").on(
      table.schoolId,
      table.isActive,
    ),
    check(
      "source_bindings_role_check",
      sql`${table.sourceRole} in ('PRIMARY_ADMISSIONS', 'NOTICE_BOARD', 'APPLICATION', 'ELIGIBILITY', 'HISTORICAL', 'DISCOVERY', 'OTHER')`,
    ),
    check("source_bindings_priority_check", sql`${table.priority} > 0`),
  ],
);

export const sourceMonitorConfigs = pgTable(
  "source_monitor_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    collectionStrategy: text("collection_strategy").notNull(),
    monitoringProfile: text("monitoring_profile").notNull(),
    customIntervalMinutes: integer("custom_interval_minutes"),
    seasonalEnabled: boolean("seasonal_enabled").notNull().default(true),
    browserRequired: boolean("browser_required").notNull().default(false),
    maxAttempts: smallint("max_attempts").notNull().default(3),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("source_monitor_configs_source_unique").on(table.sourceId),
    check(
      "source_monitor_configs_strategy_check",
      sql`${table.collectionStrategy} in ('HTTP', 'BROWSER', 'DOCUMENT', 'MANUAL')`,
    ),
    check(
      "source_monitor_configs_profile_check",
      sql`${table.monitoringProfile} in ('CRITICAL_SEASONAL', 'STANDARD_SEASONAL', 'LOW_CHANGE', 'DOCUMENT_STATIC', 'MANUAL')`,
    ),
    check(
      "source_monitor_configs_interval_check",
      sql`${table.customIntervalMinutes} is null or ${table.customIntervalMinutes} > 0`,
    ),
    check(
      "source_monitor_configs_max_attempts_check",
      sql`${table.maxAttempts} between 1 and 10`,
    ),
  ],
);

export const sourceSnapshots = pgTable(
  "source_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    contentHash: text("content_hash").notNull(),
    textHash: text("text_hash"),
    normalizedText: text("normalized_text"),
    rawStorageKey: text("raw_storage_key"),
    mimeType: text("mime_type"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("source_snapshots_id_source_unique").on(table.id, table.sourceId),
    uniqueIndex("source_snapshots_source_content_hash_unique").on(
      table.sourceId,
      table.contentHash,
    ),
    index("source_snapshots_source_captured_idx").on(
      table.sourceId,
      table.capturedAt,
    ),
  ],
);

export const sourceObservations = pgTable(
  "source_observations",
  {
    id: bigint("id", { mode: "bigint" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    outcome: text("outcome").notNull(),
    httpStatus: integer("http_status"),
    finalUrl: text("final_url"),
    contentHash: text("content_hash"),
    textHash: text("text_hash"),
    responseBytes: bigint("response_bytes", { mode: "bigint" }),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    snapshotId: uuid("snapshot_id").references(() => sourceSnapshots.id, {
      onDelete: "restrict",
    }),
    etag: text("etag"),
    lastModified: text("last_modified"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("source_observations_id_source_unique").on(table.id, table.sourceId),
    index("source_observations_source_observed_idx").on(
      table.sourceId,
      table.observedAt,
    ),
    index("source_observations_outcome_idx").on(table.outcome),
    check(
      "source_observations_outcome_check",
      sql`${table.outcome} in ('SUCCESS', 'UNCHANGED', 'CHANGED', 'NOT_FOUND', 'ACCESS_ERROR', 'PARSE_ERROR', 'TIMEOUT', 'OTHER_ERROR')`,
    ),
    check(
      "source_observations_http_status_check",
      sql`${table.httpStatus} is null or ${table.httpStatus} between 100 and 599`,
    ),
    check(
      "source_observations_response_bytes_check",
      sql`${table.responseBytes} is null or ${table.responseBytes} >= 0`,
    ),
    check(
      "source_observations_duration_ms_check",
      sql`${table.durationMs} is null or ${table.durationMs} >= 0`,
    ),
  ],
);

export const detectedChanges = pgTable(
  "detected_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    previousObservationId: bigint("previous_observation_id", {
      mode: "bigint",
    }),
    currentObservationId: bigint("current_observation_id", {
      mode: "bigint",
    }).notNull(),
    previousSnapshotId: uuid("previous_snapshot_id").references(
      () => sourceSnapshots.id,
      { onDelete: "restrict" },
    ),
    currentSnapshotId: uuid("current_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: "restrict" }),
    detectionType: text("detection_type").notNull(),
    status: text("status").notNull(),
    changeFingerprint: text("change_fingerprint"),
    diffSummary: text("diff_summary"),
    diffPayload: jsonb("diff_payload").$type<Record<string, unknown>>(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "detected_changes_previous_observation_fk",
      columns: [table.previousObservationId],
      foreignColumns: [sourceObservations.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "detected_changes_current_observation_fk",
      columns: [table.currentObservationId],
      foreignColumns: [sourceObservations.id],
    }).onDelete("restrict"),
    uniqueIndex("detected_changes_source_fingerprint_unique")
      .on(table.sourceId, table.changeFingerprint)
      .where(sql`${table.changeFingerprint} is not null`),
    index("detected_changes_status_detected_idx").on(
      table.status,
      table.detectedAt,
    ),
    check(
      "detected_changes_status_check",
      sql`${table.status} in ('DETECTED', 'EXTRACTED', 'REVIEW_REQUIRED', 'PROCESSED', 'IGNORED', 'DUPLICATE', 'ERROR')`,
    ),
  ],
);

export const meaningfulChanges = pgTable(
  "meaningful_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    detectedChangeId: uuid("detected_change_id").references(
      () => detectedChanges.id,
      { onDelete: "restrict" },
    ),
    admissionCycleId: uuid("admission_cycle_id")
      .notNull()
      .references(() => admissionCycles.id, { onDelete: "restrict" }),
    admissionEventId: uuid("admission_event_id"),
    admissionFactId: uuid("admission_fact_id"),
    changeType: text("change_type").notNull(),
    significance: text("significance").notNull(),
    reviewStatus: text("review_status").notNull(),
    alertCandidate: boolean("alert_candidate").notNull().default(false),
    publicSummary: text("public_summary"),
    beforeData: jsonb("before_data").$type<Record<string, unknown>>(),
    afterData: jsonb("after_data").$type<Record<string, unknown>>(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByAdminId: uuid("reviewed_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "restrict" },
    ),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "meaningful_changes_event_cycle_fk",
      columns: [table.admissionEventId, table.admissionCycleId],
      foreignColumns: [admissionEvents.id, admissionEvents.admissionCycleId],
    }).onDelete("restrict"),
    foreignKey({
      name: "meaningful_changes_fact_cycle_fk",
      columns: [table.admissionFactId, table.admissionCycleId],
      foreignColumns: [admissionFacts.id, admissionFacts.admissionCycleId],
    }).onDelete("restrict"),
    unique("meaningful_changes_id_cycle_unique").on(
      table.id,
      table.admissionCycleId,
    ),
    unique("meaningful_changes_id_event_unique").on(
      table.id,
      table.admissionEventId,
    ),
    index("meaningful_changes_review_created_idx").on(
      table.reviewStatus,
      table.createdAt,
    ),
    index("meaningful_changes_cycle_published_idx").on(
      table.admissionCycleId,
      table.publishedAt,
    ),
    check(
      "meaningful_changes_type_check",
      sql`${table.changeType} in ('NEW_EVENT', 'EVENT_DATE_CHANGED', 'REGISTRATION_WINDOW_CHANGED', 'APPLICATION_WINDOW_CHANGED', 'DEADLINE_EXTENDED', 'EVENT_CANCELLED', 'ELIGIBILITY_CHANGED', 'DOCUMENT_REQUIREMENT_CHANGED', 'RESULT_PUBLISHED', 'ADDITIONAL_RECRUITMENT', 'OTHER')`,
    ),
    check(
      "meaningful_changes_significance_check",
      sql`${table.significance} in ('CRITICAL', 'HIGH', 'NORMAL', 'LOW')`,
    ),
    check(
      "meaningful_changes_review_status_check",
      sql`${table.reviewStatus} in ('REVIEW_REQUIRED', 'APPROVED', 'REJECTED', 'IGNORED', 'PUBLISHED')`,
    ),
  ],
);

export const eventVersionEvidence = pgTable(
  "event_version_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventVersionId: uuid("event_version_id").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    sourceObservationId: bigint("source_observation_id", { mode: "bigint" }),
    snapshotId: uuid("snapshot_id").references(() => sourceSnapshots.id, {
      onDelete: "restrict",
    }),
    evidenceExcerpt: text("evidence_excerpt"),
    evidenceLocator: text("evidence_locator"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "event_evidence_event_version_fk",
      columns: [table.eventVersionId],
      foreignColumns: [admissionEventVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "event_evidence_observation_fk",
      columns: [table.sourceObservationId],
      foreignColumns: [sourceObservations.id],
    }).onDelete("restrict"),
    unique("event_version_evidence_logical_unique")
      .on(table.eventVersionId, table.sourceId, table.sourceObservationId)
      .nullsNotDistinct(),
  ],
);

export const factVersionEvidence = pgTable(
  "fact_version_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    factVersionId: uuid("fact_version_id").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    sourceObservationId: bigint("source_observation_id", { mode: "bigint" }),
    snapshotId: uuid("snapshot_id").references(() => sourceSnapshots.id, {
      onDelete: "restrict",
    }),
    evidenceExcerpt: text("evidence_excerpt"),
    evidenceLocator: text("evidence_locator"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "fact_evidence_fact_version_fk",
      columns: [table.factVersionId],
      foreignColumns: [admissionFactVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fact_evidence_observation_fk",
      columns: [table.sourceObservationId],
      foreignColumns: [sourceObservations.id],
    }).onDelete("restrict"),
    unique("fact_version_evidence_logical_unique")
      .on(table.factVersionId, table.sourceId, table.sourceObservationId)
      .nullsNotDistinct(),
  ],
);

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

export const institutionCategoryValues = [
  "ENGLISH_KINDERGARTEN",
  "PRIVATE_ELEMENTARY",
  "INTERNATIONAL_SCHOOL",
] as const;

export type InstitutionCategory = (typeof institutionCategoryValues)[number];

export const internationalSubtypeValues = [
  "INTERNATIONAL_SCHOOL",
  "FOREIGN_SCHOOL",
  "OTHER_INTERNATIONAL",
] as const;

export type InternationalSubtype = (typeof internationalSubtypeValues)[number];

export const institutionOperationalStateValues = [
  "ACTIVE",
  "INACTIVE",
  "CLOSED",
  "UNKNOWN",
] as const;

export type InstitutionOperationalState =
  (typeof institutionOperationalStateValues)[number];

export const institutionPublicationStateValues = [
  "DRAFT",
  "PUBLISHED",
  "HIDDEN",
  "ARCHIVED",
] as const;

export type InstitutionPublicationState =
  (typeof institutionPublicationStateValues)[number];

export const institutions = pgTable(
  "institutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    category: text("category").$type<InstitutionCategory>().notNull(),
    internationalSubtype: text(
      "international_subtype",
    ).$type<InternationalSubtype>(),
    operationalState: text("operational_state")
      .$type<InstitutionOperationalState>()
      .notNull()
      .default("UNKNOWN"),
    publicationState: text("publication_state")
      .$type<InstitutionPublicationState>()
      .notNull()
      .default("DRAFT"),
    regionCode: text("region_code"),
    city: text("city"),
    district: text("district"),
    addressLine: text("address_line"),
    latitude: numeric("latitude"),
    longitude: numeric("longitude"),
    websiteUrl: text("website_url"),
    shortDescription: text("short_description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("institutions_slug_unique").on(table.slug),
    index("institutions_publication_category_idx").on(
      table.publicationState,
      table.category,
    ),
    index("institutions_publication_region_idx").on(
      table.publicationState,
      table.regionCode,
    ),
    index("institutions_category_region_district_idx").on(
      table.category,
      table.regionCode,
      table.district,
    ),
    index("institutions_display_name_idx").on(table.displayName),
    check(
      "institutions_category_check",
      sql`${table.category} in ('ENGLISH_KINDERGARTEN', 'PRIVATE_ELEMENTARY', 'INTERNATIONAL_SCHOOL')`,
    ),
    check(
      "institutions_international_subtype_check",
      sql`${table.internationalSubtype} is null or ${table.internationalSubtype} in ('INTERNATIONAL_SCHOOL', 'FOREIGN_SCHOOL', 'OTHER_INTERNATIONAL')`,
    ),
    check(
      "institutions_subtype_category_check",
      sql`${table.category} = 'INTERNATIONAL_SCHOOL' or ${table.internationalSubtype} is null`,
    ),
    check(
      "institutions_operational_state_check",
      sql`${table.operationalState} in ('ACTIVE', 'INACTIVE', 'CLOSED', 'UNKNOWN')`,
    ),
    check(
      "institutions_publication_state_check",
      sql`${table.publicationState} in ('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED')`,
    ),
    check(
      "institutions_latitude_range_check",
      sql`${table.latitude} is null or (${table.latitude} >= -90 and ${table.latitude} <= 90)`,
    ),
    check(
      "institutions_longitude_range_check",
      sql`${table.longitude} is null or (${table.longitude} >= -180 and ${table.longitude} <= 180)`,
    ),
  ],
);

export const institutionRegistryIdentities = pgTable(
  "institution_registry_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    registryName: text("registry_name").notNull(),
    registryExternalId: text("registry_external_id").notNull(),
    registryRecordUrl: text("registry_record_url").notNull(),
    registryLocator: text("registry_locator").notNull(),
    metadataJson: jsonb("metadata_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("institution_registry_identities_registry_unique").on(
      table.registryName,
      table.registryExternalId,
    ),
    index("institution_registry_identities_institution_idx").on(
      table.institutionId,
    ),
    check(
      "institution_registry_identities_registry_name_check",
      sql`${table.registryName} in ('SCHOOLINFO', 'ISI')`,
    ),
  ],
);

export const institutionSchoolLinks = pgTable(
  "institution_school_links",
  {
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    linkReason: text("link_reason"),
  },
  (table) => [
    primaryKey({
      columns: [table.institutionId],
      name: "institution_school_links_pkey",
    }),
    uniqueIndex("institution_school_links_school_id_unique").on(table.schoolId),
    unique("institution_school_links_institution_school_unique").on(
      table.institutionId,
      table.schoolId,
    ),
  ],
);

export const institutionSourceBindingRoleValues = [
  "OFFICIAL_MAIN",
  "REGISTRY_IDENTITY",
  "ADMISSIONS",
  "TUITION",
  "CURRICULUM",
  "APPLICATION",
  "OTHER",
] as const;

export type InstitutionSourceBindingRole =
  (typeof institutionSourceBindingRoleValues)[number];

export const institutionSourceBindings = pgTable(
  "institution_source_bindings",
  {
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    role: text("role").$type<InstitutionSourceBindingRole>().notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    boundAt: timestamp("bound_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unboundAt: timestamp("unbound_at", { withTimezone: true }),
  },
  (table) => [
    unique("institution_source_bindings_target_source_role_unique").on(
      table.institutionId,
      table.sourceId,
      table.role,
    ),
    index("institution_source_bindings_institution_active_idx").on(
      table.institutionId,
      table.isActive,
    ),
    index("institution_source_bindings_source_active_idx").on(
      table.sourceId,
      table.isActive,
    ),
    index("institution_source_bindings_role_active_idx").on(
      table.role,
      table.isActive,
    ),
    uniqueIndex("institution_source_bindings_active_primary_main_unique")
      .on(table.institutionId)
      .where(
        sql`${table.isPrimary} = true and ${table.isActive} = true and ${table.role} = 'OFFICIAL_MAIN'`,
      ),
    check(
      "institution_source_bindings_role_check",
      sql`${table.role} in ('OFFICIAL_MAIN', 'REGISTRY_IDENTITY', 'ADMISSIONS', 'TUITION', 'CURRICULUM', 'APPLICATION', 'OTHER')`,
    ),
    check(
      "institution_source_bindings_lifecycle_check",
      sql`(${table.isActive} = true and ${table.unboundAt} is null) or (${table.isActive} = false and ${table.unboundAt} is not null)`,
    ),
  ],
);

export const opportunityKindValues = [
  "RECRUITMENT",
  "ADDITIONAL_RECRUITMENT",
  "INFORMATION_SESSION",
  "CONSULTATION",
  "LEVEL_TEST",
  "OPEN_HOUSE",
  "APPLICATION",
  "DOCUMENT_SUBMISSION",
  "ASSESSMENT",
  "INTERVIEW",
  "LOTTERY",
  "RESULT_ANNOUNCEMENT",
  "REGISTRATION",
  "DEADLINE",
  "OTHER",
] as const;

export type OpportunityKind = (typeof opportunityKindValues)[number];

export const opportunityTruthModeValues = ["NATIVE", "LEGACY_BACKED"] as const;

export type OpportunityTruthMode = (typeof opportunityTruthModeValues)[number];

export const opportunityPublicationStateValues = [
  "DRAFT",
  "PUBLISHED",
  "HIDDEN",
  "ARCHIVED",
] as const;

export type OpportunityPublicationState =
  (typeof opportunityPublicationStateValues)[number];

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    kind: text("kind").$type<OpportunityKind>().notNull(),
    truthMode: text("truth_mode").$type<OpportunityTruthMode>().notNull(),
    publicationState: text("publication_state")
      .$type<OpportunityPublicationState>()
      .notNull()
      .default("DRAFT"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("opportunities_slug_unique").on(table.slug),
    unique("opportunities_id_institution_unique").on(
      table.id,
      table.institutionId,
    ),
    unique("opportunities_id_truth_mode_unique").on(table.id, table.truthMode),
    index("opportunities_institution_publication_idx").on(
      table.institutionId,
      table.publicationState,
    ),
    index("opportunities_publication_kind_idx").on(
      table.publicationState,
      table.kind,
    ),
    index("opportunities_publication_published_idx").on(
      table.publicationState,
      table.publishedAt.desc(),
    ),
    index("opportunities_institution_kind_idx").on(
      table.institutionId,
      table.kind,
    ),
    check(
      "opportunities_slug_format_check",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "opportunities_kind_check",
      sql`${table.kind} in ('RECRUITMENT', 'ADDITIONAL_RECRUITMENT', 'INFORMATION_SESSION', 'CONSULTATION', 'LEVEL_TEST', 'OPEN_HOUSE', 'APPLICATION', 'DOCUMENT_SUBMISSION', 'ASSESSMENT', 'INTERVIEW', 'LOTTERY', 'RESULT_ANNOUNCEMENT', 'REGISTRATION', 'DEADLINE', 'OTHER')`,
    ),
    check(
      "opportunities_truth_mode_check",
      sql`${table.truthMode} in ('NATIVE', 'LEGACY_BACKED')`,
    ),
    check(
      "opportunities_publication_state_check",
      sql`${table.publicationState} in ('DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED')`,
    ),
  ],
);

export const opportunityAdmissionEventLinks = pgTable(
  "opportunity_admission_event_links",
  {
    opportunityId: uuid("opportunity_id").notNull(),
    institutionId: uuid("institution_id").notNull(),
    truthMode: text("truth_mode")
      .$type<"LEGACY_BACKED">()
      .notNull()
      .default("LEGACY_BACKED"),
    admissionEventId: uuid("admission_event_id").notNull(),
    admissionCycleId: uuid("admission_cycle_id").notNull(),
    schoolId: uuid("school_id").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.opportunityId],
      name: "opportunity_admission_event_links_pkey",
    }),
    uniqueIndex("opportunity_admission_event_links_event_unique").on(
      table.admissionEventId,
    ),
    unique("opportunity_event_links_opportunity_event_unique").on(
      table.opportunityId,
      table.admissionEventId,
    ),
    check(
      "opportunity_admission_event_links_truth_mode_check",
      sql`${table.truthMode} = 'LEGACY_BACKED'`,
    ),
    foreignKey({
      name: "opportunity_event_links_opportunity_institution_fk",
      columns: [table.opportunityId, table.institutionId],
      foreignColumns: [opportunities.id, opportunities.institutionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_event_links_opportunity_truth_mode_fk",
      columns: [table.opportunityId, table.truthMode],
      foreignColumns: [opportunities.id, opportunities.truthMode],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_event_links_institution_school_fk",
      columns: [table.institutionId, table.schoolId],
      foreignColumns: [
        institutionSchoolLinks.institutionId,
        institutionSchoolLinks.schoolId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_event_links_event_cycle_fk",
      columns: [table.admissionEventId, table.admissionCycleId],
      foreignColumns: [admissionEvents.id, admissionEvents.admissionCycleId],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_event_links_cycle_school_fk",
      columns: [table.admissionCycleId, table.schoolId],
      foreignColumns: [admissionCycles.id, admissionCycles.schoolId],
    }).onDelete("restrict"),
  ],
);

export const opportunitySourceBindingRoleValues = [
  "PRIMARY_NOTICE",
  "APPLICATION",
  "DETAILS",
  "SUPPORTING",
  "OTHER",
] as const;

export type OpportunitySourceBindingRole =
  (typeof opportunitySourceBindingRoleValues)[number];

export const opportunitySourceBindings = pgTable(
  "opportunity_source_bindings",
  {
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "restrict" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    role: text("role").$type<OpportunitySourceBindingRole>().notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    boundAt: timestamp("bound_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    unboundAt: timestamp("unbound_at", { withTimezone: true }),
  },
  (table) => [
    unique("opportunity_source_bindings_target_source_role_unique").on(
      table.opportunityId,
      table.sourceId,
      table.role,
    ),
    index("opportunity_source_bindings_opportunity_active_idx").on(
      table.opportunityId,
      table.isActive,
    ),
    index("opportunity_source_bindings_source_active_idx").on(
      table.sourceId,
      table.isActive,
    ),
    index("opportunity_source_bindings_role_active_idx").on(
      table.role,
      table.isActive,
    ),
    uniqueIndex("opportunity_source_bindings_active_primary_role_unique")
      .on(table.opportunityId, table.role)
      .where(sql`${table.isPrimary} = true and ${table.isActive} = true`),
    check(
      "opportunity_source_bindings_role_check",
      sql`${table.role} in ('PRIMARY_NOTICE', 'APPLICATION', 'DETAILS', 'SUPPORTING', 'OTHER')`,
    ),
    check(
      "opportunity_source_bindings_lifecycle_check",
      sql`(${table.isActive} = true and ${table.unboundAt} is null) or (${table.isActive} = false and ${table.unboundAt} is not null)`,
    ),
  ],
);

export const versionVerificationStateValues = [
  "UNVERIFIED",
  "VERIFIED",
  "SUPERSEDED",
] as const;

export type VersionVerificationState =
  (typeof versionVerificationStateValues)[number];

export const opportunityBusinessStateValues = [
  "UPCOMING",
  "OPEN",
  "CLOSED",
  "COMPLETED",
  "CANCELLED",
  "UNKNOWN",
] as const;

export type OpportunityBusinessState =
  (typeof opportunityBusinessStateValues)[number];

export const opportunityVersions = pgTable(
  "opportunity_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id").notNull(),
    truthMode: text("truth_mode").$type<"NATIVE">().notNull().default("NATIVE"),
    versionNumber: integer("version_number").notNull(),
    supersedesVersionId: uuid("supersedes_version_id"),
    verificationState: text("verification_state")
      .$type<VersionVerificationState>()
      .notNull(),
    businessState: text("business_state")
      .$type<OpportunityBusinessState>()
      .notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    title: text("title").notNull(),
    summary: text("summary"),
    targetAudience: text("target_audience"),
    eventStartAt: timestamp("event_start_at", { withTimezone: true }),
    eventEndAt: timestamp("event_end_at", { withTimezone: true }),
    applicationOpenAt: timestamp("application_open_at", { withTimezone: true }),
    applicationCloseAt: timestamp("application_close_at", {
      withTimezone: true,
    }),
    actionUrl: text("action_url"),
    locationText: text("location_text"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByAdminId: uuid("verified_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "restrict" },
    ),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    contentFingerprint: text("content_fingerprint"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("opportunity_versions_id_opportunity_unique").on(
      table.id,
      table.opportunityId,
    ),
    uniqueIndex("opportunity_versions_opportunity_number_unique").on(
      table.opportunityId,
      table.versionNumber,
    ),
    uniqueIndex("opportunity_versions_one_current_per_opportunity")
      .on(table.opportunityId)
      .where(sql`${table.isCurrent} = true`),
    uniqueIndex("opportunity_versions_one_successor")
      .on(table.supersedesVersionId)
      .where(sql`${table.supersedesVersionId} is not null`),
    foreignKey({
      name: "opportunity_versions_native_opportunity_fk",
      columns: [table.opportunityId, table.truthMode],
      foreignColumns: [opportunities.id, opportunities.truthMode],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_versions_supersedes_fk",
      columns: [table.supersedesVersionId, table.opportunityId],
      foreignColumns: [table.id, table.opportunityId],
    }).onDelete("restrict"),
    check(
      "opportunity_versions_truth_mode_check",
      sql`${table.truthMode} = 'NATIVE'`,
    ),
    check("opportunity_versions_number_check", sql`${table.versionNumber} > 0`),
    check(
      "opportunity_versions_title_check",
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      "opportunity_versions_verification_state_check",
      sql`${table.verificationState} in ('UNVERIFIED', 'VERIFIED', 'SUPERSEDED')`,
    ),
    check(
      "opportunity_versions_business_state_check",
      sql`${table.businessState} in ('UPCOMING', 'OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED', 'UNKNOWN')`,
    ),
    check(
      "opportunity_versions_current_verified_check",
      sql`not ${table.isCurrent} or ${table.verificationState} = 'VERIFIED'`,
    ),
    check(
      "opportunity_versions_verified_at_check",
      sql`${table.verificationState} <> 'VERIFIED' or ${table.verifiedAt} is not null`,
    ),
    check(
      "opportunity_versions_superseded_not_current_check",
      sql`${table.verificationState} <> 'SUPERSEDED' or not ${table.isCurrent}`,
    ),
    check(
      "opportunity_versions_not_self_superseding_check",
      sql`${table.supersedesVersionId} is null or ${table.supersedesVersionId} <> ${table.id}`,
    ),
    check(
      "opportunity_versions_event_order_check",
      sql`${table.eventEndAt} is null or ${table.eventStartAt} is null or ${table.eventEndAt} >= ${table.eventStartAt}`,
    ),
    check(
      "opportunity_versions_application_order_check",
      sql`${table.applicationCloseAt} is null or ${table.applicationOpenAt} is null or ${table.applicationCloseAt} >= ${table.applicationOpenAt}`,
    ),
    check(
      "opportunity_versions_validity_order_check",
      sql`${table.validUntil} is null or ${table.validFrom} is null or ${table.validUntil} >= ${table.validFrom}`,
    ),
  ],
);

export const opportunityVersionEvidence = pgTable(
  "opportunity_version_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityVersionId: uuid("opportunity_version_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceObservationId: bigint("source_observation_id", { mode: "bigint" }),
    sourceSnapshotId: uuid("source_snapshot_id"),
    evidenceRole: text("evidence_role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "opportunity_version_evidence_version_fk",
      columns: [table.opportunityVersionId],
      foreignColumns: [opportunityVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_version_evidence_source_fk",
      columns: [table.sourceId],
      foreignColumns: [sources.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_version_evidence_observation_source_fk",
      columns: [table.sourceObservationId, table.sourceId],
      foreignColumns: [sourceObservations.id, sourceObservations.sourceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_version_evidence_snapshot_source_fk",
      columns: [table.sourceSnapshotId, table.sourceId],
      foreignColumns: [sourceSnapshots.id, sourceSnapshots.sourceId],
    }).onDelete("restrict"),
    unique("opportunity_version_evidence_logical_unique")
      .on(
        table.opportunityVersionId,
        table.sourceId,
        table.sourceObservationId,
        table.sourceSnapshotId,
      )
      .nullsNotDistinct(),
    check(
      "opportunity_version_evidence_role_check",
      sql`length(btrim(${table.evidenceRole})) > 0`,
    ),
  ],
);

export const opportunityChangeTypeValues = [
  "NEW_OPPORTUNITY",
  "DATE_CHANGED",
  "DEADLINE_CHANGED",
  "STATUS_CHANGED",
  "APPLICATION_OPENED",
  "APPLICATION_CLOSED",
  "CANCELLED",
  "MATERIAL_INFO_CHANGED",
] as const;

export type OpportunityChangeType =
  (typeof opportunityChangeTypeValues)[number];

export const opportunityChangeMaterialityValues = [
  "NOTIFIABLE",
  "NON_NOTIFIABLE",
] as const;

export type OpportunityChangeMateriality =
  (typeof opportunityChangeMaterialityValues)[number];

export const opportunityChanges = pgTable(
  "opportunity_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id").notNull(),
    truthMode: text("truth_mode").$type<OpportunityTruthMode>().notNull(),
    changeType: text("change_type").$type<OpportunityChangeType>().notNull(),
    materiality: text("materiality")
      .$type<OpportunityChangeMateriality>()
      .notNull(),
    fromNativeVersionId: uuid("from_native_version_id"),
    toNativeVersionId: uuid("to_native_version_id"),
    legacyMeaningfulChangeId: uuid("legacy_meaningful_change_id"),
    legacyAdmissionEventId: uuid("legacy_admission_event_id"),
    summary: text("summary").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "opportunity_changes_opportunity_truth_mode_fk",
      columns: [table.opportunityId, table.truthMode],
      foreignColumns: [opportunities.id, opportunities.truthMode],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_changes_from_native_version_fk",
      columns: [table.fromNativeVersionId, table.opportunityId],
      foreignColumns: [
        opportunityVersions.id,
        opportunityVersions.opportunityId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_changes_to_native_version_fk",
      columns: [table.toNativeVersionId, table.opportunityId],
      foreignColumns: [
        opportunityVersions.id,
        opportunityVersions.opportunityId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_changes_legacy_change_event_fk",
      columns: [table.legacyMeaningfulChangeId, table.legacyAdmissionEventId],
      foreignColumns: [
        meaningfulChanges.id,
        meaningfulChanges.admissionEventId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_changes_legacy_opportunity_event_fk",
      columns: [table.opportunityId, table.legacyAdmissionEventId],
      foreignColumns: [
        opportunityAdmissionEventLinks.opportunityId,
        opportunityAdmissionEventLinks.admissionEventId,
      ],
    }).onDelete("restrict"),
    unique("opportunity_changes_id_opportunity_unique").on(
      table.id,
      table.opportunityId,
    ),
    uniqueIndex("opportunity_changes_dedupe_key_unique").on(table.dedupeKey),
    uniqueIndex("opportunity_changes_legacy_change_unique")
      .on(table.legacyMeaningfulChangeId)
      .where(sql`${table.legacyMeaningfulChangeId} is not null`),
    index("opportunity_changes_opportunity_published_idx").on(
      table.opportunityId,
      table.publishedAt.desc(),
    ),
    check(
      "opportunity_changes_type_check",
      sql`${table.changeType} in ('NEW_OPPORTUNITY', 'DATE_CHANGED', 'DEADLINE_CHANGED', 'STATUS_CHANGED', 'APPLICATION_OPENED', 'APPLICATION_CLOSED', 'CANCELLED', 'MATERIAL_INFO_CHANGED')`,
    ),
    check(
      "opportunity_changes_materiality_check",
      sql`${table.materiality} in ('NOTIFIABLE', 'NON_NOTIFIABLE')`,
    ),
    check(
      "opportunity_changes_origin_check",
      sql`(
        ${table.truthMode} = 'NATIVE'
        and ${table.legacyMeaningfulChangeId} is null
        and ${table.legacyAdmissionEventId} is null
        and ${table.toNativeVersionId} is not null
        and ((${table.changeType} = 'NEW_OPPORTUNITY' and ${table.fromNativeVersionId} is null)
          or (${table.changeType} <> 'NEW_OPPORTUNITY' and ${table.fromNativeVersionId} is not null))
      ) or (
        ${table.truthMode} = 'LEGACY_BACKED'
        and ${table.fromNativeVersionId} is null
        and ${table.toNativeVersionId} is null
        and ${table.legacyMeaningfulChangeId} is not null
        and ${table.legacyAdmissionEventId} is not null
      )`,
    ),
    check(
      "opportunity_changes_distinct_native_versions_check",
      sql`${table.fromNativeVersionId} is null or ${table.fromNativeVersionId} <> ${table.toNativeVersionId}`,
    ),
    check(
      "opportunity_changes_summary_check",
      sql`length(btrim(${table.summary})) > 0`,
    ),
    check(
      "opportunity_changes_dedupe_key_check",
      sql`length(btrim(${table.dedupeKey})) > 0`,
    ),
  ],
);

export const institutionFactTypeValues = [
  "TUITION",
  "TARGET_AGE_GRADE",
  "CURRICULUM",
  "ELIGIBILITY",
  "TRANSPORT",
  "ADMISSION_PROCESS",
  "OPERATING_INFO",
] as const;

export type InstitutionFactType = (typeof institutionFactTypeValues)[number];

export const institutionFacts = pgTable(
  "institution_facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    factType: text("fact_type").$type<InstitutionFactType>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("institution_facts_institution_type_unique").on(
      table.institutionId,
      table.factType,
    ),
    check(
      "institution_facts_type_check",
      sql`${table.factType} in ('TUITION', 'TARGET_AGE_GRADE', 'CURRICULUM', 'ELIGIBILITY', 'TRANSPORT', 'ADMISSION_PROCESS', 'OPERATING_INFO')`,
    ),
  ],
);

export const institutionFactVersions = pgTable(
  "institution_fact_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionFactId: uuid("institution_fact_id")
      .notNull()
      .references(() => institutionFacts.id, { onDelete: "restrict" }),
    versionNumber: integer("version_number").notNull(),
    supersedesVersionId: uuid("supersedes_version_id"),
    verificationState: text("verification_state")
      .$type<VersionVerificationState>()
      .notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    valueJson: jsonb("value_json").$type<Record<string, unknown>>().notNull(),
    displayText: text("display_text"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByAdminId: uuid("verified_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "restrict" },
    ),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("institution_fact_versions_id_fact_unique").on(
      table.id,
      table.institutionFactId,
    ),
    uniqueIndex("institution_fact_versions_fact_number_unique").on(
      table.institutionFactId,
      table.versionNumber,
    ),
    uniqueIndex("institution_fact_versions_one_current_per_fact")
      .on(table.institutionFactId)
      .where(sql`${table.isCurrent} = true`),
    uniqueIndex("institution_fact_versions_one_successor")
      .on(table.supersedesVersionId)
      .where(sql`${table.supersedesVersionId} is not null`),
    foreignKey({
      name: "institution_fact_versions_supersedes_fk",
      columns: [table.supersedesVersionId, table.institutionFactId],
      foreignColumns: [table.id, table.institutionFactId],
    }).onDelete("restrict"),
    check(
      "institution_fact_versions_number_check",
      sql`${table.versionNumber} > 0`,
    ),
    check(
      "institution_fact_versions_verification_state_check",
      sql`${table.verificationState} in ('UNVERIFIED', 'VERIFIED', 'SUPERSEDED')`,
    ),
    check(
      "institution_fact_versions_current_verified_check",
      sql`not ${table.isCurrent} or ${table.verificationState} = 'VERIFIED'`,
    ),
    check(
      "institution_fact_versions_verified_at_check",
      sql`${table.verificationState} <> 'VERIFIED' or ${table.verifiedAt} is not null`,
    ),
    check(
      "institution_fact_versions_superseded_not_current_check",
      sql`${table.verificationState} <> 'SUPERSEDED' or not ${table.isCurrent}`,
    ),
    check(
      "institution_fact_versions_not_self_superseding_check",
      sql`${table.supersedesVersionId} is null or ${table.supersedesVersionId} <> ${table.id}`,
    ),
    check(
      "institution_fact_versions_value_object_check",
      sql`jsonb_typeof(${table.valueJson}) = 'object'`,
    ),
    check(
      "institution_fact_versions_validity_order_check",
      sql`${table.validUntil} is null or ${table.validFrom} is null or ${table.validUntil} >= ${table.validFrom}`,
    ),
  ],
);

export const institutionFactVersionEvidence = pgTable(
  "institution_fact_version_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionFactVersionId: uuid("institution_fact_version_id").notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceObservationId: bigint("source_observation_id", { mode: "bigint" }),
    sourceSnapshotId: uuid("source_snapshot_id"),
    evidenceRole: text("evidence_role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "institution_fact_version_evidence_version_fk",
      columns: [table.institutionFactVersionId],
      foreignColumns: [institutionFactVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "institution_fact_version_evidence_source_fk",
      columns: [table.sourceId],
      foreignColumns: [sources.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "institution_fact_version_evidence_observation_source_fk",
      columns: [table.sourceObservationId, table.sourceId],
      foreignColumns: [sourceObservations.id, sourceObservations.sourceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "institution_fact_version_evidence_snapshot_source_fk",
      columns: [table.sourceSnapshotId, table.sourceId],
      foreignColumns: [sourceSnapshots.id, sourceSnapshots.sourceId],
    }).onDelete("restrict"),
    unique("institution_fact_version_evidence_logical_unique")
      .on(
        table.institutionFactVersionId,
        table.sourceId,
        table.sourceObservationId,
        table.sourceSnapshotId,
      )
      .nullsNotDistinct(),
    check(
      "institution_fact_version_evidence_role_check",
      sql`length(btrim(${table.evidenceRole})) > 0`,
    ),
  ],
);

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
      sql`${table.status} in ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED')`,
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

export const articleTypeValues = ["GUIDE", "UPDATE", "ROUNDUP"] as const;
export type ArticleType = (typeof articleTypeValues)[number];

export const articleCategoryValues = [
  "ENGLISH_KINDERGARTEN",
  "PRIVATE_ELEMENTARY",
  "INTERNATIONAL_SCHOOL",
  "ADMISSIONS_GENERAL",
] as const;
export type ArticleCategory = (typeof articleCategoryValues)[number];

export const articleStatusValues = [
  "DRAFT",
  "PUBLISHED",
  "UNPUBLISHED",
  "ARCHIVED",
] as const;
export type ArticleStatus = (typeof articleStatusValues)[number];

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    type: text("type").$type<ArticleType>().notNull(),
    category: text("category").$type<ArticleCategory>().notNull(),
    status: text("status").$type<ArticleStatus>().notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    contentHtml: text("content_html").notNull(),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    canonicalUrl: text("canonical_url"),
    robotsIndex: boolean("robots_index").notNull(),
    robotsFollow: boolean("robots_follow").notNull(),
    featuredImageUrl: text("featured_image_url"),
    featuredImageAlt: text("featured_image_alt"),
    authorAdminId: uuid("author_admin_id").references(() => adminUsers.id, {
      onDelete: "restrict",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    unpublishedAt: timestamp("unpublished_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("articles_slug_unique").on(table.slug),
    index("articles_status_published_idx").on(
      table.status,
      table.publishedAt.desc(),
    ),
    check(
      "articles_slug_format_check",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "articles_type_check",
      sql`${table.type} in ('GUIDE', 'UPDATE', 'ROUNDUP')`,
    ),
    check(
      "articles_category_check",
      sql`${table.category} in ('ENGLISH_KINDERGARTEN', 'PRIVATE_ELEMENTARY', 'INTERNATIONAL_SCHOOL', 'ADMISSIONS_GENERAL')`,
    ),
    check(
      "articles_status_check",
      sql`${table.status} in ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')`,
    ),
    check(
      "articles_published_completeness_check",
      sql`${table.status} <> 'PUBLISHED' or (length(regexp_replace(${table.title}, '[[:space:]]', '', 'g')) > 0 and length(regexp_replace(${table.contentHtml}, '[[:space:]]', '', 'g')) > 0 and ${table.publishedAt} is not null)`,
    ),
  ],
);

export const articleRelationTypeValues = ["RELATED"] as const;
export type ArticleRelationType = (typeof articleRelationTypeValues)[number];

export const articleInstitutions = pgTable(
  "article_institutions",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    relationType: text("relation_type")
      .$type<ArticleRelationType>()
      .notNull()
      .default("RELATED"),
    sortOrder: integer("sort_order"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("article_institutions_article_institution_relation_unique").on(
      table.articleId,
      table.institutionId,
      table.relationType,
    ),
    index("article_institutions_target_article_idx").on(
      table.institutionId,
      table.articleId,
    ),
    check(
      "article_institutions_relation_type_check",
      sql`${table.relationType} = 'RELATED'`,
    ),
  ],
);

export const articleOpportunities = pgTable(
  "article_opportunities",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "restrict" }),
    relationType: text("relation_type")
      .$type<ArticleRelationType>()
      .notNull()
      .default("RELATED"),
    sortOrder: integer("sort_order"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("article_opportunities_article_opportunity_relation_unique").on(
      table.articleId,
      table.opportunityId,
      table.relationType,
    ),
    index("article_opportunities_target_article_idx").on(
      table.opportunityId,
      table.articleId,
    ),
    check(
      "article_opportunities_relation_type_check",
      sql`${table.relationType} = 'RELATED'`,
    ),
  ],
);

export const urlRedirects = pgTable(
  "url_redirects",
  {
    sourcePath: text("source_path").primaryKey(),
    targetPath: text("target_path").notNull(),
    statusCode: integer("status_code").notNull(),
    createdAt: createdAt(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    reason: text("reason"),
  },
  (table) => [
    check(
      "url_redirects_status_code_check",
      sql`${table.statusCode} in (301, 308)`,
    ),
    check(
      "url_redirects_not_self_check",
      sql`${table.sourcePath} <> ${table.targetPath}`,
    ),
    check(
      "url_redirects_source_path_safe_check",
      sql`${table.sourcePath} ~ '^/' and ${table.sourcePath} !~ '^//' and ${table.sourcePath} !~ '[[:space:]\\\\?#:]' and ${table.sourcePath} !~ '[[:cntrl:]]'`,
    ),
    check(
      "url_redirects_target_path_safe_check",
      sql`${table.targetPath} ~ '^/' and ${table.targetPath} !~ '^//' and ${table.targetPath} !~ '[[:space:]\\\\?#:]' and ${table.targetPath} !~ '[[:cntrl:]]'`,
    ),
  ],
);
