import { randomUUID } from "node:crypto";

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

async function insertInstitution(): Promise<string> {
  const institutionId = randomUUID();
  await sql`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${institutionId}, ${`english-kindergarten-${institutionId}`},
      '테스트 영어유치원', 'ENGLISH_KINDERGARTEN', 'ACTIVE', 'DRAFT'
    )
  `;
  return institutionId;
}

async function insertSource(): Promise<string> {
  const sourceId = randomUUID();
  await sql`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${sourceId}, ${`https://example.com/${sourceId}`},
      'OFFICIAL_SCHOOL_PAGE', 'PRIMARY', 'ACTIVE', '테스트 공식 페이지'
    )
  `;
  return sourceId;
}

async function insertSnapshot(sourceId: string): Promise<string> {
  const snapshotId = randomUUID();
  await sql`
    insert into source_snapshots (
      id, source_id, captured_at, content_hash
    ) values (
      ${snapshotId}, ${sourceId}, now(), ${`sha256:${snapshotId}`}
    )
  `;
  return snapshotId;
}

describe("English-kindergarten profile schema", () => {
  beforeAll(async () => {
    await sql`select pg_advisory_lock(hashtext('english-kindergarten-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterAll(async () => {
    await sql`select pg_advisory_unlock(hashtext('english-kindergarten-schema-tests'))`;
    await sql.end({ timeout: 5 });
  });

  it("allows one current coverage state per institution and section", async () => {
    const institutionId = await insertInstitution();
    await sql`
      insert into institution_section_coverages (
        institution_id, section, status, last_checked_at
      ) values (
        ${institutionId}, 'TUITION', 'NOT_RESEARCHED', now()
      )
    `;

    await expect(sql`
      insert into institution_section_coverages (
        institution_id, section, status, last_checked_at
      ) values (
        ${institutionId}, 'TUITION', 'NEEDS_REVIEW', now()
      )
    `).rejects.toThrow();
  });

  it("rejects a coverage snapshot that belongs to a different source", async () => {
    const validInstitutionId = await insertInstitution();
    const invalidInstitutionId = await insertInstitution();
    const sourceId = await insertSource();
    const otherSourceId = await insertSource();
    const snapshotId = await insertSnapshot(sourceId);

    await expect(sql`
      insert into institution_section_coverages (
        institution_id, section, status, source_id, source_snapshot_id,
        last_checked_at
      ) values (
        ${validInstitutionId}, 'CURRICULUM', 'CONFIRMED', ${sourceId},
        ${snapshotId}, now()
      )
    `).resolves.toBeDefined();

    await expect(sql`
      insert into institution_section_coverages (
        institution_id, section, status, source_id, source_snapshot_id,
        last_checked_at
      ) values (
        ${invalidInstitutionId}, 'CURRICULUM', 'CONFIRMED', ${otherSourceId},
        ${snapshotId}, now()
      )
    `).rejects.toThrow();
  });

  it("requires current review insight versions to be verified", async () => {
    const institutionId = await insertInstitution();
    const insightId = randomUUID();
    await sql`
      insert into institution_review_insights (id, institution_id)
      values (${insightId}, ${institutionId})
    `;

    await expect(sql`
      insert into institution_review_insight_versions (
        id, institution_review_insight_id, version_number,
        verification_state, is_current, sample_size, themes
      ) values (
        ${randomUUID()}, ${insightId}, 1, 'UNVERIFIED', true, 1,
        ${sql.json([{ summary: "놀이 활동 언급이 있어요.", mentionCount: 1 }])}
      )
    `).rejects.toThrow();
  });

  it("requires a strictly positive review sample size", async () => {
    const institutionId = await insertInstitution();
    const insightId = randomUUID();
    await sql`
      insert into institution_review_insights (id, institution_id)
      values (${insightId}, ${institutionId})
    `;

    await expect(sql`
      insert into institution_review_insight_versions (
        id, institution_review_insight_id, version_number,
        verification_state, is_current, sample_size, themes
      ) values (
        ${randomUUID()}, ${insightId}, 1, 'UNVERIFIED', false, 0,
        ${sql.json([{ summary: "교사 소통 언급이 있어요." }])}
      )
    `).rejects.toThrow();
  });

  it("binds review evidence snapshots to their actual source", async () => {
    const institutionId = await insertInstitution();
    const insightId = randomUUID();
    const versionId = randomUUID();
    const sourceId = await insertSource();
    const otherSourceId = await insertSource();
    const snapshotId = await insertSnapshot(sourceId);
    await sql`
      insert into institution_review_insights (id, institution_id)
      values (${insightId}, ${institutionId})
    `;
    await sql`
      insert into institution_review_insight_versions (
        id, institution_review_insight_id, version_number,
        verification_state, is_current, sample_size, themes
      ) values (
        ${versionId}, ${insightId}, 1, 'UNVERIFIED', false, 1,
        ${sql.json([{ summary: "교사 소통 언급이 있어요." }])}
      )
    `;

    await expect(sql`
      insert into institution_review_insight_version_evidence (
        id, institution_review_insight_version_id, source_id,
        source_snapshot_id, evidence_role
      ) values (
        ${randomUUID()}, ${versionId}, ${otherSourceId}, ${snapshotId},
        'REVIEW_THEME_SUPPORT'
      )
    `).rejects.toThrow();
  });

  it("accepts MEALS and rejects unknown institution fact types", async () => {
    const institutionId = await insertInstitution();
    await expect(sql`
      insert into institution_facts (id, institution_id, fact_type)
      values (${randomUUID()}, ${institutionId}, 'MEALS')
    `).resolves.toBeDefined();

    await expect(sql`
      insert into institution_facts (id, institution_id, fact_type)
      values (${randomUUID()}, ${institutionId}, 'RANKING')
    `).rejects.toThrow();
  });
});
