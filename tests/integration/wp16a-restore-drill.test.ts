import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runRestoreDrill } from "@/src/modules/production-safety/restore-drill.server";
import { runRehearsal } from "@/src/modules/production-preflight/rehearsal.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(testDatabaseUrl);

const base = new URL(testDatabaseUrl);
const sourceName = "admissionradar_wp16a_rehearsal";
const targetName = "admissionradar_wp16a_restore";
const sourceUrl = new URL(base);
sourceUrl.pathname = `/${sourceName}`;
const targetUrl = new URL(base);
targetUrl.pathname = `/${targetName}`;
const maintenanceUrl = new URL(base);
maintenanceUrl.pathname = "/postgres";
const maintenance = postgres(maintenanceUrl.toString(), { max: 1 });

async function recreate(databaseName: string) {
  if (!/^[a-z0-9_]+$/.test(databaseName))
    throw new Error("unsafe test database name");
  await maintenance.unsafe(`drop database if exists "${databaseName}"`);
  await maintenance.unsafe(`create database "${databaseName}"`);
}

async function seedRepresentativeFixture() {
  await runRehearsal({
    rehearsalDatabaseUrl: sourceUrl.toString(),
    appBaseUrl: "https://preppy.example",
    now: new Date("2026-08-25T00:00:00.000Z"),
  });
  const client = postgres(sourceUrl.toString(), { max: 1 });
  const schoolId = randomUUID();
  const cycleId = randomUUID();
  const legacySourceId = randomUUID();
  try {
    await client.begin(async (transaction) => {
      await transaction`
        insert into schools (
          id, slug, canonical_name, school_type, lifecycle_status
        ) values (
          ${schoolId}, 'wp16a-legacy-school', 'WP16A Legacy School',
          'PRIVATE_ELEMENTARY', 'ACTIVE'
        )
      `;
      await transaction`
        insert into admission_cycles (
          id, school_id, academic_year, lifecycle_status, admission_mode
        ) values (${cycleId}, ${schoolId}, 2028, 'MONITORING', 'FIXED_WINDOW')
      `;
      await transaction`
        insert into admission_events (
          admission_cycle_id, event_key, event_type, canonical_title
        ) values (
          ${cycleId}, 'wp16a-application', 'APPLICATION', 'WP16A Application'
        )
      `;
      await transaction`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name
        ) values (
          ${legacySourceId}, 'https://official.example.test/wp16a/legacy',
          'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Legacy Source'
        )
      `;
      await transaction`
        insert into source_bindings (source_id, school_id, source_role)
        values (${legacySourceId}, ${schoolId}, 'NOTICE_BOARD')
      `;
    });
  } finally {
    await client.end({ timeout: 5 });
  }

  const rehearsal = await runRehearsal({
    rehearsalDatabaseUrl: sourceUrl.toString(),
    appBaseUrl: "https://preppy.example",
    now: new Date("2026-08-25T01:00:00.000Z"),
  });
  if (rehearsal.report.summary.finalGate !== "READY_FOR_WP16A") {
    throw new Error("Representative legacy fixture failed rehearsal.");
  }

  const db = postgres(sourceUrl.toString(), { max: 1 });
  const now = "2026-08-25T02:00:00.000Z";
  const adminId = randomUUID();
  const institutionId = randomUUID();
  const opportunityId = randomUUID();
  const versionId = randomUUID();
  const sourceId = randomUUID();
  const userId = randomUUID();
  const followId = randomUUID();
  const notificationId = randomUUID();
  const deliveryId = randomUUID();
  const attemptId = randomUUID();
  const articleId = randomUUID();
  const outboxId = randomUUID();
  try {
    await db.begin(async (transaction) => {
      await transaction`
        insert into admin_users (
          id, external_auth_subject, email, display_name, status
        ) values (
          ${adminId}, 'wp16a-admin-subject', 'operator@fixture.invalid',
          'Internal Operator', 'ACTIVE'
        )
      `;
      await transaction`
        insert into institutions (
          id, slug, display_name, category, operational_state, publication_state
        ) values (
          ${institutionId}, 'wp16a-native-institution', 'WP16A Native Institution',
          'ENGLISH_KINDERGARTEN', 'ACTIVE', 'PUBLISHED'
        )
      `;
      await transaction`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name
        ) values (
          ${sourceId}, 'https://official.example.test/wp16a/native',
          'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Native Source'
        )
      `;
      await transaction`
        insert into source_monitor_configs (
          source_id, collection_strategy, monitoring_profile, is_enabled
        ) values (${sourceId}, 'HTTP', 'LOW_CHANGE', true)
      `;
      await transaction`
        insert into institution_source_bindings (
          institution_id, source_id, role, is_primary, is_active
        ) values (${institutionId}, ${sourceId}, 'OFFICIAL_MAIN', true, true)
      `;
      await transaction`
        insert into opportunities (
          id, institution_id, slug, kind, truth_mode, publication_state
        ) values (
          ${opportunityId}, ${institutionId}, 'wp16a-native-opportunity',
          'RECRUITMENT', 'NATIVE', 'DRAFT'
        )
      `;
      await transaction`
        insert into opportunity_versions (
          id, opportunity_id, version_number, verification_state,
          business_state, is_current, title, verified_at
        ) values (
          ${versionId}, ${opportunityId}, 1, 'VERIFIED', 'OPEN', true,
          'WP16A Native Opportunity', ${now}
        )
      `;
      await transaction`
        insert into opportunity_version_evidence (
          opportunity_version_id, source_id, evidence_role
        ) values (${versionId}, ${sourceId}, 'PRIMARY')
      `;
      await transaction`
        insert into opportunity_source_bindings (
          opportunity_id, source_id, role, is_primary, is_active
        ) values (${opportunityId}, ${sourceId}, 'PRIMARY_NOTICE', true, true)
      `;
      await transaction`
        update opportunities set publication_state='PUBLISHED', published_at=${now}
        where id=${opportunityId}
      `;
      await transaction`
        insert into users (id, status, activated_at)
        values (${userId}, 'ACTIVE', ${now})
      `;
      await transaction`
        insert into auth_identities (user_id, provider, provider_subject)
        values (${userId}, 'KAKAO', 'wp16a-user-subject')
      `;
      await transaction`
        insert into user_emails (
          user_id, email, email_normalized, source, verification_state,
          delivery_state, verified_at
        ) values (
          ${userId}, 'user@fixture.invalid', 'user@fixture.invalid',
          'USER_INPUT', 'VERIFIED', 'USABLE', ${now}
        )
      `;
      for (const consentType of [
        "TERMS_OF_SERVICE",
        "PRIVACY_POLICY",
        "SERVICE_EMAIL_UPDATES",
      ]) {
        await transaction`
          insert into consent_decisions (
            user_id, consent_type, policy_version, decision, decided_at
          ) values (${userId}, ${consentType}, 'wp16a-v1', 'GRANTED', ${now})
        `;
      }
      await transaction`
        insert into notification_preferences (user_id, channel, state)
        values (${userId}, 'EMAIL', 'ENABLED')
      `;
      await transaction`
        insert into follows (
          id, user_id, institution_id, status, first_activated_at,
          current_activated_at
        ) values (${followId}, ${userId}, ${institutionId}, 'ACTIVE', ${now}, ${now})
      `;
      await transaction`
        insert into follow_episodes (follow_id, activated_at)
        values (${followId}, ${now})
      `;
      await transaction`
        insert into notifications (
          id, opportunity_id, signal_type, policy_version, status,
          signal_published_at, title_snapshot, body_context_json,
          deep_link_path, dedupe_key, ready_at
        ) values (
          ${notificationId}, ${opportunityId}, 'OPPORTUNITY_PUBLISHED',
          'wp16a-v1', 'READY', ${now}, 'Safe notification', '{}'::jsonb,
          '/opportunities/wp16a-native-opportunity', 'wp16a-notification', ${now}
        )
      `;
      await transaction`
        insert into notification_deliveries (
          id, notification_id, user_id, channel, status, queued_at, sent_at,
          recipient_hash
        ) values (
          ${deliveryId}, ${notificationId}, ${userId}, 'EMAIL', 'SENT',
          ${now}, ${now}, ${`sha256:${"b".repeat(64)}`}
        )
      `;
      await transaction`
        insert into notification_delivery_attempts (
          id, notification_delivery_id, attempt_number, provider,
          provider_message_id, attempt_status, attempted_at, completed_at
        ) values (
          ${attemptId}, ${deliveryId}, 1, 'RESEND', 'wp16a-provider-message',
          'ACCEPTED', ${now}, ${now}
        )
      `;
      await transaction`
        insert into outbox_events (
          id, event_type, aggregate_type, aggregate_id, payload, status,
          available_at, processed_at, attempt_count, dedupe_key
        ) values (
          ${outboxId}, 'DELIVERY_EMAIL_SEND', 'NOTIFICATION_DELIVERY',
          ${deliveryId}, ${JSON.stringify({ deliveryId })}::jsonb,
          'PROCESSED', ${now}, ${now}, 1, 'wp16a-delivery-outbox'
        )
      `;
      await transaction`
        insert into email_provider_events (
          provider, provider_event_id, provider_message_id, event_type,
          provider_created_at, processing_status, processed_at, payload_hash
        ) values (
          'RESEND', 'wp16a-provider-event', 'wp16a-provider-message',
          'email.delivered', ${now}, 'PROCESSED', ${now},
          ${`sha256:${"c".repeat(64)}`}
        )
      `;
      await transaction`
        insert into articles (
          id, slug, type, category, status, title, content_html,
          robots_index, robots_follow, author_admin_id, published_at
        ) values (
          ${articleId}, 'wp16a-restore-article', 'GUIDE',
          'ADMISSIONS_GENERAL', 'PUBLISHED', 'WP16A Restore Article',
          '<p>Safe synthetic article</p>', true, true, ${adminId}, ${now}
        )
      `;
      await transaction`
        insert into article_institutions (article_id, institution_id)
        values (${articleId}, ${institutionId})
      `;
      await transaction`
        insert into article_opportunities (article_id, opportunity_id)
        values (${articleId}, ${opportunityId})
      `;
      await transaction`
        insert into url_redirects (source_path, target_path, status_code, reason)
        values (
          '/articles/wp16a-old', '/articles/wp16a-restore-article', 308,
          'ARTICLE_SLUG_CHANGED'
        )
      `;
      await transaction`
        insert into audit_logs (
          admin_user_id, action_type, entity_type, entity_id, after_data
        ) values (
          ${adminId}, 'WP16A_SYNTHETIC_AUDIT', 'ARTICLE', ${articleId},
          '{"outcomeCode":"PASS"}'::jsonb
        )
      `;
    });
  } finally {
    await db.end({ timeout: 5 });
  }
}

