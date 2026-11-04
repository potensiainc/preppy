/**
 * Fast article publishing for operators and automation.
 *
 *   npm run content:upsert -- --file payload.json            # dry run
 *   npm run content:upsert -- --file payload.json --apply    # create/update + publish
 *
 * payload.json is one article or an array:
 * {
 *   "slug": "kbes-2027-admission",          // lowercase-hyphen, never changes
 *   "title": "...", "type": "GUIDE", "category": "PRIVATE_ELEMENTARY",
 *   "excerpt": "...", "seoTitle": null, "seoDescription": "...",
 *   "contentHtml": "<h2>...</h2><p>...</p>",   // p,h2-h4,strong,em,ul,ol,li,a,blockquote,hr
 *   "institutionSlugs": ["kbes"], "opportunitySlugs": []
 * }
 *
 * It runs the same editorial commands as /admin (sanitizer, audit log, cache
 * outbox), attributed to the content-publisher admin. Articles last changed by
 * a person in /admin are skipped unless --force, so manual edits are never
 * overwritten by automation.
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

import { and, desc, eq, inArray } from "drizzle-orm";

import { createAdminCommandContext } from "../../src/application/context";
import {
  adminUsers,
  auditLogs,
  institutions,
  opportunities,
  articleCategoryValues,
  articleTypeValues,
} from "../../src/db/schema";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "../../src/infrastructure/db/runtime.server";
import {
  createArticleDraft,
  publishArticle,
} from "../../src/modules/editorial/article-commands.server";
import { findArticleBySlug } from "../../src/modules/editorial/repository.server";

const PUBLISHER_EMAIL = "content-publisher@preppy.invalid";

type Payload = {
  slug: string;
  title: string;
  type: (typeof articleTypeValues)[number];
  category: (typeof articleCategoryValues)[number];
  excerpt: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  contentHtml: string;
  institutionSlugs?: string[];
  opportunitySlugs?: string[];
  robotsIndex?: boolean;
};

const { values } = parseArgs({
  options: {
    file: { type: "string" },
    apply: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  throw new Error(message);
}

async function main() {
  if (!values.file) fail("--file is required");
  if (!process.env.APP_BASE_URL) fail("APP_BASE_URL is required");
  const raw = JSON.parse(await readFile(values.file, "utf8")) as
    Payload | Payload[];
  const items = Array.isArray(raw) ? raw : [raw];
  const database = getRuntimeDatabase();
  const executor = database.executor;
  const appBaseUrl = new URL(process.env.APP_BASE_URL).origin;
  const dependencies = {
    transactionManager: database.transactionManager,
    appBaseUrl,
  };

  const [publisher] = await executor.drizzle
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, PUBLISHER_EMAIL))
    .limit(1);
  if (!publisher) fail(`${PUBLISHER_EMAIL} admin is missing`);

  const results: unknown[] = [];
  for (const item of items) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(item.slug))
      fail(`invalid slug ${item.slug}`);
    if (!articleTypeValues.includes(item.type))
      fail(`invalid type ${item.type}`);
    if (!articleCategoryValues.includes(item.category))
      fail(`invalid category ${item.category}`);

    const institutionSlugs = item.institutionSlugs ?? [];
    const opportunitySlugs = item.opportunitySlugs ?? [];
    const institutionRows = institutionSlugs.length
      ? await executor.drizzle
          .select({ id: institutions.id, slug: institutions.slug })
          .from(institutions)
          .where(inArray(institutions.slug, institutionSlugs))
      : [];
    const opportunityRows = opportunitySlugs.length
      ? await executor.drizzle
          .select({ id: opportunities.id, slug: opportunities.slug })
          .from(opportunities)
          .where(inArray(opportunities.slug, opportunitySlugs))
      : [];
    if (institutionRows.length !== institutionSlugs.length)
      fail(`${item.slug}: unknown institution slug`);
    if (opportunityRows.length !== opportunitySlugs.length)
      fail(`${item.slug}: unknown opportunity slug`);

    const existing = await findArticleBySlug(executor, item.slug);
    if (existing && !values.force) {
      const [lastChange] = await executor.drizzle
        .select({ adminUserId: auditLogs.adminUserId })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, "ARTICLE"),
            eq(auditLogs.entityId, existing.id),
          ),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(1);
      if (lastChange && lastChange.adminUserId !== publisher.id) {
        results.push({ slug: item.slug, action: "SKIPPED_HUMAN_EDIT" });
        continue;
      }
    }
    if (!values.apply) {
      results.push({
        slug: item.slug,
        action: existing ? "WOULD_UPDATE" : "WOULD_CREATE",
        bytes: Buffer.byteLength(item.contentHtml, "utf8"),
      });
      continue;
    }

    const context = () =>
      createAdminCommandContext({
        adminUserId: publisher.id,
        reason: "CONTENT_AUTOMATION",
      });
    let updatedAt = existing?.updatedAt.toISOString();
    let articleId = existing?.id;
    if (!existing) {
      const created = await createArticleDraft(
        context(),
        {
          slug: item.slug,
          title: item.title,
          type: item.type,
          category: item.category,
        },
        dependencies,
      );
      articleId = created.articleId;
      updatedAt = created.updatedAt;
    }
    const published = await publishArticle(
      context(),
      {
        articleId,
        expectedUpdatedAt: updatedAt,
        candidate: {
          title: item.title,
          type: item.type,
          category: item.category,
          excerpt: item.excerpt,
          contentHtml: item.contentHtml,
          seoTitle: item.seoTitle ?? null,
          seoDescription: item.seoDescription ?? null,
          canonicalUrl: null,
          robotsIndex: item.robotsIndex ?? true,
          robotsFollow: true,
          featuredImageUrl: null,
          featuredImageAlt: null,
          institutionIds: institutionRows.map((row) => row.id),
          opportunityIds: opportunityRows.map((row) => row.id),
        },
      },
      dependencies,
    );
    results.push({
      slug: item.slug,
      action: existing ? "UPDATED" : "CREATED",
      url: `${appBaseUrl}/articles/${item.slug}`,
      updatedAt: published.updatedAt,
    });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  await closeRuntimeDatabase();
}
