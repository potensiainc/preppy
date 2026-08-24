import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAdminCommandContext } from "@/src/application/context";
import {
  ConflictError,
  NotEligibleError,
  NotFoundError,
} from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  createArticleDraft,
  setArticleRelations,
  updateArticleDraft,
} from "@/src/modules/editorial/article-commands.server";
import {
  findArticleById,
  loadArticleRelationIds,
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
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const runPrefix = `wp13-command-${randomUUID()}`;
const adminIds = new Set<string>();
const institutionIds = new Set<string>();
const opportunityIds = new Set<string>();

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
      ${id}, ${`${runPrefix}-admin-${id}`}, ${`${id}@example.test`},
      'WP13 Command Admin', 'ACTIVE'
    )`;
  return id;
}

async function createInstitution(): Promise<string> {
  const id = randomUUID();
  institutionIds.add(id);
  await runtime.client`insert into institutions(id, slug, display_name, category)
    values (${id}, ${`wp13-institution-${id}`}, 'WP13 Institution',
      'ENGLISH_KINDERGARTEN')`;
  return id;
}

async function createOpportunity(institutionId: string): Promise<string> {
  const id = randomUUID();
  opportunityIds.add(id);
  await runtime.client`insert into opportunities(
      id, institution_id, slug, kind, truth_mode
    ) values (
      ${id}, ${institutionId}, ${`wp13-opportunity-${id}`},
      'APPLICATION', 'NATIVE'
    )`;
  return id;
}

function context(adminUserId: string, occurredAt: string) {
  return createAdminCommandContext({
    adminUserId,
    occurredAt: new Date(occurredAt),
  });
}

function draftCandidate(slug: string) {
  return {
    title: "Updated Article",
    type: "GUIDE",
    category: "ADMISSIONS_GENERAL",
    excerpt: "A useful summary.",
    contentHtml:
      '<p onclick="alert(1)">Safe body <a href="javascript:alert(1)">text</a></p><script>bad()</script>',
    seoTitle: "Updated Article SEO",
    seoDescription: "A useful SEO description.",
    canonicalUrl: `https://preppy.example/articles/${slug}`,
    robotsIndex: false,
    robotsFollow: true,
    featuredImageUrl: "https://images.example/guide.jpg",
    featuredImageAlt: "Students applying",
  };
}

async function productCounts() {
  const [row] = await runtime.client<
    {
      changes: number;
      notifications: number;
      deliveries: number;
      outbox: number;
    }[]
  >`select
      (select count(*)::int from opportunity_changes) as changes,
      (select count(*)::int from notifications) as notifications,
      (select count(*)::int from notification_deliveries) as deliveries,
      (select count(*)::int from outbox_events) as outbox`;
  return row!;
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    const rows = await transaction<{ id: string }[]>`
      select id from articles where slug like ${`${runPrefix}%`}`;
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await transaction`delete from audit_logs where entity_id in ${transaction(ids)}`;
      await transaction`delete from outbox_events where aggregate_id in ${transaction(ids)}`;
      await transaction`delete from articles where id in ${transaction(ids)}`;
    }
    await transaction`delete from url_redirects
      where source_path like ${`/articles/${runPrefix}%`}
         or target_path like ${`/articles/${runPrefix}%`}`;
    if (opportunityIds.size > 0) {
      await transaction`delete from opportunities
        where id in ${transaction([...opportunityIds])}`;
    }
    if (institutionIds.size > 0) {
      await transaction`delete from institutions
        where id in ${transaction([...institutionIds])}`;
    }
    if (adminIds.size > 0) {
      await transaction`delete from admin_users
        where id in ${transaction([...adminIds])}`;
    }
  });
  adminIds.clear();
  institutionIds.clear();
  opportunityIds.clear();
}

