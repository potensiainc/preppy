import { randomUUID } from "node:crypto";

import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { BoundedCacheReplayRegistry } from "@/src/modules/cache/replay.server";
import {
  createCacheRevalidationSignature,
  handleCacheRevalidationRequest,
} from "@/src/modules/cache/revalidation-handler.server";
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
const prefix = `wp13-cache-${randomUUID()}`;
const secret = "cache-secret-with-at-least-32-bytes!";
const now = new Date("2026-08-25T11:00:00.000Z");
const adminIds = new Set<string>();
const institutionIds = new Set<string>();
const opportunityIds = new Set<string>();

async function seed() {
  const adminId = randomUUID(),
    articleId = randomUUID(),
    institutionId = randomUUID(),
    opportunityId = randomUUID();
  adminIds.add(adminId);
  institutionIds.add(institutionId);
  opportunityIds.add(opportunityId);
  const slug = `${prefix}-current`,
    institutionSlug = `${prefix}-institution`,
    opportunitySlug = `${prefix}-opportunity`;
  await runtime.client`insert into admin_users(id, external_auth_subject, email, display_name, status) values (${adminId}, ${`${prefix}-${adminId}`}, ${`${adminId}@example.test`}, 'Cache Admin', 'ACTIVE')`;
  await runtime.client`insert into institutions(id, slug, display_name, category) values (${institutionId}, ${institutionSlug}, 'Cache School', 'INTERNATIONAL_SCHOOL')`;
  await runtime.client`insert into opportunities(id, institution_id, slug, kind, truth_mode) values (${opportunityId}, ${institutionId}, ${opportunitySlug}, 'APPLICATION', 'NATIVE')`;
  await runtime.client`insert into articles(id, slug, type, category, status, title, content_html, robots_index, robots_follow, author_admin_id) values (${articleId}, ${slug}, 'GUIDE', 'ADMISSIONS_GENERAL', 'DRAFT', 'Cache Article', '<p>Body</p>', true, true, ${adminId})`;
  await runtime.client`insert into article_institutions(article_id, institution_id) values (${articleId}, ${institutionId})`;
  await runtime.client`insert into article_opportunities(article_id, opportunity_id) values (${articleId}, ${opportunityId})`;
  await runtime.client`insert into url_redirects(source_path, target_path, status_code, reason) values (${`/articles/${prefix}-old-a`}, ${`/articles/${slug}`}, 308, 'ARTICLE_SLUG_CHANGED'), (${`/articles/${prefix}-old-b`}, ${`/articles/${slug}`}, 308, 'ARTICLE_SLUG_CHANGED')`;
  return {
    articleId,
    slug,
    institutionId,
    institutionSlug,
    opportunityId,
    opportunitySlug,
  };
}

function request(payload: unknown, eventId = randomUUID()) {
  const body = JSON.stringify(payload),
    timestamp = String(now.getTime() / 1000);
  const signature = createCacheRevalidationSignature({
    secret,
    timestamp,
    eventId,
    rawBody: new TextEncoder().encode(body),
  });
  return new Request("https://preppy.example/api/internal/cache/revalidate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-preppy-revalidation-timestamp": timestamp,
      "x-preppy-revalidation-event-id": eventId,
      "x-preppy-revalidation-signature": signature,
    },
    body,
  });
}

async function cleanup() {
  await runtime.client`delete from url_redirects where source_path like ${`/articles/${prefix}%`} or target_path like ${`/articles/${prefix}%`}`;
  await runtime.client`delete from articles where slug like ${`${prefix}%`}`;
  if (opportunityIds.size)
    await runtime.client`delete from opportunities where id in ${runtime.client([...opportunityIds])}`;
  if (institutionIds.size)
    await runtime.client`delete from institutions where id in ${runtime.client([...institutionIds])}`;
  if (adminIds.size)
    await runtime.client`delete from admin_users where id in ${runtime.client([...adminIds])}`;
  adminIds.clear();
  institutionIds.clear();
  opportunityIds.clear();
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

describe("WP-13 cache revalidation endpoint", () => {
  it("commits DB-derived current/history/relations before invoking Next cache APIs", async () => {
    const fixture = await seed();
    let transactionActive = false;
    const paths: string[] = [],
      tags: Array<[string, "max"]> = [];
    const transactionManager = {
      run: async <T>(
        operation: Parameters<typeof runtime.transactionManager.run<T>>[0],
      ) => {
        transactionActive = true;
        try {
          return await runtime.transactionManager.run(operation);
        } finally {
          transactionActive = false;
        }
      },
    };
    const payload = {
      version: 1,
      articleId: fixture.articleId,
      reason: "ARTICLE_SLUG_CHANGED",
      currentCanonicalPath: "/articles/forged-current",
      previousCanonicalPath: `/${"articles"}/${prefix}-previous`,
      relatedInstitutionIds: [randomUUID()],
      relatedOpportunityIds: [randomUUID()],
    };
    const response = await handleCacheRevalidationRequest(request(payload), {
      getConfig: () => ({ secret, maxClockSkewSeconds: 300 }),
      now: () => now,
      transactionManager,
      replayRegistry: new BoundedCacheReplayRegistry(),
      revalidatePath: (path) => {
        expect(transactionActive).toBe(false);
        paths.push(path);
      },
      revalidateTag: (tag, profile) => {
        expect(transactionActive).toBe(false);
        tags.push([tag, profile]);
      },
    });
    expect(response.status).toBe(200);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/",
        "/sitemap.xml",
        `/articles/${fixture.slug}`,
        `/articles/${prefix}-previous`,
        `/articles/${prefix}-old-a`,
        `/articles/${prefix}-old-b`,
        `/institutions/${fixture.institutionSlug}`,
        `/opportunities/${fixture.opportunitySlug}`,
      ]),
    );
    expect(paths).not.toContain("/articles/forged-current");
    expect(tags).toEqual(
      expect.arrayContaining([
        [`article:${fixture.articleId}`, "max"],
        [`institution:${fixture.institutionId}`, "max"],
        [`opportunity:${fixture.opportunityId}`, "max"],
        ["seo:sitemap", "max"],
      ]),
    );
  });

  it("fails closed before Next cache APIs when historical redirect fanout exceeds 100", async () => {
    const fixture = await seed();
    const rows = Array.from({ length: 99 }, (_, index) => ({
      source_path: `/articles/${prefix}-overflow-${index}`,
      target_path: `/articles/${fixture.slug}`,
      status_code: 308,
      reason: "ARTICLE_SLUG_CHANGED",
    }));
    await runtime.client`
      insert into url_redirects ${runtime.client(
        rows,
        "source_path",
        "target_path",
        "status_code",
        "reason",
      )}
    `;
    const revalidatePath = vi.fn();
    const revalidateTag = vi.fn();
    const response = await handleCacheRevalidationRequest(
      request({
        version: 1,
        articleId: fixture.articleId,
        reason: "ARTICLE_PUBLISHED",
        currentCanonicalPath: `/articles/${fixture.slug}`,
        relatedInstitutionIds: [],
        relatedOpportunityIds: [],
      }),
      {
        getConfig: () => ({ secret, maxClockSkewSeconds: 300 }),
        now: () => now,
        transactionManager: runtime.transactionManager,
        replayRegistry: new BoundedCacheReplayRegistry(),
        revalidatePath,
        revalidateTag,
      },
    );
    expect(response.status).toBe(503);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
