import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { NotFoundError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  getInstitutionBySlug,
  getPublicInstitutionCardsByIds,
  listInstitutions,
} from "@/src/modules/public/institution-query.server";
import { getOpportunityBySlug } from "@/src/modules/public/opportunity-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
}
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `international-school-public-${randomUUID()}`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

type CaptureMode = "COMPLETE" | "NO_OBSERVATION" | "NO_SNAPSHOT";

async function createInstitution(input: {
  name: string;
  category?: "INTERNATIONAL_SCHOOL" | "ENGLISH_KINDERGARTEN";
  publicationState?: "DRAFT" | "PUBLISHED";
  operationalState?: "ACTIVE" | "INACTIVE" | "CLOSED" | "UNKNOWN";
  hasIsiIdentity?: boolean;
}) {
  const id = randomUUID();
  const slug = `${prefix}-${id}`;
  const category = input.category ?? "INTERNATIONAL_SCHOOL";
  const publicationState = input.publicationState ?? "PUBLISHED";
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, publication_state, operational_state,
      region_code, district, short_description, published_at
    ) values (
      ${id}, ${slug}, ${input.name}, ${category}, ${publicationState},
      ${input.operationalState ?? "ACTIVE"}, 'KR-11', '강남구',
      '검증 가능한 공개 조회 테스트 기관입니다.',
      ${publicationState === "PUBLISHED" ? "2026-09-15T00:00:00.000Z" : null}
    )
  `;
  if (category === "INTERNATIONAL_SCHOOL" && input.hasIsiIdentity !== false) {
    await runtime.client`
      insert into institution_registry_identities (
        institution_id, registry_name, registry_external_id,
        registry_record_url, registry_locator, metadata_json
      ) values (
        ${id}, 'ISI', ${`${prefix}:${id}`},
        ${`https://registry.example.test/${prefix}/${id}`},
        ${`fixture:${id}`}, '{}'::jsonb
      )
    `;
  }
  return { id, slug };
}

async function createEvidence(input: {
  authority?: "PRIMARY" | "DISCOVERY_ONLY";
  sourceType?: "OFFICIAL_SCHOOL_PAGE" | "THIRD_PARTY_DISCOVERY";
  captureMode: CaptureMode;
}) {
  const sourceId = randomUUID();
  const snapshotId = randomUUID();
  const url = `https://public-evidence.example.test/${prefix}/${sourceId}`;
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status, source_name
    ) values (
      ${sourceId}, ${url}, ${input.sourceType ?? "OFFICIAL_SCHOOL_PAGE"},
      ${input.authority ?? "PRIMARY"}, 'ACTIVE', 'Public evidence fixture'
    )
  `;
  let persistedSnapshotId: string | null = null;
  if (input.captureMode !== "NO_SNAPSHOT") {
    persistedSnapshotId = snapshotId;
    await runtime.client`
      insert into source_snapshots (
        id, source_id, captured_at, content_hash, normalized_text, mime_type
      ) values (
        ${snapshotId}, ${sourceId}, '2026-09-15T01:00:00.000Z',
        ${`hash-${snapshotId}`}, 'verified evidence', 'text/html'
      )
    `;
  }
  let observationId: string | null = null;
  if (input.captureMode !== "NO_OBSERVATION") {
    const [observation] = await runtime.client<{ id: string }[]>`
      insert into source_observations (
        source_id, observed_at, outcome, http_status, final_url, snapshot_id
      ) values (
        ${sourceId}, '2026-09-15T01:00:00.000Z', 'SUCCESS', 200, ${url},
        ${persistedSnapshotId}
      ) returning id::text
    `;
    observationId = observation!.id;
  }
  return { sourceId, snapshotId: persistedSnapshotId, observationId, url };
}

async function addFact(
  institutionId: string,
  factType: "TUITION" | "TARGET_AGE_GRADE" | "TRANSPORT" | "CURRICULUM",
  value: Record<string, unknown>,
  evidence: Awaited<ReturnType<typeof createEvidence>>,
) {
  const factId = randomUUID();
  const versionId = randomUUID();
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into institution_facts (id, institution_id, fact_type)
      values (${factId}, ${institutionId}, ${factType})
    `;
    await transaction`
      insert into institution_fact_versions (
        id, institution_fact_id, version_number, verification_state, is_current,
        value_json, display_text, verified_at
      ) values (
        ${versionId}, ${factId}, 1, 'VERIFIED', true, ${JSON.stringify(value)}::jsonb,
        ${`Verified ${factType}`}, '2026-09-15T02:00:00.000Z'
      )
    `;
    await transaction`
      insert into institution_fact_version_evidence (
        institution_fact_version_id, source_id, source_observation_id,
        source_snapshot_id, evidence_role
      ) values (
        ${versionId}, ${evidence.sourceId},
        ${evidence.observationId}::bigint, ${evidence.snapshotId}, 'PRIMARY'
      )
    `;
  });
}

