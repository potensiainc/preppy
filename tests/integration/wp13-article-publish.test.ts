import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAdminCommandContext } from "@/src/application/context";
import { NotEligibleError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  archiveArticle,
  createArticleDraft,
  publishArticle,
  unpublishArticle,
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
  DATABASE_MAX_CONNECTIONS: 6,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const runPrefix = `wp13-publish-${randomUUID()}`;
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
      'WP13 Publish Admin', 'ACTIVE'
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

function context(adminUserId: string, iso: string) {
  return createAdminCommandContext({ adminUserId, occurredAt: new Date(iso) });
}

function candidate(
  slug: string,
  institutionIds: readonly string[] = [],
  opportunityIds: readonly string[] = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    title: "Complete admissions guide",
    type: "GUIDE",
    category: "ADMISSIONS_GENERAL",
    excerpt: "A complete description for families.",
    contentHtml: `<p onclick="bad()">${"meaningful".repeat(8)}</p><script>bad()</script>`,
    seoTitle: "Complete admissions guide",
    seoDescription: "A complete SEO description for families.",
    canonicalUrl: `https://preppy.example/articles/${slug}`,
    robotsIndex: true,
    robotsFollow: true,
    featuredImageUrl: "https://images.example/guide.jpg",
    featuredImageAlt: "Families reviewing admissions",
    institutionIds,
    opportunityIds,
    ...overrides,
  };
}

async function createDraft(adminId: string, slug: string, iso: string) {
  return createArticleDraft(
    context(adminId, iso),
    { slug, title: "Initial", type: "GUIDE", category: "ADMISSIONS_GENERAL" },
    dependencies,
  );
}

async function signalCounts() {
  const [row] = await runtime.client<
    { changes: number; notifications: number; deliveries: number }[]
  >`select
      (select count(*)::int from opportunity_changes) as changes,
      (select count(*)::int from notifications) as notifications,
      (select count(*)::int from notification_deliveries) as deliveries`;
  return row!;
}

