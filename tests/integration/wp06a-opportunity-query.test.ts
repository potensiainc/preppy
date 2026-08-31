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
  getOpportunityBySlug,
  getRelatedArticles,
} from "@/src/modules/public/opportunity-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp06a-opportunity-query-${randomUUID()}`;
const nativeCorrectionOpportunityIds = new Set<string>();
const nativeCorrectionVersionIds = new Set<string>();
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

type NativeFixture = {
  opportunityId: string;
  opportunitySlug: string;
  versionId: string;
  verifiedAt: string;
  sourceId: string;
};

type LegacyFixture = {
  opportunityId: string;
  opportunitySlug: string;
  eventId: string;
  eventVersionId: string;
  verifiedAt: string;
  sourceId: string;
};

function iso(value: string): string {
  return new Date(value).toISOString();
}

function assertNoForbiddenKeys(value: unknown): void {
  const forbidden = new Set([
    "truthMode",
    "legacySchoolId",
    "admissionEventId",
    "admissionCycleId",
    "legacyMeaningfulChangeId",
    "legacyAdmissionEventId",
    "adminUserId",
    "audit",
    "outbox",
    "email",
    "userId",
    "providerMessageId",
    "isFollowed",
  ]);

  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenKeys);
    return;
  }

  if (value === null || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    expect(forbidden.has(key), `forbidden public key: ${key}`).toBe(false);
    assertNoForbiddenKeys(nested);
  }
}

async function insertInstitution({
  publicationState = "PUBLISHED",
  slug = `${prefix}-institution-${randomUUID()}`,
}: {
  publicationState?: "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
  slug?: string;
} = {}) {
  const id = randomUUID();
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, publication_state, region_code,
      short_description, published_at
    ) values (
      ${id}, ${slug}, 'WP-06A Opportunity Institution',
      'INTERNATIONAL_SCHOOL', ${publicationState}, 'SEOUL',
      'A meaningful public institution profile.',
      ${publicationState === "PUBLISHED" ? "2026-08-01T00:00:00.000Z" : null}
    )
  `;
  return { id, slug };
}

async function insertSource({
  sourceType = "OFFICIAL_ADMISSION_PAGE",
  authorityLevel = "PRIMARY",
  sourceName = "Canonical official source",
}: {
  sourceType?: "OFFICIAL_ADMISSION_PAGE" | "THIRD_PARTY_DISCOVERY";
  authorityLevel?: "PRIMARY" | "SECONDARY_OFFICIAL" | "DISCOVERY_ONLY";
  sourceName?: string;
} = {}) {
  const id = randomUUID();
  const url = `https://source.example.test/${prefix}/${id}`;
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status, source_name
    ) values (
      ${id}, ${url}, ${sourceType}, ${authorityLevel}, 'ACTIVE', ${sourceName}
    )
  `;
  await runtime.client`
    insert into source_monitor_configs (
      source_id, collection_strategy, monitoring_profile, is_enabled
    ) values (${id}, 'HTTP', 'STANDARD_SEASONAL', true)
  `;
  return { id, url, sourceName, authorityLevel };
}

async function insertPublishedArticle({
  status = "PUBLISHED",
  title = "Published related article",
}: {
  status?: "DRAFT" | "PUBLISHED";
  title?: string;
} = {}) {
  const id = randomUUID();
  const slug = `${prefix}-article-${id}`;
  await runtime.client`
    insert into articles (
      id, slug, type, category, status, title, excerpt, content_html,
      robots_index, robots_follow, published_at
    ) values (
      ${id}, ${slug}, 'GUIDE', 'ADMISSIONS_GENERAL', ${status}, ${title},
      'A public article excerpt.', '<p>Stored article body.</p>', true, true,
      ${status === "PUBLISHED" ? "2026-08-10T00:00:00.000Z" : null}
    )
  `;
  return { id, slug, title };
}

async function createNativeFixture({
  state = "OPEN",
  title = "Equivalent public opportunity",
  actionable = true,
  institutionPublicationState = "PUBLISHED",
}: {
  state?: "UPCOMING" | "OPEN" | "CLOSED" | "COMPLETED" | "CANCELLED";
  title?: string;
  actionable?: boolean;
  institutionPublicationState?: "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
} = {}): Promise<NativeFixture> {
  const institution = await insertInstitution({
    publicationState: institutionPublicationState,
  });
  const opportunityId = randomUUID();
  const opportunitySlug = `${prefix}-native-${opportunityId}`;
  const versionId = randomUUID();
  const verifiedAt = "2026-08-12T03:04:05.000Z";
  const source = await insertSource();
  const discovery = await insertSource({
    sourceType: "THIRD_PARTY_DISCOVERY",
    authorityLevel: "DISCOVERY_ONLY",
    sourceName: "Discovery-only source",
  });

  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state, published_at
      ) values (
        ${opportunityId}, ${institution.id}, ${opportunitySlug}, 'APPLICATION',
        'NATIVE', 'PUBLISHED', '2026-08-10T00:00:00.000Z'
      )
    `;
    await transaction`
      insert into opportunity_versions (
        id, opportunity_id, truth_mode, version_number, verification_state,
        business_state, is_current, title, summary, target_audience,
        event_start_at, event_end_at, application_open_at, application_close_at,
        action_url, verified_at
      ) values (
        ${versionId}, ${opportunityId}, 'NATIVE', 1, 'VERIFIED', ${state}, true,
        ${title}, ${actionable ? "A unique actionable summary." : null},
        ${actionable ? "Families applying for 2027." : null},
        ${actionable ? "2026-09-01T01:02:03.000Z" : null},
        ${actionable ? "2026-09-01T03:04:05.000Z" : null},
        ${actionable ? "2026-08-20T00:00:00.000Z" : null},
        ${actionable ? "2026-08-31T23:59:59.000Z" : null},
        ${actionable ? "https://apply.example.test/native" : null}, ${verifiedAt}
      )
    `;
    await transaction`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, evidence_role
      ) values
        (${versionId}, ${source.id}, 'PRIMARY'),
        (${versionId}, ${discovery.id}, 'DISCOVERY')
    `;
  });

  return {
    opportunityId,
    opportunitySlug,
    versionId,
    verifiedAt,
    sourceId: source.id,
  };
}

