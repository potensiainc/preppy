import "server-only";

import {
  PREFLIGHT_TABLES,
  type PreflightDistribution,
  type PreflightTable,
  type ReadOnlyPreflightSession,
} from "@/src/modules/production-preflight/read-only-database.server";

export type SchemaCompatibility =
  "PRESENT" | "MISSING" | "INCOMPATIBLE" | "UNKNOWN";

const CRITICAL_COLUMNS: Partial<Record<PreflightTable, readonly string[]>> = {
  institutions: ["id", "slug", "operational_state", "publication_state"],
  institution_school_links: ["institution_id", "school_id"],
  institution_source_bindings: [
    "institution_id",
    "source_id",
    "role",
    "is_primary",
    "is_active",
  ],
  opportunities: ["id", "institution_id", "truth_mode", "publication_state"],
  opportunity_admission_event_links: [
    "opportunity_id",
    "institution_id",
    "admission_event_id",
    "admission_cycle_id",
    "school_id",
  ],
  opportunity_source_bindings: [
    "opportunity_id",
    "source_id",
    "role",
    "is_primary",
    "is_active",
  ],
  users: ["id", "status"],
  follows: ["id", "user_id", "institution_id", "status"],
  follow_episodes: ["follow_id", "activated_at", "deactivated_at"],
  notifications: ["id", "opportunity_id", "status", "dedupe_key"],
  notification_deliveries: ["id", "notification_id", "user_id", "status"],
  notification_delivery_attempts: [
    "id",
    "notification_delivery_id",
    "attempt_status",
    "provider_message_id",
  ],
  outbox_events: [
    "id",
    "event_type",
    "status",
    "dedupe_key",
    "locked_at",
    "locked_by",
  ],
  articles: ["id", "slug", "status", "content_html", "canonical_url"],
  url_redirects: ["source_path", "target_path", "disabled_at"],
  email_provider_events: [
    "id",
    "provider",
    "provider_event_id",
    "provider_message_id",
    "processing_status",
  ],
};

const CRITICAL_INDEXES = [
  "institution_school_links_school_id_unique",
  "opportunity_admission_event_links_event_unique",
  "institution_source_bindings_active_primary_main_unique",
  "opportunity_source_bindings_active_primary_role_unique",
  "follows_user_institution_unique",
  "follow_episodes_one_open_per_follow",
  "notifications_dedupe_key_unique",
  "notification_deliveries_logical_unique",
  "outbox_events_dedupe_key_unique",
  "email_provider_events_provider_event_unique",
] as const;

const CRITICAL_CONSTRAINTS = [
  "opportunity_event_links_institution_school_fk",
  "opportunity_event_links_event_cycle_fk",
  "opportunity_event_links_cycle_school_fk",
  "follow_episodes_interval_check",
  "outbox_events_processing_lock_check",
  "url_redirects_not_self_check",
] as const;

const DISTRIBUTIONS = [
  "institutionPublication",
  "institutionOperational",
  "opportunityPublication",
  "opportunityTruthMode",
  "userStatus",
  "userEmailVerification",
  "userEmailDelivery",
  "followStatus",
  "outboxStatus",
  "notificationStatus",
  "notificationDeliveryStatus",
  "deliveryAttemptStatus",
  "articleStatus",
  "providerEventStatus",
] as const satisfies readonly PreflightDistribution[];

export type ProductionInventory = {
  schema: {
    tables: Record<PreflightTable, SchemaCompatibility>;
    missingColumns: string[];
    missingIndexes: string[];
    missingConstraints: string[];
  };
  rowCounts: Record<PreflightTable, number>;
  distributions: Record<PreflightDistribution, Record<string, number>>;
};

export async function collectProductionInventory(
  session: ReadOnlyPreflightSession,
): Promise<ProductionInventory> {
  const [tables, columns, indexes, constraints] = await Promise.all([
    session.listPublicTables(),
    session.listPublicColumns(),
    session.listPublicIndexes(),
    session.listPublicConstraints(),
  ]);
  const tableSet = new Set(tables);
  const columnSet = new Set(
    columns.map((column) => `${column.tableName}.${column.columnName}`),
  );
  const missingColumns: string[] = [];
  const tableStatus = {} as Record<PreflightTable, SchemaCompatibility>;
  for (const table of PREFLIGHT_TABLES) {
    if (!tableSet.has(table)) {
      tableStatus[table] = "MISSING";
      continue;
    }
    const expectedColumns = CRITICAL_COLUMNS[table] ?? [];
    const missing = expectedColumns.filter(
      (column) => !columnSet.has(`${table}.${column}`),
    );
    missingColumns.push(...missing.map((column) => `${table}.${column}`));
    tableStatus[table] = missing.length === 0 ? "PRESENT" : "INCOMPATIBLE";
  }

  const rowCounts = {} as Record<PreflightTable, number>;
  for (const table of PREFLIGHT_TABLES) {
    rowCounts[table] = tableSet.has(table)
      ? await session.countTable(table)
      : 0;
  }

  const distributions = {} as Record<
    PreflightDistribution,
    Record<string, number>
  >;
  for (const distribution of DISTRIBUTIONS) {
    const requiredTable: Record<PreflightDistribution, PreflightTable> = {
      institutionPublication: "institutions",
      institutionOperational: "institutions",
      opportunityPublication: "opportunities",
      opportunityTruthMode: "opportunities",
      userStatus: "users",
      userEmailVerification: "user_emails",
      userEmailDelivery: "user_emails",
      followStatus: "follows",
      outboxStatus: "outbox_events",
      notificationStatus: "notifications",
      notificationDeliveryStatus: "notification_deliveries",
      deliveryAttemptStatus: "notification_delivery_attempts",
      articleStatus: "articles",
      providerEventStatus: "email_provider_events",
    };
    distributions[distribution] = tableSet.has(requiredTable[distribution])
      ? await session.getDistribution(distribution)
      : {};
  }

  const indexSet = new Set(indexes);
  const constraintSet = new Set(constraints);
  return {
    schema: {
      tables: tableStatus,
      missingColumns,
      missingIndexes: CRITICAL_INDEXES.filter((name) => !indexSet.has(name)),
      missingConstraints: CRITICAL_CONSTRAINTS.filter(
        (name) => !constraintSet.has(name),
      ),
    },
    rowCounts,
    distributions,
  };
}