async function cacheEvents(articleId: string) {
  return runtime.client<
    {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
      dedupeKey: string;
    }[]
  >`select event_type as "eventType", aggregate_type as "aggregateType",
      aggregate_id as "aggregateId", payload, dedupe_key as "dedupeKey"
    from outbox_events where aggregate_id=${articleId}
    order by created_at, id`;
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

describe("WP-13 Article publication lifecycle", () => {
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

  it("publishes one complete sanitized candidate, relations, Audit, and typed cache intent atomically", async () => {
    const adminId = await createAdmin();
    const institutionB = await createInstitution();
    const institutionA = await createInstitution();
    const opportunity = await createOpportunity(institutionA);
    const slug = `${runPrefix}-first`;
    const draft = await createDraft(adminId, slug, "2026-08-25T06:00:00.000Z");
    const beforeSignals = await signalCounts();

    const result = await publishArticle(
      context(adminId, "2026-08-25T06:01:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: draft.updatedAt,
        candidate: candidate(slug, [institutionB, institutionA], [opportunity]),
      },
      dependencies,
    );

    expect(result).toEqual({
      articleId: draft.articleId,
      status: "PUBLISHED",
      updatedAt: "2026-08-25T06:01:00.000Z",
    });
    const article = await findArticleById(runtime.executor, draft.articleId);
    expect(article).toMatchObject({
      status: "PUBLISHED",
      contentHtml: `<p>${"meaningful".repeat(8)}</p>`,
      publishedAt: new Date("2026-08-25T06:01:00.000Z"),
      unpublishedAt: null,
    });
    expect(
      await loadArticleRelationIds(runtime.executor, draft.articleId),
    ).toEqual({
      institutionIds: [institutionA, institutionB].sort(),
      opportunityIds: [opportunity],
    });
    const events = await cacheEvents(draft.articleId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "CACHE_REVALIDATION_REQUESTED",
      aggregateType: "ARTICLE",
      aggregateId: draft.articleId,
      payload: {
        version: 1,
        articleId: draft.articleId,
        reason: "ARTICLE_PUBLISHED",
        currentCanonicalPath: `/articles/${slug}`,
        relatedInstitutionIds: [institutionA, institutionB].sort(),
        relatedOpportunityIds: [opportunity],
      },
    });
    expect(events[0]?.dedupeKey).toMatch(
      new RegExp(
        `^CACHE_REVALIDATION_REQUESTED:${draft.articleId}:ARTICLE_PUBLISHED:`,
      ),
    );
    const audits = await runtime.client<{ afterData: unknown }[]>`
      select after_data as "afterData" from audit_logs
      where entity_id=${draft.articleId} and action_type='ARTICLE_PUBLISHED'`;
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).toMatch(/sha256:[a-f0-9]{64}/);
    expect(JSON.stringify([...audits, ...events])).not.toMatch(
      /onclick=|<script|bad\(\)|meaningfulmeaningful/i,
    );
    expect(await signalCounts()).toEqual(beforeSignals);
  });

  it.each([
    ["short body", { contentHtml: "<p>too short</p>" }],
    ["missing description", { seoDescription: null, excerpt: null }],
    [
      "external canonical",
      { canonicalUrl: "https://other.example/articles/x" },
    ],
  ])(
    "rejects publication with %s and zero partial writes",
    async (_case, overrides) => {
      const adminId = await createAdmin();
      const slug = `${runPrefix}-ineligible-${randomUUID()}`;
      const draft = await createDraft(
        adminId,
        slug,
        "2026-08-25T06:10:00.000Z",
      );
      const before = await findArticleById(runtime.executor, draft.articleId);

      await expect(
        publishArticle(
          context(adminId, "2026-08-25T06:11:00.000Z"),
          {
            articleId: draft.articleId,
            expectedUpdatedAt: draft.updatedAt,
            candidate: candidate(slug, [], [], overrides),
          },
          dependencies,
        ),
      ).rejects.toBeInstanceOf(NotEligibleError);
      expect(await findArticleById(runtime.executor, draft.articleId)).toEqual(
        before,
      );
      expect(await cacheEvents(draft.articleId)).toHaveLength(0);
    },
  );

  it("preserves first publishedAt through unpublish, republish, and published atomic edit", async () => {
    const adminId = await createAdmin();
    const slug = `${runPrefix}-republish`;
    const draft = await createDraft(adminId, slug, "2026-08-25T06:20:00.000Z");
    const first = await publishArticle(
      context(adminId, "2026-08-25T06:21:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: draft.updatedAt,
        candidate: candidate(slug),
      },
      dependencies,
    );
    const unpublished = await unpublishArticle(
      context(adminId, "2026-08-25T06:22:00.000Z"),
      { articleId: draft.articleId, expectedUpdatedAt: first.updatedAt },
      dependencies,
    );
    expect(
      await findArticleById(runtime.executor, draft.articleId),
    ).toMatchObject({
      status: "UNPUBLISHED",
      publishedAt: new Date("2026-08-25T06:21:00.000Z"),
      unpublishedAt: new Date("2026-08-25T06:22:00.000Z"),
    });

    const republished = await publishArticle(
      context(adminId, "2026-08-25T06:23:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: unpublished.updatedAt,
        candidate: candidate(slug, [], [], { title: "Republished" }),
      },
      dependencies,
    );
    const edited = await publishArticle(
      context(adminId, "2026-08-25T06:24:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: republished.updatedAt,
        candidate: candidate(slug, [], [], { title: "Atomic public edit" }),
      },
      dependencies,
    );
    expect(
      await findArticleById(runtime.executor, draft.articleId),
    ).toMatchObject({
      title: "Atomic public edit",
      status: "PUBLISHED",
      publishedAt: new Date("2026-08-25T06:21:00.000Z"),
      unpublishedAt: null,
    });
    expect(
      (await cacheEvents(draft.articleId)).map((event) => event.payload.reason),
    ).toEqual([
      "ARTICLE_PUBLISHED",
      "ARTICLE_UNPUBLISHED",
      "ARTICLE_REPUBLISHED",
      "ARTICLE_REPUBLISHED",
    ]);
    expect(edited.updatedAt).toBe("2026-08-25T06:24:00.000Z");
  });

  it("uses ARTICLE_RELATIONS_CHANGED for a complete published relation edit", async () => {
    const adminId = await createAdmin();
    const institutionId = await createInstitution();
    const slug = `${runPrefix}-published-relations`;
    const draft = await createDraft(adminId, slug, "2026-08-25T06:30:00.000Z");
    const first = await publishArticle(
      context(adminId, "2026-08-25T06:31:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: draft.updatedAt,
        candidate: candidate(slug),
      },
      dependencies,
    );
    await publishArticle(
      context(adminId, "2026-08-25T06:32:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: first.updatedAt,
        candidate: candidate(slug, [institutionId]),
      },
      dependencies,
    );

    expect(
      (await cacheEvents(draft.articleId)).map((event) => event.payload.reason),
    ).toEqual(["ARTICLE_PUBLISHED", "ARTICLE_RELATIONS_CHANGED"]);
  });

  it("archives terminally and emits cache only when the prior state was public", async () => {
    const adminId = await createAdmin();
    const draftSlug = `${runPrefix}-archive-draft`;
    const draft = await createDraft(
      adminId,
      draftSlug,
      "2026-08-25T06:40:00.000Z",
    );
    const archivedDraft = await archiveArticle(
      context(adminId, "2026-08-25T06:41:00.000Z"),
      { articleId: draft.articleId, expectedUpdatedAt: draft.updatedAt },
      dependencies,
    );
    expect(archivedDraft.status).toBe("ARCHIVED");
    expect(await cacheEvents(draft.articleId)).toHaveLength(0);
    await expect(
      archiveArticle(
        context(adminId, "2026-08-25T06:42:00.000Z"),
        {
          articleId: draft.articleId,
          expectedUpdatedAt: archivedDraft.updatedAt,
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(NotEligibleError);

    const publicSlug = `${runPrefix}-archive-public`;
    const publicDraft = await createDraft(
      adminId,
      publicSlug,
      "2026-08-25T06:43:00.000Z",
    );
    const published = await publishArticle(
      context(adminId, "2026-08-25T06:44:00.000Z"),
      {
        articleId: publicDraft.articleId,
        expectedUpdatedAt: publicDraft.updatedAt,
        candidate: candidate(publicSlug),
      },
      dependencies,
    );
    await archiveArticle(
      context(adminId, "2026-08-25T06:45:00.000Z"),
      {
        articleId: publicDraft.articleId,
        expectedUpdatedAt: published.updatedAt,
      },
      dependencies,
    );
    expect(
      (await cacheEvents(publicDraft.articleId)).map(
        (event) => event.payload.reason,
      ),
    ).toEqual(["ARTICLE_PUBLISHED", "ARTICLE_ARCHIVED"]);
  });

  it("rolls back Article, relations, Audit, and cache intent when Outbox enqueue fails", async () => {
    const adminId = await createAdmin();
    const institutionId = await createInstitution();
    const slug = `${runPrefix}-rollback`;
    const draft = await createDraft(adminId, slug, "2026-08-25T06:50:00.000Z");
    const before = await findArticleById(runtime.executor, draft.articleId);
    const beforeAudit = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from audit_logs where entity_id=${draft.articleId}`;

    await expect(
      publishArticle(
        context(adminId, "2026-08-25T06:51:00.000Z"),
        {
          articleId: draft.articleId,
          expectedUpdatedAt: draft.updatedAt,
          candidate: candidate(slug, [institutionId]),
        },
        {
          ...dependencies,
          enqueueOutbox: async () => {
            throw new Error("injected outbox failure");
          },
        },
      ),
    ).rejects.toThrow("injected outbox failure");
    expect(await findArticleById(runtime.executor, draft.articleId)).toEqual(
      before,
    );
    expect(
      await loadArticleRelationIds(runtime.executor, draft.articleId),
    ).toEqual({ institutionIds: [], opportunityIds: [] });
    expect(
      await runtime.client<{ count: number }[]>`
      select count(*)::int as count from audit_logs where entity_id=${draft.articleId}`,
    ).toEqual(beforeAudit);
    expect(await cacheEvents(draft.articleId)).toHaveLength(0);
  });
});
