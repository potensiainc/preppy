import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import type { LiveAdmissionProposal } from "@/src/modules/live-admissions/contracts";
import type { CollectedPrivateElementarySchool } from "@/src/modules/institution-detail-bootstrap/discovery.server";
import { persistPrivateElementarySchool } from "@/src/modules/institution-detail-bootstrap/persistence.server";
import { inspectBootstrapSchema } from "@/src/modules/institution-detail-bootstrap/schema-preflight.server";
import { buildRegistryBaselineFacts } from "@/src/modules/institution-detail-bootstrap/fact-extractor";
import { getInstitutionBySlug } from "@/src/modules/public/institution-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
}
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const lock = postgres(databaseUrl, { max: 1 });
const institutionIds = new Set<string>();

function proposal(
  overrides: Partial<LiveAdmissionProposal> = {},
): LiveAdmissionProposal {
  return Object.freeze({
    academicYearLabel: "2027학년도",
    knowledgeState: "SCHEDULE_FOUND",
    kind: "RECRUITMENT",
    businessState: "UPCOMING",
    title: "2027학년도 신입생 모집",
    summary: "원서접수 2026년 11월 9일 ~ 2026년 11월 13일",
    targetAudience: "2020년 출생 취학 예정 아동",
    eventStartAt: null,
    eventEndAt: null,
    applicationOpenAt: new Date("2026-11-08T15:00:00.000Z"),
    applicationCloseAt: new Date("2026-11-12T15:00:00.000Z"),
    actionUrl: "https://fixture-school.example/admissions/2027",
    evidenceExcerpt: "2027학년도 신입생 모집 원서접수",
    warnings: Object.freeze([]),
    ...overrides,
  });
}

