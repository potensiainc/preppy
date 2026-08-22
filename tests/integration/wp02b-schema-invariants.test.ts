import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import { opportunityIdForAdmissionEvent } from "@/src/infrastructure/db/opportunity-backfill.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const sql = postgres(databaseUrl, { max: 4 });
type QueryExecutor = postgres.Sql | postgres.TransactionSql;
const prefix = "wp-02b-";

async function institution(
  category = "ENGLISH_KINDERGARTEN",
  executor: QueryExecutor = sql,
) {
  const id = randomUUID();
  await executor`insert into institutions(id,slug,display_name,category) values
    (${id},${`${prefix}${id}`},'WP-02B Institution',${category})`;
  return id;
}

async function opportunity(institutionId: string, truthMode = "NATIVE") {
  const id = randomUUID();
  await sql`insert into opportunities(id,institution_id,slug,kind,truth_mode)
    values (${id},${institutionId},${`${prefix}${id}`},'APPLICATION',${truthMode})`;
  return id;
}

async function version(
  opportunityId: string,
  input: {
    id?: string;
    number?: number;
    supersedes?: string | null;
    verification?: string;
    current?: boolean;
    verifiedAt?: Date | null;
  } = {},
) {
  const id = input.id ?? randomUUID();
  const verification = input.verification ?? "VERIFIED";
  const verifiedAt =
    input.verifiedAt === undefined
      ? verification === "VERIFIED"
        ? new Date("2026-08-22T00:00:00Z")
        : null
      : input.verifiedAt;
  await sql`insert into opportunity_versions(
      id,opportunity_id,truth_mode,version_number,supersedes_version_id,
      verification_state,business_state,is_current,title,verified_at
    ) values (
      ${id},${opportunityId},'NATIVE',${input.number ?? 1},
      ${input.supersedes ?? null},${verification},'UPCOMING',
      ${input.current ?? false},'WP-02B Version',${verifiedAt}
    )`;
  return id;
}

async function source(
  input: { sourceType?: string; authorityLevel?: string } = {},
) {
  const id = randomUUID();
  await sql`insert into sources(id,canonical_url,source_type,authority_level,lifecycle_status,source_name)
    values (${id},${`https://example.com/${prefix}${id}`},${input.sourceType ?? "OFFICIAL_SCHOOL_PAGE"},${input.authorityLevel ?? "PRIMARY"},'ACTIVE','WP-02B Source')`;
  return id;
}

async function observation(sourceId: string) {
  const [row] = await sql<
    { id: bigint }[]
  >`insert into source_observations(source_id,observed_at,outcome)
    values (${sourceId},now(),'SUCCESS') returning id`;
  return row.id;
}

async function snapshot(sourceId: string) {
  const id = randomUUID();
  await sql`insert into source_snapshots(id,source_id,captured_at,content_hash)
    values (${id},${sourceId},now(),${`${prefix}${id}`})`;
  return id;
}

async function evidence(
  opportunityVersionId: string,
  sourceId: string,
  sourceObservationId: bigint | null = null,
  sourceSnapshotId: string | null = null,
) {
  await sql`insert into opportunity_version_evidence(
      opportunity_version_id,source_id,source_observation_id,source_snapshot_id,evidence_role
    ) values (${opportunityVersionId},${sourceId},${sourceObservationId?.toString() ?? null},${sourceSnapshotId},'PRIMARY')`;
}

async function fact(institutionId: string, factType = "TUITION") {
  const id = randomUUID();
  await sql`insert into institution_facts(id,institution_id,fact_type)
    values (${id},${institutionId},${factType})`;
  return id;
}

async function factVersion(
  factId: string,
  input: {
    id?: string;
    number?: number;
    supersedes?: string | null;
    verification?: string;
    current?: boolean;
  } = {},
) {
  const id = input.id ?? randomUUID();
  const state = input.verification ?? "VERIFIED";
  await sql`insert into institution_fact_versions(
      id,institution_fact_id,version_number,supersedes_version_id,
      verification_state,is_current,value_json,verified_at
    ) values (
      ${id},${factId},${input.number ?? 1},${input.supersedes ?? null},
      ${state},${input.current ?? false},${sql.json({ amount: 1 })},
      ${state === "VERIFIED" ? new Date("2026-08-22T00:00:00Z") : null}
    )`;
  return id;
}