async function insertNativeCorrectionOpportunity({
  institutionId,
  slug,
  kind,
  title,
  publicationState = "PUBLISHED",
  verificationState = "VERIFIED",
  eventStartAt = null,
}: {
  institutionId: string;
  slug: string;
  kind: "RECRUITMENT" | "LOTTERY" | "INFORMATION_SESSION";
  title: string;
  publicationState?: "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
  verificationState?: "UNVERIFIED" | "VERIFIED";
  eventStartAt?: string | null;
}) {
  const opportunityId = randomUUID();
  const versionId = randomUUID();
  const source = await insertSource({ sourceName: `${title} official PDF` });
  const supporting = await insertSource({
    sourceName: `${title} admission notice`,
    authorityLevel: "SECONDARY_OFFICIAL",
  });
  const snapshotId = randomUUID();
  await runtime.client`
    insert into source_snapshots (
      id, source_id, captured_at, content_hash, normalized_text
    ) values (
      ${snapshotId}, ${source.id}, '2026-08-24T01:30:00.000Z',
      ${`guide-${snapshotId}`}, 'Official guide source text'
    )
  `;
  const [observation] = await runtime.client<{ id: bigint }[]>`
    insert into source_observations (source_id, observed_at, outcome, snapshot_id)
    values (${source.id}, '2026-08-24T01:30:00.000Z', 'SUCCESS', ${snapshotId})
    returning id
  `;
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state, published_at
      ) values (
        ${opportunityId}, ${institutionId}, ${slug}, ${kind}, 'NATIVE',
        ${publicationState},
        ${publicationState === "PUBLISHED" ? "2026-08-24T00:00:00.000Z" : null}
      )
    `;
    await transaction`
      insert into opportunity_versions (
        id, opportunity_id, truth_mode, version_number, verification_state,
        business_state, is_current, title, summary, verified_at, event_start_at
      ) values (
        ${versionId}, ${opportunityId}, 'NATIVE', 1, ${verificationState}, 'OPEN',
        ${verificationState === "VERIFIED"}, ${title},
        '[지원 대상 및 모집인원]\\n초등 과정 84명',
        ${verificationState === "VERIFIED" ? "2026-08-25T02:30:00.000Z" : null}, ${eventStartAt}
      )
    `;
    await transaction`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, source_observation_id, source_snapshot_id, evidence_role
      ) values
        (${versionId}, ${source.id}, ${String(observation!.id)}, ${snapshotId}, 'PRIMARY'),
        (${versionId}, ${supporting.id}, null, null, 'SUPPORTING')
    `;
  });
  nativeCorrectionOpportunityIds.add(opportunityId);
  nativeCorrectionVersionIds.add(versionId);
  return { opportunityId, slug, versionId, source, supporting };
}

async function createNativeCorrectionFixture({
  mainKind = "RECRUITMENT",
  mainPublicationState = "PUBLISHED",
  mainVerificationState = "VERIFIED",
  includeMain = true,
  year = "2027",
}: {
  mainKind?: "RECRUITMENT" | "LOTTERY";
  mainPublicationState?: "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
  mainVerificationState?: "UNVERIFIED" | "VERIFIED";
  includeMain?: boolean;
  year?: string;
} = {}) {
  const institution = await insertInstitution();
  const mainSlug = `live-admissions-${institution.id}-${year}`;
  const child = await insertNativeCorrectionOpportunity({
    institutionId: institution.id,
    slug: `${mainSlug}-event-session-1`,
    kind: "INFORMATION_SESSION",
    title: "2027학년도 입학설명회",
    eventStartAt: "2026-10-31T01:00:00Z",
  });
  const main = includeMain
    ? await insertNativeCorrectionOpportunity({
        institutionId: institution.id,
        slug: mainSlug,
        kind: mainKind,
        title: "2027학년도 신입생 모집요강",
        publicationState: mainPublicationState,
        verificationState: mainVerificationState,
      })
    : null;
  return { institution, year, mainSlug, child, main };
}

async function createLegacyFixture({
  eventPublic = true,
}: {
  eventPublic?: boolean;
} = {}): Promise<LegacyFixture> {
  const institution = await insertInstitution();
  const schoolId = randomUUID();
  const cycleId = randomUUID();
  const eventId = randomUUID();
  const opportunityId = randomUUID();
  const opportunitySlug = `${prefix}-legacy-${opportunityId}`;
  const eventVersionId = randomUUID();
  const verifiedAt = "2026-08-12T03:04:05.000Z";
  const source = await insertSource();
  const discovery = await insertSource({
    sourceType: "THIRD_PARTY_DISCOVERY",
    authorityLevel: "DISCOVERY_ONLY",
    sourceName: "Legacy discovery-only source",
  });

  await runtime.client`
    insert into schools (
      id, slug, canonical_name, school_type, lifecycle_status, country_code, is_public
    ) values (
      ${schoolId}, ${`${prefix}-school-${schoolId}`}, 'Legacy Source School',
      'INTERNATIONAL_SCHOOL', 'ACTIVE', 'KR', true
    )
  `;
  await runtime.client`
    insert into institution_school_links (institution_id, school_id, link_reason)
    values (${institution.id}, ${schoolId}, 'WP-06A test bridge')
  `;
  await runtime.client`
    insert into source_bindings (
      source_id, school_id, source_role, priority, is_active
    ) values (${source.id}, ${schoolId}, 'PRIMARY_ADMISSIONS', 1, true)
  `;
  await runtime.client`
    insert into admission_cycles (
      id, school_id, academic_year, lifecycle_status, admission_mode
    ) values (${cycleId}, ${schoolId}, 2027, 'ACTIVE', 'FIXED_WINDOW')
  `;
  await runtime.client`
    insert into admission_events (
      id, admission_cycle_id, event_key, event_type, occurrence_no,
      canonical_title, audience_summary, is_public
    ) values (
      ${eventId}, ${cycleId}, ${`legacy-${eventId}`}, 'APPLICATION', 1,
      'Legacy canonical title is intentionally different', 'Families applying for 2027.', ${eventPublic}
    )
  `;
  await runtime.client`
    insert into admission_event_versions (
      id, admission_event_id, version_no, is_current, verification_status,
      knowledge_state, event_status, display_title, event_start_date, event_start_time,
      event_end_date, event_end_time, registration_open_date, registration_open_time,
      registration_close_date, registration_close_time, timezone, action_url, official_notes,
      verified_at
    ) values (
      ${eventVersionId}, ${eventId}, 1, true, 'VERIFIED', 'KNOWN', 'ACTIVE',
      'Equivalent public opportunity', '2026-09-01', '10:02:03',
      '2026-09-01', '12:04:05', '2026-08-20', '09:00:00',
      '2026-08-31', '08:59:59', 'Asia/Seoul', 'https://apply.example.test/native',
      'A unique actionable summary.', ${verifiedAt}
    )
  `;
  await runtime.client`
    insert into event_version_evidence (
      event_version_id, source_id, is_primary
    ) values
      (${eventVersionId}, ${source.id}, true),
      (${eventVersionId}, ${discovery.id}, false)
  `;
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state, published_at
      ) values (
        ${opportunityId}, ${institution.id}, ${opportunitySlug}, 'APPLICATION',
        'LEGACY_BACKED', 'PUBLISHED', '2026-08-10T00:00:00.000Z'
      )
    `;
    await transaction`
      insert into opportunity_admission_event_links (
        opportunity_id, institution_id, truth_mode, admission_event_id,
        admission_cycle_id, school_id
      ) values (
        ${opportunityId}, ${institution.id}, 'LEGACY_BACKED', ${eventId},
        ${cycleId}, ${schoolId}
      )
    `;
  });

  return {
    opportunityId,
    opportunitySlug,
    eventId,
    eventVersionId,
    verifiedAt,
    sourceId: source.id,
  };
}

