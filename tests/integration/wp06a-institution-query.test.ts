import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/src/application/errors";
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
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp06a-institution-query-${randomUUID()}`;
let legacyFixtureSequence = 0;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

function assertNoForbiddenKeys(value: unknown): void {
  const forbidden = new Set([
    "truthMode",
    "legacySchoolId",
    "admissionEventId",
    "admissionCycleId",
    "adminUserId",
    "audit",
    "outbox",
    "email",
    "userId",
    "providerMessageId",
    "isFollowed",
  ]);
  if (Array.isArray(value)) return value.forEach(assertNoForbiddenKeys);
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(forbidden.has(key), `forbidden public key: ${key}`).toBe(false);
    assertNoForbiddenKeys(nested);
  }
}

async function createInstitution({
  name = "WP-06A Institution",
  category = "INTERNATIONAL_SCHOOL",
  region = "SEOUL",
  state = "PUBLISHED",
  description = "A meaningful public profile.",
}: {
  name?: string;
  category?:
    "ENGLISH_KINDERGARTEN" | "PRIVATE_ELEMENTARY" | "INTERNATIONAL_SCHOOL";
  region?: string;
  state?: "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
  description?: string | null;
} = {}) {
  const id = randomUUID();
  const slug = `${prefix}-institution-${id}`;
  await runtime.client`
    insert into institutions (id, slug, display_name, category, publication_state, region_code, short_description, published_at)
    values (${id}, ${slug}, ${name}, ${category}, ${state}, ${region}, ${description},
      ${state === "PUBLISHED" ? "2026-08-01T00:00:00.000Z" : null})
  `;
  return { id, slug };
}

async function createSource({
  sourceType = "OFFICIAL_ADMISSION_PAGE",
  authority = "PRIMARY",
}: {
  sourceType?: "OFFICIAL_ADMISSION_PAGE" | "THIRD_PARTY_DISCOVERY";
  authority?: "PRIMARY" | "DISCOVERY_ONLY";
} = {}) {
  const id = randomUUID();
  const url = `https://institution-source.example.test/${prefix}/${id}`;
  await runtime.client`
    insert into sources (id, canonical_url, source_type, authority_level, lifecycle_status, source_name)
    values (${id}, ${url}, ${sourceType}, ${authority}, 'ACTIVE', 'Institution source')
  `;
  return { id, url };
}

async function createNativeOpportunity(
  institutionId: string,
  state:
    | "OPEN"
    | "UPCOMING"
    | "CLOSED"
    | "COMPLETED"
    | "CANCELLED"
    | "UNKNOWN" = "OPEN",
) {
  const id = randomUUID();
  const versionId = randomUUID();
  const slug = `${prefix}-opportunity-${id}`;
  const source = await createSource();
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into opportunities (id, institution_id, slug, kind, truth_mode, publication_state, published_at)
      values (${id}, ${institutionId}, ${slug}, 'APPLICATION', 'NATIVE', 'PUBLISHED', '2026-08-01T00:00:00.000Z')
    `;
    await transaction`
      insert into opportunity_versions (id, opportunity_id, truth_mode, version_number, verification_state, business_state, is_current, title, summary, application_close_at, action_url, verified_at)
      values (${versionId}, ${id}, 'NATIVE', 1, 'VERIFIED', ${state}, true, ${`Opportunity ${state}`},
        'Verified opportunity summary.', '2026-09-01T00:00:00.000Z', 'https://apply.example.test', '2026-08-11T02:03:04.000Z')
    `;
    await transaction`
      insert into opportunity_version_evidence (opportunity_version_id, source_id, evidence_role)
      values (${versionId}, ${source.id}, 'PRIMARY')
    `;
  });
  return { id, slug, versionId, source };
}

async function addVerifiedFact(institutionId: string) {
  const factId = randomUUID();
  const versionId = randomUUID();
  const source = await createSource();
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into institution_facts (id, institution_id, fact_type)
      values (${factId}, ${institutionId}, 'TUITION')
    `;
    await transaction`
      insert into institution_fact_versions (id, institution_fact_id, version_number, verification_state, is_current, value_json, display_text, verified_at)
      values (${versionId}, ${factId}, 1, 'VERIFIED', true, ${JSON.stringify({ currency: "KRW", annual: 10000000 })}::jsonb,
        'KRW 10,000,000 annually', '2026-08-12T03:04:05.000Z')
    `;
    await transaction`
      insert into institution_fact_version_evidence (institution_fact_version_id, source_id, evidence_role)
      values (${versionId}, ${source.id}, 'PRIMARY')
    `;
  });
  return source;
}

