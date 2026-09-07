import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  getInstitutionBySlug,
  listInstitutions,
} from "@/src/modules/public/institution-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
}
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `english-kindergarten-public-${randomUUID()}`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

async function createInstitution({
  name,
  category = "ENGLISH_KINDERGARTEN",
  publicationState = "PUBLISHED",
}: {
  name: string;
  category?:
    "ENGLISH_KINDERGARTEN" | "PRIVATE_ELEMENTARY" | "INTERNATIONAL_SCHOOL";
  publicationState?: "DRAFT" | "PUBLISHED";
}) {
  const id = randomUUID();
  const slug = `${prefix}-${id}`;
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, publication_state, operational_state,
      region_code, district, address_line, short_description, published_at
    ) values (
      ${id}, ${slug}, ${name}, ${category}, ${publicationState}, 'ACTIVE',
      'SEOUL', '서초구', '서울특별시 서초구 테스트로 1', '테스트 설명',
      ${publicationState === "PUBLISHED" ? "2026-09-01T00:00:00.000Z" : null}
    )
  `;
  return { id, slug };
}

async function createSource({
  official = true,
  capturedAt = "2026-08-20T01:02:03.000Z",
}: {
  official?: boolean;
  capturedAt?: string;
} = {}) {
  const id = randomUUID();
  const snapshotId = randomUUID();
  const url = `https://english-kindergarten.example.test/${prefix}/${id}`;
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${id}, ${url},
      ${official ? "OFFICIAL_SCHOOL_PAGE" : "THIRD_PARTY_DISCOVERY"},
      ${official ? "PRIMARY" : "DISCOVERY_ONLY"}, 'ACTIVE',
      ${official ? "기관 공식 페이지" : "공개 후기 출처"}
    )
  `;
  await runtime.client`
    insert into source_snapshots (id, source_id, captured_at, content_hash)
    values (${snapshotId}, ${id}, ${capturedAt}, ${`sha256:${snapshotId}`})
  `;
  return { id, snapshotId, url, capturedAt };
}

async function addFact({
  institutionId,
  factType,
  value,
  displayText,
  verified = true,
  capturedAt,
}: {
  institutionId: string;
  factType:
    "TUITION" | "TARGET_AGE_GRADE" | "CURRICULUM" | "TRANSPORT" | "MEALS";
  value: Record<string, unknown>;
  displayText: string;
  verified?: boolean;
  capturedAt?: string;
}) {
  const factId = randomUUID();
  const versionId = randomUUID();
  const source = await createSource({ capturedAt });
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into institution_facts (id, institution_id, fact_type)
      values (${factId}, ${institutionId}, ${factType})
    `;
    await transaction`
      insert into institution_fact_versions (
        id, institution_fact_id, version_number, verification_state,
        is_current, value_json, display_text, verified_at
      ) values (
        ${versionId}, ${factId}, 1, ${verified ? "VERIFIED" : "UNVERIFIED"},
        ${verified}, ${JSON.stringify(value)}::jsonb, ${displayText},
        ${verified ? "2026-08-25T04:05:06.000Z" : null}
      )
    `;
    await transaction`
      insert into institution_fact_version_evidence (
        institution_fact_version_id, source_id, source_snapshot_id,
        evidence_role
      ) values (${versionId}, ${source.id}, ${source.snapshotId}, 'PRIMARY')
    `;
  });
  return { ...source, factId, versionId };
}

function tuitionValue(
  amount: number,
  cadence: "MONTHLY" | "ANNUAL" = "MONTHLY",
) {
  return {
    academicYearLabel: "2026학년도",
    validityNote: null,
    billingCadence: cadence,
    currency: "KRW",
    amountMin: amount,
    amountMax: amount,
    programFees: [],
    extraCosts: [],
    includedItems: [],
    refundTerms: null,
    changeNote: null,
  };
}

function ageValue(minAge: number, maxAge: number) {
  return {
    academicYearLabel: "2026학년도",
    ageBasis: "INTERNATIONAL_AGE",
    minAge,
    maxAge,
    classes: [],
    midyearAdmission: null,
  };
}

