import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);
const sql = postgres(databaseUrl, { max: 1 });

async function insertInstitution(): Promise<string> {
  const id = randomUUID();
  await sql`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${id}, ${`preppy-schema-${id}`}, 'PREPPY Schema School',
      'PRIVATE_ELEMENTARY', 'ACTIVE', 'DRAFT'
    )
  `;
  return id;
}

describe("PREPPY seed registry schema", () => {
  beforeAll(async () => {
    await sql`select pg_advisory_lock(hashtext('preppy-seed-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(async () => {
    await sql`
      truncate table institution_registry_identities,
        institution_source_bindings, sources, institutions cascade
    `;
  });

  afterAll(async () => {
    await sql`select pg_advisory_unlock(hashtext('preppy-seed-schema-tests'))`;
    await sql.end({ timeout: 5 });
  });

  it("enforces the resolved registry identity key", async () => {
    const institutionId = await insertInstitution();
    const externalId = randomUUID();
    await sql`
      insert into institution_registry_identities (
        institution_id, registry_name, registry_external_id,
        registry_record_url, registry_locator, metadata_json
      ) values (
        ${institutionId}, 'SCHOOLINFO', ${externalId},
        'https://www.schoolinfo.go.kr/', 'official locator', '{}'::jsonb
      )
    `;

    await expect(
      sql`
        insert into institution_registry_identities (
          institution_id, registry_name, registry_external_id,
          registry_record_url, registry_locator, metadata_json
        ) values (
          ${institutionId}, 'SCHOOLINFO', ${externalId},
          'https://www.schoolinfo.go.kr/', 'duplicate locator', '{}'::jsonb
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });

    await expect(
      sql`
        insert into institution_registry_identities (
          institution_id, registry_name, registry_external_id,
          registry_record_url, registry_locator, metadata_json
        ) values (
          ${institutionId}, 'UNSUPPORTED', ${randomUUID()},
          'https://example.com/', 'invalid registry', '{}'::jsonb
        )
      `,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("restricts registry identities to an existing Institution", async () => {
    await expect(
      sql`
        insert into institution_registry_identities (
          institution_id, registry_name, registry_external_id,
          registry_record_url, registry_locator, metadata_json
        ) values (
          ${randomUUID()}, 'ISI', 'ST01:test',
          'https://example.com/', 'missing institution', '{}'::jsonb
        )
      `,
    ).rejects.toMatchObject({ code: "23503" });

    const institutionId = await insertInstitution();
    await sql`
      insert into institution_registry_identities (
        institution_id, registry_name, registry_external_id,
        registry_record_url, registry_locator, metadata_json
      ) values (
        ${institutionId}, 'ISI', 'ST01:test',
        'https://example.com/', 'official locator', '{}'::jsonb
      )
    `;

    await expect(
      sql`delete from institutions where id = ${institutionId}`,
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("accepts the minimal registry Source and binding vocabulary", async () => {
    const institutionId = await insertInstitution();
    const sourceId = randomUUID();
    await sql`
      insert into sources (
        id, canonical_url, source_type, authority_level,
        lifecycle_status, source_name
      ) values (
        ${sourceId}, 'https://www.schoolinfo.go.kr/', 'OFFICIAL_REGISTRY',
        'PRIMARY', 'ACTIVE', 'SchoolInfo registry'
      )
    `;
    await sql`
      insert into institution_source_bindings (
        institution_id, source_id, role, is_primary, is_active
      ) values (
        ${institutionId}, ${sourceId}, 'REGISTRY_IDENTITY', false, true
      )
    `;

    const [binding] = await sql<{ role: string; is_primary: boolean }[]>`
      select role, is_primary from institution_source_bindings
      where institution_id = ${institutionId} and source_id = ${sourceId}
    `;
    expect(binding).toEqual({
      role: "REGISTRY_IDENTITY",
      is_primary: false,
    });
  });
});
