import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { bytea, createdAt, updatedAt } from "./_shared";
import { adminUsers } from "./admin";
import {
  admissionCycles,
  admissionEventVersions,
  admissionEvents,
  admissionFactVersions,
  admissionFacts,
  schools,
} from "./legacy-admissions";

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
    rawBody: bytea("raw_body"),
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
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
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