async function legacyAggregate(executor: QueryExecutor = sql) {
  const schoolId = randomUUID();
  const cycleId = randomUUID();
  const eventId = randomUUID();
  const institutionId = await institution("PRIVATE_ELEMENTARY", executor);
  const opportunityId = opportunityIdForAdmissionEvent(eventId);
  const changeId = randomUUID();
  await executor`insert into schools(id,slug,canonical_name,school_type,lifecycle_status,country_code,is_public)
    values (${schoolId},${`${prefix}school-${schoolId}`},'WP-02B School','PRIVATE_ELEMENTARY','ACTIVE','KR',false)`;
  await executor`insert into admission_cycles(id,school_id,academic_year,lifecycle_status,admission_mode,is_public_focus,internal_notes)
    values (${cycleId},${schoolId},2099,'PLANNED','UNKNOWN',false,${`${prefix}fixture`})`;
  await executor`insert into admission_events(id,admission_cycle_id,event_key,event_type,canonical_title,importance,actionability,is_public)
    values (${eventId},${cycleId},${`${prefix}event-${eventId}`},'APPLICATION','WP-02B Event','NORMAL','ACTION_REQUIRED',false)`;
  await executor`insert into institution_school_links(institution_id,school_id,link_reason)
    values (${institutionId},${schoolId},${`${prefix}fixture`})`;
  await executor`insert into opportunities(id,institution_id,slug,kind,truth_mode)
    values (${opportunityId},${institutionId},${`${prefix}${institutionId}-${prefix}event-${eventId}`},'APPLICATION','LEGACY_BACKED')`;
  await executor`insert into opportunity_admission_event_links(opportunity_id,institution_id,truth_mode,admission_event_id,admission_cycle_id,school_id)
    values (${opportunityId},${institutionId},'LEGACY_BACKED',${eventId},${cycleId},${schoolId})`;
  await executor`insert into meaningful_changes(id,admission_cycle_id,admission_event_id,change_type,significance,review_status,public_summary,published_at)
    values (${changeId},${cycleId},${eventId},'NEW_EVENT','NORMAL','PUBLISHED',${`${prefix}legacy`},'2026-01-02T00:00:00Z')`;
  return { opportunityId, eventId, changeId };
}

