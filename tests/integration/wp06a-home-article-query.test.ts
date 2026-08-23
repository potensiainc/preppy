import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { NotFoundError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { getArticleBySlug } from "@/src/modules/public/article-query.server";
import { getHomePage } from "@/src/modules/public/home-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp06a-home-article-${randomUUID()}`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

function assertNoForbiddenKeys(value: unknown): void {
  const forbidden = new Set([
    "contentHtml",
    "storedContentHtml",
    "truthMode",
    "adminUserId",
    "authorAdminId",
    "email",
    "externalAuthSubject",
    "userId",
    "providerMessageId",
    "audit",
    "outbox",
    "notifications",
    "isFollowed",
  ]);
  if (Array.isArray(value)) return value.forEach(assertNoForbiddenKeys);
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(forbidden.has(key), `forbidden public key: ${key}`).toBe(false);
    assertNoForbiddenKeys(nested);
  }
}

async function createInstitution(
  name: string,
  state: "DRAFT" | "PUBLISHED" | "HIDDEN" | "ARCHIVED" = "PUBLISHED",
) {
  const id = randomUUID();
  const slug = `${prefix}-institution-${id}`;
  await runtime.client`
    insert into institutions (id, slug, display_name, category, publication_state, region_code, short_description, published_at)
    values (${id}, ${slug}, ${name}, 'INTERNATIONAL_SCHOOL', ${state}, 'SEOUL', 'A public profile.',
      ${state === "PUBLISHED" ? "2026-08-01T00:00:00.000Z" : null})
  `;
  return { id, slug, name };
}

async function createNativeOpportunity(
  institutionId: string,
  state: "OPEN" | "UPCOMING" | "CLOSED" | "UNKNOWN" = "OPEN",
  published = true,
) {
  const id = randomUUID();
  const versionId = randomUUID();
  const sourceId = randomUUID();
  const slug = `${prefix}-opportunity-${id}`;
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into sources (id, canonical_url, source_type, authority_level, lifecycle_status, source_name)
      values (${sourceId}, ${`https://source.example.test/${prefix}/${sourceId}`}, 'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Official')
    `;
    await transaction`
      insert into source_monitor_configs (source_id, collection_strategy, monitoring_profile, is_enabled)
      values (${sourceId}, 'HTTP', 'STANDARD_SEASONAL', true)
    `;
    await transaction`
      insert into opportunities (id, institution_id, slug, kind, truth_mode, publication_state, published_at)
      values (${id}, ${institutionId}, ${slug}, 'APPLICATION', 'NATIVE', ${published ? "PUBLISHED" : "DRAFT"},
        ${published ? "2026-08-01T00:00:00.000Z" : null})
    `;
    await transaction`
      insert into opportunity_versions (id, opportunity_id, truth_mode, version_number, verification_state, business_state, is_current, title, summary, application_close_at, action_url, verified_at)
      values (${versionId}, ${id}, 'NATIVE', 1, 'VERIFIED', ${state}, true, ${`Opportunity ${state}`},
        'Verified summary.', '2026-09-01T00:00:00.000Z', 'https://apply.example.test', '2026-08-11T02:03:04.000Z')
    `;
    await transaction`
      insert into opportunity_version_evidence (opportunity_version_id, source_id, evidence_role)
      values (${versionId}, ${sourceId}, 'PRIMARY')
    `;
  });
  return { id, slug };
}

async function createLegacyOpportunity(institutionId: string) {
  const schoolId = randomUUID();
  const cycleId = randomUUID();
  const eventId = randomUUID();
  const versionId = randomUUID();
  const sourceId = randomUUID();
  const id = randomUUID();
  const slug = `${prefix}-legacy-opportunity-${id}`;
  await runtime.client.begin(async (transaction) => {
    await transaction`insert into schools (id, slug, canonical_name, school_type, lifecycle_status, country_code, is_public) values (${schoolId}, ${`${prefix}-school-${schoolId}`}, 'Legacy school', 'INTERNATIONAL_SCHOOL', 'ACTIVE', 'KR', true)`;
    await transaction`insert into institution_school_links (institution_id, school_id, link_reason) values (${institutionId}, ${schoolId}, 'test')`;
    await transaction`insert into admission_cycles (id, school_id, academic_year, lifecycle_status, admission_mode) values (${cycleId}, ${schoolId}, 2027, 'ACTIVE', 'FIXED_WINDOW')`;
    await transaction`insert into admission_events (id, admission_cycle_id, event_key, event_type, occurrence_no, canonical_title, is_public) values (${eventId}, ${cycleId}, ${`${prefix}-event-${eventId}`}, 'APPLICATION', 1, 'Legacy opportunity', true)`;
    await transaction`insert into admission_event_versions (id, admission_event_id, version_no, is_current, verification_status, knowledge_state, event_status, display_title, registration_close_date, timezone, official_notes, verified_at) values (${versionId}, ${eventId}, 1, true, 'VERIFIED', 'KNOWN', 'ACTIVE', 'Legacy OPEN', '2026-09-02', 'Asia/Seoul', 'Verified legacy summary.', '2026-08-12T02:03:04.000Z')`;
    await transaction`insert into sources (id, canonical_url, source_type, authority_level, lifecycle_status, source_name) values (${sourceId}, ${`https://source.example.test/${prefix}/${sourceId}`}, 'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Legacy official')`;
    await transaction`insert into source_monitor_configs (source_id, collection_strategy, monitoring_profile, is_enabled) values (${sourceId}, 'HTTP', 'STANDARD_SEASONAL', true)`;
    await transaction`insert into source_bindings (source_id, school_id, source_role, priority, is_active) values (${sourceId}, ${schoolId}, 'PRIMARY_ADMISSIONS', 1, true)`;
    await transaction`insert into event_version_evidence (event_version_id, source_id, is_primary) values (${versionId}, ${sourceId}, true)`;
    await transaction`insert into opportunities (id, institution_id, slug, kind, truth_mode, publication_state, published_at) values (${id}, ${institutionId}, ${slug}, 'APPLICATION', 'LEGACY_BACKED', 'PUBLISHED', '2026-08-01T00:00:00.000Z')`;
    await transaction`insert into opportunity_admission_event_links (opportunity_id, institution_id, truth_mode, admission_event_id, admission_cycle_id, school_id) values (${id}, ${institutionId}, 'LEGACY_BACKED', ${eventId}, ${cycleId}, ${schoolId})`;
  });
  return { id, slug };
}

async function createArticle(
  status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED" = "PUBLISHED",
) {
  const id = randomUUID();
  const adminId = randomUUID();
  const slug = `${prefix}-article-${id}`;
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into admin_users (id, external_auth_subject, email, display_name, status)
      values (${adminId}, ${`${prefix}-subject-${adminId}`}, ${`${prefix}-${adminId}@example.test`}, 'Editorial Author', 'ACTIVE')
    `;
    await transaction`
      insert into articles (id, slug, type, category, status, title, excerpt, content_html, robots_index, robots_follow, author_admin_id, published_at)
      values (${id}, ${slug}, 'GUIDE', 'ADMISSIONS_GENERAL', ${status}, 'Published article', 'A concise excerpt.', '<p>Unsafe stored body</p>', true, true, ${adminId},
        ${status === "PUBLISHED" ? "2026-08-01T00:00:00.000Z" : null})
    `;
  });
  return { id, slug };
}

