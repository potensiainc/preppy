import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

import { migrateDatabase } from "@/src/db/migrate";
import { createUserSessionCookie } from "@/src/modules/auth/session.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

export const WP14_BROWSER_FIXTURE = {
  userId: "14141414-1414-4414-8414-141414141414",
  institutionId: "14141414-1414-4414-8414-141414141415",
  schoolId: "14141414-1414-4414-8414-141414141416",
  sourceId: "14141414-1414-4414-8414-141414141417",
  sourceBindingId: "14141414-1414-4414-8414-141414141418",
  monitorConfigId: "14141414-1414-4414-8414-141414141419",
  articleId: "14141414-1414-4414-8414-141414141420",
  institutionSlug: "wp14-browser-academy",
  articleSlug: "wp14-browser-admissions-guide",
} as const;

async function resetFixture(sql: postgres.Sql) {
  const fixture = WP14_BROWSER_FIXTURE;
  await sql.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`delete from follow_episodes where follow_id in (select id from follows where user_id=${fixture.userId})`;
    await transaction`delete from follows where user_id=${fixture.userId}`;
    await transaction`delete from consent_decisions where user_id=${fixture.userId}`;
    await transaction`delete from notification_preferences where user_id=${fixture.userId}`;
    await transaction`delete from user_interest_categories where user_id=${fixture.userId}`;
    await transaction`delete from user_interest_regions where user_id=${fixture.userId}`;
    await transaction`delete from user_profiles where user_id=${fixture.userId}`;
    await transaction`delete from user_emails where user_id=${fixture.userId}`;
    await transaction`delete from auth_identities where user_id=${fixture.userId}`;
    await transaction`delete from users where id=${fixture.userId}`;
    await transaction`delete from article_institutions where article_id=${fixture.articleId}`;
    await transaction`delete from articles where id=${fixture.articleId}`;
    await transaction`delete from source_monitor_configs where source_id=${fixture.sourceId}`;
    await transaction`delete from source_bindings where id=${fixture.sourceBindingId}`;
    await transaction`delete from institution_school_links where institution_id=${fixture.institutionId}`;
    await transaction`delete from sources where id=${fixture.sourceId}`;
    await transaction`delete from institutions where id=${fixture.institutionId}`;
    await transaction`delete from schools where id=${fixture.schoolId}`;
  });
}

export async function seedWp14AnalyticsFixture(
  databaseUrl: string,
  sessionSecret: string,
) {
  assertDedicatedTestDatabaseUrl(databaseUrl);
  await migrateDatabase(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1 });
  const fixture = WP14_BROWSER_FIXTURE;
  try {
    await resetFixture(sql);
    await sql.begin(async (transaction) => {
      await transaction`
        insert into users (id, status, created_at)
        values (${fixture.userId}, 'PENDING', '2026-08-25T00:00:00.000Z')
      `;
      await transaction`
        insert into schools (
          id, slug, canonical_name, school_type, lifecycle_status, is_public
        ) values (
          ${fixture.schoolId}, 'wp14-browser-school', 'WP14 Browser School',
          'INTERNATIONAL_SCHOOL', 'ACTIVE', true
        )
      `;
      await transaction`
        insert into institutions (
          id, slug, display_name, category, operational_state,
          publication_state, region_code, short_description, published_at
        ) values (
          ${fixture.institutionId}, ${fixture.institutionSlug},
          'WP14 Browser Academy', 'INTERNATIONAL_SCHOOL', 'ACTIVE',
          'PUBLISHED', 'KR-11',
          'A browser fixture institution with canonical public information.',
          '2026-08-25T00:00:00.000Z'
        )
      `;
      await transaction`
        insert into institution_school_links (institution_id, school_id, link_reason)
        values (${fixture.institutionId}, ${fixture.schoolId}, 'WP14_BROWSER_FIXTURE')
      `;
      await transaction`
        insert into sources (
          id, canonical_url, source_type, authority_level,
          lifecycle_status, source_name
        ) values (
          ${fixture.sourceId}, 'https://official.example/wp14-browser-academy',
          'OFFICIAL_SCHOOL_PAGE', 'PRIMARY', 'ACTIVE',
          'WP14 Browser Academy Official'
        )
      `;
      await transaction`
        insert into source_bindings (
          id, source_id, school_id, source_role, priority, is_active
        ) values (
          ${fixture.sourceBindingId}, ${fixture.sourceId}, ${fixture.schoolId},
          'PRIMARY_ADMISSIONS', 1, true
        )
      `;
      await transaction`
        insert into source_monitor_configs (
          id, source_id, collection_strategy, monitoring_profile, is_enabled
        ) values (
          ${fixture.monitorConfigId}, ${fixture.sourceId}, 'HTTP',
          'STANDARD_SEASONAL', true
        )
      `;
      await transaction`
        insert into articles (
          id, slug, type, category, status, title, excerpt, content_html,
          seo_title, seo_description, robots_index, robots_follow, published_at
        ) values (
          ${fixture.articleId}, ${fixture.articleSlug}, 'GUIDE',
          'INTERNATIONAL_SCHOOL', 'PUBLISHED',
          'WP14 Browser Admissions Guide',
          'A safe browser guide connected to one canonical institution.',
          '<h2>Plan with canonical information</h2><p>This browser guide links a family to a verified public Institution without collecting personal analytics data.</p>',
          'WP14 Browser Admissions Guide',
          'A browser-verified PREPPY guide for canonical admissions discovery.',
          true, true, '2026-08-25T00:00:00.000Z'
        )
      `;
      await transaction`
        insert into article_institutions (
          article_id, institution_id, relation_type, sort_order
        ) values (${fixture.articleId}, ${fixture.institutionId}, 'RELATED', 0)
      `;
    });
    const session = createUserSessionCookie(fixture.userId, {
      secret: sessionSecret,
      now: new Date(),
      production: false,
    });
    return {
      ...fixture,
      sessionCookie: { name: session.name, value: session.value },
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function inspectWp14AnalyticsFixture(databaseUrl: string) {
  assertDedicatedTestDatabaseUrl(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1 });
  const fixture = WP14_BROWSER_FIXTURE;
  try {
    const [row] = await sql<
      Array<{
        user_status: string;
        active_follows: number;
        email_state: string | null;
        consent: string | null;
        preference: string | null;
        product_signals: number;
      }>
    >`
      select
        u.status as user_status,
        (select count(*)::int from follows f where f.user_id=u.id and f.status='ACTIVE') as active_follows,
        (select verification_state || '/' || delivery_state from user_emails e where e.user_id=u.id) as email_state,
        (select decision from consent_decisions c where c.user_id=u.id and c.consent_type='SERVICE_EMAIL_UPDATES' order by decided_at desc, id desc limit 1) as consent,
        (select state from notification_preferences p where p.user_id=u.id and p.channel='EMAIL') as preference,
        ((select count(*) from notifications) + (select count(*) from notification_deliveries))::int as product_signals
      from users u where u.id=${fixture.userId}
    `;
    if (!row) throw new Error("WP-14 browser fixture user is missing");
    return row;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  const sessionSecret = process.env.USER_SESSION_SECRET;
  if (!databaseUrl || !sessionSecret) {
    throw new Error(
      "DATABASE_URL/TEST_DATABASE_URL and USER_SESSION_SECRET are required",
    );
  }
  const output = process.argv.includes("--inspect")
    ? await inspectWp14AnalyticsFixture(databaseUrl)
    : await seedWp14AnalyticsFixture(databaseUrl, sessionSecret);
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "WP-14 seed failed"}\n`,
    );
    process.exitCode = 1;
  });
}
