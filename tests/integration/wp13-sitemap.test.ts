import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { listPublicSitemapEntries } from "@/src/modules/public/sitemap-query.server";
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
const prefix = `wp13-map-${randomUUID()}`;
const adminIds = new Set<string>();

async function seedOfficialSource() {
  const id = randomUUID();
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${id}, ${`https://sitemap-source.example.test/${prefix}/${id}`},
      'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Sitemap source'
    )
  `;
  return id;
}

async function seedInstitution(input: {
  suffix: string;
  officialSource?: boolean;
}) {
  const id = randomUUID();
  const slug = `${prefix}-${input.suffix}`;
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, publication_state, region_code,
      short_description, published_at
    ) values (
      ${id}, ${slug}, ${`Sitemap ${input.suffix}`},
      'INTERNATIONAL_SCHOOL', 'PUBLISHED', 'SEOUL',
      'A meaningful public institution profile.',
      '2026-08-25T00:00:00.000Z'
    )
  `;
  if (input.officialSource) {
    const factId = randomUUID();
    const versionId = randomUUID();
    const sourceId = await seedOfficialSource();
    await runtime.client.begin(async (transaction) => {
      await transaction`
        insert into institution_facts (id, institution_id, fact_type)
        values (${factId}, ${id}, 'TUITION')
      `;
      await transaction`
        insert into institution_fact_versions (
          id, institution_fact_id, version_number, verification_state,
          is_current, value_json, display_text, verified_at
        ) values (
          ${versionId}, ${factId}, 1, 'VERIFIED', true,
          ${JSON.stringify({ currency: "KRW", annual: 10_000_000 })}::jsonb,
          'KRW 10,000,000 annually', '2026-08-25T01:00:00.000Z'
        )
      `;
      await transaction`
        insert into institution_fact_version_evidence (
          institution_fact_version_id, source_id, evidence_role
        ) values (${versionId}, ${sourceId}, 'PRIMARY')
      `;
    });
  }
  return { id, slug };
}