async function addFactTrustFixtures(institutionId: string) {
  const currentFact = randomUUID();
  const currentVersion = randomUUID();
  const unverifiedFact = randomUUID();
  const unverifiedVersion = randomUUID();
  const discovery = await createSource({
    sourceType: "THIRD_PARTY_DISCOVERY",
    authority: "DISCOVERY_ONLY",
  });
  await runtime.client.begin(async (transaction) => {
    await transaction`insert into institution_facts (id, institution_id, fact_type) values (${currentFact}, ${institutionId}, 'CURRICULUM'), (${unverifiedFact}, ${institutionId}, 'TRANSPORT')`;
    await transaction`insert into institution_fact_versions (id, institution_fact_id, version_number, verification_state, is_current, value_json, display_text, verified_at) values (${currentVersion}, ${currentFact}, 1, 'VERIFIED', true, ${JSON.stringify({ label: "discovery fact" })}::jsonb, 'Discovery fact', '2026-08-16T00:00:00.000Z'), (${unverifiedVersion}, ${unverifiedFact}, 1, 'UNVERIFIED', false, ${JSON.stringify({ label: "unverified" })}::jsonb, 'Unverified fact', null)`;
    await transaction`insert into institution_fact_version_evidence (institution_fact_version_id, source_id, evidence_role) values (${currentVersion}, ${discovery.id}, 'PRIMARY')`;
  });
  return discovery;
}

async function linkArticle(
  institutionId: string,
  status: "PUBLISHED" | "DRAFT" | "UNPUBLISHED" | "ARCHIVED",
) {
  const id = randomUUID();
  const slug = `${prefix}-article-${id}`;
  await runtime.client`
    insert into articles (id, slug, type, category, status, title, content_html, robots_index, robots_follow, published_at)
    values (${id}, ${slug}, 'GUIDE', 'ADMISSIONS_GENERAL', ${status}, 'Related article', '<p>Body</p>', true, true,
      ${status === "PUBLISHED" ? "2026-08-01T00:00:00.000Z" : null})
  `;
  await runtime.client`
    insert into article_institutions (article_id, institution_id, sort_order) values (${id}, ${institutionId}, 1)
  `;
}

