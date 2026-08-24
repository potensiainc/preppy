import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { resolvePublicArticlePage } from "@/src/modules/public/article-page.server";
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
const prefix = `wp13-public-${randomUUID()}`;
const adminIds = new Set<string>();

async function article(
  status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED",
  suffix: string,
) {
  const adminId = randomUUID();
  const id = randomUUID();
  const slug = `${prefix}-${suffix}`;
  adminIds.add(adminId);
  await runtime.client`insert into admin_users(id, external_auth_subject, email, display_name, status)
    values (${adminId}, ${`${prefix}-${adminId}`}, ${`${adminId}@example.test`}, 'Internal Operator', 'ACTIVE')`;
  await runtime.client`insert into articles(
      id, slug, type, category, status, title, excerpt, content_html,
      robots_index, robots_follow, author_admin_id, published_at
    ) values (
      ${id}, ${slug}, 'GUIDE', 'ADMISSIONS_GENERAL', ${status}, 'Public Article',
      'Summary', ${'<p onclick="bad()">Visible</p><script>private()</script>'},
      true, true, ${adminId}, ${status === "PUBLISHED" ? "2026-08-25T01:00:00.000Z" : null}
    )`;
  return { id, slug };
}

async function cleanup() {
  await runtime.client`delete from url_redirects where source_path like ${`/articles/${prefix}%`} or target_path like ${`/articles/${prefix}%`}`;
  await runtime.client`delete from articles where slug like ${`${prefix}%`}`;
  if (adminIds.size)
    await runtime.client`delete from admin_users where id in ${runtime.client([...adminIds])}`;
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

describe("WP-13 public Article resolution", () => {
  it("renders only a current PUBLISHED sanitized DTO with no internal Admin identity", async () => {
    const current = await article("PUBLISHED", "current");
    const resolution = await resolvePublicArticlePage(
      runtime.executor,
      current.slug,
      "https://preppy.example",
    );
    expect(resolution.kind).toBe("ARTICLE");
    const serialized = JSON.stringify(resolution);
    expect(serialized).toContain("sanitizedContentHtml");
    expect(serialized).toContain("Visible");
    expect(serialized).not.toMatch(
      /onclick|<script|private\(\)|Internal Operator|@example\.test|authorAdminId|authorDisplayName|unsafeStoredContentHtml/i,
    );
  });

  it("returns NOT_FOUND for current nonpublic states and invalid/missing slugs", async () => {
    for (const status of ["DRAFT", "UNPUBLISHED", "ARCHIVED"] as const) {
      const current = await article(status, status.toLowerCase());
      await expect(
        resolvePublicArticlePage(
          runtime.executor,
          current.slug,
          "https://preppy.example",
        ),
      ).resolves.toEqual({ kind: "NOT_FOUND" });
    }
    await expect(
      resolvePublicArticlePage(
        runtime.executor,
        "Bad%2FSlug",
        "https://preppy.example",
      ),
    ).resolves.toEqual({ kind: "NOT_FOUND" });
    await expect(
      resolvePublicArticlePage(
        runtime.executor,
        `${prefix}-missing`,
        "https://preppy.example",
      ),
    ).resolves.toEqual({ kind: "NOT_FOUND" });
  });

  it("redirects one historical row only while its canonical target remains PUBLIC", async () => {
    const target = await article("PUBLISHED", "target");
    const oldSlug = `${prefix}-old`;
    await runtime.client`insert into url_redirects(source_path, target_path, status_code, reason)
      values (${`/articles/${oldSlug}`}, ${`/articles/${target.slug}`}, 308, 'ARTICLE_SLUG_CHANGED')`;
    await expect(
      resolvePublicArticlePage(
        runtime.executor,
        oldSlug,
        "https://preppy.example",
      ),
    ).resolves.toEqual({
      kind: "REDIRECT",
      targetPath: `/articles/${target.slug}`,
    });
    await runtime.client`update articles set status='UNPUBLISHED', unpublished_at=now() where id=${target.id}`;
    await expect(
      resolvePublicArticlePage(
        runtime.executor,
        oldSlug,
        "https://preppy.example",
      ),
    ).resolves.toEqual({ kind: "NOT_FOUND" });
  });
});
