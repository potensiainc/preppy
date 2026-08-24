import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAdminCommandContext } from "@/src/application/context";
import { ConflictError, NotEligibleError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  archiveArticle,
  changeArticleSlug,
  createArticleDraft,
  publishArticle,
} from "@/src/modules/editorial/article-commands.server";
import {
  findArticleById,
  findRedirectBySourcePath,
} from "@/src/modules/editorial/repository.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 8,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const runPrefix = `wp13-slug-${randomUUID()}`;
const adminIds = new Set<string>();
const dependencies = {
  transactionManager: runtime.transactionManager,
  appBaseUrl: "https://preppy.example",
};

async function createAdmin(): Promise<string> {
  const id = randomUUID();
  adminIds.add(id);
  await runtime.client`insert into admin_users(
      id, external_auth_subject, email, display_name, status
    ) values (
      ${id}, ${`${runPrefix}-${id}`}, ${`${id}@example.test`},
      'WP13 Slug Admin', 'ACTIVE'
    )`;
  return id;
}

function context(adminUserId: string, iso: string) {
  return createAdminCommandContext({ adminUserId, occurredAt: new Date(iso) });
}

function candidate(slug: string) {
  return {
    title: "Published guide",
    type: "GUIDE",
    category: "ADMISSIONS_GENERAL",
    excerpt: "A complete description.",
    contentHtml: `<p>${"content".repeat(8)}</p>`,
    seoTitle: "Published guide",
    seoDescription: "A complete SEO description.",
    canonicalUrl: `https://preppy.example/articles/${slug}`,
    robotsIndex: true,
    robotsFollow: true,
    featuredImageUrl: null,
    featuredImageAlt: null,
    institutionIds: [],
    opportunityIds: [],
  };
}

async function createDraft(adminId: string, slug: string, iso: string) {
  return createArticleDraft(
    context(adminId, iso),
    { slug, title: "Initial", type: "GUIDE", category: "ADMISSIONS_GENERAL" },
    dependencies,
  );
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    const rows = await transaction<{ id: string }[]>`
      select id from articles where slug like ${`${runPrefix}%`}`;
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await transaction`delete from outbox_events where aggregate_id in ${transaction(ids)}`;
      await transaction`delete from audit_logs where entity_id in ${transaction(ids)}`;
      await transaction`delete from articles where id in ${transaction(ids)}`;
    }
    await transaction`delete from url_redirects
      where source_path like ${`/articles/${runPrefix}%`}
         or target_path like ${`/articles/${runPrefix}%`}`;
    if (adminIds.size > 0) {
      await transaction`delete from admin_users
        where id in ${transaction([...adminIds])}`;
    }
  });
  adminIds.clear();
}