async function addNativeOpportunity(
  institutionId: string,
  evidence: Awaited<ReturnType<typeof createEvidence>>,
  applicationCloseAt = "2026-10-01T00:00:00.000Z",
) {
  const id = randomUUID();
  const versionId = randomUUID();
  const slug = `${prefix}-opportunity-${id}`;
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state, published_at
      ) values (
        ${id}, ${institutionId}, ${slug}, 'APPLICATION', 'NATIVE', 'PUBLISHED',
        '2026-09-15T00:00:00.000Z'
      )
    `;
    await transaction`
      insert into opportunity_versions (
        id, opportunity_id, truth_mode, version_number, verification_state,
        business_state, is_current, title, summary, application_close_at,
        action_url, verified_at
      ) values (
        ${versionId}, ${id}, 'NATIVE', 1, 'VERIFIED', 'OPEN', true,
        ${`Admissions ${id}`}, 'Verified admissions summary.',
        ${applicationCloseAt}, 'https://apply.example.test',
        '2026-09-15T02:00:00.000Z'
      )
    `;
    await transaction`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, source_observation_id,
        source_snapshot_id, evidence_role
      ) values (
        ${versionId}, ${evidence.sourceId},
        ${evidence.observationId}::bigint, ${evidence.snapshotId}, 'PRIMARY'
      )
    `;
  });
  return { id, slug };
}

async function cleanup(): Promise<void> {
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select v.id from opportunity_versions v join opportunities o on o.id=v.opportunity_id where o.slug like ${`${prefix}%`})`;
    await transaction`delete from opportunity_versions where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`})`;
    await transaction`delete from opportunities where slug like ${`${prefix}%`}`;
    await transaction`delete from institution_fact_version_evidence where institution_fact_version_id in (select v.id from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id join institutions i on i.id=f.institution_id where i.slug like ${`${prefix}%`})`;
    await transaction`delete from institution_fact_versions where institution_fact_id in (select f.id from institution_facts f join institutions i on i.id=f.institution_id where i.slug like ${`${prefix}%`})`;
    await transaction`delete from institution_facts where institution_id in (select id from institutions where slug like ${`${prefix}%`})`;
    await transaction`delete from institution_registry_identities where registry_external_id like ${`${prefix}:%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}%`}`;
    await transaction`delete from source_observations where source_id in (select id from sources where canonical_url like ${`https://public-evidence.example.test/${prefix}/%`})`;
    await transaction`delete from source_snapshots where source_id in (select id from sources where canonical_url like ${`https://public-evidence.example.test/${prefix}/%`})`;
    await transaction`delete from sources where canonical_url like ${`https://public-evidence.example.test/${prefix}/%`}`;
  });
}

describe("international school public query guard", () => {
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

  it("publishes only active ISI-identified international schools without changing non-international visibility", async () => {
    const eligible = await createInstitution({ name: `${prefix} eligible` });
    const noIsi = await createInstitution({
      name: `${prefix} no isi`,
      hasIsiIdentity: false,
    });
    const unknown = await createInstitution({
      name: `${prefix} unknown`,
      operationalState: "UNKNOWN",
    });
    const inactive = await createInstitution({
      name: `${prefix} inactive`,
      operationalState: "INACTIVE",
    });
    const closed = await createInstitution({
      name: `${prefix} closed`,
      operationalState: "CLOSED",
    });
    const draft = await createInstitution({
      name: `${prefix} draft`,
      publicationState: "DRAFT",
    });
    const kindergarten = await createInstitution({
      name: `${prefix} kindergarten`,
      category: "ENGLISH_KINDERGARTEN",
      operationalState: "UNKNOWN",
      hasIsiIdentity: false,
    });

    const international = await listInstitutions(runtime.executor, {
      category: "INTERNATIONAL_SCHOOL",
      query: prefix,
      page: 1,
      pageSize: 50,
    });
    expect(international.items.map((item) => item.id)).toEqual([eligible.id]);
    const all = await listInstitutions(runtime.executor, {
      query: prefix,
      page: 1,
      pageSize: 50,
    });
    expect(all.items.map((item) => item.id)).toContain(kindergarten.id);
    for (const target of [noIsi, unknown, inactive, closed, draft]) {
      await expect(
        getInstitutionBySlug(runtime.executor, target.slug),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it("requires complete official captures for facts and English-kindergarten comparison filters", async () => {
    const rejected = await createInstitution({
      name: `${prefix} rejected facts`,
      category: "ENGLISH_KINDERGARTEN",
      hasIsiIdentity: false,
    });
    await addFact(
      rejected.id,
      "TUITION",
      { billingCadence: "MONTHLY", academicYearLabel: "2027", amountMin: 1 },
      await createEvidence({ captureMode: "NO_OBSERVATION" }),
    );
    await addFact(
      rejected.id,
      "TARGET_AGE_GRADE",
      { minAge: 4, maxAge: 7 },
      await createEvidence({ captureMode: "NO_SNAPSHOT" }),
    );
    await addFact(
      rejected.id,
      "TRANSPORT",
      { isAvailable: true },
      await createEvidence({
        captureMode: "COMPLETE",
        sourceType: "THIRD_PARTY_DISCOVERY",
        authority: "DISCOVERY_ONLY",
      }),
    );

    const accepted = await createInstitution({
      name: `${prefix} accepted facts`,
      category: "ENGLISH_KINDERGARTEN",
      hasIsiIdentity: false,
    });
    for (const [factType, value] of [
      ["TUITION", { billingCadence: "MONTHLY", academicYearLabel: "2027", amountMin: 2 }],
      ["TARGET_AGE_GRADE", { minAge: 4, maxAge: 7 }],
      ["TRANSPORT", { isAvailable: true }],
    ] as const) {
      await addFact(
        accepted.id,
        factType,
        value,
        await createEvidence({ captureMode: "COMPLETE" }),
      );
    }

    const rejectedDetail = await getInstitutionBySlug(
      runtime.executor,
      rejected.slug,
    );
    expect(rejectedDetail.verifiedFacts).toEqual([]);
    for (const filter of [
      { hasConfirmedTuition: true },
      { minAge: 5 },
      { transport: "AVAILABLE" as const },
    ]) {
      const result = await listInstitutions(runtime.executor, {
        category: "ENGLISH_KINDERGARTEN",
        query: prefix,
        ...filter,
        page: 1,
        pageSize: 50,
      });
      expect(result.items.map((item) => item.id)).toEqual([accepted.id]);
    }
  });

  it("requires complete official captures before a native opportunity is public", async () => {
    const institution = await createInstitution({ name: `${prefix} admissions` });
    const noObservation = await addNativeOpportunity(
      institution.id,
      await createEvidence({ captureMode: "NO_OBSERVATION" }),
      "2026-09-20T00:00:00.000Z",
    );
    const noSnapshot = await addNativeOpportunity(
      institution.id,
      await createEvidence({ captureMode: "NO_SNAPSHOT" }),
      "2026-09-21T00:00:00.000Z",
    );
    const accepted = await addNativeOpportunity(
      institution.id,
      await createEvidence({ captureMode: "COMPLETE" }),
    );

    const detail = await getInstitutionBySlug(runtime.executor, institution.slug);
    expect(detail.currentOpportunities.map((item) => item.id)).toEqual([
      accepted.id,
    ]);
    const [card] = await getPublicInstitutionCardsByIds(runtime.executor, [
      institution.id,
    ]);
    expect(card?.currentOpportunity?.id).toBe(accepted.id);
    for (const target of [noObservation, noSnapshot]) {
      await expect(
        getOpportunityBySlug(runtime.executor, target.slug),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(
      getOpportunityBySlug(runtime.executor, accepted.slug),
    ).resolves.toEqual(expect.objectContaining({ id: accepted.id }));
  });
});