async function insertInstitution() {
  const id = randomUUID();
  const slug = `bootstrap-school-${id}`;
  institutionIds.add(id);
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, operational_state,
      publication_state, region_code, address_line, website_url, published_at
    ) values (
      ${id}, ${slug}, 'Bootstrap Fixture School', 'PRIVATE_ELEMENTARY',
      'ACTIVE', 'PUBLISHED', 'KR-11', '서울특별시 테스트구 공식로 1',
      'https://fixture-school.example/', now()
    )
  `;
  return { id, slug };
}

function collection(
  institution: Readonly<{ id: string; slug: string }>,
  admissionProposal: LiveAdmissionProposal = proposal(),
): CollectedPrivateElementarySchool {
  const collectedAt = new Date("2026-08-30T03:04:05.000Z");
  return Object.freeze({
    target: Object.freeze({
      institutionId: institution.id,
      slug: institution.slug,
      institutionName: "Bootstrap Fixture School",
      category: "PRIVATE_ELEMENTARY" as const,
      regionCode: "KR-11" as const,
      address: "서울특별시 테스트구 공식로 1",
      gradeRange: "초등학교(1–6)",
      offersElementary: true,
      province: "서울특별시",
      cityDistrict: "테스트구",
      registryVerifiedAt: "2026-08-27",
      websiteUrl: "https://fixture-school.example/",
      registryName: "SCHOOLINFO" as const,
      registryExternalId: "fixture-registry-id",
      registryUrl:
        "https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=fixture-registry-id",
    }),
    status: "COLLECTED" as const,
    partialFetchWarning: false,
    pagesScheduled: 2,
    pagesFetched: 2,
    candidateUrls: Object.freeze([
      "https://fixture-school.example/admissions/2027",
    ]),
    pages: Object.freeze([
      Object.freeze({
        url: "https://fixture-school.example/",
        finalUrl: "https://fixture-school.example/",
        sourceName: "Bootstrap Fixture School 공식 홈페이지",
        sourceType: "OFFICIAL_SCHOOL_PAGE" as const,
        classificationHint: "OTHER" as const,
        collectedAt,
        contentHash: "a".repeat(64),
        textHash: "b".repeat(64),
        normalizedText: "Bootstrap Fixture School 공식 홈페이지",
        mimeType: "text/html",
        httpStatus: 200,
        responseBytes: 100,
        durationMs: 10,
        extractionHtml: "<p>Bootstrap Fixture School 공식 홈페이지</p>",
        score: 0,
      }),
      Object.freeze({
        url: "https://fixture-school.example/admissions/2027",
        finalUrl: "https://fixture-school.example/admissions/2027",
        sourceName: "Bootstrap Fixture School 공식 입학 안내",
        sourceType: "OFFICIAL_ADMISSION_PAGE" as const,
        classificationHint: "ADMISSIONS" as const,
        collectedAt,
        contentHash: "c".repeat(64),
        textHash: "d".repeat(64),
        normalizedText: "2027학년도 신입생 모집",
        mimeType: "text/html",
        httpStatus: 200,
        responseBytes: 200,
        durationMs: 20,
        extractionHtml: "<p>2027학년도 신입생 모집</p>",
        score: 100,
      }),
    ]),
    facts: Object.freeze([
      Object.freeze({
        factType: "OPERATING_INFO" as const,
        displayText:
          "Bootstrap Fixture School · 사립초등학교 · 초등학교(1–6) · 서울특별시 테스트구 공식로 1",
        valueJson: Object.freeze({
          institutionName: "Bootstrap Fixture School",
          institutionType: "PRIVATE_ELEMENTARY",
          address: "서울특별시 테스트구 공식로 1",
          gradeRange: "초등학교(1–6)",
          officialWebsite: "https://fixture-school.example/",
        }),
        evidenceExcerpt: "공식 SchoolInfo 운영 정보",
        sourceUrl:
          "https://www.schoolinfo.go.kr/ei/ss/Pneiss_b01_s0.do?SHL_IDF_CD=fixture-registry-id",
      }),
      Object.freeze({
        factType: "TUITION" as const,
        displayText: "2027학년도 수업료는 분기별 2,000,000원입니다.",
        valueJson: Object.freeze({
          text: "2027학년도 수업료는 분기별 2,000,000원입니다.",
        }),
        evidenceExcerpt: "2027학년도 수업료는 분기별 2,000,000원입니다.",
        sourceUrl: "https://fixture-school.example/admissions/2027",
      }),
    ]),
    admission: Object.freeze({
      proposal: admissionProposal,
      collectedAt,
      sourceUrl: admissionProposal.actionUrl,
    }),
    warnings: Object.freeze([]),
    errors: Object.freeze([]),
  });
}

async function counts(institutionId: string) {
  const [row] = await runtime.client<
    Array<{
      sources: number;
      bindings: number;
      facts: number;
      factVersions: number;
      factEvidence: number;
      opportunities: number;
      opportunityVersions: number;
      opportunityEvidence: number;
      opportunityBindings: number;
      observations: number;
      snapshots: number;
    }>
  >`
    select
      (select count(*)::int from sources s where exists (
        select 1 from institution_source_bindings b
        where b.institution_id=${institutionId} and b.source_id=s.id
      )) as sources,
      (select count(*)::int from institution_source_bindings where institution_id=${institutionId}) as bindings,
      (select count(*)::int from institution_facts where institution_id=${institutionId}) as facts,
      (select count(*)::int from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id where f.institution_id=${institutionId}) as "factVersions",
      (select count(*)::int from institution_fact_version_evidence e join institution_fact_versions v on v.id=e.institution_fact_version_id join institution_facts f on f.id=v.institution_fact_id where f.institution_id=${institutionId}) as "factEvidence",
      (select count(*)::int from opportunities where institution_id=${institutionId}) as opportunities,
      (select count(*)::int from opportunity_versions v join opportunities o on o.id=v.opportunity_id where o.institution_id=${institutionId}) as "opportunityVersions",
      (select count(*)::int from opportunity_version_evidence e join opportunity_versions v on v.id=e.opportunity_version_id join opportunities o on o.id=v.opportunity_id where o.institution_id=${institutionId}) as "opportunityEvidence",
      (select count(*)::int from opportunity_source_bindings b join opportunities o on o.id=b.opportunity_id where o.institution_id=${institutionId}) as "opportunityBindings",
      (select count(distinct so.id)::int from source_observations so join institution_source_bindings b on b.source_id=so.source_id where b.institution_id=${institutionId}) as observations,
      (select count(distinct ss.id)::int from source_snapshots ss join institution_source_bindings b on b.source_id=ss.source_id where b.institution_id=${institutionId}) as snapshots
  `;
  return row!;
}

beforeAll(async () => {
  await lock`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
  await lock`select pg_advisory_lock(hashtext('preppy-private-elementary-bootstrap-tests'))`;
  await migrateDatabase(databaseUrl);
});

