import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import postgres from "postgres";

import { assertDedicatedTestDatabaseUrl } from "../../support/test-database";

export const WP11_BROWSER_FIXTURE = {
  activeAdminId: "11111111-1111-4111-8111-111111111111",
  activeSubject: "wp11-browser-active",
  disabledAdminId: "22222222-2222-4222-8222-222222222222",
  disabledSubject: "wp11-browser-disabled",
  institutionId: "33333333-3333-4333-8333-333333333333",
  opportunityId: "44444444-4444-4444-8444-444444444444",
  sourceId: "55555555-5555-4555-8555-555555555555",
  initialVersionId: "66666666-6666-4666-8666-666666666666",
  initialEvidenceId: "77777777-7777-4777-8777-777777777777",
  detailPath:
    "/admin/monitoring/OPPORTUNITY/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555/PRIMARY_NOTICE",
  initialSourceUrl: "https://fixture.preppy.test/admissions",
  correctedSourceUrl: "https://fixture.preppy.test/admissions/official",
  replacementSourceUrl: "https://replacement.preppy.test/admissions",
} as const;

type Sql = ReturnType<typeof postgres>;

export async function seedAdminConsole(databaseUrl: string): Promise<void> {
  assertDedicatedTestDatabaseUrl(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql.begin(async (transaction) => {
      const migrated = await transaction<{ table_name: string | null }[]>`
        select to_regclass('public.opportunity_source_bindings')::text as table_name
      `;
      if (migrated[0]?.table_name !== "opportunity_source_bindings") {
        throw new Error(
          "WP-11 browser database must be freshly migrated first",
        );
      }

      await transaction`
        insert into admin_users (
          id, external_auth_subject, email, display_name, status
        ) values
          (
            ${WP11_BROWSER_FIXTURE.activeAdminId},
            ${WP11_BROWSER_FIXTURE.activeSubject},
            'browser-active@example.invalid',
            'Browser Active Admin',
            'ACTIVE'
          ),
          (
            ${WP11_BROWSER_FIXTURE.disabledAdminId},
            ${WP11_BROWSER_FIXTURE.disabledSubject},
            'browser-disabled@example.invalid',
            'Browser Disabled Admin',
            'DISABLED'
          )
      `;
      await transaction`
        insert into institutions (
          id, slug, display_name, category, operational_state,
          publication_state, region_code, city, district, website_url,
          short_description, published_at
        ) values (
          ${WP11_BROWSER_FIXTURE.institutionId},
          'wp11-browser-institution',
          'WP-11 Browser Institution',
          'INTERNATIONAL_SCHOOL',
          'ACTIVE',
          'PUBLISHED',
          'KR-11',
          'Seoul',
          'Fixture District',
          'https://fixture.preppy.test',
          'Dedicated WP-11 browser fixture.',
          now() - interval '7 days'
        )
      `;
      await transaction`
        insert into opportunities (
          id, institution_id, slug, kind, truth_mode,
          publication_state, published_at
        ) values (
          ${WP11_BROWSER_FIXTURE.opportunityId},
          ${WP11_BROWSER_FIXTURE.institutionId},
          'wp11-browser-opportunity',
          'APPLICATION',
          'NATIVE',
          'PUBLISHED',
          now() - interval '7 days'
        )
      `;
      await transaction`
        insert into sources (
          id, canonical_url, source_type, authority_level,
          lifecycle_status, source_name, requires_js, content_type_hint
        ) values (
          ${WP11_BROWSER_FIXTURE.sourceId},
          ${WP11_BROWSER_FIXTURE.initialSourceUrl},
          'OFFICIAL_ADMISSION_PAGE',
          'PRIMARY',
          'ACTIVE',
          'WP-11 Browser Admissions',
          false,
          'text/html'
        )
      `;
      await transaction`
        insert into source_monitor_configs (
          source_id, collection_strategy, monitoring_profile,
          custom_interval_minutes, seasonal_enabled, browser_required,
          max_attempts, is_enabled
        ) values (
          ${WP11_BROWSER_FIXTURE.sourceId},
          'HTTP',
          'CRITICAL_SEASONAL',
          1,
          true,
          false,
          3,
          true
        )
      `;
      await transaction`
        insert into opportunity_source_bindings (
          opportunity_id, source_id, role, is_primary, is_active
        ) values (
          ${WP11_BROWSER_FIXTURE.opportunityId},
          ${WP11_BROWSER_FIXTURE.sourceId},
          'PRIMARY_NOTICE',
          true,
          true
        )
      `;
      await transaction`
        insert into opportunity_versions (
          id, opportunity_id, truth_mode, version_number,
          verification_state, business_state, is_current,
          title, summary, target_audience, application_open_at,
          application_close_at, action_url, location_text,
          verified_at, verified_by_admin_id, valid_from,
          content_fingerprint
        ) values (
          ${WP11_BROWSER_FIXTURE.initialVersionId},
          ${WP11_BROWSER_FIXTURE.opportunityId},
          'NATIVE',
          1,
          'VERIFIED',
          'OPEN',
          true,
          'WP-11 Browser Opportunity',
          'Initial canonical browser fixture truth.',
          'Prospective families',
          now() - interval '1 day',
          now() + interval '30 days',
          'https://fixture.preppy.test/apply',
          'Fixture Campus',
          now() - interval '2 days',
          ${WP11_BROWSER_FIXTURE.activeAdminId},
          now() - interval '2 days',
          'wp11-browser-initial-fingerprint'
        )
      `;
      await transaction`
        insert into opportunity_version_evidence (
          id, opportunity_version_id, source_id, evidence_role
        ) values (
          ${WP11_BROWSER_FIXTURE.initialEvidenceId},
          ${WP11_BROWSER_FIXTURE.initialVersionId},
          ${WP11_BROWSER_FIXTURE.sourceId},
          'PRIMARY'
        )
      `;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function inspectAdminConsole(databaseUrl: string) {
  assertDedicatedTestDatabaseUrl(databaseUrl);
  const sql: Sql = postgres(databaseUrl, { max: 1 });
  try {
    const [summary] = await sql<
      {
        current_version_id: string;
        current_title: string;
        old_source_url: string;
        old_source_status: string;
        active_binding_source_id: string;
        active_binding_source_url: string;
        active_binding_source_status: string;
        old_source_evidence_count: number;
        observation_count: number;
        unchanged_observation_count: number;
        opportunity_change_count: number;
        outbox_count: number;
        notification_count: number;
        delivery_count: number;
        audit_count: number;
      }[]
    >`
      select
        current_version.id::text as current_version_id,
        current_version.title as current_title,
        old_source.canonical_url as old_source_url,
        old_source.lifecycle_status as old_source_status,
        active_binding.source_id::text as active_binding_source_id,
        active_source.canonical_url as active_binding_source_url,
        active_source.lifecycle_status as active_binding_source_status,
        (
          select count(*)::int
          from opportunity_version_evidence evidence
          where evidence.source_id = ${WP11_BROWSER_FIXTURE.sourceId}
        ) as old_source_evidence_count,
        (
          select count(*)::int from source_observations observation
          where observation.source_id = ${WP11_BROWSER_FIXTURE.sourceId}
        ) as observation_count,
        (
          select count(*)::int from source_observations observation
          where observation.source_id = ${WP11_BROWSER_FIXTURE.sourceId}
            and observation.outcome = 'UNCHANGED'
        ) as unchanged_observation_count,
        (
          select count(*)::int from opportunity_changes change
          where change.opportunity_id = ${WP11_BROWSER_FIXTURE.opportunityId}
        ) as opportunity_change_count,
        (select count(*)::int from outbox_events) as outbox_count,
        (select count(*)::int from notifications) as notification_count,
        (select count(*)::int from notification_deliveries) as delivery_count,
        (
          select count(*)::int from audit_logs audit
          where audit.admin_user_id = ${WP11_BROWSER_FIXTURE.activeAdminId}
        ) as audit_count
      from opportunity_versions current_version
      join sources old_source
        on old_source.id = ${WP11_BROWSER_FIXTURE.sourceId}
      join opportunity_source_bindings active_binding
        on active_binding.opportunity_id = ${WP11_BROWSER_FIXTURE.opportunityId}
       and active_binding.is_active = true
      join sources active_source on active_source.id = active_binding.source_id
      where current_version.opportunity_id = ${WP11_BROWSER_FIXTURE.opportunityId}
        and current_version.is_current = true
    `;
    if (!summary) throw new Error("WP-11 browser fixture was not seeded");
    return summary;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function runStandalone(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL or TEST_DATABASE_URL is required");
  if (process.argv.includes("--inspect")) {
    process.stdout.write(
      `${JSON.stringify(await inspectAdminConsole(databaseUrl))}\n`,
    );
    return;
  }
  if (!process.argv.includes("--seed")) {
    throw new Error("Use --seed or --inspect");
  }
  await seedAdminConsole(databaseUrl);
  process.stdout.write(
    `${JSON.stringify({ type: "SEEDED", ...WP11_BROWSER_FIXTURE })}\n`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  runStandalone().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "WP-11 browser seed failed"}\n`,
    );
    process.exit(1);
  });
}
