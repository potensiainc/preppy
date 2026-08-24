import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AdminCommandContext } from "@/src/application/context";
import { ForbiddenError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  handleAdminCreateArticleRequest,
  handleAdminUpdateArticleDraftRequest,
} from "@/src/modules/admin/http/article-commands.server";
import {
  createArticleDraft,
  updateArticleDraft,
} from "@/src/modules/editorial/article-commands.server";
import { findArticleById } from "@/src/modules/editorial/repository.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const appBaseUrl = "https://preppy.example";
const prefix = `wp13-http-${randomUUID()}`;
const adminIds = new Set<string>();

async function admin(): Promise<string> {
  const id = randomUUID();
  adminIds.add(id);
  await runtime.client`insert into admin_users(
      id, external_auth_subject, email, display_name, status
    ) values (
      ${id}, ${`${prefix}-${id}`}, ${`${id}@example.test`}, 'HTTP Admin', 'ACTIVE'
    )`;
  return id;
}

function request(body: unknown, origin = appBaseUrl): Request {
  return new Request(`${appBaseUrl}/api/admin/articles`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

function pipeline(adminUserId: string, occurredAt: string) {
  return {
    requireCurrentAdmin: async () => ({
      adminUserId,
      displayName: "HTTP Admin",
    }),
    getAppBaseUrl: () => appBaseUrl,
    createContext: ({
      reason,
    }: {
      adminUserId: string;
      reason: string;
    }): AdminCommandContext => ({
      adminUserId,
      reason,
      occurredAt: new Date(occurredAt),
      correlationId: randomUUID(),
    }),
  };
}

const commandDependencies = {
  transactionManager: runtime.transactionManager,
  appBaseUrl,
};

async function cleanup(): Promise<void> {
  await runtime.client.begin(async (transaction) => {
    const articles = await transaction<{ id: string }[]>`
      select id from articles where slug like ${`${prefix}%`}`;
    const ids = articles.map((row) => row.id);
    if (ids.length > 0) {
      await transaction`delete from audit_logs where entity_id in ${transaction(ids)}`;
      await transaction`delete from outbox_events where aggregate_id in ${transaction(ids)}`;
      await transaction`delete from articles where id in ${transaction(ids)}`;
    }
    if (adminIds.size > 0) {
      await transaction`delete from admin_users where id in ${transaction([...adminIds])}`;
    }
  });
  adminIds.clear();
}

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
  await migrateDatabase(databaseUrl);
});
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await schemaLockSql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
  await schemaLockSql.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("WP-13 Admin Article HTTP integration", () => {
  it("creates through the command boundary, then maps a stale draft edit to safe 409 without overwrite", async () => {
    const adminUserId = await admin();
    const slug = `${prefix}-stale`;
    const createResponse = await handleAdminCreateArticleRequest(
      request({
        slug,
        title: "HTTP Article",
        type: "GUIDE",
        category: "ADMISSIONS_GENERAL",
      }),
      {
        ...pipeline(adminUserId, "2026-08-25T06:00:00.000Z"),
        createArticleDraft: (context, input) =>
          createArticleDraft(context, input, commandDependencies),
      },
    );
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as {
      data: { articleId: string };
    };
    const before = await findArticleById(
      runtime.executor,
      created.data.articleId,
    );
    const maliciousHtml =
      '<script>secret()</script><p onclick="secret()">body</p>';

    const staleResponse = await handleAdminUpdateArticleDraftRequest(
      request({
        expectedUpdatedAt: "2026-08-25T00:00:00.000Z",
        candidate: {
          title: "Stale overwrite",
          type: "GUIDE",
          category: "ADMISSIONS_GENERAL",
          excerpt: "Summary",
          contentHtml: maliciousHtml,
          seoTitle: null,
          seoDescription: "Summary",
          canonicalUrl: null,
          robotsIndex: false,
          robotsFollow: true,
          featuredImageUrl: null,
          featuredImageAlt: null,
        },
      }),
      { articleId: created.data.articleId },
      {
        ...pipeline(adminUserId, "2026-08-25T06:01:00.000Z"),
        updateArticleDraft: (context, input) =>
          updateArticleDraft(context, input, commandDependencies),
      },
    );
    const serialized = JSON.stringify(await staleResponse.json());
    expect(staleResponse.status).toBe(409);
    expect(serialized).toContain("다른 운영자가 먼저 변경했을 수 있습니다.");
    expect(serialized).not.toContain("secret");
    expect(
      await findArticleById(runtime.executor, created.data.articleId),
    ).toEqual(before);
  });

  it("fails closed for non-Admin and cross-origin requests before any write", async () => {
    const adminUserId = await admin();
    const before = await runtime.client<{ count: number }[]>`
      select count(*)::int as count from articles where slug like ${`${prefix}%`}`;
    const body = {
      slug: `${prefix}-denied`,
      title: "Denied",
      type: "GUIDE",
      category: "ADMISSIONS_GENERAL",
    };
    const command = (context: AdminCommandContext, input: unknown) =>
      createArticleDraft(context, input, commandDependencies);

    const unauthorized = await handleAdminCreateArticleRequest(request(body), {
      ...pipeline(adminUserId, "2026-08-25T06:10:00.000Z"),
      requireCurrentAdmin: async () => {
        throw new ForbiddenError();
      },
      createArticleDraft: command,
    });
    const crossOrigin = await handleAdminCreateArticleRequest(
      request(body, "https://evil.example"),
      {
        ...pipeline(adminUserId, "2026-08-25T06:11:00.000Z"),
        createArticleDraft: command,
      },
    );

    expect(unauthorized.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(
      await runtime.client<{ count: number }[]>`
        select count(*)::int as count from articles where slug like ${`${prefix}%`}`,
    ).toEqual(before);
  });
});