async function linkLegacyOfficialSource(institutionId: string) {
  const existing =
    await runtime.client`select school_id as "schoolId" from institution_school_links where institution_id=${institutionId}`;
  const schoolId = existing[0]?.schoolId ?? randomUUID();
  const source = await createSource();
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into schools (id, slug, canonical_name, school_type, lifecycle_status, country_code, is_public)
      values (${schoolId}, ${`${prefix}-school-${schoolId}`}, 'Legacy source school', 'INTERNATIONAL_SCHOOL', 'ACTIVE', 'KR', true)
    `;
    await transaction`
      insert into institution_school_links (institution_id, school_id, link_reason)
      values (${institutionId}, ${schoolId}, 'WP-06A public source fixture')
    `;
    await transaction`
      insert into source_bindings (source_id, school_id, source_role, priority, is_active)
      values (${source.id}, ${schoolId}, 'PRIMARY_ADMISSIONS', 1, true)
    `;
  });
  return source;
}

async function createLegacyOpportunity(
  institutionId: string,
  {
    status = "ACTIVE",
    publicEvent = true,
    verifiedAt = "2026-08-15T04:05:06.000Z",
    closeDate = "2026-09-02",
    closeTime = null,
    timezone = "Asia/Seoul",
  }: {
    status?: "ACTIVE" | "SCHEDULED" | "CLOSED" | "COMPLETED" | "CANCELLED";
    publicEvent?: boolean;
    verifiedAt?: string | null;
    closeDate?: string | null;
    closeTime?: string | null;
    timezone?: string | null;
  } = {},
) {
  const existing =
    await runtime.client`select school_id as "schoolId" from institution_school_links where institution_id=${institutionId}`;
  const schoolId = existing[0]?.schoolId ?? randomUUID();
  const cycleId = randomUUID();
  const eventId = randomUUID();
  const id = randomUUID();
  const versionId = randomUUID();
  const source = await createSource();
  const slug = `${prefix}-legacy-opportunity-${id}`;
  await runtime.client.begin(async (transaction) => {
    if (existing.length === 0) {
      await transaction`insert into schools (id, slug, canonical_name, school_type, lifecycle_status, country_code, is_public) values (${schoolId}, ${`${prefix}-legacy-school-${schoolId}`}, 'Legacy query school', 'INTERNATIONAL_SCHOOL', 'ACTIVE', 'KR', true)`;
      await transaction`insert into institution_school_links (institution_id, school_id, link_reason) values (${institutionId}, ${schoolId}, 'WP-06A legacy query fixture')`;
    }
    await transaction`insert into admission_cycles (id, school_id, academic_year, lifecycle_status, admission_mode) values (${cycleId}, ${schoolId}, ${2027 + legacyFixtureSequence++}, 'ACTIVE', 'FIXED_WINDOW')`;
    await transaction`insert into admission_events (id, admission_cycle_id, event_key, event_type, occurrence_no, canonical_title, audience_summary, is_public) values (${eventId}, ${cycleId}, ${`${prefix}-legacy-event-${eventId}`}, 'APPLICATION', 1, 'Legacy title', 'Legacy families', ${publicEvent})`;
    await transaction`insert into admission_event_versions (id, admission_event_id, version_no, is_current, verification_status, knowledge_state, event_status, display_title, registration_close_date, registration_close_time, timezone, official_notes, verified_at) values (${versionId}, ${eventId}, 1, true, 'VERIFIED', 'KNOWN', ${status}, ${`Legacy ${status}`}, ${closeDate}, ${closeTime}, ${timezone}, 'Legacy verified summary', ${verifiedAt})`;
    await transaction`insert into event_version_evidence (event_version_id, source_id, is_primary) values (${versionId}, ${source.id}, true)`;
    await transaction`insert into opportunities (id, institution_id, slug, kind, truth_mode, publication_state, published_at) values (${id}, ${institutionId}, ${slug}, 'APPLICATION', 'LEGACY_BACKED', 'PUBLISHED', '2026-08-01T00:00:00.000Z')`;
    await transaction`insert into opportunity_admission_event_links (opportunity_id, institution_id, truth_mode, admission_event_id, admission_cycle_id, school_id) values (${id}, ${institutionId}, 'LEGACY_BACKED', ${eventId}, ${cycleId}, ${schoolId})`;
  });
  return { id, slug, eventId, versionId, source, verifiedAt };
}

async function cleanup(): Promise<void> {
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`delete from article_institutions where article_id in (select id from articles where slug like ${`${prefix}%`})`;
    await transaction`delete from articles where slug like ${`${prefix}%`}`;
    await transaction`delete from institution_fact_version_evidence where institution_fact_version_id in (select version.id from institution_fact_versions version join institution_facts fact on fact.id = version.institution_fact_id where fact.institution_id in (select id from institutions where slug like ${`${prefix}%`}))`;
    await transaction`delete from institution_fact_versions where institution_fact_id in (select id from institution_facts where institution_id in (select id from institutions where slug like ${`${prefix}%`}))`;
    await transaction`delete from institution_facts where institution_id in (select id from institutions where slug like ${`${prefix}%`})`;
    await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select id from opportunity_versions where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`}))`;
    await transaction`delete from opportunity_versions where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`})`;
    await transaction`delete from event_version_evidence where event_version_id in (select v.id from admission_event_versions v join admission_events e on e.id=v.admission_event_id where e.event_key like ${`${prefix}%`})`;
    await transaction`delete from source_observations where source_id in (select id from sources where canonical_url like ${`https://institution-source.example.test/${prefix}/%`})`;
    await transaction`delete from opportunity_admission_event_links where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`})`;
    await transaction`delete from opportunities where slug like ${`${prefix}%`}`;
    await transaction`delete from admission_event_versions where admission_event_id in (select id from admission_events where event_key like ${`${prefix}%`})`;
    await transaction`delete from admission_events where event_key like ${`${prefix}%`}`;
    await transaction`delete from admission_cycles where school_id in (select id from schools where slug like ${`${prefix}%`})`;
    await transaction`delete from source_bindings where school_id in (select id from schools where slug like ${`${prefix}%`})`;
    await transaction`delete from institution_school_links where school_id in (select id from schools where slug like ${`${prefix}%`})`;
    await transaction`delete from schools where slug like ${`${prefix}%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}%`}`;
    await transaction`delete from sources where canonical_url like ${`https://institution-source.example.test/${prefix}/%`}`;
  });
}

describe("WP-06A Institution public query", () => {
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

  it("filters published Institutions, validates query input, paginates deterministically, and selects OPEN before UPCOMING", async () => {
    const first = await createInstitution({ name: "Alpha Academy" });
    const second = await createInstitution({
      name: "Beta Academy",
      category: "PRIVATE_ELEMENTARY",
      region: "BUSAN",
    });
    await createInstitution({ name: "Hidden Academy", state: "HIDDEN" });
    await createNativeOpportunity(first.id, "UPCOMING");
    const open = await createNativeOpportunity(first.id, "OPEN");
    await createNativeOpportunity(second.id, "CLOSED");

    const result = await listInstitutions(runtime.executor, {
      category: "INTERNATIONAL_SCHOOL",
      region: "SEOUL",
      query: " Alpha ",
      page: 1,
      pageSize: 1,
    });
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 1,
      hasNext: false,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        id: first.id,
        currentAdmissionsState: "OPEN",
        currentOpportunity: expect.objectContaining({
          id: open.id,
          state: "OPEN",
        }),
      }),
    ]);
    const closedOnly = await listInstitutions(runtime.executor, {
      recruitmentState: "CLOSED",
      page: 1,
      pageSize: 10,
    });
    expect(closedOnly.pagination.total).toBe(1);
    expect(closedOnly.items[0]?.id).toBe(second.id);
    expect(closedOnly.items[0]?.currentAdmissionsState).toBe("CLOSED");
    await expect(
      listInstitutions(runtime.executor, { unknown: "nope" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("orders matching Institution pages by name then id with bounded pagination", async () => {
    const alpha = await createInstitution({ name: `${prefix} Stable Alpha` });
    const beta = await createInstitution({ name: `${prefix} Stable Beta` });
    const firstPage = await listInstitutions(runtime.executor, {
      query: `${prefix} Stable`,
      page: 1,
      pageSize: 1,
    });
    const secondPage = await listInstitutions(runtime.executor, {
      query: `${prefix} Stable`,
      page: 2,
      pageSize: 1,
    });
    expect(firstPage.pagination).toEqual({
      page: 1,
      pageSize: 1,
      total: 2,
      hasNext: true,
    });
    expect(secondPage.pagination).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
      hasNext: false,
    });
    expect(firstPage.items[0]?.id).toBe(alpha.id);
    expect(secondPage.items[0]?.id).toBe(beta.id);
  });

  it("returns a Native Institution without School, exact fact verification/source, public Articles only, and no fake page freshness", async () => {
    const institution = await createInstitution();
    await createNativeOpportunity(institution.id, "OPEN");
    const factSource = await addVerifiedFact(institution.id);
    await linkArticle(institution.id, "PUBLISHED");
    await linkArticle(institution.id, "DRAFT");
    await linkArticle(institution.id, "UNPUBLISHED");
    await linkArticle(institution.id, "ARCHIVED");
    const result = await getInstitutionBySlug(
      runtime.executor,
      institution.slug,
    );
    expect(result.institution.id).toBe(institution.id);
    expect(result.currentOpportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ businessState: "OPEN" }),
      ]),
    );
    expect(result.verifiedFacts[0]?.factType).toBe("TUITION");
    expect(result.verifiedFacts[0]?.verifiedAt).toBe(
      "2026-08-12T03:04:05.000Z",
    );
    expect(result.verifiedFacts[0]?.officialSource?.url).toBe(factSource.url);
    expect(result.officialSources.map((source) => source.url)).toEqual(
      expect.arrayContaining([factSource.url]),
    );
    expect(result.relatedArticles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "Related article" }),
      ]),
    );
    expect(result.indexability).toBe("INDEX");
    expect(Object.hasOwn(result, "lastVerifiedAt")).toBe(false);
    expect(result.relatedArticles).toHaveLength(1);
    assertNoForbiddenKeys(result);
  });

  it("adds only active authoritative linked legacy School sources separately from a School-less Native detail", async () => {
    const institution = await createInstitution();
    const official = await linkLegacyOfficialSource(institution.id);
    const result = await getInstitutionBySlug(
      runtime.executor,
      institution.slug,
    );
    expect(result.officialSources.map((source) => source.url)).toEqual(
      expect.arrayContaining([official.url]),
    );
  });

  it("groups verified current Opportunities deterministically and excludes non-public Institutions", async () => {
    const institution = await createInstitution();
    await createNativeOpportunity(institution.id, "OPEN");
    await createNativeOpportunity(institution.id, "UPCOMING");
    await createNativeOpportunity(institution.id, "CLOSED");
    await createNativeOpportunity(institution.id, "COMPLETED");
    await createNativeOpportunity(institution.id, "CANCELLED");
    const result = await getInstitutionBySlug(
      runtime.executor,
      institution.slug,
    );
    expect(
      result.currentOpportunities.map((item) => item.businessState),
    ).toEqual(["OPEN"]);
    expect(
      result.upcomingOpportunities.map((item) => item.businessState),
    ).toEqual(["UPCOMING"]);
    expect(
      result.recentOpportunities.map((item) => item.businessState),
    ).toEqual(["CLOSED", "COMPLETED", "CANCELLED"]);
    const hidden = await createInstitution({ state: "HIDDEN" });
    await expect(
      getInstitutionBySlug(runtime.executor, hidden.slug),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("bounds each detail section in SQL and keeps UNKNOWN neutral", async () => {
    const institution = await createInstitution();
    await Promise.all(
      Array.from({ length: 8 }, () =>
        createNativeOpportunity(institution.id, "OPEN"),
      ),
    );
    for (let index = 0; index < 8; index += 1)
      await createLegacyOpportunity(institution.id, { status: "ACTIVE" });
    const unknownInstitution = await createInstitution({
      name: `${prefix} Unknown only`,
    });
    await createNativeOpportunity(unknownInstitution.id, "UNKNOWN");
    const detail = await getInstitutionBySlug(
      runtime.executor,
      institution.slug,
    );
    expect(detail.currentOpportunities).toHaveLength(12);
    const unknown = await getInstitutionBySlug(
      runtime.executor,
      unknownInstitution.slug,
    );
    const unknownList = await listInstitutions(runtime.executor, {
      query: `${prefix} Unknown only`,
      page: 1,
      pageSize: 10,
    });
    expect(unknown.institution.currentAdmissionsState).toBeNull();
    expect(unknown.currentOpportunities).toEqual([]);
    expect(unknown.upcomingOpportunities).toEqual([]);
    expect(unknown.recentOpportunities).toEqual([]);
    expect(unknownList.items[0]?.currentAdmissionsState).toBeNull();
    expect(unknownList.items[0]?.currentOpportunity).toBeNull();
    expect(unknownList.items[0]?.lastVerifiedAt).toBeNull();
  });

  it("does not return draft or archived Institution roots", async () => {
    const name = `${prefix} Visibility boundary`;
    const published = await createInstitution({ name });
    const draft = await createInstitution({ name, state: "DRAFT" });
    const archived = await createInstitution({ name, state: "ARCHIVED" });
    const list = await listInstitutions(runtime.executor, {
      query: name,
      page: 1,
      pageSize: 50,
    });
    expect(list.pagination.total).toBe(1);
    expect(list.items.map((item) => item.id)).toContain(published.id);
    expect(list.items.map((item) => item.id)).not.toContain(draft.id);
    expect(list.items.map((item) => item.id)).not.toContain(archived.id);
    await expect(
      getInstitutionBySlug(runtime.executor, draft.slug),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getInstitutionBySlug(runtime.executor, archived.slug),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("projects Legacy OPEN, UPCOMING and CANCELLED truth through list/detail and excludes private events", async () => {
    const institution = await createInstitution({
      name: `${prefix} Legacy public`,
    });
    const open = await createLegacyOpportunity(institution.id, {
      status: "ACTIVE",
    });
    await createLegacyOpportunity(institution.id, { status: "SCHEDULED" });
    await createLegacyOpportunity(institution.id, { status: "CANCELLED" });
    const privateInstitution = await createInstitution({
      name: `${prefix} Legacy private`,
    });
    await createLegacyOpportunity(privateInstitution.id, {
      publicEvent: false,
    });
    const openList = await listInstitutions(runtime.executor, {
      recruitmentState: "OPEN",
      page: 1,
      pageSize: 10,
    });
    const upcomingList = await listInstitutions(runtime.executor, {
      recruitmentState: "UPCOMING",
      page: 1,
      pageSize: 10,
    });
    expect(openList.items.map((item) => item.id)).toContain(institution.id);
    expect(upcomingList.items.map((item) => item.id)).toContain(institution.id);
    expect(openList.items.map((item) => item.id)).not.toContain(
      privateInstitution.id,
    );
    const detail = await getInstitutionBySlug(
      runtime.executor,
      institution.slug,
    );
    expect(
      detail.currentOpportunities.map((item) => item.businessState),
    ).toContain("OPEN");
    expect(
      detail.upcomingOpportunities.map((item) => item.businessState),
    ).toContain("UPCOMING");
    expect(
      detail.recentOpportunities.map((item) => item.businessState),
    ).toContain("CANCELLED");
    expect(
      detail.currentOpportunities.find((item) => item.id === open.id)
        ?.lastVerifiedAt,
    ).toBe("2026-08-15T04:05:06.000Z");
    const privateDetail = await getInstitutionBySlug(
      runtime.executor,
      privateInstitution.slug,
    );
    expect(privateDetail.currentOpportunities).toEqual([]);
  });

  it("preserves Native and Legacy key-date semantics and rejects Legacy truth without verification freshness", async () => {
    const institution = await createInstitution({
      name: `${prefix} Key date fidelity`,
    });
    const native = await createNativeOpportunity(institution.id, "OPEN");
    const seoul = await createLegacyOpportunity(institution.id, {
      status: "ACTIVE",
      closeDate: "2026-09-02",
      closeTime: "09:30:00",
      timezone: "Asia/Seoul",
    });
    const dateOnly = await createLegacyOpportunity(institution.id, {
      status: "ACTIVE",
      closeDate: "2026-09-03",
      closeTime: null,
      timezone: "UTC",
    });
    const nullFreshnessInstitution = await createInstitution({
      name: `${prefix} Null Legacy freshness`,
    });
    const nullFreshness = await createLegacyOpportunity(
      nullFreshnessInstitution.id,
      { verifiedAt: null },
    );

    const detail = await getInstitutionBySlug(
      runtime.executor,
      institution.slug,
    );
    const cards = detail.currentOpportunities;
    expect(cards.map((card) => card.id)).toEqual([
      native.id,
      seoul.id,
      dateOnly.id,
    ]);
    expect(cards.find((card) => card.id === native.id)?.keyDate).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    expect(cards.find((card) => card.id === seoul.id)?.keyDate).toBe(
      "2026-09-02T09:30:00+09:00",
    );
    expect(cards.find((card) => card.id === dateOnly.id)?.keyDate).toBe(
      "2026-09-03",
    );

    const list = await listInstitutions(runtime.executor, {
      query: `${prefix} Key date fidelity`,
      page: 1,
      pageSize: 10,
    });
    expect(list.items[0]?.currentOpportunity?.keyDate).toBe(
      "2026-09-01T00:00:00.000Z",
    );
    const nullDetail = await getInstitutionBySlug(
      runtime.executor,
      nullFreshnessInstitution.slug,
    );
    const nullList = await listInstitutions(runtime.executor, {
      query: `${prefix} Null Legacy freshness`,
      page: 1,
      pageSize: 10,
    });
    const nullOpenList = await listInstitutions(runtime.executor, {
      query: `${prefix} Null Legacy freshness`,
      recruitmentState: "OPEN",
      page: 1,
      pageSize: 10,
    });
    expect(nullDetail.institution.currentOpportunity).toBeNull();
    expect(nullDetail.currentOpportunities).toEqual([]);
    expect(nullDetail.upcomingOpportunities).toEqual([]);
    expect(nullDetail.recentOpportunities).toEqual([]);
    expect(nullList.items[0]?.currentOpportunity).toBeNull();
    expect(nullList.items[0]?.lastVerifiedAt).toBeNull();
    expect(nullOpenList.items).toEqual([]);
    expect(nullOpenList.pagination.total).toBe(0);
    expect(cards.map((card) => card.id)).not.toContain(nullFreshness.id);
  });

  it("excludes unverified Facts and discovery-only Fact/binding sources while retaining the Fact safely", async () => {
    const institution = await createInstitution();
    await addVerifiedFact(institution.id);
    const discovery = await addFactTrustFixtures(institution.id);
    const official = await linkLegacyOfficialSource(institution.id);
    const linked =
      await runtime.client`select school_id as "schoolId" from institution_school_links where institution_id=${institution.id}`;
    const inactive = await createSource();
    const bindingDiscovery = await createSource({
      sourceType: "THIRD_PARTY_DISCOVERY",
      authority: "DISCOVERY_ONLY",
    });
    await runtime.client`insert into source_bindings (source_id, school_id, source_role, priority, is_active) values (${inactive.id}, ${linked[0]?.schoolId}, 'NOTICE_BOARD', 2, false), (${bindingDiscovery.id}, ${linked[0]?.schoolId}, 'DISCOVERY', 3, true)`;
    const detail = await getInstitutionBySlug(
      runtime.executor,
      institution.slug,
    );
    expect(detail.verifiedFacts.map((fact) => fact.displayValue)).not.toContain(
      "Unverified fact",
    );
    expect(
      detail.verifiedFacts.find(
        (fact) => fact.displayValue === "Discovery fact",
      )?.officialSource,
    ).toBeNull();
    expect(detail.officialSources.map((source) => source.url)).toContain(
      official.url,
    );
    expect(detail.officialSources.map((source) => source.url)).not.toContain(
      discovery.url,
    );
    expect(detail.officialSources.map((source) => source.url)).not.toContain(
      inactive.url,
    );
    expect(detail.officialSources.map((source) => source.url)).not.toContain(
      bindingDiscovery.url,
    );
  });

  it("keeps native card freshness version-scoped and makes no operational writes", async () => {
    const institution = await createInstitution({
      name: `${prefix} Freshness`,
    });
    const native = await createNativeOpportunity(institution.id, "OPEN");
    const before =
      await runtime.client`select (select count(*) from audit_logs) as audit, (select count(*) from outbox_events) as outbox, (select count(*) from notifications) as notification`;
    await runtime.client`update institutions set updated_at='2099-01-01T00:00:00.000Z' where id=${institution.id}`;
    await runtime.client`update opportunities set updated_at='2099-01-01T00:00:00.000Z' where id=${native.id}`;
    await runtime.client`insert into source_observations (source_id, observed_at, outcome) values (${native.source.id}, '2099-01-02T00:00:00.000Z', 'CHANGED')`;
    const list = await listInstitutions(runtime.executor, {
      query: `${prefix} Freshness`,
      page: 1,
      pageSize: 10,
    });
    const detail = await getInstitutionBySlug(
      runtime.executor,
      institution.slug,
    );
    const expected = "2026-08-11T02:03:04.000Z";
    expect(list.items[0]?.lastVerifiedAt).toBe(expected);
    expect(detail.institution.lastVerifiedAt).toBe(expected);
    const after =
      await runtime.client`select (select count(*) from audit_logs) as audit, (select count(*) from outbox_events) as outbox, (select count(*) from notifications) as notification`;
    expect(after).toEqual(before);
  });
});
