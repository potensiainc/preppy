import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  CoverageStatus,
  EnglishKindergartenSection,
} from "@/src/modules/english-kindergarten/coverage";
import type { ReviewInsightValue } from "@/src/modules/english-kindergarten/review-insight";

import { createdAt, updatedAt } from "./_shared";
import { adminUsers } from "./admin";
import { institutions } from "./institutions";
import type { VersionVerificationState } from "./opportunities";
import { sourceObservations, sourceSnapshots, sources } from "./sources";

export const institutionFactTypeValues = [
  "TUITION",
  "TARGET_AGE_GRADE",
  "CURRICULUM",
  "ELIGIBILITY",
  "TRANSPORT",
  "MEALS",
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
      sql`${table.factType} in ('TUITION', 'TARGET_AGE_GRADE', 'CURRICULUM', 'ELIGIBILITY', 'TRANSPORT', 'MEALS', 'ADMISSION_PROCESS', 'OPERATING_INFO')`,
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

export const institutionSectionCoverages = pgTable(
  "institution_section_coverages",
  {
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    section: text("section").$type<EnglishKindergartenSection>().notNull(),
    status: text("status").$type<CoverageStatus>().notNull(),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "restrict",
    }),
    sourceSnapshotId: uuid("source_snapshot_id"),
    academicYearLabel: text("academic_year_label"),
    publicNote: text("public_note"),
    internalNote: text("internal_note"),
    lastCollectedAt: timestamp("last_collected_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      name: "institution_section_coverages_pk",
      columns: [table.institutionId, table.section],
    }),
    foreignKey({
      name: "institution_section_coverages_snapshot_source_fk",
      columns: [table.sourceSnapshotId, table.sourceId],
      foreignColumns: [sourceSnapshots.id, sourceSnapshots.sourceId],
    }).onDelete("restrict"),
    index("institution_section_coverages_status_idx").on(
      table.section,
      table.status,
    ),
    check(
      "institution_section_coverages_section_check",
      sql`${table.section} in ('TUITION', 'INFORMATION_SESSION', 'TARGET_AGE_GRADE', 'CURRICULUM', 'TRANSPORT', 'MEALS', 'REVIEWS', 'OPERATING_INFO')`,
    ),
    check(
      "institution_section_coverages_status_check",
      sql`${table.status} in ('NOT_RESEARCHED', 'CONFIRMED', 'CHECKED_NOT_FOUND', 'ACCESS_FAILED', 'NEEDS_REVIEW')`,
    ),
    check(
      "institution_section_coverages_snapshot_source_check",
      sql`${table.sourceSnapshotId} is null or ${table.sourceId} is not null`,
    ),
    check(
      "institution_section_coverages_year_check",
      sql`${table.academicYearLabel} is null or length(btrim(${table.academicYearLabel})) > 0`,
    ),
    check(
      "institution_section_coverages_public_note_check",
      sql`${table.publicNote} is null or length(btrim(${table.publicNote})) > 0`,
    ),
    check(
      "institution_section_coverages_internal_note_check",
      sql`${table.internalNote} is null or length(btrim(${table.internalNote})) > 0`,
    ),
    check(
      "institution_section_coverages_collection_order_check",
      sql`${table.lastCollectedAt} is null or ${table.lastCollectedAt} <= ${table.lastCheckedAt}`,
    ),
  ],
);

export const institutionReviewInsights = pgTable(
  "institution_review_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("institution_review_insights_institution_unique").on(
      table.institutionId,
    ),
  ],
);

