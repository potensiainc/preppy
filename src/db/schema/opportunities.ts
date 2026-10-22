import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
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
import { adminUsers } from "./admin";
import { institutionSchoolLinks, institutions } from "./institutions";
import { admissionCycles, admissionEvents } from "./legacy-admissions";
import {
  meaningfulChanges,
  sourceObservations,
  sourceSnapshots,
  sources,
} from "./sources";

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

/**
 * An explicit public grouping for repeated sessions of one admission event.
 * Membership is never inferred from titles or slugs at read time.
 */
export const opportunitySeries = pgTable(
  "opportunity_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    kind: text("kind").$type<OpportunityKind>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("opportunity_series_slug_unique").on(table.slug),
    unique("opportunity_series_id_institution_unique").on(
      table.id,
      table.institutionId,
    ),
    index("opportunity_series_institution_kind_idx").on(
      table.institutionId,
      table.kind,
    ),
    check(
      "opportunity_series_slug_format_check",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "opportunity_series_title_check",
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      "opportunity_series_kind_check",
      sql`${table.kind} in ('RECRUITMENT', 'ADDITIONAL_RECRUITMENT', 'INFORMATION_SESSION', 'CONSULTATION', 'LEVEL_TEST', 'OPEN_HOUSE', 'APPLICATION', 'DOCUMENT_SUBMISSION', 'ASSESSMENT', 'INTERVIEW', 'LOTTERY', 'RESULT_ANNOUNCEMENT', 'REGISTRATION', 'DEADLINE', 'OTHER')`,
    ),
  ],
);

export const opportunitySeriesMembers = pgTable(
  "opportunity_series_members",
  {
    opportunityId: uuid("opportunity_id").notNull(),
    seriesId: uuid("series_id").notNull(),
    institutionId: uuid("institution_id").notNull(),
    sessionNumber: smallint("session_number").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.opportunityId],
      name: "opportunity_series_members_pkey",
    }),
    uniqueIndex("opportunity_series_members_number_unique").on(
      table.seriesId,
      table.sessionNumber,
    ),
    index("opportunity_series_members_series_idx").on(table.seriesId),
    foreignKey({
      name: "opportunity_series_members_opportunity_institution_fk",
      columns: [table.opportunityId, table.institutionId],
      foreignColumns: [opportunities.id, opportunities.institutionId],
    }).onDelete("restrict"),
    foreignKey({
      name: "opportunity_series_members_series_institution_fk",
      columns: [table.seriesId, table.institutionId],
      foreignColumns: [opportunitySeries.id, opportunitySeries.institutionId],
    }).onDelete("restrict"),
    check(
      "opportunity_series_members_session_number_check",
      sql`${table.sessionNumber} > 0`,
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