describe("WP-16A real non-production backup/restore drill", () => {
  beforeAll(async () => {
    await maintenance`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await recreate(sourceName);
    await recreate(targetName);
  }, 60_000);

  afterAll(async () => {
    await maintenance.unsafe(`drop database if exists "${targetName}"`);
    await maintenance.unsafe(`drop database if exists "${sourceName}"`);
    await maintenance`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await maintenance.end({ timeout: 5 });
  }, 60_000);

  it("restores ledger, exact critical counts, invariants, and read smoke", async () => {
    await seedRepresentativeFixture();
    const result = await runRestoreDrill({
      sourceDatabaseUrl: sourceUrl.toString(),
      targetDatabaseUrl: targetUrl.toString(),
      appBaseUrl: "https://preppy.example",
      toolMode: {
        kind: "DOCKER_COMPOSE_LOCAL",
        service: "postgres",
        databaseUser: "admissionradar",
      },
      sideEffects: {
        workerEnabled: false,
        emailSendEnabled: false,
        analyticsEnabled: false,
        cacheRevalidationEnabled: false,
      },
      now: new Date("2026-08-25T03:00:00.000Z"),
    });
    expect(result).toMatchObject({
      drillResult: "PASS",
      productionDatabaseTouched: false,
      externalSideEffectsEnabled: false,
      sourceDatabaseLabel: sourceName,
      artifactPathClass: "OS_TEMP/WP16A",
      migrationLatest: "0011_preppy_seed_registry",
      criticalTableCountsMatch: true,
      invariants: "PASS",
      readSmoke: "PASS",
    });
    expect(result.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.backupDurationMs).toBeGreaterThan(0);
    expect(result.restoreDurationMs).toBeGreaterThan(0);
    expect(result.verificationDurationMs).toBeGreaterThan(0);
    expect(result.manifest.criticalTableCounts).toMatchObject({
      schools: 1,
      institutions: 2,
      institution_school_links: 1,
      opportunities: 2,
      opportunity_admission_event_links: 1,
      users: 1,
      follows: 1,
      notifications: 1,
      notification_deliveries: 1,
      notification_delivery_attempts: 1,
      outbox_events: 1,
      articles: 1,
      url_redirects: 1,
      email_provider_events: 1,
      audit_logs: 1,
      admin_users: 1,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("fixture.invalid");
    expect(serialized).not.toContain("Safe synthetic article");
    expect(serialized).not.toContain("postgres://");
    process.stdout.write(
      `WP16A_RESTORE_EVIDENCE ${JSON.stringify({ artifactSha256: result.artifactSha256, backupDurationMs: result.backupDurationMs, restoreDurationMs: result.restoreDurationMs, verificationDurationMs: result.verificationDurationMs, migrationLatest: result.migrationLatest, criticalTableCountsMatch: result.criticalTableCountsMatch, invariants: result.invariants, readSmoke: result.readSmoke })}\n`,
    );
  }, 60_000);
});