describe("WP-13 Article draft commands", () => {
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

  it("creates the minimal DRAFT with one safe Audit and zero Product signals", async () => {
    const adminId = await createAdmin();
    const before = await productCounts();
    const slug = `${runPrefix}-minimal`;

    const result = await createArticleDraft(
      context(adminId, "2026-08-25T04:00:00.000Z"),
      {
        slug,
        title: " First guide ",
        type: "GUIDE",
        category: "ADMISSIONS_GENERAL",
      },
      dependencies,
    );

    expect(result).toMatchObject({
      articleId: expect.any(String),
      status: "DRAFT",
    });
    const article = await findArticleById(runtime.executor, result.articleId);
    expect(article).toMatchObject({
      slug,
      title: "First guide",
      status: "DRAFT",
      contentHtml: "",
      robotsIndex: false,
      robotsFollow: true,
      authorAdminId: adminId,
      publishedAt: null,
      unpublishedAt: null,
      archivedAt: null,
    });
    const audits = await runtime.client<
      { afterData: Record<string, unknown> }[]
    >`select after_data as "afterData" from audit_logs
      where entity_id=${result.articleId}`;
    expect(audits).toHaveLength(1);
    expect(audits[0]?.afterData).toMatchObject({
      metadata: {
        contentFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    });
    expect(JSON.stringify(audits)).not.toContain("contentHtml");
    expect(await productCounts()).toEqual(before);
  });

  it("rejects current-slug and historical redirect-source collisions with zero writes", async () => {
    const adminId = await createAdmin();
    const slug = `${runPrefix}-collision`;
    await createArticleDraft(
      context(adminId, "2026-08-25T04:10:00.000Z"),
      { slug, title: "First", type: "GUIDE", category: "ADMISSIONS_GENERAL" },
      dependencies,
    );
    const beforeRows = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from articles where slug like ${`${runPrefix}%`}`;
    await expect(
      createArticleDraft(
        context(adminId, "2026-08-25T04:11:00.000Z"),
        {
          slug,
          title: "Second",
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const historicalSlug = `${runPrefix}-historical`;
    await runtime.client`insert into url_redirects(
        source_path, target_path, status_code, reason
      ) values (
        ${`/articles/${historicalSlug}`}, ${`/articles/${slug}`}, 308,
        'ARTICLE_SLUG_CHANGED'
      )`;
    await expect(
      createArticleDraft(
        context(adminId, "2026-08-25T04:12:00.000Z"),
        {
          slug: historicalSlug,
          title: "Historical",
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    const afterRows = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from articles where slug like ${`${runPrefix}%`}`;
    expect(afterRows).toEqual(beforeRows);
  });

  it.each(["DRAFT", "UNPUBLISHED"] as const)(
    "sanitizes and updates a %s Article while preserving identity",
    async (status) => {
      const adminId = await createAdmin();
      const slug = `${runPrefix}-${status.toLowerCase()}`;
      const created = await createArticleDraft(
        context(adminId, "2026-08-25T04:20:00.000Z"),
        {
          slug,
          title: "Initial",
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
        },
        dependencies,
      );
      if (status === "UNPUBLISHED") {
        await runtime.client`update articles set status='UNPUBLISHED'
          where id=${created.articleId}`;
      }
      const current = await findArticleById(
        runtime.executor,
        created.articleId,
      );

      const result = await updateArticleDraft(
        context(adminId, "2026-08-25T04:21:00.000Z"),
        {
          articleId: created.articleId,
          expectedUpdatedAt: current!.updatedAt.toISOString(),
          candidate: draftCandidate(slug),
        },
        dependencies,
      );

      const updated = await findArticleById(
        runtime.executor,
        created.articleId,
      );
      expect(result.updatedAt).toBe("2026-08-25T04:21:00.000Z");
      expect(updated).toMatchObject({
        slug,
        authorAdminId: adminId,
        status,
        contentHtml: "<p>Safe body text</p>",
        canonicalUrl: `https://preppy.example/articles/${slug}`,
      });
      expect(updated?.contentHtml).not.toMatch(/onclick|javascript|script/i);
    },
  );

  it.each(["PUBLISHED", "ARCHIVED"] as const)(
    "rejects the draft update endpoint for %s with no overwrite",
    async (status) => {
      const adminId = await createAdmin();
      const slug = `${runPrefix}-${status.toLowerCase()}`;
      const created = await createArticleDraft(
        context(adminId, "2026-08-25T04:30:00.000Z"),
        {
          slug,
          title: "Initial",
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
        },
        dependencies,
      );
      if (status === "PUBLISHED") {
        await runtime.client`update articles set status='PUBLISHED',
            content_html='<p>Published body with enough content for fixture.</p>',
            published_at='2026-08-25T04:30:00.000Z'::timestamptz
          where id=${created.articleId}`;
      } else {
        await runtime.client`update articles set status='ARCHIVED',
            archived_at='2026-08-25T04:30:00.000Z'::timestamptz
          where id=${created.articleId}`;
      }
      const before = await findArticleById(runtime.executor, created.articleId);

      await expect(
        updateArticleDraft(
          context(adminId, "2026-08-25T04:31:00.000Z"),
          {
            articleId: created.articleId,
            expectedUpdatedAt: before!.updatedAt.toISOString(),
            candidate: draftCandidate(slug),
          },
          dependencies,
        ),
      ).rejects.toBeInstanceOf(NotEligibleError);
      expect(
        await findArticleById(runtime.executor, created.articleId),
      ).toEqual(before);
    },
  );

  it("returns a stale conflict without overwriting current draft data", async () => {
    const adminId = await createAdmin();
    const slug = `${runPrefix}-stale`;
    const created = await createArticleDraft(
      context(adminId, "2026-08-25T04:40:00.000Z"),
      { slug, title: "Initial", type: "GUIDE", category: "ADMISSIONS_GENERAL" },
      dependencies,
    );
    const before = await findArticleById(runtime.executor, created.articleId);
    await expect(
      updateArticleDraft(
        context(adminId, "2026-08-25T04:41:00.000Z"),
        {
          articleId: created.articleId,
          expectedUpdatedAt: "2026-08-25T00:00:00.000Z",
          candidate: draftCandidate(slug),
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await findArticleById(runtime.executor, created.articleId)).toEqual(
      before,
    );
  });

  it("replaces complete relation sets deterministically and emits no cache/customer event", async () => {
    const adminId = await createAdmin();
    const institutionB = await createInstitution();
    const institutionA = await createInstitution();
    const opportunity = await createOpportunity(institutionA);
    const slug = `${runPrefix}-relations`;
    const created = await createArticleDraft(
      context(adminId, "2026-08-25T04:50:00.000Z"),
      {
        slug,
        title: "Relations",
        type: "GUIDE",
        category: "ADMISSIONS_GENERAL",
      },
      dependencies,
    );
    const current = await findArticleById(runtime.executor, created.articleId);
    const beforeProduct = await productCounts();

    const result = await setArticleRelations(
      context(adminId, "2026-08-25T04:51:00.000Z"),
      {
        articleId: created.articleId,
        expectedUpdatedAt: current!.updatedAt.toISOString(),
        institutionIds: [institutionB, institutionA, institutionB],
        opportunityIds: [opportunity, opportunity],
      },
      dependencies,
    );

    expect(result.updatedAt).toBe("2026-08-25T04:51:00.000Z");
    expect(
      await loadArticleRelationIds(runtime.executor, created.articleId),
    ).toEqual({
      institutionIds: [institutionA, institutionB].sort(),
      opportunityIds: [opportunity],
    });
    expect(await productCounts()).toEqual(beforeProduct);

    await expect(
      setArticleRelations(
        context(adminId, "2026-08-25T04:52:00.000Z"),
        {
          articleId: created.articleId,
          expectedUpdatedAt: result.updatedAt,
          institutionIds: [randomUUID()],
          opportunityIds: [],
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(
      await loadArticleRelationIds(runtime.executor, created.articleId),
    ).toEqual({
      institutionIds: [institutionA, institutionB].sort(),
      opportunityIds: [opportunity],
    });
  });

  it.each(["PUBLISHED", "ARCHIVED"] as const)(
    "forbids the secondary relation endpoint for %s Articles",
    async (status) => {
      const adminId = await createAdmin();
      const institutionId = await createInstitution();
      const created = await createArticleDraft(
        context(adminId, "2026-08-25T05:00:00.000Z"),
        {
          slug: `${runPrefix}-relation-${status.toLowerCase()}`,
          title: "Relations",
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
        },
        dependencies,
      );
      if (status === "PUBLISHED") {
        await runtime.client`update articles set status='PUBLISHED',
            content_html='<p>Published fixture content.</p>',
            published_at='2026-08-25T05:00:00.000Z'::timestamptz
          where id=${created.articleId}`;
      } else {
        await runtime.client`update articles set status='ARCHIVED',
            archived_at='2026-08-25T05:00:00.000Z'::timestamptz
          where id=${created.articleId}`;
      }
      const current = await findArticleById(
        runtime.executor,
        created.articleId,
      );

      await expect(
        setArticleRelations(
          context(adminId, "2026-08-25T05:01:00.000Z"),
          {
            articleId: created.articleId,
            expectedUpdatedAt: current!.updatedAt.toISOString(),
            institutionIds: [institutionId],
            opportunityIds: [],
          },
          dependencies,
        ),
      ).rejects.toBeInstanceOf(NotEligibleError);
      expect(
        await loadArticleRelationIds(runtime.executor, created.articleId),
      ).toEqual({ institutionIds: [], opportunityIds: [] });
    },
  );
});
