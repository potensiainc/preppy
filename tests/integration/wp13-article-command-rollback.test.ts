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
  createArticleDraft,
  setArticleRelations,
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
const runPrefix = `wp13-rollback-${randomUUID()}`;
const adminIds = new Set<string>();
const institutionIds = new Set<string>();

async function createAdmin(): Promise<string> {
  const id = randomUUID();
  adminIds.add(id);
  await runtime.client`insert into admin_users(
      id, external_auth_subject, email, display_name, status
    ) values (
      ${id}, ${`${runPrefix}-${id}`}, ${`${id}@example.test`},
      'WP13 Rollback Admin', 'ACTIVE'
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

function context(adminUserId: string, occurredAt: string) {
  return createAdminCommandContext({
    adminUserId,
    occurredAt: new Date(occurredAt),
  });
}

const baseDependencies = {
  transactionManager: runtime.transactionManager,
  appBaseUrl: "https://preppy.example",
};

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
}

describe("WP-13 Article command rollback", () => {
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

  it("rolls back Article creation when Audit fails after the insert", async () => {
    const adminId = await createAdmin();
    const slug = `${runPrefix}-create`;

    await expect(
      createArticleDraft(
        context(adminId, "2026-08-25T05:00:00.000Z"),
        {
          slug,
          title: "Rollback",
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
        },
        {
          ...baseDependencies,
          writeAudit: async () => {
            throw new Error("injected audit failure");
          },
        },
      ),
    ).rejects.toThrow("injected audit failure");

    const rows = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from articles where slug=${slug}`;
    expect(rows[0]?.count).toBe(0);
  });

  it("rolls back relation replacement and updatedAt when Audit fails", async () => {
    const adminId = await createAdmin();
    const institutionId = await createInstitution();
    const created = await createArticleDraft(
      context(adminId, "2026-08-25T05:10:00.000Z"),
      {
        slug: `${runPrefix}-relations`,
        title: "Rollback",
        type: "GUIDE",
        category: "ADMISSIONS_GENERAL",
      },
      baseDependencies,
    );
    const before = await findArticleById(runtime.executor, created.articleId);

    await expect(
      setArticleRelations(
        context(adminId, "2026-08-25T05:11:00.000Z"),
        {
          articleId: created.articleId,
          expectedUpdatedAt: before!.updatedAt.toISOString(),
          institutionIds: [institutionId],
          opportunityIds: [],
        },
        {
          ...baseDependencies,
          writeAudit: async () => {
            throw new Error("injected audit failure");
          },
        },
      ),
    ).rejects.toThrow("injected audit failure");

    expect(
      await loadArticleRelationIds(runtime.executor, created.articleId),
    ).toEqual({ institutionIds: [], opportunityIds: [] });
    expect(await findArticleById(runtime.executor, created.articleId)).toEqual(
      before,
    );
  });
});
