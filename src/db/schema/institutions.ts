import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "./_shared";
import { schools } from "./legacy-admissions";
import { sources } from "./sources";

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
    index("institutions_normalized_display_name_trgm_idx").using(
      "gin",
      sql`(regexp_replace(lower(coalesce(${table.displayName}, '')), '[^0-9a-z가-힣]+', '', 'g')) gin_trgm_ops`,
    ),
    index("institutions_normalized_slug_trgm_idx").using(
      "gin",
      sql`(regexp_replace(lower(coalesce(${table.slug}, '')), '[^0-9a-z가-힣]+', '', 'g')) gin_trgm_ops`,
    ),
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
    index("institution_registry_identities_normalized_name_en_trgm_idx").using(
      "gin",
      sql`(regexp_replace(lower(coalesce(${table.metadataJson} ->> 'canonical_name_en', '')), '[^0-9a-z가-힣]+', '', 'g')) gin_trgm_ops`,
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
