import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { getAdminInstitution } from "@/src/modules/admin/read-model/institution-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `english-kindergarten-admin-${randomUUID()}`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

async function createInstitution(
  category: "ENGLISH_KINDERGARTEN" | "PRIVATE_ELEMENTARY",
) {
  const id = randomUUID();
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, publication_state, operational_state
    ) values (
      ${id}, ${`${prefix}-${id}`}, ${`${prefix} 기관`}, ${category}, 'DRAFT', 'ACTIVE'
    )
  `;
  return id;
}

async function createEvidenceSource() {
  const sourceId = randomUUID();
  const snapshotId = randomUUID();
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status, source_name
    ) values (
      ${sourceId}, ${`https://admin-read.example.test/${sourceId}`},
      'OFFICIAL_SCHOOL_PAGE', 'PRIMARY', 'ACTIVE', '기관 공식 페이지'
    )
  `;
  await runtime.client`
    insert into source_snapshots (id, source_id, captured_at, content_hash)
    values (
      ${snapshotId}, ${sourceId}, '2026-09-03T01:02:03.000Z',
      ${`sha256:${snapshotId}`}
    )
  `;
  return { sourceId, snapshotId };
}

async function addEnglishKindergartenAdminData(institutionId: string) {
  const { sourceId, snapshotId } = await createEvidenceSource();
  const sections = [
    ["TUITION", "CONFIRMED"],
    ["INFORMATION_SESSION", "CHECKED_NOT_FOUND"],
    ["TARGET_AGE_GRADE", "CONFIRMED"],
    ["CURRICULUM", "NEEDS_REVIEW"],
    ["TRANSPORT", "ACCESS_FAILED"],
    ["MEALS", "NOT_RESEARCHED"],
    ["REVIEWS", "CONFIRMED"],
    ["OPERATING_INFO", "NOT_RESEARCHED"],
  ] as const;
  for (const [section, status] of sections) {
    await runtime.client`
      insert into institution_section_coverages (
        institution_id, section, status, source_id, source_snapshot_id,
        academic_year_label, public_note, internal_note, last_collected_at,
        last_checked_at
      ) values (
        ${institutionId}, ${section}, ${status}, ${sourceId}, ${snapshotId},
        '2026학년도', null, ${`${section} 운영자 메모`},
        '2026-09-03T01:02:03.000Z', '2026-09-04T04:05:06.000Z'
      )
    `;
  }

  const insightId = randomUUID();
  const versionId = randomUUID();
  await runtime.client`
    insert into institution_review_insights (id, institution_id)
    values (${insightId}, ${institutionId})
  `;
  await runtime.client`
    insert into institution_review_insight_versions (
      id, institution_review_insight_id, version_number, verification_state,
      is_current, period_start, period_end, sample_size, themes, limitations,
      verified_at
    ) values (
      ${versionId}, ${insightId}, 1, 'VERIFIED', true, '2026-01-01',
      '2026-08-31', 12,
      ${JSON.stringify([{ summary: "놀이 언급", mentionCount: 5 }])}::jsonb,
      '공개 후기만 검토', '2026-09-05T06:07:08.000Z'
    )
  `;
  await runtime.client`
    insert into institution_review_insight_version_evidence (
      institution_review_insight_version_id, source_id, source_snapshot_id,
      evidence_role
    ) values (${versionId}, ${sourceId}, ${snapshotId}, 'THEME_SUPPORT')
  `;
  return { sourceId, snapshotId, versionId };
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    await transaction`delete from institution_review_insight_version_evidence where institution_review_insight_version_id in (select v.id from institution_review_insight_versions v join institution_review_insights r on r.id = v.institution_review_insight_id join institutions i on i.id = r.institution_id where i.slug like ${`${prefix}%`})`;
    await transaction`delete from institution_review_insight_versions where institution_review_insight_id in (select r.id from institution_review_insights r join institutions i on i.id = r.institution_id where i.slug like ${`${prefix}%`})`;
    await transaction`delete from institution_review_insights where institution_id in (select id from institutions where slug like ${`${prefix}%`})`;
    await transaction`delete from institution_section_coverages where institution_id in (select id from institutions where slug like ${`${prefix}%`})`;
    await transaction`delete from source_snapshots where source_id in (select id from sources where canonical_url like 'https://admin-read.example.test/%')`;
    await transaction`delete from sources where canonical_url like 'https://admin-read.example.test/%'`;
    await transaction`delete from institutions where slug like ${`${prefix}%`}`;
  });
}

describe("English-kindergarten Admin read model", () => {
  beforeAll(async () => {
    await schemaLockSql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });
  afterEach(cleanup);
  afterAll(async () => {
    await schemaLockSql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await schemaLockSql.end({ timeout: 5 });
    await closeRuntimeDatabase();
  });

  it("returns eight coverage rows, provenance, dates, internal notes, and review verification", async () => {
    const institutionId = await createInstitution("ENGLISH_KINDERGARTEN");
    const references = await addEnglishKindergartenAdminData(institutionId);

    const detail = await getAdminInstitution(runtime.executor, {
      id: institutionId,
    });

    expect(detail.englishKindergarten?.coverages).toHaveLength(8);
    expect(detail.englishKindergarten?.coverages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "TRANSPORT",
          status: "ACCESS_FAILED",
          sourceId: references.sourceId,
          sourceSnapshotId: references.snapshotId,
          internalNote: "TRANSPORT 운영자 메모",
          lastCollectedAt: "2026-09-03T01:02:03.000Z",
          lastCheckedAt: "2026-09-04T04:05:06.000Z",
        }),
      ]),
    );
    expect(detail.englishKindergarten?.reviewInsight).toMatchObject({
      versionId: references.versionId,
      verificationState: "VERIFIED",
      sampleSize: 12,
      evidence: [
        expect.objectContaining({
          sourceId: references.sourceId,
          sourceSnapshotId: references.snapshotId,
          evidenceRole: "THEME_SUPPORT",
        }),
      ],
    });
  });

  it("does not attach English-kindergarten fields to a private elementary school", async () => {
    const institutionId = await createInstitution("PRIVATE_ELEMENTARY");
    const detail = await getAdminInstitution(runtime.executor, {
      id: institutionId,
    });
    expect(detail.englishKindergarten).toBeNull();
  });
});
