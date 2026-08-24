import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAdminCommandContext } from "@/src/application/context";
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
  unpublishArticle,
} from "@/src/modules/editorial/article-commands.server";
import { resolveHistoricalArticleRedirect } from "@/src/modules/editorial/redirects.server";
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
const runPrefix = `wp13-redirect-${randomUUID()}`;
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
      'WP13 Redirect Admin', 'ACTIVE'
    )`;
  return id;
}

function context(adminUserId: string, iso: string) {
  return createAdminCommandContext({ adminUserId, occurredAt: new Date(iso) });
}

function candidate(slug: string, robotsIndex = true) {
  return {
    title: "Redirect target",
    type: "GUIDE",
    category: "ADMISSIONS_GENERAL",
    excerpt: "A complete description.",
    contentHtml: `<p>${"public".repeat(10)}</p>`,
    seoTitle: "Redirect target",
    seoDescription: "A complete SEO description.",
    canonicalUrl: `https://preppy.example/articles/${slug}`,
    robotsIndex,
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

describe("WP-13 public-state-gated historical redirects", () => {
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

  it("does not disclose an UNPUBLISHED flattened target, then revives history after republish", async () => {
    const adminId = await createAdmin();
    const slugA = `${runPrefix}-leak-a`;
    const slugB = `${runPrefix}-leak-b`;
    const slugC = `${runPrefix}-leak-c`;
    const draft = await createDraft(adminId, slugA, "2026-08-25T09:00:00.000Z");
    const published = await publishArticle(
      context(adminId, "2026-08-25T09:01:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: draft.updatedAt,
        candidate: candidate(slugA),
      },
      dependencies,
    );
    const toB = await changeArticleSlug(
      context(adminId, "2026-08-25T09:02:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: published.updatedAt,
        newSlug: slugB,
      },
      dependencies,
    );
    const unpublished = await unpublishArticle(
      context(adminId, "2026-08-25T09:03:00.000Z"),
      { articleId: draft.articleId, expectedUpdatedAt: toB.updatedAt },
      dependencies,
    );
    const toC = await changeArticleSlug(
      context(adminId, "2026-08-25T09:04:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: unpublished.updatedAt,
        newSlug: slugC,
      },
      dependencies,
    );

    expect(
      await resolveHistoricalArticleRedirect(
        runtime.executor,
        `/articles/${slugA}`,
      ),
    ).toEqual({ kind: "NOT_FOUND" });
    expect(
      await resolveHistoricalArticleRedirect(
        runtime.executor,
        `/articles/${slugB}`,
      ),
    ).toEqual({ kind: "NOT_FOUND" });

    await publishArticle(
      context(adminId, "2026-08-25T09:05:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: toC.updatedAt,
        candidate: candidate(slugC),
      },
      dependencies,
    );
    expect(
      await resolveHistoricalArticleRedirect(
        runtime.executor,
        `/articles/${slugA}`,
      ),
    ).toEqual({ kind: "REDIRECT", targetPath: `/articles/${slugC}` });
    expect(
      await resolveHistoricalArticleRedirect(
        runtime.executor,
        `/articles/${slugB}`,
      ),
    ).toEqual({ kind: "REDIRECT", targetPath: `/articles/${slugC}` });
  });

  it("returns only NOT_FOUND for draft, archived, missing, disabled, and noncanonical targets", async () => {
    const adminId = await createAdmin();
    const draftSlug = `${runPrefix}-target-draft`;
    const archivedSlug = `${runPrefix}-target-archived`;
    const draft = await createDraft(
      adminId,
      draftSlug,
      "2026-08-25T09:10:00.000Z",
    );
    const archivedDraft = await createDraft(
      adminId,
      archivedSlug,
      "2026-08-25T09:11:00.000Z",
    );
    await archiveArticle(
      context(adminId, "2026-08-25T09:12:00.000Z"),
      {
        articleId: archivedDraft.articleId,
        expectedUpdatedAt: archivedDraft.updatedAt,
      },
      dependencies,
    );
    const sources = {
      draft: `/articles/${runPrefix}-source-draft`,
      archived: `/articles/${runPrefix}-source-archived`,
      missing: `/articles/${runPrefix}-source-missing`,
      disabled: `/articles/${runPrefix}-source-disabled`,
      malformed: `/articles/${runPrefix}-source-malformed`,
    };
    await runtime.client`insert into url_redirects(
        source_path, target_path, status_code, disabled_at
      ) values
        (${sources.draft}, ${`/articles/${draftSlug}`}, 308, null),
        (${sources.archived}, ${`/articles/${archivedSlug}`}, 308, null),
        (${sources.missing}, ${`/articles/${runPrefix}-missing`}, 308, null),
        (${sources.disabled}, ${`/articles/${draftSlug}`}, 308, now()),
        (${sources.malformed}, '/articles/Bad-Slug', 308, null)`;

    for (const sourcePath of Object.values(sources)) {
      expect(
        await resolveHistoricalArticleRedirect(runtime.executor, sourcePath),
      ).toEqual({ kind: "NOT_FOUND" });
    }
    expect(draft.articleId).toEqual(expect.any(String));
  });

  it("allows a PUBLISHED robotsIndex=false target because public state, not indexing, authorizes 308", async () => {
    const adminId = await createAdmin();
    const slugA = `${runPrefix}-noindex-a`;
    const slugB = `${runPrefix}-noindex-b`;
    const draft = await createDraft(adminId, slugA, "2026-08-25T09:20:00.000Z");
    const published = await publishArticle(
      context(adminId, "2026-08-25T09:21:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: draft.updatedAt,
        candidate: candidate(slugA, false),
      },
      dependencies,
    );
    await changeArticleSlug(
      context(adminId, "2026-08-25T09:22:00.000Z"),
      {
        articleId: draft.articleId,
        expectedUpdatedAt: published.updatedAt,
        newSlug: slugB,
      },
      dependencies,
    );

    expect(
      await resolveHistoricalArticleRedirect(
        runtime.executor,
        `/articles/${slugA}`,
      ),
    ).toEqual({ kind: "REDIRECT", targetPath: `/articles/${slugB}` });
  });
});
