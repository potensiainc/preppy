import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  getAdminArticleDetail,
  listAdminArticleInstitutionOptions,
  listAdminArticleOpportunityOptions,
} from "@/src/modules/admin/read-model/article-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const lock = postgres(databaseUrl, { max: 1 });
const prefix = `wp13-read-${randomUUID()}`;
const ids = {
  admins: new Set<string>(),
  articles: new Set<string>(),
  institutions: new Set<string>(),
  opportunities: new Set<string>(),
};

async function seed() {
  const adminId = randomUUID();
  const articleId = randomUUID();
  const institutionId = randomUUID();
  const opportunityId = randomUUID();
  ids.admins.add(adminId);
  ids.articles.add(articleId);
  ids.institutions.add(institutionId);
  ids.opportunities.add(opportunityId);
  await runtime.client`insert into admin_users(id, external_auth_subject, email, display_name, status)
    values (${adminId}, ${`${prefix}-${adminId}`}, ${`${adminId}@example.test`}, 'Internal Secret Name', 'ACTIVE')`;
  await runtime.client`insert into institutions(id, slug, display_name, category)
    values (${institutionId}, ${`${prefix}-institution`}, 'Alpha School', 'INTERNATIONAL_SCHOOL')`;
  await runtime.client`insert into opportunities(id, institution_id, slug, kind, truth_mode)
    values (${opportunityId}, ${institutionId}, ${`${prefix}-opportunity`}, 'APPLICATION', 'NATIVE')`;
  await runtime.client`insert into opportunity_versions(
      opportunity_id, version_number, verification_state, business_state,
      is_current, title, verified_at
    ) values (
      ${opportunityId}, 1, 'VERIFIED', 'OPEN', true, 'Alpha Admission',
      '2026-08-25T06:59:00.000Z'
    )`;
  await runtime.client`insert into articles(
      id, slug, type, category, status, title, excerpt, content_html,
      robots_index, robots_follow, author_admin_id, updated_at
    ) values (
      ${articleId}, ${`${prefix}-article`}, 'GUIDE', 'ADMISSIONS_GENERAL', 'DRAFT',
      'Unsafe historical article', 'Summary',
      ${'<p onclick="alert(1)">Visible <a href="javascript:alert(2)">link</a></p><script>secret()</script>'},
      false, true, ${adminId}, '2026-08-25T07:00:00.000Z'
    )`;
  await runtime.client`insert into article_institutions(article_id, institution_id) values (${articleId}, ${institutionId})`;
  await runtime.client`insert into article_opportunities(article_id, opportunity_id) values (${articleId}, ${opportunityId})`;
  return { adminId, articleId, institutionId, opportunityId };
}

async function cleanup() {
  await runtime.client.begin(async (tx) => {
    if (ids.articles.size)
      await tx`delete from articles where id in ${tx([...ids.articles])}`;
    if (ids.opportunities.size)
      await tx`delete from opportunity_versions where opportunity_id in ${tx([...ids.opportunities])}`;
    if (ids.opportunities.size)
      await tx`delete from opportunities where id in ${tx([...ids.opportunities])}`;
    if (ids.institutions.size)
      await tx`delete from institutions where id in ${tx([...ids.institutions])}`;
    if (ids.admins.size)
      await tx`delete from admin_users where id in ${tx([...ids.admins])}`;
  });
  Object.values(ids).forEach((set) => set.clear());
}

beforeAll(async () => {
  await lock`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
  await migrateDatabase(databaseUrl);
});
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await lock`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
  await lock.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("WP-13 Admin Article read projection", () => {
  it("re-sanitizes historical HTML before the detail DTO and omits raw body/Admin identity", async () => {
    const fixture = await seed();
    const detail = await getAdminArticleDetail(
      runtime.executor,
      fixture.articleId,
      "https://preppy.example",
    );
    expect(detail).toMatchObject({
      id: fixture.articleId,
      sanitizedContentHtml: "<p>Visible link</p>",
      institutionIds: [fixture.institutionId],
      opportunityIds: [fixture.opportunityId],
      updatedAt: "2026-08-25T07:00:00.000Z",
    });
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toMatch(
      /onclick|javascript:|<script|Internal Secret Name|@example\.test/i,
    );
    expect(Object.hasOwn(detail!, "contentHtml")).toBe(false);
    expect(Object.hasOwn(detail!, "sanitizedContentHtml")).toBe(true);
  });

  it("returns strict bounded canonical relation options in stable label+ID order", async () => {
    const fixture = await seed();
    const institutions = await listAdminArticleInstitutionOptions(
      runtime.executor,
      { query: "Alpha", page: "1", pageSize: "50" },
    );
    const opportunities = await listAdminArticleOpportunityOptions(
      runtime.executor,
      { query: "Alpha", page: 1, pageSize: 50 },
    );
    expect(institutions.items).toContainEqual({
      id: fixture.institutionId,
      slug: `${prefix}-institution`,
      label: "Alpha School",
    });
    expect(opportunities.items).toContainEqual({
      id: fixture.opportunityId,
      slug: `${prefix}-opportunity`,
      label: "Alpha Admission",
    });
    expect(institutions.items.length).toBeLessThanOrEqual(50);
    expect(opportunities.items.length).toBeLessThanOrEqual(50);
    await expect(
      listAdminArticleInstitutionOptions(runtime.executor, {
        page: 1,
        pageSize: 51,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      listAdminArticleOpportunityOptions(runtime.executor, {
        page: 1,
        pageSize: 50,
        sourceId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
