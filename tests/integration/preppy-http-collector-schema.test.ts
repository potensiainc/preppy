import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
}
assertDedicatedTestDatabaseUrl(databaseUrl);

const sql = postgres(databaseUrl, { max: 1 });

describe("PREPPY HTTP collector schema", () => {
  beforeAll(async () => {
    await sql`select pg_advisory_lock(hashtext('preppy-http-collector-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterAll(async () => {
    await sql`select pg_advisory_unlock(hashtext('preppy-http-collector-schema-tests'))`;
    await sql.end({ timeout: 5 });
  });

  it("adds only nullable bytea root evidence and bounded observation metadata columns", async () => {
    const rows = await sql<
      {
        table_name: string;
        column_name: string;
        data_type: string;
        is_nullable: string;
      }[]
    >`
      select table_name, column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and (table_name, column_name) in (
          ('source_snapshots', 'raw_body'),
          ('source_observations', 'metadata')
        )
      order by table_name, column_name
    `;

    expect(rows).toEqual([
      {
        table_name: "source_observations",
        column_name: "metadata",
        data_type: "jsonb",
        is_nullable: "YES",
      },
      {
        table_name: "source_snapshots",
        column_name: "raw_body",
        data_type: "bytea",
        is_nullable: "YES",
      },
    ]);
  });

  it("retains the existing Snapshot uniqueness, provenance, and Observation checks", async () => {
    const constraints = await sql<{ constraint_name: string }[]>`
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name in ('source_snapshots', 'source_observations')
        and constraint_name in (
          'source_snapshots_source_id_sources_id_fk',
          'source_observations_source_id_sources_id_fk',
          'source_observations_snapshot_id_source_snapshots_id_fk',
          'source_observations_outcome_check',
          'source_observations_http_status_check',
          'source_observations_response_bytes_check',
          'source_observations_duration_ms_check'
        )
      order by constraint_name
    `;

    expect(constraints.map((row) => row.constraint_name)).toEqual([
      "source_observations_duration_ms_check",
      "source_observations_http_status_check",
      "source_observations_outcome_check",
      "source_observations_response_bytes_check",
      "source_observations_snapshot_id_source_snapshots_id_fk",
      "source_observations_source_id_sources_id_fk",
      "source_snapshots_source_id_sources_id_fk",
    ]);

    const [snapshotIndex] = await sql<{ indexdef: string }[]>`
      select indexdef
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'source_snapshots'
        and indexname = 'source_snapshots_source_content_hash_unique'
    `;
    expect(snapshotIndex?.indexdef).toContain(
      "UNIQUE INDEX source_snapshots_source_content_hash_unique",
    );
    expect(snapshotIndex?.indexdef).toContain("(source_id, content_hash)");
  });
});
