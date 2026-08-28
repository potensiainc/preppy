import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { institutionIdForSchool } from "@/src/infrastructure/db/institution-backfill.server";
import { runRehearsal } from "@/src/modules/production-preflight/rehearsal.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(testDatabaseUrl);

const baseUrl = new URL(testDatabaseUrl);
const databaseName = "admissionradar_wp15a_full_rehearsal";
const databaseUrl = new URL(baseUrl);
databaseUrl.pathname = `/${databaseName}`;
const maintenanceUrl = new URL(baseUrl);
maintenanceUrl.pathname = "/postgres";
const maintenance = postgres(maintenanceUrl.toString(), { max: 1 });
let sql: ReturnType<typeof postgres>;

describe("WP-15A full non-production rehearsal", () => {
  beforeAll(async () => {
    await maintenance`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await maintenance.unsafe(`drop database if exists ${databaseName}`);
    await maintenance.unsafe(`create database ${databaseName}`);
    sql = postgres(databaseUrl.toString(), { max: 1 });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await maintenance.unsafe(`drop database if exists ${databaseName}`);
    await maintenance`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await maintenance.end({ timeout: 5 });
  });

  it("migrates an empty rehearsal database through the current repository migration", async () => {
    const result = await runRehearsal({
      rehearsalDatabaseUrl: databaseUrl.toString(),
      appBaseUrl: "https://preppy.example",
      now: new Date("2026-08-25T01:00:00.000Z"),
    });

    expect(result.stages?.baseline.appliedMigrations).toBe(0);
    expect(result.report.migrations.latestApplied).toBe("0012_loving_trauma");
    expect(result.stages?.productSignalsUnchanged).toBe(true);
    expect(result.stages?.secondPass).toMatchObject({
      institution: { created: 0, linked: 0 },
      opportunity: { created: 0, linked: 0 },
      sourceBindings: {
        institution: { inserted: 0 },
        opportunity: { inserted: 0 },
      },
    });
    expect(result.stages?.smoke.result).toBe("PASS");
    expect(result.report.summary.finalGate).toBe("READY_FOR_WP16A");
  });

  it("backfills an upgrade fixture twice and passes canonical query smoke", async () => {
    const legacySchoolId = randomUUID();
    const legacyInstitutionId = institutionIdForSchool(legacySchoolId);
    const cycleId = randomUUID();
    const legacySourceId = randomUUID();
    const nativeInstitutionId = randomUUID();
    const nativeOpportunityId = randomUUID();
    const nativeVersionId = randomUUID();
    const nativeSourceId = randomUUID();
    const userId = randomUUID();
    const followId = randomUUID();
    const now = new Date("2026-08-25T02:00:00.000Z");

    await sql.begin(async (transaction) => {
      await transaction`
        insert into schools (
          id, slug, canonical_name, school_type, lifecycle_status
        ) values (
          ${legacySchoolId}, 'wp15a-upgrade-school', 'Upgrade School',
          'PRIVATE_ELEMENTARY', 'ACTIVE'
        )
      `;
      await transaction`
        insert into admission_cycles (
          id, school_id, academic_year, lifecycle_status, admission_mode
        ) values (
          ${cycleId}, ${legacySchoolId}, 2028, 'MONITORING', 'FIXED_WINDOW'
        )
      `;
      await transaction`
        insert into admission_events (
          admission_cycle_id, event_key, event_type, canonical_title
        ) values (
          ${cycleId}, 'wp15a-upgrade-application', 'APPLICATION',
          'Upgrade Application'
        )
      `;
      await transaction`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status,
          source_name
        ) values
          (${legacySourceId}, 'https://official.example.test/wp15a-upgrade',
            'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Upgrade Source'),
          (${nativeSourceId}, 'https://official.example.test/wp15a-native',
            'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Native Source')
      `;
      await transaction`
        insert into source_bindings (source_id, school_id, source_role)
        values (${legacySourceId}, ${legacySchoolId}, 'NOTICE_BOARD')
      `;
      await transaction`
        insert into institutions (
          id, slug, display_name, category, operational_state,
          publication_state
        ) values (
          ${nativeInstitutionId}, 'wp15a-native-school', 'Native School',
          'ENGLISH_KINDERGARTEN', 'ACTIVE', 'PUBLISHED'
        )
      `;
      await transaction`
        insert into opportunities (
          id, institution_id, slug, kind, truth_mode, publication_state,
          published_at
        ) values (
          ${nativeOpportunityId}, ${nativeInstitutionId},
          'wp15a-native-opportunity', 'RECRUITMENT', 'NATIVE', 'PUBLISHED',
          ${now}
        )
      `;
      await transaction`
        insert into opportunity_versions (
          id, opportunity_id, version_number, verification_state,
          business_state, is_current, title, verified_at
        ) values (
          ${nativeVersionId}, ${nativeOpportunityId}, 1, 'VERIFIED', 'OPEN',
          true, 'Native Opportunity', ${now}
        )
      `;
      await transaction`
        insert into opportunity_version_evidence (
          opportunity_version_id, source_id, evidence_role
        ) values (${nativeVersionId}, ${nativeSourceId}, 'PRIMARY')
      `;
      await transaction`
        insert into institution_source_bindings (
          institution_id, source_id, role, is_primary
        ) values (${nativeInstitutionId}, ${nativeSourceId}, 'OFFICIAL_MAIN', true)
      `;
      await transaction`
        insert into source_monitor_configs (
          source_id, collection_strategy, monitoring_profile
        ) values (${nativeSourceId}, 'MANUAL', 'MANUAL')
      `;
      await transaction`
        insert into articles (
          slug, type, category, status, title, content_html, robots_index,
          robots_follow, published_at
        ) values (
          'wp15a-public-article', 'GUIDE', 'ADMISSIONS_GENERAL', 'PUBLISHED',
          'WP15A Public Article', '<p>Safe article</p>', true, true, ${now}
        )
      `;
      await transaction`
        insert into users (id, status, activated_at)
        values (${userId}, 'ACTIVE', ${now})
      `;
      await transaction`
        insert into user_emails (
          user_id, email, email_normalized, source, verification_state,
          delivery_state, verified_at
        ) values (
          ${userId}, 'fixture@example.test', 'fixture@example.test',
          'USER_INPUT', 'VERIFIED', 'USABLE', ${now}
        )
      `;
      for (const type of [
        "TERMS_OF_SERVICE",
        "PRIVACY_POLICY",
        "SERVICE_EMAIL_UPDATES",
      ]) {
        await transaction`
          insert into consent_decisions (
            user_id, consent_type, policy_version, decision, decided_at
          ) values (${userId}, ${type}, 'wp15a-v1', 'GRANTED', ${now})
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
        ) values (
          ${followId}, ${userId}, ${nativeInstitutionId}, 'ACTIVE', ${now}, ${now}
        )
      `;
      await transaction`
        insert into follow_episodes (follow_id, activated_at)
        values (${followId}, ${now})
      `;
    });

    const result = await runRehearsal({
      rehearsalDatabaseUrl: databaseUrl.toString(),
      appBaseUrl: "https://preppy.example",
      now,
    });

    expect(result.stages?.baseline.appliedMigrations).toBe(13);
    expect(result.stages?.firstPass).toMatchObject({
      institution: { created: 1, linked: 1 },
      opportunity: { created: 1, linked: 1 },
      sourceBindings: { institution: { inserted: 1 } },
    });
    expect(result.stages?.secondPass).toMatchObject({
      institution: { created: 0, linked: 0 },
      opportunity: { created: 0, linked: 0 },
      sourceBindings: {
        institution: { inserted: 0 },
        opportunity: { inserted: 0 },
      },
    });
    expect(result.stages?.smoke).toMatchObject({
      result: "PASS",
      institutionDetail: "PASS",
      opportunityDetail: "PASS",
      articleDetail: "PASS",
      myPreppy: "PASS",
      adminDashboard: "PASS",
      adminMonitoring: "PASS",
      adminOperations: "PASS",
      kpi: "PASS",
      sitemap: "PASS",
    });
    expect(result.stages?.productSignalsUnchanged).toBe(true);
    expect(result.report.summary.finalGate).toBe("READY_FOR_WP16A");
    expect(result.report.summary.blockers).toBe(0);
    expect(JSON.stringify(result.report)).not.toContain("fixture@example.test");
    expect(JSON.stringify(result.report)).not.toContain("Safe article");
    expect(result.report.inventory).toMatchObject({
      rowCounts: { institutions: 2, opportunities: 2 },
    });
    expect(legacyInstitutionId).toMatch(/[0-9a-f-]{36}/);
  });

  it("returns BLOCKED and preserves rollback when a deterministic backfill conflicts", async () => {
    const schoolId = randomUUID();
    const institutionId = institutionIdForSchool(schoolId);
    await sql`
      insert into schools (
        id, slug, canonical_name, school_type, lifecycle_status
      ) values (
        ${schoolId}, 'wp15a-conflict-school', 'Conflict School',
        'PRIVATE_ELEMENTARY', 'ACTIVE'
      )
    `;
    await sql`
      insert into institutions (
        id, slug, display_name, category, operational_state, publication_state
      ) values (
        ${institutionId}, 'wp15a-conflict-school', 'Contradictory Name',
        'PRIVATE_ELEMENTARY', 'ACTIVE', 'DRAFT'
      )
    `;

    const result = await runRehearsal({
      rehearsalDatabaseUrl: databaseUrl.toString(),
      appBaseUrl: "https://preppy.example",
      now: new Date("2026-08-25T04:00:00.000Z"),
    });
    const [linkCount] = await sql<{ count: number }[]>`
      select count(*)::int as count from institution_school_links
      where school_id = ${schoolId}
    `;

    expect(result.stages).toBeNull();
    expect(result.report.summary.finalGate).toBe("BLOCKED");
    expect(result.report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "INSTITUTION_BACKFILL_BLOCKED" }),
        expect.objectContaining({ code: "REHEARSAL_STAGE_FAILED" }),
      ]),
    );
    expect(linkCount?.count).toBe(0);
  });
});