describe("WP-13 transactional Article slug changes", () => {
  beforeAll(async () => {
    await schemaLockSql`
      select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
    `;
    await migrateDatabase(databaseUrl);
  });

  afterEach(cleanup);

  afterAll(async () => {
    await schemaLockSql`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
    await schemaLockSql.end({ timeout: 5 });
    await closeRuntimeDatabase();
  });

  it("changes a never-published DRAFT without redirect or cache history", async () => {
    const adminId = await createAdmin();
    const oldSlug = `${runPrefix}-draft-a`;
    const newSlug = `${runPrefix}-draft-b`;
    const draft = await createDraft(
      adminId,
      oldSlug,
      "2026-08-25T08:00:00.000Z",
    );

    const result = await changeArticleSlug(
      context(adminId, "2026-08-25T08:01:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: draft.updatedAt,
        newSlug,
      },
      dependencies,
    );

    expect(result).toEqual({
      articleId: draft.articleId,
      status: "DRAFT",
      updatedAt: "2026-08-25T08:01:00.000Z",
      previousCanonicalPath: `/articles/${oldSlug}`,
      currentCanonicalPath: `/articles/${newSlug}`,
    });
    expect(
      await findRedirectBySourcePath(runtime.executor, `/articles/${oldSlug}`),
    ).toBeNull();
    expect(
      await runtime.client<{ count: number }[]>`
      select count(*)::int as count from outbox_events where aggregate_id=${draft.articleId}`,
    ).toEqual([{ count: 0 }]);
  });

  it("rewrites self canonical and flattens published A to B to C with exact events", async () => {
    const adminId = await createAdmin();
    const slugA = `${runPrefix}-a`;
    const slugB = `${runPrefix}-b`;
    const slugC = `${runPrefix}-c`;
    const draft = await createDraft(adminId, slugA, "2026-08-25T08:10:00.000Z");
    const published = await publishArticle(
      context(adminId, "2026-08-25T08:11:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: draft.updatedAt,
        candidate: candidate(slugA),
      },
      dependencies,
    );
    const toB = await changeArticleSlug(
      context(adminId, "2026-08-25T08:12:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: published.updatedAt,
        newSlug: slugB,
      },
      dependencies,
    );
    const toC = await changeArticleSlug(
      context(adminId, "2026-08-25T08:13:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: toB.updatedAt,
        newSlug: slugC,
      },
      dependencies,
    );

    expect(toB.previousCanonicalPath).toBe(`/articles/${slugA}`);
    expect(toB.currentCanonicalPath).toBe(`/articles/${slugB}`);
    expect(toC.previousCanonicalPath).toBe(`/articles/${slugB}`);
    expect(toC.currentCanonicalPath).toBe(`/articles/${slugC}`);
    expect(
      await findArticleById(runtime.executor, draft.articleId),
    ).toMatchObject({
      slug: slugC,
      canonicalUrl: `https://preppy.example/articles/${slugC}`,
    });
    expect(
      await findRedirectBySourcePath(runtime.executor, `/articles/${slugA}`),
    ).toMatchObject({
      targetPath: `/articles/${slugC}`,
      statusCode: 308,
    });
    expect(
      await findRedirectBySourcePath(runtime.executor, `/articles/${slugB}`),
    ).toMatchObject({
      targetPath: `/articles/${slugC}`,
      statusCode: 308,
    });
    const events = await runtime.client<{ payload: Record<string, unknown> }[]>`
      select payload from outbox_events where aggregate_id=${draft.articleId}
        and event_type='CACHE_REVALIDATION_REQUESTED'
      order by created_at, id`;
    expect(events.map((event) => event.payload.reason)).toEqual([
      "ARTICLE_PUBLISHED",
      "ARTICLE_SLUG_CHANGED",
      "ARTICLE_SLUG_CHANGED",
    ]);
    expect(events[1]?.payload).toMatchObject({
      previousCanonicalPath: `/articles/${slugA}`,
      currentCanonicalPath: `/articles/${slugB}`,
    });
    expect(events[2]?.payload).toMatchObject({
      previousCanonicalPath: `/articles/${slugB}`,
      currentCanonicalPath: `/articles/${slugC}`,
    });
    const audits = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from audit_logs
      where entity_id=${draft.articleId} and action_type='ARTICLE_SLUG_CHANGED'`;
    expect(audits).toEqual([{ count: 2 }]);
  });

  it("rejects same, stale, current-slug, redirect-source, and ARCHIVED changes", async () => {
    const adminId = await createAdmin();
    const firstSlug = `${runPrefix}-guard-a`;
    const otherSlug = `${runPrefix}-guard-b`;
    const redirectSlug = `${runPrefix}-guard-history`;
    const first = await createDraft(
      adminId,
      firstSlug,
      "2026-08-25T08:20:00.000Z",
    );
    const other = await createDraft(
      adminId,
      otherSlug,
      "2026-08-25T08:21:00.000Z",
    );

    await expect(
      changeArticleSlug(
        context(adminId, "2026-08-25T08:22:00.000Z"),
        {
          articleId: first.articleId,
          expectedUpdatedAt: first.updatedAt,
          newSlug: firstSlug,
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      changeArticleSlug(
        context(adminId, "2026-08-25T08:22:00.000Z"),
        {
          articleId: first.articleId,
          expectedUpdatedAt: "2026-08-25T00:00:00.000Z",
          newSlug: `${runPrefix}-stale`,
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      changeArticleSlug(
        context(adminId, "2026-08-25T08:22:00.000Z"),
        {
          articleId: first.articleId,
          expectedUpdatedAt: first.updatedAt,
          newSlug: otherSlug,
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    await runtime.client`insert into url_redirects(source_path, target_path, status_code)
      values (${`/articles/${redirectSlug}`}, ${`/articles/${otherSlug}`}, 308)`;
    await expect(
      changeArticleSlug(
        context(adminId, "2026-08-25T08:22:00.000Z"),
        {
          articleId: first.articleId,
          expectedUpdatedAt: first.updatedAt,
          newSlug: redirectSlug,
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const archived = await archiveArticle(
      context(adminId, "2026-08-25T08:23:00.000Z"),
      { articleId: first.articleId, expectedUpdatedAt: first.updatedAt },
      dependencies,
    );
    await expect(
      changeArticleSlug(
        context(adminId, "2026-08-25T08:24:00.000Z"),
        {
          articleId: first.articleId,
          expectedUpdatedAt: archived.updatedAt,
          newSlug: `${runPrefix}-archived`,
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(NotEligibleError);
    expect(
      (await findArticleById(runtime.executor, other.articleId))?.slug,
    ).toBe(otherSlug);
  });

  it("serializes namespace races without chains, loops, or duplicate sources", async () => {
    const adminId = await createAdmin();
    const sharedSlug = `${runPrefix}-race-shared`;
    const first = await createDraft(
      adminId,
      `${runPrefix}-race-a`,
      "2026-08-25T08:30:00.000Z",
    );
    const second = await createDraft(
      adminId,
      `${runPrefix}-race-b`,
      "2026-08-25T08:30:01.000Z",
    );
    const settled = await Promise.allSettled([
      changeArticleSlug(
        context(adminId, "2026-08-25T08:31:00.000Z"),
        {
          articleId: first.articleId,
          expectedUpdatedAt: first.updatedAt,
          newSlug: sharedSlug,
        },
        dependencies,
      ),
      changeArticleSlug(
        context(adminId, "2026-08-25T08:31:00.000Z"),
        {
          articleId: second.articleId,
          expectedUpdatedAt: second.updatedAt,
          newSlug: sharedSlug,
        },
        dependencies,
      ),
    ]);
    expect(
      settled.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    expect(settled.find((entry) => entry.status === "rejected")).toMatchObject({
      reason: expect.any(ConflictError),
    });
    const owners = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from articles where slug=${sharedSlug}`;
    expect(owners).toEqual([{ count: 1 }]);

    const winner = settled.find((entry) => entry.status === "fulfilled")!;
    const winnerResult = (
      winner as PromiseFulfilledResult<{ articleId: string; updatedAt: string }>
    ).value;
    const sameArticleRace = await Promise.allSettled([
      changeArticleSlug(
        context(adminId, "2026-08-25T08:32:00.000Z"),
        {
          articleId: winnerResult.articleId,
          expectedUpdatedAt: winnerResult.updatedAt,
          newSlug: `${runPrefix}-race-c`,
        },
        dependencies,
      ),
      changeArticleSlug(
        context(adminId, "2026-08-25T08:32:00.000Z"),
        {
          articleId: winnerResult.articleId,
          expectedUpdatedAt: winnerResult.updatedAt,
          newSlug: `${runPrefix}-race-d`,
        },
        dependencies,
      ),
    ]);
    expect(
      sameArticleRace.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      sameArticleRace.find((entry) => entry.status === "rejected"),
    ).toMatchObject({
      reason: expect.any(ConflictError),
    });
  });

  it("rolls back slug, canonical, redirects, Audit, and event when Outbox fails", async () => {
    const adminId = await createAdmin();
    const slugA = `${runPrefix}-rollback-a`;
    const slugB = `${runPrefix}-rollback-b`;
    const draft = await createDraft(adminId, slugA, "2026-08-25T08:40:00.000Z");
    const published = await publishArticle(
      context(adminId, "2026-08-25T08:41:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: draft.updatedAt,
        candidate: candidate(slugA),
      },
      dependencies,
    );
    const before = await findArticleById(runtime.executor, draft.articleId);
    const beforeAudits = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from audit_logs where entity_id=${draft.articleId}`;
    const beforeEvents = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from outbox_events where aggregate_id=${draft.articleId}`;

    await expect(
      changeArticleSlug(
        context(adminId, "2026-08-25T08:42:00.000Z"),
        {
          articleId: draft.articleId,
          expectedUpdatedAt: published.updatedAt,
          newSlug: slugB,
        },
        {
          ...dependencies,
          enqueueOutbox: async () => {
            throw new Error("injected slug outbox failure");
          },
        },
      ),
    ).rejects.toThrow("injected slug outbox failure");
    expect(await findArticleById(runtime.executor, draft.articleId)).toEqual(
      before,
    );
    expect(
      await findRedirectBySourcePath(runtime.executor, `/articles/${slugA}`),
    ).toBeNull();
    expect(
      await runtime.client<{ count: number }[]>`
      select count(*)::int as count from audit_logs where entity_id=${draft.articleId}`,
    ).toEqual(beforeAudits);
    expect(
      await runtime.client<{ count: number }[]>`
      select count(*)::int as count from outbox_events where aggregate_id=${draft.articleId}`,
    ).toEqual(beforeEvents);
  });

  it("fails closed instead of truncating a 101st active historical source", async () => {
    const adminId = await createAdmin();
    const slugA = `${runPrefix}-overflow-a`;
    const slugB = `${runPrefix}-overflow-b`;
    const draft = await createDraft(adminId, slugA, "2026-08-25T08:50:00.000Z");
    const published = await publishArticle(
      context(adminId, "2026-08-25T08:51:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: draft.updatedAt,
        candidate: candidate(slugA),
      },
      dependencies,
    );
    await runtime.client`insert into url_redirects(source_path, target_path, status_code)
      select
        ${`/articles/${runPrefix}-overflow-`} || lpad(value::text, 3, '0'),
        ${`/articles/${slugA}`},
        308
      from generate_series(1, 100) as value`;

    await expect(
      changeArticleSlug(
        context(adminId, "2026-08-25T08:52:00.000Z"),
        {
          articleId: draft.articleId,
          expectedUpdatedAt: published.updatedAt,
          newSlug: slugB,
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(
      (await findArticleById(runtime.executor, draft.articleId))?.slug,
    ).toBe(slugA);
    expect(
      await findRedirectBySourcePath(runtime.executor, `/articles/${slugA}`),
    ).toBeNull();
    const targets = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from url_redirects
      where target_path=${`/articles/${slugA}`}`;
    expect(targets).toEqual([{ count: 100 }]);
  });
});