function transportValue(isAvailable: boolean) {
  return {
    isAvailable,
    serviceAreas: isAvailable ? ["서초구"] : [],
    routes: [],
    restrictions: null,
    inquiryRequired: isAvailable,
  };
}

async function addCoverage({
  institutionId,
  section,
  status,
  source,
  publicNote = null,
  internalNote = null,
}: {
  institutionId: string;
  section:
    | "TUITION"
    | "INFORMATION_SESSION"
    | "TARGET_AGE_GRADE"
    | "CURRICULUM"
    | "TRANSPORT"
    | "MEALS"
    | "REVIEWS"
    | "OPERATING_INFO";
  status:
    | "NOT_RESEARCHED"
    | "CONFIRMED"
    | "CHECKED_NOT_FOUND"
    | "ACCESS_FAILED"
    | "NEEDS_REVIEW";
  source?: { id: string; snapshotId: string; capturedAt: string };
  publicNote?: string | null;
  internalNote?: string | null;
}) {
  await runtime.client`
    insert into institution_section_coverages (
      institution_id, section, status, source_id, source_snapshot_id,
      academic_year_label, public_note, internal_note, last_collected_at,
      last_checked_at
    ) values (
      ${institutionId}, ${section}, ${status}, ${source?.id ?? null},
      ${source?.snapshotId ?? null}, '2026학년도', ${publicNote},
      ${internalNote}, ${source?.capturedAt ?? null},
      '2026-08-26T07:08:09.000Z'
    )
  `;
}

async function addInformationSession({
  institutionId,
  eventStartAt,
  applicationCloseAt,
  businessState = "UPCOMING",
}: {
  institutionId: string;
  eventStartAt: string;
  applicationCloseAt: string;
  businessState?: "UPCOMING" | "CANCELLED";
}) {
  const id = randomUUID();
  const versionId = randomUUID();
  const slug = `${prefix}-information-session-${id}`;
  const source = await createSource({ capturedAt: "2026-08-21T02:03:04.000Z" });
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state,
        published_at
      ) values (
        ${id}, ${institutionId}, ${slug}, 'INFORMATION_SESSION', 'NATIVE',
        'PUBLISHED', '2026-09-01T00:00:00.000Z'
      )
    `;
    await transaction`
      insert into opportunity_versions (
        id, opportunity_id, truth_mode, version_number, verification_state,
        business_state, is_current, title, summary, event_start_at,
        application_close_at, action_url, verified_at
      ) values (
        ${versionId}, ${id}, 'NATIVE', 1, 'VERIFIED', ${businessState}, true,
        '2026학년도 입학설명회', '사전 신청이 필요한 설명회예요.',
        ${eventStartAt}, ${applicationCloseAt},
        'https://apply.example.test/information-session',
        '2026-08-27T08:09:10.000Z'
      )
    `;
    await transaction`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, source_snapshot_id, evidence_role
      ) values (${versionId}, ${source.id}, ${source.snapshotId}, 'PRIMARY')
    `;
  });
  return { id, slug };
}

async function addReviewInsight(institutionId: string) {
  const insightId = randomUUID();
  const versionId = randomUUID();
  const source = await createSource({
    official: false,
    capturedAt: "2026-08-22T03:04:05.000Z",
  });
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into institution_review_insights (id, institution_id)
      values (${insightId}, ${institutionId})
    `;
    await transaction`
      insert into institution_review_insight_versions (
        id, institution_review_insight_id, version_number,
        verification_state, is_current, period_start, period_end,
        sample_size, themes, limitations, verified_at
      ) values (
        ${versionId}, ${insightId}, 1, 'VERIFIED', true, '2026-01-01',
        '2026-08-31', 12,
        ${JSON.stringify([{ summary: "놀이 활동 언급이 반복돼요.", mentionCount: 5 }])}::jsonb,
        '공개적으로 접근 가능한 후기만 확인했어요.',
        '2026-08-28T09:10:11.000Z'
      )
    `;
    await transaction`
      insert into institution_review_insight_version_evidence (
        institution_review_insight_version_id, source_id,
        source_snapshot_id, evidence_role
      ) values (${versionId}, ${source.id}, ${source.snapshotId}, 'THEME_SUPPORT')
    `;
  });
  return source;
}