async function cleanupFixtures(): Promise<void> {
  const createdNativeOpportunityIds = [...nativeCorrectionOpportunityIds];
  const createdNativeVersionIds = [...nativeCorrectionVersionIds];
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    if (createdNativeOpportunityIds.length > 0) {
      await transaction`
        delete from opportunity_changes
        where opportunity_id = any(${createdNativeOpportunityIds}::uuid[])
      `;
      await transaction`
        delete from opportunity_version_evidence
        where opportunity_version_id = any(${createdNativeVersionIds}::uuid[])
      `;
      await transaction`
        delete from opportunity_source_bindings
        where opportunity_id = any(${createdNativeOpportunityIds}::uuid[])
      `;
      await transaction`
        delete from opportunity_admission_event_links
        where opportunity_id = any(${createdNativeOpportunityIds}::uuid[])
      `;
      await transaction`
        delete from opportunity_versions
        where id = any(${createdNativeVersionIds}::uuid[])
      `;
      await transaction`
        delete from opportunities
        where id = any(${createdNativeOpportunityIds}::uuid[])
      `;
    }
    await transaction`
      delete from article_opportunities
      where article_id in (select id from articles where slug like ${`${prefix}%`})
    `;
    await transaction`delete from articles where slug like ${`${prefix}%`}`;
    await transaction`
      delete from opportunity_changes
      where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`})
    `;
    await transaction`
      delete from opportunity_version_evidence
      where opportunity_version_id in (
        select id from opportunity_versions where opportunity_id in (
          select id from opportunities where slug like ${`${prefix}%`}
        )
      )
    `;
    await transaction`
      delete from opportunity_source_bindings
      where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`})
    `;
    await transaction`
      delete from event_version_evidence
      where event_version_id in (
        select version.id from admission_event_versions as version
        join admission_events as event on event.id = version.admission_event_id
        where event.event_key like ${`${prefix}%`}
      )
    `;
    await transaction`
      delete from source_observations
      where source_id in (
        select id from sources where canonical_url like ${`https://source.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from source_snapshots
      where source_id in (
        select id from sources where canonical_url like ${`https://source.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from opportunity_versions
      where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`})
    `;
    await transaction`
      delete from opportunity_admission_event_links
      where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`})
    `;
    await transaction`delete from opportunities where slug like ${`${prefix}%`}`;
    await transaction`
      delete from admission_event_versions
      where admission_event_id in (
        select id from admission_events where event_key like ${`${prefix}%`}
      )
    `;
    await transaction`delete from admission_events where event_key like ${`${prefix}%`}`;
    await transaction`
      delete from admission_cycles
      where school_id in (select id from schools where slug like ${`${prefix}%`})
    `;
    await transaction`
      delete from institution_school_links
      where school_id in (select id from schools where slug like ${`${prefix}%`})
    `;
    await transaction`
      delete from source_bindings
      where school_id in (select id from schools where slug like ${`${prefix}%`})
    `;
    await transaction`delete from schools where slug like ${`${prefix}%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}%`}`;
    await transaction`
      delete from source_monitor_configs
      where source_id in (
        select id from sources where canonical_url like ${`https://source.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from sources
      where canonical_url like ${`https://source.example.test/${prefix}/%`}
    `;
  });

  if (createdNativeOpportunityIds.length > 0) {
    const remaining = await runtime.client<{ count: string }[]>`
      select count(*)::text as count from opportunities
      where id = any(${createdNativeOpportunityIds}::uuid[])
    `;
    expect(Number(remaining[0]!.count)).toBe(0);
    const remainingVersions = await runtime.client<{ count: string }[]>`
      select count(*)::text as count from opportunity_versions
      where id = any(${createdNativeVersionIds}::uuid[])
    `;
    expect(Number(remainingVersions[0]!.count)).toBe(0);
    const remainingEvidence = await runtime.client<{ count: string }[]>`
      select count(*)::text as count from opportunity_version_evidence
      where opportunity_version_id = any(${createdNativeVersionIds}::uuid[])
    `;
    expect(Number(remainingEvidence[0]!.count)).toBe(0);
  }
  nativeCorrectionOpportunityIds.clear();
  nativeCorrectionVersionIds.clear();
}

describe("WP-06A canonical Opportunity query", () => {
  it("projects only public official verified exact-cycle siblings with canonical dates and no private identifiers", async () => {
    const fixture = await createNativeCorrectionFixture();
    const second = await insertNativeCorrectionOpportunity({
      institutionId: fixture.institution.id,
      slug: `${fixture.mainSlug}-event-session-2`,
      kind: "INFORMATION_SESSION",
      title: "오후 설명회",
      eventStartAt: "2026-10-31T05:00:00Z",
    });
    for (const [suffix, publicationState, verificationState] of [
      ["draft", "DRAFT", "VERIFIED"],
      ["hidden", "HIDDEN", "VERIFIED"],
      ["unverified", "DRAFT", "UNVERIFIED"],
    ] as const)
      await insertNativeCorrectionOpportunity({
        institutionId: fixture.institution.id,
        slug: `${fixture.mainSlug}-event-${suffix}`,
        kind: "INFORMATION_SESSION",
        title: suffix,
        publicationState,
        verificationState,
      });
    const sourceLess = await insertNativeCorrectionOpportunity({
      institutionId: fixture.institution.id,
      slug: `${fixture.mainSlug}-event-source-less`,
      kind: "INFORMATION_SESSION",
      title: "no official source",
      publicationState: "DRAFT",
    });
    await runtime.client`delete from opportunity_version_evidence where opportunity_version_id=${sourceLess.versionId}`;
    await insertNativeCorrectionOpportunity({
      institutionId: fixture.institution.id,
      slug: `live-admissions-${fixture.institution.id}-2028-event-session-1`,
      kind: "INFORMATION_SESSION",
      title: "different year",
    });
    await insertNativeCorrectionOpportunity({
      institutionId: fixture.institution.id,
      slug: `${fixture.mainSlug}-extra-event-session-1`,
      kind: "INFORMATION_SESSION",
      title: "malformed identity",
    });
    const other = await createNativeCorrectionFixture();
    await insertNativeCorrectionOpportunity({
      institutionId: other.institution.id,
      slug: `${fixture.mainSlug}-event-other-school`,
      kind: "INFORMATION_SESSION",
      title: "different institution",
    });
    for (const slug of [fixture.mainSlug, fixture.child.slug, second.slug]) {
      const result = await getOpportunityBySlug(runtime.executor, slug);
      expect(result.academicYearLabel).toBe("2027학년도");
      expect(result.relatedAdmissions?.map((row) => row.slug)).toEqual([
        fixture.child.slug,
        second.slug,
      ]);
      expect(
        result.relatedAdmissions?.map((row) => row.keyDates.eventStartsAt),
      ).toEqual(["2026-10-31T01:00:00.000Z", "2026-10-31T05:00:00.000Z"]);
      expect(
        result.relatedAdmissions?.every(
          (row) => row.keyDates.eventEndsAt === null,
        ),
      ).toBe(true);
      for (const row of result.relatedAdmissions ?? [])
        expect(Object.keys(row).sort()).toEqual([
          "businessState",
          "keyDates",
          "kind",
          "slug",
          "title",
        ]);
      assertNoForbiddenKeys(result);
    }
  });

  it("does not guess a cycle or academic year from legacy, malformed, or current-token titles", async () => {
    const legacy = await createLegacyFixture();
    const native = await createNativeFixture({ title: "2027학년도 모집" });
    const current = await createNativeCorrectionFixture({ year: "current" });
    for (const slug of [legacy.opportunitySlug, native.opportunitySlug]) {
      await expect(
        getOpportunityBySlug(runtime.executor, slug),
      ).resolves.toMatchObject({
        academicYearLabel: null,
        relatedAdmissions: [],
      });
    }
    await expect(
      getOpportunityBySlug(runtime.executor, current.child.slug),
    ).resolves.toMatchObject({ academicYearLabel: null });
  });

  beforeAll(async () => {
    await schemaLockSql`
      select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
    `;
    await migrateDatabase(databaseUrl);
  });

  afterEach(cleanupFixtures);

  afterAll(async () => {
    await schemaLockSql`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
    await schemaLockSql.end({ timeout: 5 });
    await closeRuntimeDatabase();
  });

  it("projects equivalent Native and Legacy current verified truth into one public shape", async () => {
    const native = await createNativeFixture();
    const legacy = await createLegacyFixture();

    const nativeResult = await getOpportunityBySlug(
      runtime.executor,
      native.opportunitySlug,
    );
    const legacyResult = await getOpportunityBySlug(
      runtime.executor,
      legacy.opportunitySlug,
    );

    expect(Object.keys(nativeResult).sort()).toEqual(
      Object.keys(legacyResult).sort(),
    );
    expect(nativeResult).toMatchObject({
      title: "Equivalent public opportunity",
      businessState: "OPEN",
      keyDates: {
        eventStartsAt: "2026-09-01T01:02:03.000Z",
        eventEndsAt: "2026-09-01T03:04:05.000Z",
        applicationOpensAt: "2026-08-20T00:00:00.000Z",
        applicationClosesAt: "2026-08-31T23:59:59.000Z",
      },
      lastVerifiedAt: iso(native.verifiedAt),
      officialSource: {
        name: "Canonical official source",
        authorityLevel: "PRIMARY",
      },
      indexability: "INDEX",
    });
    expect(legacyResult).toMatchObject({
      title: "Equivalent public opportunity",
      businessState: "OPEN",
      keyDates: {
        eventStartsAt: "2026-09-01T10:02:03+09:00",
        eventEndsAt: "2026-09-01T12:04:05+09:00",
        applicationOpensAt: "2026-08-20T09:00:00+09:00",
        applicationClosesAt: "2026-08-31T08:59:59+09:00",
      },
      lastVerifiedAt: iso(legacy.verifiedAt),
      officialSource: {
        name: "Canonical official source",
        authorityLevel: "PRIMARY",
      },
      indexability: "INDEX",
    });
    expect(nativeResult.officialSources).toEqual([nativeResult.officialSource]);
    const supplementary = await insertSource({
      sourceName: "Registration and fee guide",
    });
    await runtime.client`insert into opportunity_version_evidence (opportunity_version_id, source_id, evidence_role)
      values (${native.versionId}, ${supplementary.id}, 'SUPPORTING')`;
    const supplemented = await getOpportunityBySlug(
      runtime.executor,
      native.opportunitySlug,
    );
    expect(supplemented.officialSources).toHaveLength(2);
    expect(
      supplemented.officialSources?.map((source) => source.name),
    ).toContain("Registration and fee guide");
    expect(supplemented.officialSource).toEqual(nativeResult.officialSource);
    expect(nativeResult.officialSource?.url).toContain("source.example.test");
    expect(legacyResult.officialSource?.url).toContain("source.example.test");
    expect(nativeResult.institution.followable).toBe(true);
    expect(legacyResult.institution.followable).toBe(true);
    assertNoForbiddenKeys(nativeResult);
    assertNoForbiddenKeys(legacyResult);
  });

  it("uses current verified timestamps and evidence-derived authoritative sources only", async () => {
    const native = await createNativeFixture();
    const legacy = await createLegacyFixture();

    await runtime.client`
      update opportunities set updated_at = '2099-01-01T00:00:00.000Z'
      where id in (${native.opportunityId}, ${legacy.opportunityId})
    `;
    await runtime.client`
      insert into source_observations (source_id, observed_at, outcome)
      values (${native.sourceId}, '2099-01-02T00:00:00.000Z', 'CHANGED')
    `;
    await runtime.client`
      insert into source_observations (source_id, observed_at, outcome)
      values (${legacy.sourceId}, '2099-01-02T00:00:00.000Z', 'CHANGED')
    `;

    await expect(
      getOpportunityBySlug(runtime.executor, native.opportunitySlug),
    ).resolves.toMatchObject({
      lastVerifiedAt: iso(native.verifiedAt),
      officialSource: {
        name: "Canonical official source",
        authorityLevel: "PRIMARY",
      },
    });
    await expect(
      getOpportunityBySlug(runtime.executor, legacy.opportunitySlug),
    ).resolves.toMatchObject({
      lastVerifiedAt: iso(legacy.verifiedAt),
      officialSource: {
        name: "Canonical official source",
        authorityLevel: "PRIMARY",
      },
    });
  });

  it("attaches the exact native canonical main guide to a native child event and does not duplicate it on the main page", async () => {
    const fixture = await createNativeCorrectionFixture({
      mainKind: "LOTTERY",
    });

    await expect(
      getOpportunityBySlug(runtime.executor, fixture.child.slug),
    ).resolves.toMatchObject({
      admissionGuide: {
        title: "2027학년도 신입생 모집요강",
        slug: fixture.mainSlug,
        summary: "[지원 대상 및 모집인원]\\n초등 과정 84명",
        officialSources: [
          { name: "2027학년도 신입생 모집요강 official PDF" },
          { name: "2027학년도 신입생 모집요강 admission notice" },
        ],
        lastCollectedAt: "2026-08-24T01:30:00.000Z",
        lastVerifiedAt: "2026-08-25T02:30:00.000Z",
      },
    });
    await expect(
      getOpportunityBySlug(runtime.executor, fixture.mainSlug),
    ).resolves.toMatchObject({ admissionGuide: null });
  });

  it("rejects native guides with mismatched institution or year identity and non-public or unverified truth", async () => {
    const missingYear = await createNativeCorrectionFixture({
      includeMain: false,
    });
    await insertNativeCorrectionOpportunity({
      institutionId: missingYear.institution.id,
      slug: `live-admissions-${missingYear.institution.id}-2028`,
      kind: "RECRUITMENT",
      title: "2028학년도 신입생 모집요강",
    });

    const otherInstitution = await insertInstitution();
    const mismatchedChild = await insertNativeCorrectionOpportunity({
      institutionId: missingYear.institution.id,
      slug: `live-admissions-${otherInstitution.id}-2027-event-session-2`,
      kind: "INFORMATION_SESSION",
      title: "Institution mismatch child",
    });
    await insertNativeCorrectionOpportunity({
      institutionId: otherInstitution.id,
      slug: `live-admissions-${otherInstitution.id}-2027`,
      kind: "RECRUITMENT",
      title: "Other institution main guide",
    });

    const hidden = await createNativeCorrectionFixture({
      mainPublicationState: "HIDDEN",
    });
    const unverified = await createNativeCorrectionFixture({
      mainPublicationState: "DRAFT",
      mainVerificationState: "UNVERIFIED",
    });

    await expect(
      getOpportunityBySlug(runtime.executor, missingYear.child.slug),
    ).resolves.toMatchObject({ admissionGuide: null });
    await expect(
      getOpportunityBySlug(runtime.executor, mismatchedChild.slug),
    ).resolves.toMatchObject({ admissionGuide: null });
    await expect(
      getOpportunityBySlug(runtime.executor, hidden.child.slug),
    ).resolves.toMatchObject({ admissionGuide: null });
    await expect(
      getOpportunityBySlug(runtime.executor, unverified.child.slug),
    ).resolves.toMatchObject({ admissionGuide: null });
  });

  it("resolves the exact native current token without falling back to a numbered year", async () => {
    const current = await createNativeCorrectionFixture({ year: "current" });
    const noFallback = await createNativeCorrectionFixture({
      year: "current",
      includeMain: false,
    });
    await insertNativeCorrectionOpportunity({
      institutionId: noFallback.institution.id,
      slug: `live-admissions-${noFallback.institution.id}-2026`,
      kind: "RECRUITMENT",
      title: "2026학년도 신입생 모집요강",
    });

    await expect(
      getOpportunityBySlug(runtime.executor, current.child.slug),
    ).resolves.toMatchObject({
      admissionGuide: { slug: current.mainSlug },
    });
    await expect(
      getOpportunityBySlug(runtime.executor, noFallback.child.slug),
    ).resolves.toMatchObject({ admissionGuide: null });
  });

  it("uses only bounded deterministic canonical changes and published related Articles", async () => {
    const native = await createNativeFixture();
    const legacy = await createLegacyFixture();
    const publishedArticle = await insertPublishedArticle();
    const draftArticle = await insertPublishedArticle({ status: "DRAFT" });

    await runtime.client`
      insert into article_opportunities (article_id, opportunity_id, sort_order)
      values
        (${publishedArticle.id}, ${native.opportunityId}, 2),
        (${draftArticle.id}, ${native.opportunityId}, 1)
    `;
    await runtime.client`
      insert into opportunity_changes (
        id, opportunity_id, truth_mode, change_type, materiality,
        to_native_version_id, summary, verified_at, published_at, dedupe_key
      ) values
        (
          ${randomUUID()}, ${native.opportunityId}, 'NATIVE', 'NEW_OPPORTUNITY',
          'NOTIFIABLE', ${native.versionId}, 'Earlier canonical change.',
          '2026-08-13T00:00:00.000Z', '2026-08-13T00:00:00.000Z',
          ${`${prefix}-change-earlier-${randomUUID()}`}
        ),
        (
          ${randomUUID()}, ${native.opportunityId}, 'NATIVE', 'NEW_OPPORTUNITY',
          'NOTIFIABLE', ${native.versionId}, 'Later canonical change.',
          '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z',
          ${`${prefix}-change-later-${randomUUID()}`}
        )
    `;
    await runtime.client`
      insert into meaningful_changes (
        id, admission_cycle_id, admission_event_id, change_type, significance,
        review_status, public_summary, published_at
      )
      select ${randomUUID()}, cycle.id, event.id, 'EVENT_DATE_CHANGED', 'HIGH',
        'PUBLISHED', 'Legacy-only change must not leak.', '2026-08-15T00:00:00.000Z'
      from admission_events as event
      join admission_cycles as cycle on cycle.id = event.admission_cycle_id
      where event.id = ${legacy.eventId}
    `;

    const result = await getOpportunityBySlug(
      runtime.executor,
      native.opportunitySlug,
    );
    expect(result.recentMeaningfulChanges).toEqual([
      {
        occurredAt: "2026-08-14T00:00:00.000Z",
        summary: "Later canonical change.",
      },
      {
        occurredAt: "2026-08-13T00:00:00.000Z",
        summary: "Earlier canonical change.",
      },
    ]);
    expect(result.relatedArticles).toEqual([
      expect.objectContaining({
        id: publishedArticle.id,
        title: publishedArticle.title,
      }),
    ]);
    await expect(
      getRelatedArticles(runtime.executor, {
        opportunityId: native.opportunityId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: publishedArticle.id,
        title: publishedArticle.title,
      }),
    ]);
    await expect(
      getOpportunityBySlug(runtime.executor, legacy.opportunitySlug),
    ).resolves.toMatchObject({ recentMeaningfulChanges: [] });
  });

  it("hides non-public or invalid truth and keeps public thin and closed canonical records indexability-correct", async () => {
    const draft = await createNativeFixture();
    const parentHidden = await createNativeFixture({
      institutionPublicationState: "HIDDEN",
    });
    const thin = await createNativeFixture({ actionable: false });
    const closed = await createNativeFixture({ state: "CLOSED" });
    const legacyPrivateTruth = await createLegacyFixture({
      eventPublic: false,
    });

    await runtime.client`
      update opportunities set publication_state = 'DRAFT'
      where id = ${draft.opportunityId}
    `;
    const invalidInstitution = await insertInstitution();
    const invalidOpportunityId = randomUUID();
    const invalidSlug = `${prefix}-invalid-legacy-${invalidOpportunityId}`;
    await runtime.client.begin(async (transaction) => {
      await transaction.unsafe("set local session_replication_role = replica");
      await transaction`
        insert into opportunities (
          id, institution_id, slug, kind, truth_mode, publication_state, published_at
        ) values (
          ${invalidOpportunityId}, ${invalidInstitution.id}, ${invalidSlug}, 'APPLICATION',
          'LEGACY_BACKED', 'PUBLISHED', '2026-08-10T00:00:00.000Z'
        )
      `;
    });

    await expect(
      getOpportunityBySlug(runtime.executor, `${prefix}-missing`),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getOpportunityBySlug(runtime.executor, draft.opportunitySlug),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getOpportunityBySlug(runtime.executor, parentHidden.opportunitySlug),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getOpportunityBySlug(runtime.executor, invalidSlug),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getOpportunityBySlug(
        runtime.executor,
        legacyPrivateTruth.opportunitySlug,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      getOpportunityBySlug(runtime.executor, thin.opportunitySlug),
    ).resolves.toMatchObject({ indexability: "NOINDEX" });
    await expect(
      getOpportunityBySlug(runtime.executor, closed.opportunitySlug),
    ).resolves.toMatchObject({
      businessState: "CLOSED",
      indexability: "INDEX",
    });
  });
});
