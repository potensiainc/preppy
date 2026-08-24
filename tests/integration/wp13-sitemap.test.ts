import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { listPublicSitemapEntries } from "@/src/modules/public/sitemap-query.server";
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
const prefix = `wp13-map-${randomUUID()}`;
const adminIds = new Set<string>();

async function seedArticle(input: {
  suffix: string;
  status?: "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";
  robotsIndex?: boolean;
  html?: string;
  description?: string | null;
}) {
  const adminId = randomUUID();
  const id = randomUUID();
  const slug = `${prefix}-${input.suffix}`;
  adminIds.add(adminId);
  const status = input.status ?? "PUBLISHED";
  await runtime.client`insert into admin_users(id, external_auth_subject, email, display_name, status) values (${adminId}, ${`${prefix}-${adminId}`}, ${`${adminId}@example.test`}, 'Internal', 'ACTIVE')`;
  await runtime.client`insert into articles(id, slug, type, category, status, title, excerpt, content_html, robots_index, robots_follow, author_admin_id, published_at, updated_at)
    values (${id}, ${slug}, 'GUIDE', 'ADMISSIONS_GENERAL', ${status}, 'Sitemap Article', ${input.description ?? null}, ${input.html ?? "<p>Meaningful Article body with sufficient verified editorial content.</p>"}, ${input.robotsIndex ?? true}, true, ${adminId}, ${status === "PUBLISHED" ? "2026-08-25T01:00:00.000Z" : null}, '2026-08-25T02:00:00.000Z')`;
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

describe("WP-13 INDEX-only sitemap", () => {
  it("includes static canonicals and only meaningful INDEX Article canonicals without body leakage", async () => {
    const index = await seedArticle({
      suffix: "index",
      description: "Useful description",
      html: '<p onclick="bad()">Meaningful safe Article body with more than forty useful characters.</p><script>bad()</script>',
    });
    const thin = await seedArticle({
      suffix: "thin",
      description: "Thin",
      html: "<script>only unsafe text</script>",
    });
    const noindex = await seedArticle({
      suffix: "noindex",
      description: "Description",
      robotsIndex: false,
    });
    const draft = await seedArticle({
      suffix: "draft",
      status: "DRAFT",
      description: "Description",
    });
    const redirectSource = `${prefix}-historical`;
    await runtime.client`insert into url_redirects(source_path, target_path, status_code, reason) values (${`/articles/${redirectSource}`}, ${`/articles/${index.slug}`}, 308, 'ARTICLE_SLUG_CHANGED')`;

    const entries = await listPublicSitemapEntries(
      runtime.executor,
      "https://preppy.example",
    );
    expect(entries).toContainEqual({ url: "https://preppy.example/" });
    expect(entries).toContainEqual({
      url: "https://preppy.example/institutions",
    });
    expect(entries).toContainEqual({
      url: `https://preppy.example/articles/${index.slug}`,
      lastModified: "2026-08-25T02:00:00.000Z",
    });
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toMatch(
      new RegExp(
        `${thin.slug}|${noindex.slug}|${draft.slug}|${redirectSource}`,
      ),
    );
    expect(serialized).not.toMatch(
      /contentHtml|unsafeStored|sanitizedContent|onclick|script|admin|auth|api|my-preppy/i,
    );
  });
});