async function cleanup(): Promise<void> {
  await runtime.client.begin(async (transaction) => {
    await transaction`delete from institution_review_insight_version_evidence where institution_review_insight_version_id in (select v.id from institution_review_insight_versions v join institution_review_insights r on r.id=v.institution_review_insight_id where r.institution_id in (select id from institutions where slug like ${`${prefix}%`}))`;
    await transaction`delete from institution_review_insight_versions where institution_review_insight_id in (select id from institution_review_insights where institution_id in (select id from institutions where slug like ${`${prefix}%`}))`;
    await transaction`delete from institution_review_insights where institution_id in (select id from institutions where slug like ${`${prefix}%`})`;
    await transaction`delete from institution_section_coverages where institution_id in (select id from institutions where slug like ${`${prefix}%`})`;
    await transaction`delete from institution_fact_version_evidence where institution_fact_version_id in (select v.id from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id where f.institution_id in (select id from institutions where slug like ${`${prefix}%`}))`;
    await transaction`delete from institution_fact_versions where institution_fact_id in (select id from institution_facts where institution_id in (select id from institutions where slug like ${`${prefix}%`}))`;
    await transaction`delete from institution_facts where institution_id in (select id from institutions where slug like ${`${prefix}%`})`;
    await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select v.id from opportunity_versions v join opportunities o on o.id=v.opportunity_id where o.institution_id in (select id from institutions where slug like ${`${prefix}%`}))`;
    await transaction`delete from opportunity_versions where opportunity_id in (select id from opportunities where institution_id in (select id from institutions where slug like ${`${prefix}%`}))`;
    await transaction`delete from opportunities where institution_id in (select id from institutions where slug like ${`${prefix}%`})`;
    await transaction`delete from institutions where slug like ${`${prefix}%`}`;
    await transaction`delete from source_snapshots where source_id in (select id from sources where canonical_url like ${`https://english-kindergarten.example.test/${prefix}/%`})`;
    await transaction`delete from sources where canonical_url like ${`https://english-kindergarten.example.test/${prefix}/%`}`;
  });
}

describe("English-kindergarten public query", () => {
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

  it("filters only published English kindergartens by age and available transport", async () => {
    const matching = await createInstitution({ name: `${prefix} 가나다` });
    const other = await createInstitution({ name: `${prefix} 나다라` });
    await createInstitution({
      name: `${prefix} 비공개`,
      publicationState: "DRAFT",
    });
    await createInstitution({
      name: `${prefix} 사립초`,
      category: "PRIVATE_ELEMENTARY",
    });
    await addFact({
      institutionId: matching.id,
      factType: "TARGET_AGE_GRADE",
      value: ageValue(4, 6),
      displayText: "만 4~6세 반을 운영해요.",
    });
    await addFact({
      institutionId: matching.id,
      factType: "TRANSPORT",
      value: transportValue(true),
      displayText: "서초구 셔틀을 운영해요.",
    });
    await addFact({
      institutionId: other.id,
      factType: "TARGET_AGE_GRADE",
      value: ageValue(5, 7),
      displayText: "만 5~7세 반을 운영해요.",
    });
    await addFact({
      institutionId: other.id,
      factType: "TRANSPORT",
      value: transportValue(false),
      displayText: "셔틀을 운영하지 않아요.",
    });

    const result = await listInstitutions(runtime.executor, {
      category: "ENGLISH_KINDERGARTEN",
      query: prefix,
      minAge: 4,
      transport: "AVAILABLE",
      sort: "NAME_ASC",
      page: 1,
      pageSize: 20,
    });

    expect(result.items.map((item) => item.category)).toEqual([
      "ENGLISH_KINDERGARTEN",
    ]);
    expect(result.items[0]).toMatchObject({
      id: matching.id,
      address: "서울특별시 서초구 테스트로 1",
      englishKindergarten: {
        ageRange: { min: 4, max: 6 },
        transport: { state: "AVAILABLE" },
      },
    });
  });

  it("sorts comparable monthly tuition before differently based fees", async () => {
    const cheap = await createInstitution({ name: `${prefix} 하 저렴` });
    const expensive = await createInstitution({ name: `${prefix} 가 비쌈` });
    const annual = await createInstitution({ name: `${prefix} 나 연간` });
    await addFact({
      institutionId: cheap.id,
      factType: "TUITION",
      value: tuitionValue(1_850_000),
      displayText: "2026학년도 월 185만원이에요.",
    });
    await addFact({
      institutionId: expensive.id,
      factType: "TUITION",
      value: tuitionValue(2_100_000),
      displayText: "2026학년도 월 210만원이에요.",
    });
    await addFact({
      institutionId: annual.id,
      factType: "TUITION",
      value: tuitionValue(10_000_000, "ANNUAL"),
      displayText: "2026학년도 연 1,000만원이에요.",
    });

    const result = await listInstitutions(runtime.executor, {
      category: "ENGLISH_KINDERGARTEN",
      query: prefix,
      sort: "TUITION_ASC",
      page: 1,
      pageSize: 20,
    });

    expect(result.items.map((item) => item.id)).toEqual([
      cheap.id,
      expensive.id,
      annual.id,
    ]);
  });

  it("keeps official facts, coverage, information sessions, and review insights distinct", async () => {
    const institution = await createInstitution({ name: `${prefix} 상세` });
    const tuition = await addFact({
      institutionId: institution.id,
      factType: "TUITION",
      value: tuitionValue(1_850_000),
      displayText: "2026학년도 월 185만원이에요.",
      capturedAt: "2026-08-20T01:02:03.000Z",
    });
    await addFact({
      institutionId: institution.id,
      factType: "TRANSPORT",
      value: transportValue(true),
      displayText: "검수 전 셔틀 정보예요.",
      verified: false,
    });
    await addCoverage({
      institutionId: institution.id,
      section: "TUITION",
      status: "CONFIRMED",
      source: tuition,
      internalNote: "공개하면 안 되는 내부 메모",
    });
    await addCoverage({
      institutionId: institution.id,
      section: "MEALS",
      status: "CHECKED_NOT_FOUND",
      source: tuition,
    });
    const nextSession = await addInformationSession({
      institutionId: institution.id,
      eventStartAt: "2026-10-15T01:00:00.000Z",
      applicationCloseAt: "2026-10-01T14:59:59.000Z",
    });
    await addInformationSession({
      institutionId: institution.id,
      eventStartAt: "2026-09-10T01:00:00.000Z",
      applicationCloseAt: "2026-09-01T14:59:59.000Z",
      businessState: "CANCELLED",
    });
    const reviewSource = await addReviewInsight(institution.id);

    const detail = await getInstitutionBySlug(
      runtime.executor,
      institution.slug,
    );

    expect(detail.englishKindergarten).toMatchObject({
      nextInformationSession: {
        id: nextSession.id,
        eventStartsAt: "2026-10-15T01:00:00.000Z",
        applicationClosesAt: "2026-10-01T14:59:59.000Z",
      },
      sections: expect.arrayContaining([
        expect.objectContaining({
          section: "MEALS",
          message: "확인한 공식 안내에서 급식 정보를 찾지 못했어요.",
        }),
      ]),
      facts: [
        expect.objectContaining({
          factType: "TUITION",
          lastCollectedAt: "2026-08-20T01:02:03.000Z",
          verifiedAt: "2026-08-25T04:05:06.000Z",
        }),
      ],
      reviewInsight: {
        sampleSize: 12,
        themes: [{ summary: "놀이 활동 언급이 반복돼요.", mentionCount: 5 }],
        sources: [expect.objectContaining({ url: reviewSource.url })],
      },
    });
    expect(JSON.stringify(detail.englishKindergarten)).not.toContain(
      "공개하면 안 되는 내부 메모",
    );
    expect(detail.englishKindergarten?.facts).toHaveLength(1);
  });
});
