import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { resolvePublicArticlePage } from "@/src/modules/public/article-page.server";
import { getHomePage } from "@/src/modules/public/home-query.server";
import {
  getInstitutionBySlug,
  listInstitutions,
} from "@/src/modules/public/institution-query.server";
import { getOpportunityBySlug } from "@/src/modules/public/opportunity-query.server";
import {
  PREVIEW_DEMO_FIXTURE,
  inspectPreviewDemo,
  seedPreviewDemo,
} from "@/scripts/seed-preview-demo";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const sql = postgres(databaseUrl, { max: 1 });
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const appBaseUrl = "https://preppy-ui-preview.example.test";
const ids = {
  institutions: PREVIEW_DEMO_FIXTURE.institutions.map(({ id }) => id),
  opportunities: PREVIEW_DEMO_FIXTURE.opportunities.map(({ id }) => id),
  articles: PREVIEW_DEMO_FIXTURE.articles.map(({ id }) => id),
};

async function cleanup(): Promise<void> {
  await sql.begin(async (transaction) => {
    await transaction`delete from article_institutions where article_id in ${transaction(ids.articles)}`;
    await transaction`delete from article_opportunities where article_id in ${transaction(ids.articles)}`;
    await transaction`delete from articles where id in ${transaction(ids.articles)}`;
    await transaction`delete from institution_fact_version_evidence where institution_fact_version_id in (select version.id from institution_fact_versions version join institution_facts fact on fact.id = version.institution_fact_id where fact.institution_id in ${transaction(ids.institutions)})`;
    await transaction`delete from institution_fact_versions where institution_fact_id in (select id from institution_facts where institution_id in ${transaction(ids.institutions)})`;
    await transaction`delete from institution_facts where institution_id in ${transaction(ids.institutions)}`;
    await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select id from opportunity_versions where opportunity_id in ${transaction(ids.opportunities)})`;
    await transaction`delete from opportunity_source_bindings where opportunity_id in ${transaction(ids.opportunities)}`;
    await transaction`delete from opportunity_versions where opportunity_id in ${transaction(ids.opportunities)}`;
    await transaction`delete from opportunities where id in ${transaction(ids.opportunities)}`;
    await transaction`delete from institution_source_bindings where institution_id in ${transaction(ids.institutions)}`;
    await transaction`delete from institutions where id in ${transaction(ids.institutions)}`;
    await transaction`delete from source_monitor_configs where source_id::text like '54000000-0000-4000-8000-%'`;
    await transaction`delete from sources where id::text like '54000000-0000-4000-8000-%'`;
  });
}

beforeAll(async () => {
  await migrateDatabase(databaseUrl);
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closeRuntimeDatabase();
  await sql.end({ timeout: 5 });
});

describe("WP-UI-01 Railway Preview demo seed", () => {
  it("is deterministic and idempotent while satisfying public projections", async () => {
    const first = await seedPreviewDemo(sql, { appBaseUrl });
    const second = await seedPreviewDemo(sql, { appBaseUrl });
    const inspected = await inspectPreviewDemo(sql);

    expect(first).toEqual(second);
    expect(second).toEqual(inspected);
    expect(inspected).toMatchObject({
      institutions: 6,
      sources: 6,
      institutionSourceBindings: 6,
      opportunities: 6,
      opportunitySourceBindings: 6,
      opportunityVersions: 6,
      opportunityEvidence: 6,
      institutionFacts: 6,
      institutionFactEvidence: 6,
      articles: 3,
      articleInstitutionRelations: 6,
      articleOpportunityRelations: 6,
      outboxEvents: 0,
      notifications: 0,
    });

    const home = await getHomePage(runtime.executor);
    expect(home.featuredInstitutions).toHaveLength(6);
    expect(home.currentOpportunities).toHaveLength(6);
    expect(home.latestArticles).toHaveLength(3);

    const list = await listInstitutions(runtime.executor, { pageSize: 12 });
    expect(list.pagination.total).toBe(6);
    expect(list.items.every(({ followable }) => followable)).toBe(true);

    const institution = await getInstitutionBySlug(
      runtime.executor,
      PREVIEW_DEMO_FIXTURE.institutions[0].slug,
    );
    expect(institution.verifiedFacts.length).toBeGreaterThan(0);
    expect(institution.officialSources.length).toBeGreaterThan(0);

    const opportunity = await getOpportunityBySlug(
      runtime.executor,
      PREVIEW_DEMO_FIXTURE.opportunities[0].slug,
    );
    expect(opportunity.officialSource).not.toBeNull();

    const article = await resolvePublicArticlePage(
      runtime.executor,
      PREVIEW_DEMO_FIXTURE.articles[0].slug,
      appBaseUrl,
    );
    expect(article.kind).toBe("ARTICLE");
  });
});
