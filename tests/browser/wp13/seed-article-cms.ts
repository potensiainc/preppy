import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

import { assertDedicatedTestDatabaseUrl } from "../../support/test-database";
import {
  seedAdminConsole,
  WP11_BROWSER_FIXTURE,
} from "../wp11/seed-admin-console";

export const WP13_BROWSER_FIXTURE = {
  activeAdminId: WP11_BROWSER_FIXTURE.activeAdminId,
  activeSubject: "wp13-browser-active",
  activeAdminStatus: "ACTIVE",
  internalAdminDisplayName: "WP-13 Internal Operator",
  institutionId: WP11_BROWSER_FIXTURE.institutionId,
  institutionPath: "/institutions/wp11-browser-institution",
  opportunityId: WP11_BROWSER_FIXTURE.opportunityId,
  opportunityPath: "/opportunities/wp11-browser-opportunity",
  historicalArticleId: "17171717-1717-4171-8171-171717171717",
  historicalArticleSlug: "wp13-historical-unsafe",
  historicalUnsafeHtml:
    '<h2 onclick="globalThis.wp13Xss=true">Historical unsafe body</h2><script>globalThis.wp13Xss=true</script><p><a href="javascript:alert(1)">unsafe link</a></p>',
  emptyProductSignalBaseline: {
    opportunityChanges: 0,
    notifications: 0,
    notificationDeliveries: 0,
    deliveryAttempts: 0,
    emailOutboxEvents: 0,
  },
} as const;

export type Wp13ProductSignalCounts = Readonly<{
  opportunityChanges: number;
  notifications: number;
  notificationDeliveries: number;
  deliveryAttempts: number;
  emailOutboxEvents: number;
}>;