describe("WP-02B canonical truth/history schema invariants", () => {
  beforeAll(async () => {
    await sql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });
  afterAll(async () => {
    await sql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await sql.end({ timeout: 5 });
  });

  it("allows versions only for NATIVE Opportunities", async () => {
    const institutionId = await institution();
    const nativeId = await opportunity(institutionId);
    const legacyId = await opportunity(institutionId, "LEGACY_BACKED");
    await expect(version(nativeId)).resolves.toBeTypeOf("string");
    await expect(version(legacyId)).rejects.toMatchObject({ code: "23503" });
  });

  it("enforces version number, current and verification integrity", async () => {
    const opportunityId = await opportunity(await institution());
    await version(opportunityId, { number: 1, current: true });
    await expect(version(opportunityId, { number: 1 })).rejects.toMatchObject({
      code: "23505",
    });
    await expect(
      version(opportunityId, { number: 2, current: true }),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      version(opportunityId, {
        number: 3,
        verification: "UNVERIFIED",
        current: true,
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      version(opportunityId, {
        number: 4,
        verification: "SUPERSEDED",
        current: true,
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      version(opportunityId, { number: 5, current: false, verifiedAt: null }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces dedicated OpportunityVersion lineage", async () => {
    const firstOpportunity = await opportunity(await institution());
    const secondOpportunity = await opportunity(await institution());
    const predecessor = await version(firstOpportunity, { number: 1 });
    await expect(
      version(secondOpportunity, { number: 2, supersedes: predecessor }),
    ).rejects.toMatchObject({ code: "23503" });
    const self = randomUUID();
    await expect(
      version(firstOpportunity, { id: self, number: 2, supersedes: self }),
    ).rejects.toMatchObject({ code: "23514" });
    await version(firstOpportunity, { number: 2, supersedes: predecessor });
    await expect(
      version(firstOpportunity, { number: 3, supersedes: predecessor }),
    ).rejects.toMatchObject({ code: "23505" });
    const high = await version(firstOpportunity, { number: 10 });
    await expect(
      version(firstOpportunity, { number: 9, supersedes: high }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps verified OpportunityVersion payload and lineage immutable", async () => {
    const opportunityId = await opportunity(await institution());
    const versionId = await version(opportunityId);
    await expect(
      sql`update opportunity_versions set title='mutated' where id=${versionId}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`update opportunity_versions set version_number=99 where id=${versionId}`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("blocks a VERIFIED OpportunityVersion downgrade-and-rewrite bypass", async () => {
    const opportunityId = await opportunity(await institution());
    const versionId = await version(opportunityId, { current: true });

    await expect(
      sql.begin(async (tx) => {
        await tx`update opportunity_versions
          set verification_state='UNVERIFIED', is_current=false
          where id=${versionId}`;
        await tx`update opportunity_versions set title='rewritten' where id=${versionId}`;
      }),
    ).rejects.toMatchObject({ code: "23514" });

    const [row] = await sql<
      { verification_state: string; is_current: boolean; title: string }[]
    >`select verification_state,is_current,title from opportunity_versions where id=${versionId}`;
    expect(row).toEqual({
      verification_state: "VERIFIED",
      is_current: true,
      title: "WP-02B Version",
    });
  });

  it("enforces Evidence source ownership while permitting manual source-only Evidence", async () => {
    const opportunityId = await opportunity(await institution());
    const versionId = await version(opportunityId);
    const sourceA = await source();
    const sourceB = await source();
    await expect(evidence(versionId, sourceA)).resolves.toBeUndefined();
    const observationA = await observation(sourceA);
    const snapshotA = await snapshot(sourceA);
    await expect(
      evidence(versionId, sourceA, observationA),
    ).resolves.toBeUndefined();
    await expect(
      evidence(versionId, sourceB, observationA),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      evidence(versionId, sourceA, null, snapshotA),
    ).resolves.toBeUndefined();
    await expect(
      evidence(versionId, sourceB, null, snapshotA),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(evidence(randomUUID(), sourceA)).rejects.toMatchObject({
      code: "23503",
    });
    await expect(evidence(versionId, randomUUID())).rejects.toMatchObject({
      code: "23503",
    });
  });

  it("defers and enforces NATIVE publication completeness", async () => {
    const institutionId = await institution();
    const noVersion = await opportunity(institutionId);
    await expect(
      sql.begin(
        (tx) =>
          tx`update opportunities set publication_state='PUBLISHED' where id=${noVersion}`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const unverified = await opportunity(institutionId);
    await version(unverified, { verification: "UNVERIFIED" });
    await expect(
      sql.begin(
        (tx) =>
          tx`update opportunities set publication_state='PUBLISHED' where id=${unverified}`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const noEvidence = await opportunity(institutionId);
    await version(noEvidence, { current: true });
    await expect(
      sql.begin(
        (tx) =>
          tx`update opportunities set publication_state='PUBLISHED' where id=${noEvidence}`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects Discovery-only Evidence for NATIVE publication", async () => {
    const opportunityId = await opportunity(await institution());
    const versionId = await version(opportunityId, { current: true });
    const sourceId = await source({
      sourceType: "THIRD_PARTY_DISCOVERY",
      authorityLevel: "DISCOVERY_ONLY",
    });
    await evidence(versionId, sourceId);

    await expect(
      sql.begin(
        (tx) => tx`update opportunities
        set publication_state='PUBLISHED' where id=${opportunityId}`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("revalidates official Source eligibility on downgrade", async () => {
    const opportunityId = await opportunity(await institution());
    const versionId = await version(opportunityId, { current: true });
    const sourceId = await source();
    await evidence(versionId, sourceId);
    await sql`update opportunities set publication_state='PUBLISHED' where id=${opportunityId}`;

    await expect(
      sql.begin(
        (tx) => tx`update sources
        set authority_level='DISCOVERY_ONLY' where id=${sourceId}`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("allows one official Source downgrade when another eligible Source remains", async () => {
    const opportunityId = await opportunity(await institution());
    const versionId = await version(opportunityId, { current: true });
    const firstSourceId = await source();
    const secondSourceId = await source({
      authorityLevel: "SECONDARY_OFFICIAL",
    });
    await evidence(versionId, firstSourceId);
    await evidence(versionId, secondSourceId);
    await sql`update opportunities set publication_state='PUBLISHED' where id=${opportunityId}`;

    await sql.begin(
      (tx) => tx`update sources
        set authority_level='DISCOVERY_ONLY' where id=${firstSourceId}`,
    );
  });

  it("allows atomic publish plus current VERIFIED version plus Evidence", async () => {
    const opportunityId = await opportunity(await institution());
    const sourceId = await source();
    await sql.begin(async (tx) => {
      const versionId = randomUUID();
      await tx`update opportunities set publication_state='PUBLISHED' where id=${opportunityId}`;
      await tx`insert into opportunity_versions(id,opportunity_id,truth_mode,version_number,verification_state,business_state,is_current,title,verified_at)
        values (${versionId},${opportunityId},'NATIVE',1,'VERIFIED','UPCOMING',true,'Atomic',now())`;
      await tx`insert into opportunity_version_evidence(opportunity_version_id,source_id,evidence_role)
        values (${versionId},${sourceId},'PRIMARY')`;
    });
  });

  it("rejects moving the only Evidence away from a published Native Opportunity", async () => {
    const institutionId = await institution();
    const publishedId = await opportunity(institutionId);
    const otherId = await opportunity(institutionId);
    const publishedVersionId = await version(publishedId, { current: true });
    const otherVersionId = await version(otherId);
    const sourceId = await source();
    await evidence(publishedVersionId, sourceId);
    await sql`update opportunities set publication_state='PUBLISHED' where id=${publishedId}`;

    await expect(
      sql.begin(
        (tx) => tx`update opportunity_version_evidence
        set opportunity_version_id=${otherVersionId}
        where opportunity_version_id=${publishedVersionId}`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces Native OpportunityChange parent and truth-mode consistency", async () => {
    const first = await opportunity(await institution());
    const second = await opportunity(await institution());
    const v1 = await version(first, { number: 1 });
    const v2 = await version(first, { number: 2, supersedes: v1 });
    const other = await version(second, { number: 1 });
    await sql`insert into opportunity_changes(id,opportunity_id,truth_mode,change_type,materiality,to_native_version_id,summary,verified_at,published_at,dedupe_key)
      values (${randomUUID()},${first},'NATIVE','NEW_OPPORTUNITY','NOTIFIABLE',${v1},'New',now(),now(),${`${prefix}${randomUUID()}`})`;
    await sql`insert into opportunity_changes(id,opportunity_id,truth_mode,change_type,materiality,from_native_version_id,to_native_version_id,summary,verified_at,published_at,dedupe_key)
      values (${randomUUID()},${first},'NATIVE','DATE_CHANGED','NOTIFIABLE',${v1},${v2},'Changed',now(),now(),${`${prefix}${randomUUID()}`})`;
    await expect(sql`insert into opportunity_changes(id,opportunity_id,truth_mode,change_type,materiality,from_native_version_id,to_native_version_id,summary,verified_at,published_at,dedupe_key)
      values (${randomUUID()},${first},'NATIVE','DATE_CHANGED','NOTIFIABLE',${v1},${other},'Bad',now(),now(),${`${prefix}${randomUUID()}`})`).rejects.toMatchObject(
      { code: "23503" },
    );
    await expect(sql`insert into opportunity_changes(id,opportunity_id,truth_mode,change_type,materiality,to_native_version_id,summary,verified_at,published_at,dedupe_key)
      values (${randomUUID()},${first},'LEGACY_BACKED','NEW_OPPORTUNITY','NOTIFIABLE',${v1},'Bad',now(),now(),${`${prefix}${randomUUID()}`})`).rejects.toMatchObject(
      { code: "23514" },
    );
  });

  it("enforces OpportunityChange dedupe and immutability", async () => {
    const opportunityId = await opportunity(await institution());
    const versionId = await version(opportunityId);
    const id = randomUUID();
    const key = `${prefix}${randomUUID()}`;
    await sql`insert into opportunity_changes(id,opportunity_id,truth_mode,change_type,materiality,to_native_version_id,summary,verified_at,published_at,dedupe_key)
      values (${id},${opportunityId},'NATIVE','NEW_OPPORTUNITY','NON_NOTIFIABLE',${versionId},'New',now(),now(),${key})`;
    await expect(sql`insert into opportunity_changes(id,opportunity_id,truth_mode,change_type,materiality,to_native_version_id,summary,verified_at,published_at,dedupe_key)
      values (${randomUUID()},${opportunityId},'NATIVE','NEW_OPPORTUNITY','NON_NOTIFIABLE',${versionId},'New',now(),now(),${key})`).rejects.toMatchObject(
      { code: "23505" },
    );
    await expect(
      sql`update opportunity_changes set summary='mutated' where id=${id}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`delete from opportunity_changes where id=${id}`,
    ).rejects.toMatchObject({ code: "23514" });
    const [{ count }] = await sql<
      { count: number }[]
    >`select count(*)::int as count
      from opportunity_changes where id=${id} and dedupe_key=${key}`;
    expect(count).toBe(1);
  });

  it("enforces legacy OpportunityChange parent, truth mode and unique normalization", async () => {
    const rollback = new Error("rollback append-only legacy fixtures");
    await expect(
      sql.begin(async (tx) => {
        const legacy = await legacyAggregate(tx);
        await tx`insert into opportunity_changes(
          id,opportunity_id,truth_mode,change_type,materiality,
          legacy_meaningful_change_id,legacy_admission_event_id,summary,
          detected_at,verified_at,published_at,dedupe_key
        ) values (
          ${randomUUID()},${legacy.opportunityId},'LEGACY_BACKED','NEW_OPPORTUNITY','NOTIFIABLE',
          ${legacy.changeId},${legacy.eventId},'Legacy','2026-01-01T00:00:00Z',
          '2026-01-02T00:00:00Z','2026-01-02T00:00:00Z',${`${prefix}${randomUUID()}`}
        )`;
        await expect(
          tx.savepoint(
            (sp) => sp`insert into opportunity_changes(
              id,opportunity_id,truth_mode,change_type,materiality,
              legacy_meaningful_change_id,legacy_admission_event_id,summary,
              verified_at,published_at,dedupe_key
            ) values (
              ${randomUUID()},${legacy.opportunityId},'LEGACY_BACKED','NEW_OPPORTUNITY','NOTIFIABLE',
              ${legacy.changeId},${legacy.eventId},'Duplicate',now(),now(),${`${prefix}${randomUUID()}`}
            )`,
          ),
        ).rejects.toMatchObject({ code: "23505" });

        const other = await legacyAggregate(tx);
        await expect(
          tx.savepoint(
            (sp) => sp`insert into opportunity_changes(
              id,opportunity_id,truth_mode,change_type,materiality,
              legacy_meaningful_change_id,legacy_admission_event_id,summary,
              verified_at,published_at,dedupe_key
            ) values (
              ${randomUUID()},${legacy.opportunityId},'LEGACY_BACKED','NEW_OPPORTUNITY','NOTIFIABLE',
              ${other.changeId},${other.eventId},'Wrong parent',now(),now(),${`${prefix}${randomUUID()}`}
            )`,
          ),
        ).rejects.toMatchObject({ code: "23503" });

        const nativeInstitutionId = await institution(
          "ENGLISH_KINDERGARTEN",
          tx,
        );
        const nativeId = randomUUID();
        await tx`insert into opportunities(id,institution_id,slug,kind,truth_mode)
          values (${nativeId},${nativeInstitutionId},${`${prefix}${nativeId}`},'APPLICATION','NATIVE')`;
        await expect(
          tx.savepoint(
            (sp) => sp`insert into opportunity_changes(
              id,opportunity_id,truth_mode,change_type,materiality,
              legacy_meaningful_change_id,legacy_admission_event_id,summary,
              verified_at,published_at,dedupe_key
            ) values (
              ${randomUUID()},${nativeId},'NATIVE','NEW_OPPORTUNITY','NOTIFIABLE',
              ${legacy.changeId},${legacy.eventId},'Wrong mode',now(),now(),${`${prefix}${randomUUID()}`}
            )`,
          ),
        ).rejects.toMatchObject({ code: "23514" });

        const nativeVersionId = randomUUID();
        await tx`insert into opportunity_versions(
          id,opportunity_id,truth_mode,version_number,verification_state,
          business_state,is_current,title,verified_at
        ) values (
          ${nativeVersionId},${nativeId},'NATIVE',1,'VERIFIED',
          'UPCOMING',false,'Native',now()
        )`;
        await expect(
          tx.savepoint(
            (sp) => sp`insert into opportunity_changes(
              id,opportunity_id,truth_mode,change_type,materiality,
              to_native_version_id,summary,verified_at,published_at,dedupe_key
            ) values (
              ${randomUUID()},${legacy.opportunityId},'LEGACY_BACKED','NEW_OPPORTUNITY','NOTIFIABLE',
              ${nativeVersionId},'Legacy with Native origin',now(),now(),${`${prefix}${randomUUID()}`}
            )`,
          ),
        ).rejects.toMatchObject({ code: "23514" });

        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("enforces InstitutionFact identity and supports native Institutions", async () => {
    const institutionId = await institution();
    await fact(institutionId, "TUITION");
    await expect(fact(institutionId, "TUITION")).rejects.toMatchObject({
      code: "23505",
    });
    await expect(fact(institutionId, "CURRICULUM")).resolves.toBeTypeOf(
      "string",
    );
  });

  it("enforces InstitutionFactVersion current, number and lineage invariants", async () => {
    const firstFact = await fact(await institution());
    const secondFact = await fact(await institution());
    const first = await factVersion(firstFact, { current: true });
    await expect(factVersion(firstFact, { number: 1 })).rejects.toMatchObject({
      code: "23505",
    });
    await expect(
      factVersion(firstFact, { number: 2, current: true }),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      factVersion(firstFact, {
        number: 3,
        verification: "UNVERIFIED",
        current: true,
      }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      factVersion(secondFact, { number: 2, supersedes: first }),
    ).rejects.toMatchObject({ code: "23503" });
    await factVersion(firstFact, { number: 2, supersedes: first });
    await expect(
      factVersion(firstFact, { number: 3, supersedes: first }),
    ).rejects.toMatchObject({ code: "23505" });
    const self = randomUUID();
    await expect(
      factVersion(firstFact, { id: self, number: 4, supersedes: self }),
    ).rejects.toMatchObject({ code: "23514" });
    const high = await factVersion(firstFact, { number: 10 });
    await expect(
      factVersion(firstFact, { number: 9, supersedes: high }),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`update institution_fact_versions set value_json='{"amount":2}'::jsonb where id=${first}`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("blocks a VERIFIED InstitutionFactVersion downgrade-and-rewrite bypass", async () => {
    const factId = await fact(await institution());
    const versionId = await factVersion(factId, { current: true });

    await expect(
      sql.begin(async (tx) => {
        await tx`update institution_fact_versions
          set verification_state='UNVERIFIED', is_current=false
          where id=${versionId}`;
        await tx`update institution_fact_versions
          set value_json='{"amount":999}'::jsonb where id=${versionId}`;
      }),
    ).rejects.toMatchObject({ code: "23514" });

    const [row] = await sql<
      { verification_state: string; is_current: boolean; amount: number }[]
    >`select verification_state,is_current,(value_json->>'amount')::int as amount
      from institution_fact_versions where id=${versionId}`;
    expect(row).toEqual({
      verification_state: "VERIFIED",
      is_current: true,
      amount: 1,
    });
  });

  it("allows a valid VERIFIED-to-SUPERSEDED current OpportunityVersion swap", async () => {
    const opportunityId = await opportunity(await institution());
    const firstVersionId = await version(opportunityId, { current: true });
    const sourceId = await source();
    await evidence(firstVersionId, sourceId);
    await sql`update opportunities set publication_state='PUBLISHED' where id=${opportunityId}`;
    const secondVersionId = randomUUID();

    await sql.begin(async (tx) => {
      await tx`update opportunity_versions
        set verification_state='SUPERSEDED', is_current=false
        where id=${firstVersionId}`;
      await tx`insert into opportunity_versions(
        id,opportunity_id,truth_mode,version_number,supersedes_version_id,
        verification_state,business_state,is_current,title,verified_at
      ) values (
        ${secondVersionId},${opportunityId},'NATIVE',2,${firstVersionId},
        'VERIFIED','OPEN',true,'Replacement',now()
      )`;
      await tx`insert into opportunity_version_evidence(
        opportunity_version_id,source_id,evidence_role
      ) values (${secondVersionId},${sourceId},'PRIMARY')`;
    });

    const rows = await sql<
      { id: string; verification_state: string; is_current: boolean }[]
    >`select id,verification_state,is_current from opportunity_versions
      where opportunity_id=${opportunityId} order by version_number`;
    expect(rows).toEqual([
      {
        id: firstVersionId,
        verification_state: "SUPERSEDED",
        is_current: false,
      },
      {
        id: secondVersionId,
        verification_state: "VERIFIED",
        is_current: true,
      },
    ]);
    await expect(
      sql`update opportunity_versions
        set verification_state='VERIFIED' where id=${firstVersionId}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`update opportunity_versions
        set is_current=true where id=${firstVersionId}`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("freezes SUPERSEDED InstitutionFactVersion state and history", async () => {
    const factId = await fact(await institution());
    const versionId = await factVersion(factId, { current: true });
    await sql`update institution_fact_versions
      set verification_state='SUPERSEDED', is_current=false
      where id=${versionId}`;

    await expect(
      sql`update institution_fact_versions
        set verification_state='VERIFIED' where id=${versionId}`,
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      sql`update institution_fact_versions
        set value_json='{"amount":500}'::jsonb where id=${versionId}`,
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces InstitutionFact Evidence source ownership and manual evidence", async () => {
    const factId = await fact(await institution());
    const versionId = await factVersion(factId);
    const sourceA = await source();
    const sourceB = await source();
    const observationA = await observation(sourceA);
    const snapshotA = await snapshot(sourceA);
    await sql`insert into institution_fact_version_evidence(institution_fact_version_id,source_id,evidence_role)
      values (${versionId},${sourceA},'WP-02B')`;
    await sql`insert into institution_fact_version_evidence(institution_fact_version_id,source_id,source_observation_id,evidence_role)
      values (${versionId},${sourceA},${observationA.toString()},'WP-02B')`;
    await sql`insert into institution_fact_version_evidence(institution_fact_version_id,source_id,source_snapshot_id,evidence_role)
      values (${versionId},${sourceA},${snapshotA},'WP-02B')`;
    await expect(sql`insert into institution_fact_version_evidence(institution_fact_version_id,source_id,source_observation_id,evidence_role)
      values (${versionId},${sourceB},${observationA.toString()},'WP-02B')`).rejects.toMatchObject(
      { code: "23503" },
    );
    await expect(sql`insert into institution_fact_version_evidence(institution_fact_version_id,source_id,source_snapshot_id,evidence_role)
      values (${versionId},${sourceB},${snapshotA},'WP-02B')`).rejects.toMatchObject(
      { code: "23503" },
    );
  });

  it("uses a deterministic concurrent current-version guard", async () => {
    const opportunityId = await opportunity(await institution());
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    try {
      await a`begin`;
      await b`begin`;
      await a`insert into opportunity_versions(id,opportunity_id,truth_mode,version_number,verification_state,business_state,is_current,title,verified_at)
        values (${randomUUID()},${opportunityId},'NATIVE',1,'VERIFIED','UPCOMING',true,'A',now())`;
      const blocked =
        b`insert into opportunity_versions(id,opportunity_id,truth_mode,version_number,verification_state,business_state,is_current,title,verified_at)
        values (${randomUUID()},${opportunityId},'NATIVE',2,'VERIFIED','UPCOMING',true,'B',now())`.catch(
          (error: unknown) => error,
        );
      await a`commit`;
      expect(await blocked).toMatchObject({ code: "23505" });
      await b`rollback`;
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("uses a deterministic concurrent version-number guard", async () => {
    const opportunityId = await opportunity(await institution());
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    try {
      await a`begin`;
      await b`begin`;
      await a`insert into opportunity_versions(id,opportunity_id,truth_mode,version_number,verification_state,business_state,is_current,title)
        values (${randomUUID()},${opportunityId},'NATIVE',1,'UNVERIFIED','UNKNOWN',false,'A')`;
      const blocked =
        b`insert into opportunity_versions(id,opportunity_id,truth_mode,version_number,verification_state,business_state,is_current,title)
        values (${randomUUID()},${opportunityId},'NATIVE',1,'UNVERIFIED','UNKNOWN',false,'B')`.catch(
          (error: unknown) => error,
        );
      await a`commit`;
      expect(await blocked).toMatchObject({ code: "23505" });
      await b`rollback`;
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("uses a deterministic concurrent lineage-branch guard", async () => {
    const opportunityId = await opportunity(await institution());
    const predecessor = await version(opportunityId, { number: 1 });
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    try {
      await a`begin`;
      await b`begin`;
      await a`insert into opportunity_versions(id,opportunity_id,truth_mode,version_number,supersedes_version_id,verification_state,business_state,is_current,title)
        values (${randomUUID()},${opportunityId},'NATIVE',2,${predecessor},'UNVERIFIED','UNKNOWN',false,'A')`;
      const blocked =
        b`insert into opportunity_versions(id,opportunity_id,truth_mode,version_number,supersedes_version_id,verification_state,business_state,is_current,title)
        values (${randomUUID()},${opportunityId},'NATIVE',3,${predecessor},'UNVERIFIED','UNKNOWN',false,'B')`.catch(
          (error: unknown) => error,
        );
      await a`commit`;
      expect(await blocked).toMatchObject({ code: "23505" });
      await b`rollback`;
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });

  it("uses a deterministic concurrent InstitutionFact current guard", async () => {
    const factId = await fact(await institution());
    const a = postgres(databaseUrl, { max: 1 });
    const b = postgres(databaseUrl, { max: 1 });
    try {
      await a`begin`;
      await b`begin`;
      await a`insert into institution_fact_versions(id,institution_fact_id,version_number,verification_state,is_current,value_json,verified_at)
        values (${randomUUID()},${factId},1,'VERIFIED',true,${sql.json({ value: "A" })},now())`;
      const blocked =
        b`insert into institution_fact_versions(id,institution_fact_id,version_number,verification_state,is_current,value_json,verified_at)
        values (${randomUUID()},${factId},2,'VERIFIED',true,${sql.json({ value: "B" })},now())`.catch(
          (error: unknown) => error,
        );
      await a`commit`;
      expect(await blocked).toMatchObject({ code: "23505" });
      await b`rollback`;
    } finally {
      await a.end({ timeout: 5 });
      await b.end({ timeout: 5 });
    }
  });
});