export const institutionReviewInsightVersions = pgTable(
  "institution_review_insight_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionReviewInsightId: uuid("institution_review_insight_id")
      .notNull()
      .references(() => institutionReviewInsights.id, {
        onDelete: "restrict",
      }),
    versionNumber: integer("version_number").notNull(),
    supersedesVersionId: uuid("supersedes_version_id"),
    verificationState: text("verification_state")
      .$type<VersionVerificationState>()
      .notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    sampleSize: integer("sample_size").notNull(),
    themes: jsonb("themes").$type<ReviewInsightValue["themes"]>().notNull(),
    limitations: text("limitations"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedByAdminId: uuid("verified_by_admin_id").references(
      () => adminUsers.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
  },
  (table) => [
    unique("institution_review_insight_versions_id_root_unique").on(
      table.id,
      table.institutionReviewInsightId,
    ),
    uniqueIndex("institution_review_insight_versions_root_number_unique").on(
      table.institutionReviewInsightId,
      table.versionNumber,
    ),
    uniqueIndex("institution_review_insight_versions_one_current_per_root")
      .on(table.institutionReviewInsightId)
      .where(sql`${table.isCurrent} = true`),
    uniqueIndex("institution_review_insight_versions_one_successor")
      .on(table.supersedesVersionId)
      .where(sql`${table.supersedesVersionId} is not null`),
    foreignKey({
      name: "institution_review_insight_versions_supersedes_fk",
      columns: [table.supersedesVersionId, table.institutionReviewInsightId],
      foreignColumns: [table.id, table.institutionReviewInsightId],
    }).onDelete("restrict"),
    check(
      "institution_review_insight_versions_number_check",
      sql`${table.versionNumber} > 0`,
    ),
    check(
      "institution_review_insight_versions_verification_state_check",
      sql`${table.verificationState} in ('UNVERIFIED', 'VERIFIED', 'SUPERSEDED')`,
    ),
    check(
      "institution_review_insight_versions_current_verified_check",
      sql`not ${table.isCurrent} or ${table.verificationState} = 'VERIFIED'`,
    ),
    check(
      "institution_review_insight_versions_verified_at_check",
      sql`${table.verificationState} <> 'VERIFIED' or ${table.verifiedAt} is not null`,
    ),
    check(
      "institution_review_insight_versions_superseded_not_current_check",
      sql`${table.verificationState} <> 'SUPERSEDED' or not ${table.isCurrent}`,
    ),
    check(
      "institution_review_insight_versions_not_self_superseding_check",
      sql`${table.supersedesVersionId} is null or ${table.supersedesVersionId} <> ${table.id}`,
    ),
    check(
      "institution_review_insight_versions_sample_size_check",
      sql`${table.sampleSize} > 0`,
    ),
    check(
      "institution_review_insight_versions_themes_check",
      sql`jsonb_typeof(${table.themes}) = 'array' and jsonb_array_length(${table.themes}) > 0`,
    ),
    check(
      "institution_review_insight_versions_period_order_check",
      sql`${table.periodEnd} is null or ${table.periodStart} is null or ${table.periodEnd} >= ${table.periodStart}`,
    ),
    check(
      "institution_review_insight_versions_limitations_check",
      sql`${table.limitations} is null or length(btrim(${table.limitations})) > 0`,
    ),
  ],
);

export const institutionReviewInsightVersionEvidence = pgTable(
  "institution_review_insight_version_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    institutionReviewInsightVersionId: uuid(
      "institution_review_insight_version_id",
    ).notNull(),
    sourceId: uuid("source_id").notNull(),
    sourceObservationId: bigint("source_observation_id", { mode: "bigint" }),
    sourceSnapshotId: uuid("source_snapshot_id"),
    evidenceRole: text("evidence_role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "institution_review_insight_version_evidence_version_fk",
      columns: [table.institutionReviewInsightVersionId],
      foreignColumns: [institutionReviewInsightVersions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "institution_review_insight_version_evidence_source_fk",
      columns: [table.sourceId],
      foreignColumns: [sources.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "institution_review_insight_version_evidence_observation_source_fk",
      columns: [table.sourceObservationId, table.sourceId],
      foreignColumns: [sourceObservations.id, sourceObservations.sourceId],
    }).onDelete("restrict"),
    foreignKey({
      name: "institution_review_insight_version_evidence_snapshot_source_fk",
      columns: [table.sourceSnapshotId, table.sourceId],
      foreignColumns: [sourceSnapshots.id, sourceSnapshots.sourceId],
    }).onDelete("restrict"),
    unique("institution_review_insight_version_evidence_logical_unique")
      .on(
        table.institutionReviewInsightVersionId,
        table.sourceId,
        table.sourceObservationId,
        table.sourceSnapshotId,
      )
      .nullsNotDistinct(),
    check(
      "institution_review_insight_version_evidence_role_check",
      sql`length(btrim(${table.evidenceRole})) > 0`,
    ),
  ],
);