async function seedOpportunity(input: {
  institutionId: string;
  suffix: string;
  actionable: boolean;
}) {
  const id = randomUUID();
  const versionId = randomUUID();
  const sourceId = await seedOfficialSource();
  const slug = `${prefix}-${input.suffix}`;
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state,
        published_at
      ) values (
        ${id}, ${input.institutionId}, ${slug}, 'APPLICATION', 'NATIVE',
        'PUBLISHED', '2026-08-25T00:00:00.000Z'
      )
    `;
    await transaction`
      insert into opportunity_versions (
        id, opportunity_id, truth_mode, version_number, verification_state,
        business_state, is_current, title, summary, action_url, verified_at
      ) values (
        ${versionId}, ${id}, 'NATIVE', 1, 'VERIFIED', 'OPEN', true,
        ${`Sitemap ${input.suffix}`},
        ${input.actionable ? "A unique actionable admissions summary." : null},
        ${input.actionable ? "https://apply.example.test/sitemap" : null},
        '2026-08-25T02:00:00.000Z'
      )
    `;
    await transaction`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, evidence_role
      ) values (${versionId}, ${sourceId}, 'PRIMARY')
    `;
  });
  return { id, slug };
}

async function seedArticle(input: {
  suffix: string;
  status?: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
  robotsIndex?: boolean;
  html?: string;
  description?: string | null;
}) {
  const adminId = randomUUID();
  const id = randomUUID();
  const slug = `${prefix}-${input.suffix}`;
  adminIds.add(adminId);
  const status = input.status ?? "PUBLISHED";
  await runtime.client`insert into admin_users(id, external_auth_subject, email, display_name, status) values (${adminId}, ${`${prefix}-${adminId}`}, ${`${adminId}@example.test`}, 'Internal', 'ACTIVE')`;
  await runtime.client`insert into articles(id, slug, type, category, status, title, excerpt, content_html, robots_index, robots_follow, author_admin_id, published_at, updated_at)
    values (${id}, ${slug}, 'GUIDE', 'ADMISSIONS_GENERAL', ${status}, 'Sitemap Article', ${input.description ?? null}, ${input.html ?? "<p>Meaningful Article body with sufficient verified editorial content.</p>"}, ${input.robotsIndex ?? true}, true, ${adminId}, ${status === "PUBLISHED" ? "2026-08-25T01:00:00.000Z" : null}, '2026-08-25T02:00:00.000Z')`;
  return { id, slug };
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`delete from url_redirects where source_path like ${`/%/${prefix}%`} or target_path like ${`/%/${prefix}%`}`;
    await transaction`delete from articles where slug like ${`${prefix}%`}`;
    await transaction`
      delete from opportunity_version_evidence
      where opportunity_version_id in (
        select id from opportunity_versions where opportunity_id in (
          select id from opportunities where slug like ${`${prefix}%`}
        )
      )
    `;
    await transaction`
      delete from opportunity_versions
      where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}%`}
      )
    `;
    await transaction`delete from opportunities where slug like ${`${prefix}%`}`;
    await transaction`
      delete from institution_fact_version_evidence
      where institution_fact_version_id in (
        select version.id from institution_fact_versions as version
        join institution_facts as fact
          on fact.id = version.institution_fact_id
        join institutions as institution
          on institution.id = fact.institution_id
        where institution.slug like ${`${prefix}%`}
      )
    `;
    await transaction`
      delete from institution_fact_versions
      where institution_fact_id in (
        select fact.id from institution_facts as fact
        join institutions as institution
          on institution.id = fact.institution_id
        where institution.slug like ${`${prefix}%`}
      )
    `;
    await transaction`
      delete from institution_facts
      where institution_id in (
        select id from institutions where slug like ${`${prefix}%`}
      )
    `;
    await transaction`delete from institutions where slug like ${`${prefix}%`}`;
    await transaction`
      delete from sources
      where canonical_url like ${`https://sitemap-source.example.test/${prefix}/%`}
    `;
    if (adminIds.size) {
      await transaction`delete from admin_users where id in ${transaction([...adminIds])}`;
    }
  });
  adminIds.clear();
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

describe("WP-13 INDEX-only sitemap", () => {
  it("includes static canonicals and only meaningful INDEX Article canonicals without body leakage", async () => {
    const index = await seedArticle({
      suffix: "index",
      description: "Useful description",
      html: '<p onclick="bad()">Meaningful safe Article body with more than forty useful characters.</p><script>bad()</script>',
    });
    const thin = await seedArticle({
      suffix: "thin",
      description: "Thin",
      html: "<script>only unsafe text</script>",
    });
    const noindex = await seedArticle({
      suffix: "noindex",
      description: "Description",
      robotsIndex: false,
    });
    const draft = await seedArticle({
      suffix: "draft",
      status: "DRAFT",
      description: "Description",
    });
    const redirectSource = `${prefix}-historical`;
    await runtime.client`insert into url_redirects(source_path, target_path, status_code, reason) values (${`/articles/${redirectSource}`}, ${`/articles/${index.slug}`}, 308, 'ARTICLE_SLUG_CHANGED')`;

    const entries = await listPublicSitemapEntries(
      runtime.executor,
      "https://preppy.example",
    );
    expect(entries).toContainEqual({ url: "https://preppy.example/" });
    expect(entries).toContainEqual({
      url: "https://preppy.example/institutions",
    });
    expect(entries).toContainEqual({
      url: `https://preppy.example/articles/${index.slug}`,
      lastModified: "2026-08-25T02:00:00.000Z",
    });
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toMatch(
      new RegExp(
        `${thin.slug}|${noindex.slug}|${draft.slug}|${redirectSource}`,
      ),
    );
    expect(serialized).not.toMatch(
      /contentHtml|unsafeStored|sanitizedContent|onclick|script|admin|auth|api|my-preppy/i,
    );
  });

  it("executes the runtime sitemap against canonical DB truth and excludes every NOINDEX or redirect source", async () => {
    const indexedInstitution = await seedInstitution({
      suffix: "institution-index",
      officialSource: true,
    });
    const noindexInstitution = await seedInstitution({
      suffix: "institution-noindex",
    });
    const indexedOpportunity = await seedOpportunity({
      institutionId: indexedInstitution.id,
      suffix: "opportunity-index",
      actionable: true,
    });
    const noindexOpportunity = await seedOpportunity({
      institutionId: indexedInstitution.id,
      suffix: "opportunity-noindex",
      actionable: false,
    });
    const indexedArticle = await seedArticle({
      suffix: "article-index",
      description: "Useful description",
    });
    const robotsNoindexArticle = await seedArticle({
      suffix: "article-robots-noindex",
      description: "Useful description",
      robotsIndex: false,
    });
    const redirectSourceArticle = await seedArticle({
      suffix: "article-redirect-source",
      description: "Useful description",
    });
    await runtime.client`
      insert into url_redirects (source_path, target_path, status_code, reason)
      values (
        ${`/articles/${redirectSourceArticle.slug}`},
        ${`/articles/${indexedArticle.slug}`}, 308, 'ARTICLE_SLUG_CHANGED'
      )
    `;

    const previousAppBaseUrl = process.env.APP_BASE_URL;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousMaxConnections = process.env.DATABASE_MAX_CONNECTIONS;
    process.env.APP_BASE_URL = "https://preppy.example";
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_MAX_CONNECTIONS = "4";
    try {
      const entries = await sitemap();
      const urls = entries.map((entry) => entry.url);

      expect(urls).toContain(
        `https://preppy.example/institutions/${indexedInstitution.slug}`,
      );
      expect(urls).not.toContain(
        `https://preppy.example/institutions/${noindexInstitution.slug}`,
      );
      expect(urls).toContain(
        `https://preppy.example/opportunities/${indexedOpportunity.slug}`,
      );
      expect(urls).not.toContain(
        `https://preppy.example/opportunities/${noindexOpportunity.slug}`,
      );
      expect(urls).toContain(
        `https://preppy.example/articles/${indexedArticle.slug}`,
      );
      expect(urls).not.toContain(
        `https://preppy.example/articles/${robotsNoindexArticle.slug}`,
      );
      expect(urls).not.toContain(
        `https://preppy.example/articles/${redirectSourceArticle.slug}`,
      );
    } finally {
      if (previousAppBaseUrl === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = previousAppBaseUrl;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousMaxConnections === undefined)
        delete process.env.DATABASE_MAX_CONNECTIONS;
      else process.env.DATABASE_MAX_CONNECTIONS = previousMaxConnections;
    }
  });
});