async function writeCounts() {
  const [row] = await runtime.client`
    select
      (select count(*)::int from audit_logs) as "auditLogs",
      (select count(*)::int from outbox_events) as "outboxEvents",
      (select count(*)::int from notifications) as "notifications"
  `;
  return row;
}

async function cleanup(): Promise<void> {
  await runtime.client.begin(async (transaction) => {
    await transaction`delete from article_institutions where article_id in (select id from articles where slug like ${`${prefix}%`})`;
    await transaction`delete from article_opportunities where article_id in (select id from articles where slug like ${`${prefix}%`})`;
    await transaction`delete from articles where slug like ${`${prefix}%`}`;
    await transaction`delete from event_version_evidence where event_version_id in (select v.id from admission_event_versions v join admission_events e on e.id = v.admission_event_id where e.event_key like ${`${prefix}%`})`;
    await transaction`delete from opportunity_admission_event_links where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`})`;
    await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select id from opportunity_versions where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`}))`;
    await transaction`delete from opportunity_versions where opportunity_id in (select id from opportunities where slug like ${`${prefix}%`})`;
    await transaction`delete from opportunities where slug like ${`${prefix}%`}`;
    await transaction`delete from admission_event_versions where admission_event_id in (select id from admission_events where event_key like ${`${prefix}%`})`;
    await transaction`delete from admission_events where event_key like ${`${prefix}%`}`;
    await transaction`delete from admission_cycles where school_id in (select id from schools where slug like ${`${prefix}%`})`;
    await transaction`delete from institution_school_links where school_id in (select id from schools where slug like ${`${prefix}%`})`;
    await transaction`delete from source_bindings where school_id in (select id from schools where slug like ${`${prefix}%`})`;
    await transaction`delete from schools where slug like ${`${prefix}%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}%`}`;
    await transaction`delete from admin_users where external_auth_subject like ${`${prefix}-%`}`;
    await transaction`delete from source_monitor_configs where source_id in (select id from sources where canonical_url like ${`https://source.example.test/${prefix}/%`})`;
    await transaction`delete from sources where canonical_url like ${`https://source.example.test/${prefix}/%`}`;
  });
}

describe("WP-06A Article and Home public queries", () => {
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

  it("returns only a published Article with explicitly unsafe stored HTML and published canonical related targets", async () => {
    const article = await createArticle();
    const publishedInstitution = await createInstitution("Article Institution");
    const hiddenInstitution = await createInstitution(
      "Hidden Institution",
      "HIDDEN",
    );
    const publishedOpportunity = await createNativeOpportunity(
      publishedInstitution.id,
    );
    const legacyOpportunity = await createLegacyOpportunity(
      publishedInstitution.id,
    );
    const hiddenOpportunity = await createNativeOpportunity(
      hiddenInstitution.id,
    );
    await runtime.client`insert into article_institutions (article_id, institution_id, sort_order) values (${article.id}, ${hiddenInstitution.id}, 1), (${article.id}, ${publishedInstitution.id}, 2)`;
    await runtime.client`insert into article_opportunities (article_id, opportunity_id, sort_order) values (${article.id}, ${hiddenOpportunity.id}, 1), (${article.id}, ${publishedOpportunity.id}, 2), (${article.id}, ${legacyOpportunity.id}, 3)`;
    const before = await writeCounts();
    const result = await getArticleBySlug(runtime.executor, article.slug);
    expect(result.unsafeStoredContentHtml).toBe("<p>Unsafe stored body</p>");
    expect(Object.hasOwn(result, "contentHtml")).toBe(false);
    expect(Object.hasOwn(result, "storedContentHtml")).toBe(false);
    expect(result.authorDisplayName).toBe("Editorial Author");
    expect(result.indexability).toBe("NOINDEX");
    expect(result.relatedInstitutions.map((item) => item.id)).toEqual([
      publishedInstitution.id,
    ]);
    expect(result.relatedOpportunities.map((item) => item.id)).toEqual([
      publishedOpportunity.id,
      legacyOpportunity.id,
    ]);
    assertNoForbiddenKeys(result);
    expect(await writeCounts()).toEqual(before);
  });

  it("treats missing and every non-published Article status as the same not-found boundary", async () => {
    for (const status of ["DRAFT", "UNPUBLISHED", "ARCHIVED"] as const) {
      const article = await createArticle(status);
      await expect(
        getArticleBySlug(runtime.executor, article.slug),
      ).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(
      getArticleBySlug(runtime.executor, `${prefix}-missing`),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("filters invalid Article relations before the public cap and preserves stable relation order", async () => {
    const article = await createArticle();
    for (let index = 0; index < 13; index += 1) {
      const hidden = await createInstitution(
        `Hidden relation ${index}`,
        "HIDDEN",
      );
      await runtime.client`insert into article_institutions (article_id, institution_id, sort_order) values (${article.id}, ${hidden.id}, ${index + 1})`;
    }
    const orderedInstitutions = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        createInstitution(`Public relation ${index}`),
      ),
    );
    for (const [index, institution] of orderedInstitutions.entries()) {
      await runtime.client`insert into article_institutions (article_id, institution_id, sort_order) values (${article.id}, ${institution.id}, ${index + 14})`;
    }
    const nullOrderInstitutions = await Promise.all([
      createInstitution("Public null relation A"),
      createInstitution("Public null relation B"),
      createInstitution("Public null relation C"),
    ]);
    for (const institution of nullOrderInstitutions) {
      await runtime.client`insert into article_institutions (article_id, institution_id) values (${article.id}, ${institution.id})`;
    }

    const invalidInstitution = await createInstitution(
      "Invalid opportunity parent",
      "HIDDEN",
    );
    for (let index = 0; index < 13; index += 1) {
      const invalid = await createNativeOpportunity(invalidInstitution.id);
      await runtime.client`insert into article_opportunities (article_id, opportunity_id, sort_order) values (${article.id}, ${invalid.id}, ${index + 1})`;
    }
    const opportunityInstitution = await createInstitution(
      "Opportunity relation parent",
    );
    const native = await createNativeOpportunity(opportunityInstitution.id);
    const legacy = await createLegacyOpportunity(opportunityInstitution.id);
    await runtime.client`insert into article_opportunities (article_id, opportunity_id, sort_order) values (${article.id}, ${native.id}, 14), (${article.id}, ${legacy.id}, 15)`;
    for (let index = 0; index < 8; index += 1) {
      const valid = await createNativeOpportunity(opportunityInstitution.id);
      await runtime.client`insert into article_opportunities (article_id, opportunity_id, sort_order) values (${article.id}, ${valid.id}, ${index + 16})`;
    }
    const nullOrderOpportunities = await Promise.all([
      createNativeOpportunity(opportunityInstitution.id),
      createNativeOpportunity(opportunityInstitution.id),
      createNativeOpportunity(opportunityInstitution.id),
    ]);
    for (const opportunity of nullOrderOpportunities) {
      await runtime.client`insert into article_opportunities (article_id, opportunity_id) values (${article.id}, ${opportunity.id})`;
    }

    const result = await getArticleBySlug(runtime.executor, article.slug);
    expect(result.relatedInstitutions).toHaveLength(12);
    expect(result.relatedInstitutions.map((item) => item.id)).toEqual([
      ...orderedInstitutions.map((item) => item.id),
      ...nullOrderInstitutions
        .map((item) => item.id)
        .sort()
        .slice(0, 2),
    ]);
    expect(result.relatedOpportunities).toHaveLength(12);
    expect(result.relatedOpportunities.map((item) => item.id)).toEqual(
      expect.arrayContaining([native.id, legacy.id]),
    );
    expect(
      result.relatedOpportunities.map((item) => item.id).slice(10),
    ).toEqual(
      nullOrderOpportunities
        .map((item) => item.id)
        .sort()
        .slice(0, 2),
    );
  });

  it("filters UNKNOWN Native Article relation truth before the public cap", async () => {
    const article = await createArticle();
    const institution = await createInstitution("Unknown relation parent");
    for (let index = 0; index < 12; index += 1) {
      const unknown = await createNativeOpportunity(institution.id, "UNKNOWN");
      await runtime.client`insert into article_opportunities (article_id, opportunity_id, sort_order) values (${article.id}, ${unknown.id}, ${index + 1})`;
    }
    const native = await createNativeOpportunity(institution.id, "OPEN");
    const legacyInstitution = await createInstitution("Legacy relation parent");
    const legacy = await createLegacyOpportunity(legacyInstitution.id);
    await runtime.client`insert into article_opportunities (article_id, opportunity_id, sort_order) values (${article.id}, ${native.id}, 13), (${article.id}, ${legacy.id}, 14)`;

    const result = await getArticleBySlug(runtime.executor, article.slug);
    expect(result.relatedOpportunities.map((item) => item.id)).toEqual([
      native.id,
      legacy.id,
    ]);
  });

  it("builds deterministic globally cache-safe Home sections from published canonical records only", async () => {
    const alpha = await createInstitution("Home Alpha");
    const beta = await createInstitution("Home Beta");
    const hidden = await createInstitution("Home Hidden", "HIDDEN");
    const open = await createNativeOpportunity(alpha.id, "OPEN");
    await createNativeOpportunity(beta.id, "UPCOMING");
    await createNativeOpportunity(hidden.id, "OPEN");
    const publishedArticle = await createArticle("PUBLISHED");
    await createArticle("DRAFT");
    const before = await writeCounts();
    const first = await getHomePage(runtime.executor);
    const second = await getHomePage(runtime.executor);
    expect(first).toEqual(second);
    expect(first.currentOpportunities.map((item) => item.id)).toContain(
      open.id,
    );
    expect(
      first.currentOpportunities.every((item) =>
        ["OPEN", "UPCOMING"].includes(item.businessState),
      ),
    ).toBe(true);
    expect(first.currentOpportunities.length).toBeLessThanOrEqual(12);
    expect(first.featuredInstitutions.length).toBeLessThanOrEqual(12);
    expect(first.featuredInstitutions.map((item) => item.id)).toEqual(
      expect.arrayContaining([alpha.id, beta.id]),
    );
    expect(first.latestArticles.map((item) => item.id)).toEqual(
      expect.arrayContaining([publishedArticle.id]),
    );
    expect(first.latestArticles.length).toBeLessThanOrEqual(12);
    expect(first.categories).toEqual([
      {
        category: "ENGLISH_KINDERGARTEN",
        label: "English Kindergartens",
        href: "/institutions?category=ENGLISH_KINDERGARTEN",
      },
      {
        category: "PRIVATE_ELEMENTARY",
        label: "Private Elementary Schools",
        href: "/institutions?category=PRIVATE_ELEMENTARY",
      },
      {
        category: "INTERNATIONAL_SCHOOL",
        label: "International Schools",
        href: "/institutions?category=INTERNATIONAL_SCHOOL",
      },
    ]);
    assertNoForbiddenKeys(first);
    expect(await writeCounts()).toEqual(before);
  });
});
