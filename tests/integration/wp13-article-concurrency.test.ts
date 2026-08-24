import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminCommandContext } from "@/src/application/context";
import { ConflictError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
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
  DATABASE_MAX_CONNECTIONS: 8,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const runPrefix = `wp13-race-${randomUUID()}`;
const adminId = randomUUID();
const institutionA = randomUUID();
const institutionB = randomUUID();
const dependencies = {
  transactionManager: runtime.transactionManager,
  appBaseUrl: "https://preppy.example",
};

function context(iso: string) {
  return createAdminCommandContext({
    adminUserId: adminId,
    occurredAt: new Date(iso),
  });
}

function candidate(slug: string, variant: "A" | "B", institutionId?: string) {
  return {
    title: `Candidate ${variant}`,
    type: "GUIDE",
    category: "ADMISSIONS_GENERAL",
    excerpt: `Candidate ${variant} description.`,
    contentHtml: `<p>${variant.repeat(50)}</p>`,
    seoTitle: `Candidate ${variant}`,
    seoDescription: `Candidate ${variant} SEO description.`,
    canonicalUrl: `https://preppy.example/articles/${slug}`,
    robotsIndex: true,
    robotsFollow: true,
    featuredImageUrl: null,
    featuredImageAlt: null,
    institutionIds: institutionId ? [institutionId] : [],
    opportunityIds: [],
  };
}

describe("WP-13 Article concurrent stale-write safety", () => {
  beforeAll(async () => {
    await schemaLockSql`
      select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
    `;
    await migrateDatabase(databaseUrl);
    await runtime.client`insert into admin_users(
        id, external_auth_subject, email, display_name, status
      ) values (
        ${adminId}, ${`${runPrefix}-admin`}, ${`${adminId}@example.test`},
        'WP13 Race Admin', 'ACTIVE'
      )`;
    await runtime.client`insert into institutions(id, slug, display_name, category)
      values
        (${institutionA}, ${`wp13-institution-${institutionA}`}, 'Race A', 'ENGLISH_KINDERGARTEN'),
        (${institutionB}, ${`wp13-institution-${institutionB}`}, 'Race B', 'ENGLISH_KINDERGARTEN')`;
  });

  afterAll(async () => {
    const rows = await runtime.client<{ id: string }[]>`
      select id from articles where slug like ${`${runPrefix}%`}`;
    const ids = rows.map((row) => row.id);
    await runtime.client.begin(async (transaction) => {
      if (ids.length > 0) {
        await transaction`delete from outbox_events where aggregate_id in ${transaction(ids)}`;
        await transaction`delete from audit_logs where entity_id in ${transaction(ids)}`;
        await transaction`delete from articles where id in ${transaction(ids)}`;
      }
      await transaction`delete from institutions where id in (${institutionA}, ${institutionB})`;
      await transaction`delete from admin_users where id=${adminId}`;
    });
    await schemaLockSql`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
    await schemaLockSql.end({ timeout: 5 });
    await closeRuntimeDatabase();
  });

  it("commits exactly one whole published candidate in three repeated races", async () => {
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const slug = `${runPrefix}-${iteration}`;
      const draft = await createArticleDraft(
        context(`2026-08-25T07:0${iteration}:00.000Z`),
        {
          slug,
          title: "Initial",
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
        },
        dependencies,
      );
      const first = await publishArticle(
        context(`2026-08-25T07:0${iteration}:01.000Z`),
        {
          articleId: draft.articleId,
          expectedUpdatedAt: draft.updatedAt,
          candidate: candidate(slug, "A"),
        },
        dependencies,
      );

      const raceTime = `2026-08-25T07:0${iteration}:02.000Z`;
      const settled = await Promise.allSettled([
        publishArticle(
          context(raceTime),
          {
            articleId: draft.articleId,
            expectedUpdatedAt: first.updatedAt,
            candidate: candidate(slug, "A", institutionA),
          },
          dependencies,
        ),
        publishArticle(
          context(raceTime),
          {
            articleId: draft.articleId,
            expectedUpdatedAt: first.updatedAt,
            candidate: candidate(slug, "B", institutionB),
          },
          dependencies,
        ),
      ]);

      expect(
        settled.filter((entry) => entry.status === "fulfilled"),
      ).toHaveLength(1);
      const rejection = settled.find((entry) => entry.status === "rejected");
      expect(rejection).toMatchObject({ reason: expect.any(ConflictError) });

      const finalArticle = await findArticleById(
        runtime.executor,
        draft.articleId,
      );
      const finalRelations = await loadArticleRelationIds(
        runtime.executor,
        draft.articleId,
      );
      if (finalArticle?.title === "Candidate A") {
        expect(finalArticle.contentHtml).toBe(`<p>${"A".repeat(50)}</p>`);
        expect(finalRelations.institutionIds).toEqual([institutionA]);
      } else {
        expect(finalArticle?.title).toBe("Candidate B");
        expect(finalArticle?.contentHtml).toBe(`<p>${"B".repeat(50)}</p>`);
        expect(finalRelations.institutionIds).toEqual([institutionB]);
      }
      const [events] = await runtime.client<{ count: number }[]>`
        select count(*)::int as count from outbox_events
        where aggregate_id=${draft.articleId}`;
      expect(events?.count).toBe(2);
    }
  });

  it("serializes a published edit racing an unpublish without a hybrid result", async () => {
    const slug = `${runPrefix}-publish-unpublish`;
    const draft = await createArticleDraft(
      context("2026-08-25T07:10:00.000Z"),
      {
        slug,
        title: "Initial",
        type: "GUIDE",
        category: "ADMISSIONS_GENERAL",
      },
      dependencies,
    );
    const first = await publishArticle(
      context("2026-08-25T07:10:01.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: draft.updatedAt,
        candidate: candidate(slug, "A"),
      },
      dependencies,
    );

    const settled = await Promise.allSettled([
      publishArticle(
        context("2026-08-25T07:10:02.000Z"),
        {
          articleId: draft.articleId,
          expectedUpdatedAt: first.updatedAt,
          candidate: candidate(slug, "B", institutionB),
        },
        dependencies,
      ),
      unpublishArticle(
        context("2026-08-25T07:10:02.000Z"),
        { articleId: draft.articleId, expectedUpdatedAt: first.updatedAt },
        dependencies,
      ),
    ]);

    expect(
      settled.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    expect(settled.find((entry) => entry.status === "rejected")).toMatchObject({
      reason: expect.any(ConflictError),
    });
    const finalArticle = await findArticleById(
      runtime.executor,
      draft.articleId,
    );
    const finalRelations = await loadArticleRelationIds(
      runtime.executor,
      draft.articleId,
    );
    if (finalArticle?.status === "PUBLISHED") {
      expect(finalArticle.title).toBe("Candidate B");
      expect(finalArticle.contentHtml).toBe(`<p>${"B".repeat(50)}</p>`);
      expect(finalRelations.institutionIds).toEqual([institutionB]);
    } else {
      expect(finalArticle?.status).toBe("UNPUBLISHED");
      expect(finalArticle?.title).toBe("Candidate A");
      expect(finalArticle?.contentHtml).toBe(`<p>${"A".repeat(50)}</p>`);
      expect(finalRelations.institutionIds).toEqual([]);
    }
    const [events] = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from outbox_events
      where aggregate_id=${draft.articleId}`;
    expect(events?.count).toBe(2);
  });
});