export async function readWp13ProductSignalCounts(
  databaseUrl: string,
): Promise<Wp13ProductSignalCounts> {
  assertDedicatedTestDatabaseUrl(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [counts] = await sql<
      {
        opportunity_changes: number;
        notifications: number;
        notification_deliveries: number;
        delivery_attempts: number;
        email_outbox_events: number;
      }[]
    >`
      select
        (select count(*)::int from opportunity_changes) as opportunity_changes,
        (select count(*)::int from notifications) as notifications,
        (select count(*)::int from notification_deliveries) as notification_deliveries,
        (select count(*)::int from notification_delivery_attempts) as delivery_attempts,
        (
          select count(*)::int
          from outbox_events
          where event_type = 'DELIVERY_EMAIL_SEND'
        ) as email_outbox_events
    `;
    if (!counts) throw new Error("WP-13 Product-signal count query failed");
    return {
      opportunityChanges: counts.opportunity_changes,
      notifications: counts.notifications,
      notificationDeliveries: counts.notification_deliveries,
      deliveryAttempts: counts.delivery_attempts,
      emailOutboxEvents: counts.email_outbox_events,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function assertWp13ProductSignalsUnchanged(
  baseline: Wp13ProductSignalCounts,
  current: Wp13ProductSignalCounts,
): void {
  for (const key of Object.keys(
    baseline,
  ) as (keyof Wp13ProductSignalCounts)[]) {
    if (baseline[key] !== current[key]) {
      throw new Error(
        `WP-13 Product signal changed: ${key} ${baseline[key]} -> ${current[key]}`,
      );
    }
  }
}

export async function seedWp13ArticleCmsFixture(databaseUrl: string) {
  assertDedicatedTestDatabaseUrl(databaseUrl);
  await seedAdminConsole(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.begin(async (transaction) => {
      await transaction`
        update admin_users
        set
          external_auth_subject = ${WP13_BROWSER_FIXTURE.activeSubject},
          display_name = ${WP13_BROWSER_FIXTURE.internalAdminDisplayName}
        where id = ${WP13_BROWSER_FIXTURE.activeAdminId}
      `;
      await transaction`
        insert into articles (
          id, slug, type, category, status, title, excerpt, content_html,
          robots_index, robots_follow, author_admin_id
        ) values (
          ${WP13_BROWSER_FIXTURE.historicalArticleId},
          ${WP13_BROWSER_FIXTURE.historicalArticleSlug},
          'GUIDE', 'ADMISSIONS_GENERAL', 'DRAFT',
          'Historical unsafe Article',
          'Legacy content used to prove read-boundary sanitization.',
          ${WP13_BROWSER_FIXTURE.historicalUnsafeHtml},
          false, true, ${WP13_BROWSER_FIXTURE.activeAdminId}
        )
      `;
      await transaction`
        insert into article_institutions (
          article_id, institution_id, relation_type, sort_order
        ) values (
          ${WP13_BROWSER_FIXTURE.historicalArticleId},
          ${WP13_BROWSER_FIXTURE.institutionId},
          'RELATED', 0
        )
      `;
      await transaction`
        insert into article_opportunities (
          article_id, opportunity_id, relation_type, sort_order
        ) values (
          ${WP13_BROWSER_FIXTURE.historicalArticleId},
          ${WP13_BROWSER_FIXTURE.opportunityId},
          'RELATED', 0
        )
      `;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }

  const productSignals = await readWp13ProductSignalCounts(databaseUrl);
  assertWp13ProductSignalsUnchanged(
    WP13_BROWSER_FIXTURE.emptyProductSignalBaseline,
    productSignals,
  );
  return { ...WP13_BROWSER_FIXTURE, productSignals };
}

export async function inspectWp13ArticleCmsFixture(
  databaseUrl: string,
  articleId: string,
) {
  assertDedicatedTestDatabaseUrl(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [article] = await sql<
      {
        id: string;
        slug: string;
        title: string;
        status: string;
        unsafe_content: boolean;
        institution_relations: number;
        opportunity_relations: number;
        cache_events: number;
        audits: number;
      }[]
    >`
      select
        article.id::text as id,
        article.slug,
        article.title,
        article.status,
        article.content_html ~* '<script|onclick|javascript:|<svg|<math' as unsafe_content,
        (
          select count(*)::int from article_institutions relation
          where relation.article_id = article.id
        ) as institution_relations,
        (
          select count(*)::int from article_opportunities relation
          where relation.article_id = article.id
        ) as opportunity_relations,
        (
          select count(*)::int from outbox_events event
          where event.aggregate_id = article.id
            and event.event_type = 'CACHE_REVALIDATION_REQUESTED'
        ) as cache_events,
        (
          select count(*)::int from audit_logs audit
          where audit.entity_id = article.id
            and audit.entity_type = 'ARTICLE'
        ) as audits
      from articles article
      where article.id = ${articleId}
    `;
    if (!article) throw new Error("WP-13 browser Article was not found");
    const redirects = await sql<{ source_path: string; target_path: string }[]>`
      select source_path, target_path
      from url_redirects
      where target_path = ${`/articles/${article.slug}`}
      order by source_path
    `;
    return {
      ...article,
      redirects: redirects.map((row) => ({
        sourcePath: row.source_path,
        targetPath: row.target_path,
      })),
      productSignals: await readWp13ProductSignalCounts(databaseUrl),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function runStandalone(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required");

  if (process.argv.includes("--signals")) {
    process.stdout.write(
      `${JSON.stringify(await readWp13ProductSignalCounts(databaseUrl))}\n`,
    );
    return;
  }
  if (process.argv.includes("--inspect")) {
    const articleIdIndex = process.argv.indexOf("--article-id");
    const articleId = process.argv[articleIdIndex + 1];
    if (articleIdIndex < 0 || !articleId) {
      throw new Error("--inspect requires --article-id <uuid>");
    }
    process.stdout.write(
      `${JSON.stringify(await inspectWp13ArticleCmsFixture(databaseUrl, articleId))}\n`,
    );
    return;
  }
  if (!process.argv.includes("--seed")) {
    throw new Error("Use --seed, --signals, or --inspect --article-id <uuid>");
  }
  process.stdout.write(
    `${JSON.stringify({ type: "WP13_ARTICLE_CMS_SEEDED", ...(await seedWp13ArticleCmsFixture(databaseUrl)) })}\n`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  runStandalone().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "WP-13 browser seed failed"}\n`,
    );
    process.exit(1);
  });
}