afterEach(async () => {
  const cleanupSourceIds = new Set<string>();
  for (const institutionId of institutionIds) {
    await runtime.client.begin(async (transaction) => {
      await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select v.id from opportunity_versions v join opportunities o on o.id=v.opportunity_id where o.institution_id=${institutionId})`;
      await transaction`delete from opportunity_source_bindings where opportunity_id in (select id from opportunities where institution_id=${institutionId})`;
      await transaction`delete from opportunity_versions where opportunity_id in (select id from opportunities where institution_id=${institutionId})`;
      await transaction`delete from opportunities where institution_id=${institutionId}`;
      await transaction`delete from institution_fact_version_evidence where institution_fact_version_id in (select v.id from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id where f.institution_id=${institutionId})`;
      await transaction`delete from institution_fact_versions where institution_fact_id in (select id from institution_facts where institution_id=${institutionId})`;
      await transaction`delete from institution_facts where institution_id=${institutionId}`;
      const sources = await transaction<
        Array<{ source_id: string }>
      >`select source_id from institution_source_bindings where institution_id=${institutionId}`;
      const sourceIds = sources.map((row) => row.source_id);
      if (sourceIds.length > 0) {
        for (const sourceId of sourceIds) cleanupSourceIds.add(sourceId);
        await transaction`delete from institution_source_bindings where institution_id=${institutionId}`;
      }
      await transaction`delete from institutions where id=${institutionId}`;
    });
  }
  if (cleanupSourceIds.size > 0) {
    const ids = [...cleanupSourceIds];
    await runtime.client`delete from source_observations where source_id in ${runtime.client(ids)}`;
    await runtime.client`delete from source_snapshots where source_id in ${runtime.client(ids)}`;
    await runtime.client`delete from sources where id in ${runtime.client(ids)}`;
  }
  institutionIds.clear();
});

afterAll(async () => {
  await lock`select pg_advisory_unlock(hashtext('preppy-private-elementary-bootstrap-tests'))`;
  await lock`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
  await lock.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("private elementary per-school atomic persistence", () => {
  it("reuses one registry Source when two school transactions bootstrap the same registry URL concurrently", async () => {
    const institutions = [await insertInstitution(), await insertInstitution()];
    const results = await Promise.all(
      institutions.map(async (institution) => {
        const original = collection(institution);
        return persistPrivateElementarySchool(
          {
            ...original,
            status: "SCHOOL_FETCH_FAILED",
            pages: [],
            admission: null,
            facts: buildRegistryBaselineFacts(original.target),
          },
          {
            transactionManager: runtime.transactionManager,
            supportsOfficialRegistrySourceType: false,
            supportsRegistryIdentityBindingRole: false,
          },
        );
      }),
    );
    expect(
      results.reduce((sum, result) => sum + result.created.sources, 0),
    ).toBe(1);
    expect(results.every((result) => result.created.facts === 2)).toBe(true);
  });
  it("persists registry-only fallback with official public Fact provenance and no duplicate rows", async () => {
    const institution = await insertInstitution();
    const original = collection(institution);
    const input: CollectedPrivateElementarySchool = {
      ...original,
      status: "SCHOOL_FETCH_FAILED",
      pages: [],
      pagesFetched: 0,
      admission: null,
      facts: buildRegistryBaselineFacts(original.target),
      errors: ["ROBOTS_BLOCKED"],
    };
    const dependencies = {
      transactionManager: runtime.transactionManager,
      supportsOfficialRegistrySourceType: false,
      supportsRegistryIdentityBindingRole: false,
    };
    const first = await persistPrivateElementarySchool(input, dependencies);
    const afterFirst = await counts(institution.id);
    const second = await persistPrivateElementarySchool(input, dependencies);
    expect(afterFirst).toMatchObject({
      facts: 2,
      factVersions: 2,
      factEvidence: 2,
      sources: 1,
      observations: 0,
      snapshots: 0,
      opportunities: 0,
    });
    expect(await counts(institution.id)).toEqual(afterFirst);
    expect(Object.values(second.created).every((count) => count === 0)).toBe(
      true,
    );
    expect(
      Object.values(first.sideEffectDelta).every((count) => count === 0),
    ).toBe(true);
    expect(
      Object.values(second.sideEffectDelta).every((count) => count === 0),
    ).toBe(true);
    const detail = await getInstitutionBySlug(
      runtime.executor,
      institution.slug,
    );
    expect(detail.verifiedFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          factType: "OPERATING_INFO",
          officialSource: expect.objectContaining({
            url: original.target.registryUrl,
          }),
        }),
        expect.objectContaining({
          factType: "TARGET_AGE_GRADE",
          displayValue:
            "초등학교 1~6학년 (학교 교육과정 기준; 신입생 모집 대상 아님)",
        }),
      ]),
    );
    expect(detail.reviewedAdmissions).toEqual([]);
  });

  it.each(["2024학년도", "2025학년도"])(
    "does not persist a current admission for %s while retaining Institution facts",
    async (academicYearLabel) => {
      const institution = await insertInstitution();
      const input = collection(institution, proposal({ academicYearLabel }));
      const result = await persistPrivateElementarySchool(input, {
        transactionManager: runtime.transactionManager,
        supportsOfficialRegistrySourceType: false,
        supportsRegistryIdentityBindingRole: false,
      });
      expect(result.opportunityId).toBeNull();
      expect(await counts(institution.id)).toMatchObject({
        facts: 2,
        opportunities: 0,
        opportunityVersions: 0,
        opportunityEvidence: 0,
        opportunityBindings: 0,
      });
    },
  );

  it("accepts the canonical schema without consulting the migration ledger", async () => {
    await expect(
      inspectBootstrapSchema(runtime.executor),
    ).resolves.toMatchObject({
      compatible: true,
      missingColumns: [],
      missingConstraintValues: [],
      migrationLedgerInspected: false,
    });
  });

  it("persists canonical provenance with zero side effects and is idempotent", async () => {
    const institution = await insertInstitution();
    const input = collection(institution);
    const first = await persistPrivateElementarySchool(input, {
      transactionManager: runtime.transactionManager,
      supportsOfficialRegistrySourceType: false,
      supportsRegistryIdentityBindingRole: false,
      now: () => new Date("2026-08-30T03:05:06.000Z"),
    });
    const afterFirst = await counts(institution.id);
    const second = await persistPrivateElementarySchool(input, {
      transactionManager: runtime.transactionManager,
      supportsOfficialRegistrySourceType: false,
      supportsRegistryIdentityBindingRole: false,
      now: () => new Date("2026-08-30T03:06:07.000Z"),
    });
    const afterSecond = await counts(institution.id);

    expect(first.sideEffectDelta).toEqual({
      outboxEvents: 0,
      notifications: 0,
      deliveries: 0,
      deliveryAttempts: 0,
      meaningfulChanges: 0,
      opportunityChanges: 0,
    });
    expect(first.created).toMatchObject({
      facts: 2,
      factVersions: 2,
      opportunities: 1,
      opportunityVersions: 1,
    });
    expect(second.created).toEqual({
      sources: 0,
      bindings: 0,
      snapshots: 0,
      observations: 0,
      facts: 0,
      factVersions: 0,
      factEvidence: 0,
      opportunities: 0,
      opportunityVersions: 0,
      opportunityEvidence: 0,
      opportunityBindings: 0,
    });
    expect(afterSecond).toEqual(afterFirst);

    const [chain] = await runtime.client<
      Array<{
        institutionState: string;
        versionState: string;
        observedAt: Date;
        verifiedAt: Date;
        rawBody: Buffer | null;
        observationMetadata: unknown;
      }>
    >`
      select i.publication_state as "institutionState",
        v.verification_state as "versionState", so.observed_at as "observedAt",
        v.verified_at as "verifiedAt", ss.raw_body as "rawBody",
        so.metadata as "observationMetadata"
      from institutions i
      join opportunities o on o.institution_id=i.id
      join opportunity_versions v on v.opportunity_id=o.id and v.is_current=true
      join opportunity_version_evidence e on e.opportunity_version_id=v.id
      join source_observations so on so.id=e.source_observation_id and so.source_id=e.source_id
      join source_snapshots ss on ss.id=e.source_snapshot_id and ss.source_id=e.source_id
      where i.id=${institution.id}
    `;
    expect(chain).toMatchObject({
      institutionState: "PUBLISHED",
      versionState: "VERIFIED",
      rawBody: null,
      observationMetadata: null,
    });
    expect(new Date(chain!.observedAt).toISOString()).toBe(
      "2026-08-30T03:04:05.000Z",
    );
    expect(new Date(chain!.verifiedAt).toISOString()).toBe(
      "2026-08-30T03:05:06.000Z",
    );
  });

  it("rolls back all writes for only the school when a late DB constraint fails", async () => {
    const institution = await insertInstitution();
    await expect(
      persistPrivateElementarySchool(
        collection(institution, proposal({ title: "" })),
        {
          transactionManager: runtime.transactionManager,
          supportsOfficialRegistrySourceType: false,
          supportsRegistryIdentityBindingRole: false,
          now: () => new Date("2026-08-30T03:05:06.000Z"),
        },
      ),
    ).rejects.toBeTruthy();

    expect(await counts(institution.id)).toEqual({
      sources: 0,
      bindings: 0,
      facts: 0,
      factVersions: 0,
      factEvidence: 0,
      opportunities: 0,
      opportunityVersions: 0,
      opportunityEvidence: 0,
      opportunityBindings: 0,
      observations: 0,
      snapshots: 0,
    });
  });
});
