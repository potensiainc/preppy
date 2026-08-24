import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { AuditWriter } from "@/src/application/audit-writer.server";
import { NotFoundError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import type { TransactionExecutor } from "@/src/infrastructure/db/runtime.server";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  acquireArticleSlugRegistryLock,
  findArticleById,
  findArticleForUpdate,
  findArticleSlugOwner,
  findRedirectBySourcePath,
  insertArticleDraft,
  listRedirectSourcesByTarget,
  loadArticleRelationIds,
  replaceArticleRelations,
  requireRelationTargetsExist,
  updateArticleRecord,
  upsertFlattenedArticleRedirects,
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
const runPrefix = `wp13-repo-${randomUUID()}`;
const articleIds = new Set<string>();
const adminIds = new Set<string>();
const institutionIds = new Set<string>();
const opportunityIds = new Set<string>();

async function createAdmin(): Promise<string> {
  const id = randomUUID();
  adminIds.add(id);
  await runtime.client`insert into admin_users(
      id, external_auth_subject, email, display_name, status
    ) values (
      ${id}, ${`${runPrefix}-admin-${id}`},
      ${`${id}@example.test`}, 'WP13 Repository Admin', 'ACTIVE'
    )`;
  return id;
}

async function createInstitution(): Promise<string> {
  const id = randomUUID();
  institutionIds.add(id);
  await runtime.client`insert into institutions(
      id, slug, display_name, category
    ) values (
      ${id}, ${`wp13-institution-${id}`}, 'WP13 Institution',
      'ENGLISH_KINDERGARTEN'
    )`;
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

function draftValues(adminId: string, slug: string) {
  const now = new Date("2026-08-25T01:00:00.000Z");
  return {
    slug,
    type: "GUIDE" as const,
    category: "ADMISSIONS_GENERAL" as const,
    status: "DRAFT" as const,
    title: "Repository guide",
    excerpt: null,
    contentHtml: "",
    seoTitle: null,
    seoDescription: null,
    canonicalUrl: null,
    robotsIndex: false,
    robotsFollow: true,
    featuredImageUrl: null,
    featuredImageAlt: null,
    authorAdminId: adminId,
    publishedAt: null,
    unpublishedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    await transaction`delete from url_redirects
      where source_path like ${`/articles/${runPrefix}%`}
         or target_path like ${`/articles/${runPrefix}%`}`;
    if (articleIds.size > 0) {
      await transaction`delete from audit_logs
        where entity_id in ${transaction([...articleIds])}`;
      await transaction`delete from articles
        where id in ${transaction([...articleIds])}`;
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
  articleIds.clear();
  adminIds.clear();
  institutionIds.clear();
  opportunityIds.clear();
}

describe("WP-13 executor-scoped editorial repository", () => {
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

  it("requires a TransactionExecutor for every write primitive", async () => {
    const adminId = await createAdmin();
    await expect(
      insertArticleDraft(
        runtime.executor as TransactionExecutor,
        draftValues(adminId, `${runPrefix}-scope`),
      ),
    ).rejects.toThrow("transaction executor");
  });

  it("inserts, locks, reads, and updates an Article without opening a transaction", async () => {
    const adminId = await createAdmin();
    const slug = `${runPrefix}-record`;

    const inserted = await runtime.transactionManager.run(async (executor) => {
      const created = await insertArticleDraft(
        executor,
        draftValues(adminId, slug),
      );
      articleIds.add(created.id);
      const locked = await findArticleForUpdate(executor, created.id);
      expect(locked?.id).toBe(created.id);
      return updateArticleRecord(executor, created.id, {
        title: "Updated repository guide",
        updatedAt: new Date("2026-08-25T01:01:00.000Z"),
      });
    });

    expect(inserted.title).toBe("Updated repository guide");
    expect((await findArticleById(runtime.executor, inserted.id))?.slug).toBe(
      slug,
    );
    expect((await findArticleSlugOwner(runtime.executor, slug))?.id).toBe(
      inserted.id,
    );
  });

  it("validates targets and replaces both relation sets in stable UUID order", async () => {
    const adminId = await createAdmin();
    const institutionB = await createInstitution();
    const institutionA = await createInstitution();
    const opportunity = await createOpportunity(institutionA);

    const article = await runtime.transactionManager.run(async (executor) => {
      const created = await insertArticleDraft(
        executor,
        draftValues(adminId, `${runPrefix}-relations`),
      );
      articleIds.add(created.id);
      await requireRelationTargetsExist(
        executor,
        [institutionB, institutionA],
        [opportunity],
      );
      await replaceArticleRelations(
        executor,
        created.id,
        [institutionB, institutionA],
        [opportunity],
      );
      return created;
    });

    expect(await loadArticleRelationIds(runtime.executor, article.id)).toEqual({
      institutionIds: [institutionA, institutionB].sort(),
      opportunityIds: [opportunity],
    });
    const institutionRows = await runtime.client<
      { institutionId: string; sortOrder: number }[]
    >`select institution_id as "institutionId", sort_order as "sortOrder"
      from article_institutions where article_id=${article.id}
      order by sort_order`;
    expect(institutionRows).toEqual(
      [institutionA, institutionB]
        .sort()
        .map((institutionId, sortOrder) => ({ institutionId, sortOrder })),
    );

    await expect(
      runtime.transactionManager.run((executor) =>
        requireRelationTargetsExist(executor, [randomUUID()], []),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("serializes and flattens A to B to C redirect history", async () => {
    const sourceA = `/articles/${runPrefix}-a`;
    const sourceB = `/articles/${runPrefix}-b`;
    const targetC = `/articles/${runPrefix}-c`;

    await runtime.transactionManager.run(async (executor) => {
      await acquireArticleSlugRegistryLock(executor);
      await upsertFlattenedArticleRedirects(
        executor,
        sourceA,
        sourceB,
        new Date("2026-08-25T02:00:00.000Z"),
      );
    });
    await runtime.transactionManager.run(async (executor) => {
      await acquireArticleSlugRegistryLock(executor);
      await upsertFlattenedArticleRedirects(
        executor,
        sourceB,
        targetC,
        new Date("2026-08-25T02:01:00.000Z"),
      );
    });

    expect(
      await findRedirectBySourcePath(runtime.executor, sourceA),
    ).toMatchObject({
      sourcePath: sourceA,
      targetPath: targetC,
      statusCode: 308,
    });
    expect(
      await findRedirectBySourcePath(runtime.executor, sourceB),
    ).toMatchObject({
      sourcePath: sourceB,
      targetPath: targetC,
      statusCode: 308,
    });
    expect(
      await listRedirectSourcesByTarget(runtime.executor, targetC, 101),
    ).toEqual([sourceA, sourceB]);
  });

  it("accepts only the bounded content fingerprint in Audit metadata", async () => {
    const adminId = await createAdmin();
    const entityId = randomUUID();
    articleIds.add(entityId);
    const fingerprint = `sha256:${"a".repeat(64)}` as const;

    const audit = await AuditWriter.write(
      {
        adminUserId: adminId,
        actionType: "ARTICLE_DRAFT_UPDATED",
        entityType: "ARTICLE",
        entityId,
        correlationId: randomUUID(),
        occurredAt: new Date("2026-08-25T03:00:00.000Z"),
        metadata: { contentFingerprint: fingerprint },
      },
      runtime.executor,
    );
    expect(audit.afterData).toMatchObject({
      metadata: { contentFingerprint: fingerprint },
    });

    await expect(
      AuditWriter.write(
        {
          adminUserId: adminId,
          actionType: "ARTICLE_DRAFT_UPDATED",
          entityType: "ARTICLE",
          entityId,
          correlationId: randomUUID(),
          occurredAt: new Date("2026-08-25T03:01:00.000Z"),
          metadata: {
            contentFingerprint: "sha256:raw-html" as `sha256:${string}`,
          },
        },
        runtime.executor,
      ),
    ).rejects.toThrow("Request validation failed");
  });
});
