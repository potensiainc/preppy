import "server-only";

import { sql } from "drizzle-orm";

import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

export const REQUIRED_BOOTSTRAP_COLUMNS = Object.freeze({
  institutions: Object.freeze([
    "id",
    "slug",
    "display_name",
    "category",
    "publication_state",
  ]),
  sources: Object.freeze([
    "id",
    "canonical_url",
    "source_type",
    "authority_level",
    "lifecycle_status",
    "source_name",
    "requires_js",
    "content_type_hint",
    "created_at",
    "updated_at",
  ]),
  institution_source_bindings: Object.freeze([
    "institution_id",
    "source_id",
    "role",
    "is_primary",
    "is_active",
    "bound_at",
    "unbound_at",
  ]),
  source_snapshots: Object.freeze([
    "id",
    "source_id",
    "captured_at",
    "content_hash",
    "text_hash",
    "normalized_text",
    "mime_type",
    "created_at",
  ]),
  source_observations: Object.freeze([
    "id",
    "source_id",
    "observed_at",
    "outcome",
    "http_status",
    "final_url",
    "content_hash",
    "text_hash",
    "response_bytes",
    "duration_ms",
    "snapshot_id",
    "created_at",
  ]),
  institution_facts: Object.freeze([
    "id",
    "institution_id",
    "fact_type",
    "created_at",
  ]),
  institution_fact_versions: Object.freeze([
    "id",
    "institution_fact_id",
    "version_number",
    "supersedes_version_id",
    "verification_state",
    "is_current",
    "value_json",
    "display_text",
    "verified_at",
    "verified_by_admin_id",
    "created_at",
  ]),
  institution_fact_version_evidence: Object.freeze([
    "id",
    "institution_fact_version_id",
    "source_id",
    "source_observation_id",
    "source_snapshot_id",
    "evidence_role",
    "created_at",
  ]),
  opportunities: Object.freeze([
    "id",
    "institution_id",
    "slug",
    "kind",
    "truth_mode",
    "publication_state",
    "created_at",
    "updated_at",
    "published_at",
  ]),
  opportunity_versions: Object.freeze([
    "id",
    "opportunity_id",
    "truth_mode",
    "version_number",
    "supersedes_version_id",
    "verification_state",
    "business_state",
    "is_current",
    "title",
    "summary",
    "target_audience",
    "event_start_at",
    "event_end_at",
    "application_open_at",
    "application_close_at",
    "action_url",
    "verified_at",
    "verified_by_admin_id",
    "content_fingerprint",
    "created_at",
  ]),
  opportunity_version_evidence: Object.freeze([
    "id",
    "opportunity_version_id",
    "source_id",
    "source_observation_id",
    "source_snapshot_id",
    "evidence_role",
    "created_at",
  ]),
  opportunity_source_bindings: Object.freeze([
    "opportunity_id",
    "source_id",
    "role",
    "is_primary",
    "is_active",
    "bound_at",
    "unbound_at",
  ]),
  outbox_events: Object.freeze(["id"]),
  notifications: Object.freeze(["id"]),
  notification_deliveries: Object.freeze(["id"]),
  notification_delivery_attempts: Object.freeze(["id"]),
  meaningful_changes: Object.freeze(["id"]),
  opportunity_changes: Object.freeze(["id"]),
} as const);

type ColumnInventoryRow = Readonly<{
  tableName: string;
  columnName: string;
}>;

type ConstraintInventoryRow = Readonly<{
  name: string;
  definition: string;
}>;

const REQUIRED_CONSTRAINT_VALUES = Object.freeze([
  ["sources_source_type_check", "OFFICIAL_SCHOOL_PAGE", "sources.source_type"],
  ["sources_source_type_check", "OFFICIAL_DOCUMENT", "sources.source_type"],
  [
    "sources_source_type_check",
    "OFFICIAL_ADMISSION_PAGE",
    "sources.source_type",
  ],
  ["sources_source_type_check", "OFFICIAL_NOTICE_BOARD", "sources.source_type"],
  [
    "institution_source_bindings_role_check",
    "OFFICIAL_MAIN",
    "institution_source_bindings.role",
  ],
  [
    "institution_source_bindings_role_check",
    "ADMISSIONS",
    "institution_source_bindings.role",
  ],
  [
    "opportunity_source_bindings_role_check",
    "PRIMARY_NOTICE",
    "opportunity_source_bindings.role",
  ],
] as const);

export type BootstrapSchemaCompatibility = Readonly<{
  compatible: boolean;
  missingColumns: readonly string[];
  missingConstraintValues: readonly string[];
  supportsOfficialRegistrySourceType: boolean;
  supportsRegistryIdentityBindingRole: boolean;
  migrationLedgerInspected: false;
}>;

export function validateBootstrapSchemaInventory(
  input: Readonly<{
    columns: readonly ColumnInventoryRow[];
    constraints: readonly ConstraintInventoryRow[];
  }>,
): BootstrapSchemaCompatibility {
  const actualColumns = new Set(
    input.columns.map((row) => `${row.tableName}.${row.columnName}`),
  );
  const missingColumns = Object.entries(REQUIRED_BOOTSTRAP_COLUMNS).flatMap(
    ([tableName, columns]) =>
      columns
        .map((columnName) => `${tableName}.${columnName}`)
        .filter((key) => !actualColumns.has(key)),
  );
  const constraints = new Map(
    input.constraints.map((row) => [row.name, row.definition]),
  );
  const missingConstraintValues = REQUIRED_CONSTRAINT_VALUES.flatMap(
    ([constraintName, value, label]) =>
      constraints.get(constraintName)?.includes(value)
        ? []
        : [`${label}=${value}`],
  );
  return Object.freeze({
    compatible:
      missingColumns.length === 0 && missingConstraintValues.length === 0,
    missingColumns: Object.freeze(missingColumns),
    missingConstraintValues: Object.freeze(missingConstraintValues),
    supportsOfficialRegistrySourceType:
      constraints
        .get("sources_source_type_check")
        ?.includes("OFFICIAL_REGISTRY") ?? false,
    supportsRegistryIdentityBindingRole:
      constraints
        .get("institution_source_bindings_role_check")
        ?.includes("REGISTRY_IDENTITY") ?? false,
    migrationLedgerInspected: false as const,
  });
}

export async function inspectBootstrapSchema(
  executor: DatabaseExecutor,
): Promise<BootstrapSchemaCompatibility> {
  const columns = (await executor.raw(sql`
    select table_name as "tableName", column_name as "columnName"
    from information_schema.columns
    where table_schema=current_schema()
  `)) as unknown as ColumnInventoryRow[];
  const constraints = (await executor.raw(sql`
    select constraint_name as name, pg_get_constraintdef(constraint_oid) as definition
    from (
      select constraint_record.oid as constraint_oid,
        constraint_record.conname as constraint_name
      from pg_constraint constraint_record
      join pg_namespace namespace_record
        on namespace_record.oid=constraint_record.connamespace
      where namespace_record.nspname=current_schema()
        and constraint_record.contype='c'
    ) check_constraints
  `)) as unknown as ConstraintInventoryRow[];
  return validateBootstrapSchemaInventory({ columns, constraints });
}
