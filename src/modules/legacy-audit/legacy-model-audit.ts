import type postgres from "postgres";

// Tables that only the pre-PREPPY admission model writes or that bridge it to
// the canonical Institution/Opportunity model. Fixed identifiers only.
export const LEGACY_MODEL_TABLES = [
  "schools",
  "school_aliases",
  "admission_cycles",
  "admission_events",
  "admission_event_versions",
  "admission_facts",
  "admission_fact_versions",
  "expected_windows",
  "meaningful_changes",
  "event_version_evidence",
  "fact_version_evidence",
  "source_bindings",
  "detected_changes",
  "updates",
  "update_changes",
  "guides",
  "subscribers",
  "subscriptions",
  "subscription_action_tokens",
  "alerts",
  "alert_deliveries",
  "institution_school_links",
  "opportunity_admission_event_links",
] as const;

export type LegacyModelAudit = Readonly<{
  readOnly: true;
  opportunitiesByTruthMode: ReadonlyArray<{
    truthMode: string;
    publicationState: string;
    count: number;
  }>;
  tables: ReadonlyArray<{
    table: string;
    rows: number;
    writesLast90Days: number | null;
    latestWrite: string | null;
  }>;
}>;

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

// Counts only: no row values leave the database. The whole audit runs in a
// single read-only repeatable-read transaction and refuses otherwise.
export async function auditLegacyModel(
  sql: ReturnType<typeof postgres>,
  now: Date = new Date(),
): Promise<LegacyModelAudit> {
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const [mode] = await tx<{ readOnly: string }[]>`
      select current_setting('transaction_read_only') as "readOnly"`;
    if (mode?.readOnly !== "on") throw new Error("LEGACY_AUDIT_NOT_READ_ONLY");
    const opportunitiesByTruthMode = await tx<
      { truthMode: string; publicationState: string; count: number }[]
    >`
      select truth_mode as "truthMode", publication_state as "publicationState",
        count(*)::int as count
      from opportunities group by 1, 2 order by 1, 2`;
    const since = new Date(now.getTime() - 90 * 86_400_000).toISOString();
    const tables = [];
    for (const table of LEGACY_MODEL_TABLES) {
      const [shape] = await tx<
        { present: boolean; hasCreatedAt: boolean; hasUpdatedAt: boolean }[]
      >`
        select to_regclass(${`public.${table}`}) is not null as present,
          exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = ${table}
              and column_name = 'created_at') as "hasCreatedAt",
          exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = ${table}
              and column_name = 'updated_at') as "hasUpdatedAt"`;
      if (!shape?.present) continue;
      // An update is a write too: use the later of creation and update.
      const writtenAt = shape.hasUpdatedAt
        ? "greatest(created_at, updated_at)"
        : "created_at";
      const [stats] = shape.hasCreatedAt
        ? await tx.unsafe(
            `select count(*)::int as rows,
               count(*) filter (where ${writtenAt} >= $1::timestamptz)::int as recent,
               max(${writtenAt})::text as latest
             from public.${quote(table)}`,
            [since],
          )
        : await tx.unsafe(
            `select count(*)::int as rows, null::int as recent, null::text as latest
             from public.${quote(table)}`,
          );
      tables.push({
        table,
        rows: Number(stats!.rows),
        writesLast90Days: stats!.recent === null ? null : Number(stats!.recent),
        latestWrite: (stats!.latest as string | null) ?? null,
      });
    }
    return { readOnly: true as const, opportunitiesByTruthMode, tables };
  });
}
