import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAdminCommandContext } from "@/src/application/context";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { defaultCanonicalChangeDependencies } from "@/src/modules/monitoring/opportunity-change.server";
import {
  defaultVerifyOpportunityPersistence,
  verifyLegacyBackedOpportunityInTransaction,
  verifyNativeOpportunityInTransaction,
  verifyOpportunity,
} from "@/src/modules/monitoring/verify-opportunity.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp10b-verify-${randomUUID()}`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 8,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

type NativeFixture = {
  adminUserId: string;
  institutionId: string;
  opportunityId: string;
  versionId: string;
  sourceId: string;
};

type LegacyFixture = {
  adminUserId: string;
  institutionId: string;
  opportunityId: string;
  eventId: string;
  eventVersionId: string;
  sourceId: string;
};

async function createNativeFixture(): Promise<NativeFixture> {
  const adminUserId = randomUUID();
  const institutionId = randomUUID();
  const opportunityId = randomUUID();
  const versionId = randomUUID();
  const sourceId = randomUUID();
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into admin_users (
        id, external_auth_subject, email, display_name, status
      ) values (
        ${adminUserId}, ${`${prefix}-admin-${adminUserId}`},
        ${`${prefix}-${adminUserId}@example.test`}, 'WP-10B Verifier', 'ACTIVE'
      )
    `;
    await transaction`
      insert into institutions (
        id, slug, display_name, category, operational_state, publication_state
      ) values (
        ${institutionId}, ${`${prefix}-institution-${institutionId}`},
        'WP-10B Native Institution', 'ENGLISH_KINDERGARTEN', 'ACTIVE', 'PUBLISHED'
      )
    `;
    await transaction`
      insert into sources (
        id, canonical_url, source_type, authority_level, lifecycle_status,
        source_name
      ) values (
        ${sourceId}, ${`https://official.example.test/${prefix}/${sourceId}`},
        'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP-10B Official Source'
      )
    `;
    await transaction`
      insert into source_monitor_configs (
        source_id, collection_strategy, monitoring_profile, is_enabled
      ) values (${sourceId}, 'HTTP', 'CRITICAL_SEASONAL', true)
    `;
    await transaction`
      insert into institution_source_bindings (
        institution_id, source_id, role, is_primary, is_active
      ) values (${institutionId}, ${sourceId}, 'OFFICIAL_MAIN', true, true)
    `;
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state,
        published_at
      ) values (
        ${opportunityId}, ${institutionId}, ${`${prefix}-opportunity-${opportunityId}`},
        'APPLICATION', 'NATIVE', 'PUBLISHED', '2026-08-01T00:00:00.000Z'
      )
    `;
    await transaction`
      insert into opportunity_versions (
        id, opportunity_id, truth_mode, version_number, verification_state,
        business_state, is_current, title, summary, target_audience,
        event_start_at, event_end_at, application_open_at,
        application_close_at, action_url, location_text, verified_at,
        verified_by_admin_id, content_fingerprint
      ) values (
        ${versionId}, ${opportunityId}, 'NATIVE', 1, 'VERIFIED', 'OPEN', true,
        '2027 Admissions', 'Apply during the official window.', 'Families',
        '2026-09-01T01:00:00.000Z', '2026-09-01T03:00:00.000Z',
        '2026-08-01T00:00:00.000Z', '2026-08-31T23:59:59.000Z',
        'https://apply.example.test/native', 'Main campus',
        '2026-08-01T01:02:03.000Z', ${adminUserId}, 'fixture-v1'
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
  });
  return { adminUserId, institutionId, opportunityId, versionId, sourceId };
}

async function createLegacyFixture(): Promise<LegacyFixture> {
  const adminUserId = randomUUID();
  const institutionId = randomUUID();
  const schoolId = randomUUID();
  const cycleId = randomUUID();
  const eventId = randomUUID();
  const eventVersionId = randomUUID();
  const opportunityId = randomUUID();
  const sourceId = randomUUID();
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into admin_users (
        id, external_auth_subject, email, display_name, status
      ) values (
        ${adminUserId}, ${`${prefix}-admin-${adminUserId}`},
        ${`${prefix}-${adminUserId}@example.test`}, 'WP-10B Legacy Verifier', 'ACTIVE'
      )
    `;
    await transaction`
      insert into institutions (
        id, slug, display_name, category, operational_state, publication_state
      ) values (
        ${institutionId}, ${`${prefix}-institution-${institutionId}`},
        'WP-10B Legacy Institution', 'PRIVATE_ELEMENTARY', 'ACTIVE', 'PUBLISHED'
      )
    `;
    await transaction`
      insert into schools (
        id, slug, canonical_name, school_type, lifecycle_status
      ) values (
        ${schoolId}, ${`${prefix}-school-${schoolId}`}, 'WP-10B Legacy School',
        'PRIVATE_ELEMENTARY', 'ACTIVE'
      )
    `;
    await transaction`
      insert into institution_school_links (institution_id, school_id, link_reason)
      values (${institutionId}, ${schoolId}, ${prefix})
    `;
    await transaction`
      insert into admission_cycles (
        id, school_id, academic_year, lifecycle_status, admission_mode,
        internal_notes
      ) values (${cycleId}, ${schoolId}, 2027, 'ACTIVE', 'FIXED_WINDOW', ${prefix})
    `;
    await transaction`
      insert into admission_events (
        id, admission_cycle_id, event_key, event_type, canonical_title,
        importance, actionability, is_public
      ) values (
        ${eventId}, ${cycleId}, ${`${prefix}-event-${eventId}`}, 'APPLICATION',
        '2027 Application', 'HIGH', 'ACTION_REQUIRED', true
      )
    `;
    await transaction`
      insert into sources (
        id, canonical_url, source_type, authority_level, lifecycle_status,
        source_name
      ) values (
        ${sourceId}, ${`https://official.example.test/${prefix}/${sourceId}`},
        'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Legacy Official Source'
      )
    `;
    await transaction`
      insert into source_monitor_configs (
        source_id, collection_strategy, monitoring_profile, is_enabled
      ) values (${sourceId}, 'HTTP', 'CRITICAL_SEASONAL', true)
    `;
    await transaction`
      insert into admission_event_versions (
        id, admission_event_id, version_no, is_current, verification_status,
        knowledge_state, event_status, display_title, event_start_date,
        event_start_time, event_end_date, event_end_time,
        registration_open_date, registration_open_time,
        registration_close_date, registration_close_time, timezone,
        action_url, verified_at, verified_by_admin_id
      ) values (
        ${eventVersionId}, ${eventId}, 1, true, 'VERIFIED', 'KNOWN', 'ACTIVE',
        '2027 Application', '2026-08-01', '09:00:00', '2026-08-31',
        '18:00:00', '2026-08-01', '09:00:00', '2026-08-31', '18:00:00',
        'Asia/Seoul', 'https://apply.example.test/legacy',
        '2026-08-01T01:02:03.000Z', ${adminUserId}
      )
    `;
    await transaction`
      insert into event_version_evidence (
        event_version_id, source_id, is_primary
      ) values (${eventVersionId}, ${sourceId}, true)
    `;
    await transaction`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state,
        published_at
      ) values (
        ${opportunityId}, ${institutionId}, ${`${prefix}-opportunity-${opportunityId}`},
        'APPLICATION', 'LEGACY_BACKED', 'PUBLISHED', '2026-08-01T00:00:00.000Z'
      )
    `;
    await transaction`
      insert into opportunity_admission_event_links (
        opportunity_id, institution_id, truth_mode, admission_event_id,
        admission_cycle_id, school_id
      ) values (
        ${opportunityId}, ${institutionId}, 'LEGACY_BACKED', ${eventId},
        ${cycleId}, ${schoolId}
      )
    `;
    await transaction`
      insert into opportunity_source_bindings (
        opportunity_id, source_id, role, is_primary, is_active
      ) values (${opportunityId}, ${sourceId}, 'PRIMARY_NOTICE', true, true)
    `;
  });
  return {
    adminUserId,
    institutionId,
    opportunityId,
    eventId,
    eventVersionId,
    sourceId,
  };
}

function nativeInput(fixture: NativeFixture, eventStartAt: string) {
  return {
    opportunityId: fixture.opportunityId,
    expectedCurrentVersionId: fixture.versionId,
    sourceId: fixture.sourceId,
    evidence: { evidenceRole: "PRIMARY" },
    proposedState: {
      businessState: "OPEN",
      title: "2027 Admissions",
      summary: "Apply during the official window.",
      targetAudience: "Families",
      eventStartAt,
      eventEndAt: "2026-09-01T03:00:00.000Z",
      applicationOpenAt: "2026-08-01T00:00:00.000Z",
      applicationCloseAt: "2026-08-31T23:59:59.000Z",
      actionUrl: "https://apply.example.test/native",
      locationText: "Main campus",
      validFrom: null,
      validUntil: null,
    },
  };
}

function legacyInput(fixture: LegacyFixture, registrationCloseDate: string) {
  return {
    opportunityId: fixture.opportunityId,
    expectedCurrentVersionId: fixture.eventVersionId,
    sourceId: fixture.sourceId,
    evidence: { evidenceRole: "PRIMARY" },
    proposedState: {
      knowledgeState: "KNOWN",
      eventStatus: "ACTIVE",
      displayTitle: "2027 Application",
      eventStartDate: "2026-08-01",
      eventStartTime: "09:00:00",
      eventEndDate: "2026-08-31",
      eventEndTime: "18:00:00",
      registrationOpenDate: "2026-08-01",
      registrationOpenTime: "09:00:00",
      registrationCloseDate,
      registrationCloseTime: "18:00:00",
      timezone: "Asia/Seoul",
      venue: null,
      actionUrl: "https://apply.example.test/legacy",
      officialNotes: null,
    },
  };
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`delete from audit_logs where action_type like 'WP10B_%'`;
    await transaction`
      delete from outbox_events
      where aggregate_id in (
        select id from opportunity_changes where opportunity_id in (
          select id from opportunities where slug like ${`${prefix}-%`}
        )
      )
    `;
    await transaction`
      delete from opportunity_changes
      where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}-%`}
      )
    `;
    await transaction`
      delete from meaningful_changes
      where admission_event_id in (
        select id from admission_events where event_key like ${`${prefix}-%`}
      )
    `;
    await transaction`
      delete from opportunity_version_evidence
      where opportunity_version_id in (
        select id from opportunity_versions where opportunity_id in (
          select id from opportunities where slug like ${`${prefix}-%`}
        )
      )
    `;
    await transaction`
      delete from source_observations
      where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from opportunity_source_bindings
      where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}-%`}
      )
    `;
    await transaction`
      delete from opportunity_admission_event_links
      where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}-%`}
      )
    `;
    await transaction`
      delete from institution_source_bindings
      where institution_id in (
        select id from institutions where slug like ${`${prefix}-%`}
      )
    `;
    await transaction`
      delete from opportunity_versions
      where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}-%`}
      )
    `;
    await transaction`delete from opportunities where slug like ${`${prefix}-%`}`;
    await transaction`
      delete from event_version_evidence where event_version_id in (
        select id from admission_event_versions where admission_event_id in (
          select id from admission_events where event_key like ${`${prefix}-%`}
        )
      )
    `;
    await transaction`
      delete from admission_event_versions where admission_event_id in (
        select id from admission_events where event_key like ${`${prefix}-%`}
      )
    `;
    await transaction`delete from admission_events where event_key like ${`${prefix}-%`}`;
    await transaction`delete from admission_cycles where internal_notes = ${prefix}`;
    await transaction`delete from institution_school_links where link_reason = ${prefix}`;
    await transaction`delete from schools where slug like ${`${prefix}-%`}`;
    await transaction`
      delete from source_monitor_configs where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`delete from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}-%`}`;
    await transaction`delete from admin_users where external_auth_subject like ${`${prefix}-%`}`;
  });
}

describe("WP-10B Opportunity verification", () => {
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

  it("atomically verifies changed Native truth and publishes one canonical signal", async () => {
    const fixture = await createNativeFixture();
    const occurredAt = new Date("2026-08-23T11:12:13.000Z");
    const context = createAdminCommandContext({
      adminUserId: fixture.adminUserId,
      occurredAt,
    });

    const result = await verifyOpportunity(
      context,
      nativeInput(fixture, "2026-09-01T02:00:00.000Z"),
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toMatchObject({
      opportunityId: fixture.opportunityId,
      truthMode: "NATIVE",
      outcome: "CHANGED",
      previousVersionId: fixture.versionId,
      currentVersionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      changeType: "DATE_CHANGED",
      materiality: "NOTIFIABLE",
      opportunityChangeId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      outboxEnqueued: true,
      verifiedAt: occurredAt.toISOString(),
    });
    const versions = await runtime.client<
      {
        id: string;
        version_number: number;
        verification_state: string;
        is_current: boolean;
        supersedes_version_id: string | null;
      }[]
    >`
      select id, version_number, verification_state, is_current,
             supersedes_version_id
      from opportunity_versions where opportunity_id = ${fixture.opportunityId}
      order by version_number
    `;
    expect(versions).toEqual([
      {
        id: fixture.versionId,
        version_number: 1,
        verification_state: "SUPERSEDED",
        is_current: false,
        supersedes_version_id: null,
      },
      {
        id: result.currentVersionId,
        version_number: 2,
        verification_state: "VERIFIED",
        is_current: true,
        supersedes_version_id: fixture.versionId,
      },
    ]);
    const [change] = await runtime.client<
      {
        id: string;
        change_type: string;
        materiality: string;
        from_native_version_id: string;
        to_native_version_id: string;
        published_at: string;
      }[]
    >`
      select id, change_type, materiality, from_native_version_id,
             to_native_version_id, published_at
      from opportunity_changes where opportunity_id = ${fixture.opportunityId}
    `;
    expect(change).toMatchObject({
      id: result.opportunityChangeId,
      change_type: "DATE_CHANGED",
      materiality: "NOTIFIABLE",
      from_native_version_id: fixture.versionId,
      to_native_version_id: result.currentVersionId,
    });
    expect(new Date(change!.published_at)).toEqual(occurredAt);
    const outbox = await runtime.client<
      { event_type: string; aggregate_type: string; aggregate_id: string }[]
    >`
      select event_type, aggregate_type, aggregate_id from outbox_events
      where aggregate_id = ${result.opportunityChangeId}
    `;
    expect(outbox).toEqual([
      {
        event_type: "OPPORTUNITY_CHANGE_PUBLISHED",
        aggregate_type: "OPPORTUNITY_CHANGE",
        aggregate_id: result.opportunityChangeId,
      },
    ]);
    const [downstream] = await runtime.client<
      { notifications: number; deliveries: number }[]
    >`
      select
        (select count(*)::int from notifications where opportunity_id = ${fixture.opportunityId}) as notifications,
        (select count(*)::int from notification_deliveries d
          join notifications n on n.id = d.notification_id
          where n.opportunity_id = ${fixture.opportunityId}) as deliveries
    `;
    expect(downstream).toEqual({ notifications: 0, deliveries: 0 });
  });

  it("records a verified change for a DRAFT Opportunity without customer Outbox", async () => {
    const fixture = await createNativeFixture();
    await runtime.client`
      update opportunities set publication_state='DRAFT', published_at=null
      where id=${fixture.opportunityId}
    `;

    const request = nativeInput(fixture, "2026-09-01T02:00:00.000Z");
    const result = await verifyOpportunity(
      createAdminCommandContext({ adminUserId: fixture.adminUserId }),
      request,
      { transactionManager: runtime.transactionManager },
    );
    const retry = await verifyOpportunity(
      createAdminCommandContext({ adminUserId: fixture.adminUserId }),
      request,
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toMatchObject({
      outcome: "CHANGED",
      changeType: "DATE_CHANGED",
      opportunityChangeId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      outboxEnqueued: false,
    });
    expect(retry).toMatchObject({
      outcome: "IDEMPOTENT_REPLAY",
      opportunityChangeId: result.opportunityChangeId,
      outboxEnqueued: false,
    });
    const [counts] = await runtime.client<
      { changes: number; outbox: number }[]
    >`
      select
        (select count(*)::int from opportunity_changes where opportunity_id=${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id=${result.opportunityChangeId}) as outbox
    `;
    expect(counts).toEqual({ changes: 1, outbox: 0 });
  });

  it("creates the initial Native v1 for a DRAFT root without a customer signal", async () => {
    const fixture = await createNativeFixture();
    await runtime.client`
      update opportunities set publication_state='DRAFT', published_at=null
      where id=${fixture.opportunityId}
    `;
    await runtime.client`
      delete from opportunity_version_evidence
      where opportunity_version_id=${fixture.versionId}
    `;
    await runtime.client`
      delete from opportunity_versions where id=${fixture.versionId}
    `;

    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: fixture.adminUserId }),
        {
          ...nativeInput(fixture, "2026-09-01T01:00:00.000Z"),
          expectedCurrentVersionId: null,
          materialityOverride: "NON_NOTIFIABLE",
          overrideReason: "INITIAL_MATERIALITY_OVERRIDE",
        },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const result = await verifyOpportunity(
      createAdminCommandContext({ adminUserId: fixture.adminUserId }),
      {
        ...nativeInput(fixture, "2026-09-01T01:00:00.000Z"),
        expectedCurrentVersionId: null,
      },
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toMatchObject({
      truthMode: "NATIVE",
      outcome: "CHANGED",
      previousVersionId: null,
      currentVersionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      evidenceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      changeType: null,
      materiality: null,
      opportunityChangeId: null,
      outboxEnqueued: false,
    });
    const [version] = await runtime.client<
      {
        version_number: number;
        supersedes_version_id: string | null;
        verification_state: string;
        is_current: boolean;
      }[]
    >`
      select version_number, supersedes_version_id, verification_state, is_current
      from opportunity_versions where id=${result.currentVersionId}
    `;
    expect(version).toEqual({
      version_number: 1,
      supersedes_version_id: null,
      verification_state: "VERIFIED",
      is_current: true,
    });
  });

  it("routes identical Native truth to Observation and Audit only", async () => {
    const fixture = await createNativeFixture();
    const occurredAt = new Date("2026-08-23T12:13:14.000Z");
    const result = await verifyOpportunity(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt,
      }),
      nativeInput(fixture, "2026-09-01T01:00:00.000Z"),
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toMatchObject({
      opportunityId: fixture.opportunityId,
      truthMode: "NATIVE",
      outcome: "NO_CHANGE",
      previousVersionId: fixture.versionId,
      currentVersionId: fixture.versionId,
      opportunityChangeId: null,
      outboxEnqueued: false,
    });
    const [counts] = await runtime.client<
      {
        versions: number;
        observations: number;
        changes: number;
        outbox: number;
      }[]
    >`
      select
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId}) as versions,
        (select count(*)::int from source_observations where source_id = ${fixture.sourceId}) as observations,
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id in (
          select id from opportunity_changes where opportunity_id = ${fixture.opportunityId}
        )) as outbox
    `;
    expect(counts).toEqual({
      versions: 1,
      observations: 1,
      changes: 0,
      outbox: 0,
    });
  });

  it("returns the existing Native signal on an exact retry without duplicating lineage", async () => {
    const fixture = await createNativeFixture();
    const occurredAt = new Date("2026-08-23T13:14:15.000Z");
    const input = nativeInput(fixture, "2026-09-01T02:00:00.000Z");
    const first = await verifyOpportunity(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt,
      }),
      input,
      { transactionManager: runtime.transactionManager },
    );
    const retry = await verifyOpportunity(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt: new Date("2026-08-23T13:15:15.000Z"),
      }),
      input,
      { transactionManager: runtime.transactionManager },
    );

    expect(retry).toMatchObject({
      outcome: "IDEMPOTENT_REPLAY",
      currentVersionId: first.currentVersionId,
      opportunityChangeId: first.opportunityChangeId,
      outboxEnqueued: true,
    });
    const [counts] = await runtime.client<
      {
        versions: number;
        current_versions: number;
        changes: number;
        outbox: number;
      }[]
    >`
      select
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId}) as versions,
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId} and is_current) as current_versions,
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id = ${first.opportunityChangeId}) as outbox
    `;
    expect(counts).toEqual({
      versions: 2,
      current_versions: 1,
      changes: 1,
      outbox: 1,
    });
  });

  it("rejects a matching Native candidate when the stale expected ID is not the immediate predecessor", async () => {
    const fixture = await createNativeFixture();
    const candidate = nativeInput(fixture, "2026-09-01T02:00:00.000Z");
    await verifyOpportunity(
      createAdminCommandContext({ adminUserId: fixture.adminUserId }),
      candidate,
      { transactionManager: runtime.transactionManager },
    );

    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: fixture.adminUserId }),
        { ...candidate, expectedCurrentVersionId: randomUUID() },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects Native replay through a different Source than the committed successor Evidence", async () => {
    const fixture = await createNativeFixture();
    const candidate = nativeInput(fixture, "2026-09-01T02:00:00.000Z");
    await verifyOpportunity(
      createAdminCommandContext({ adminUserId: fixture.adminUserId }),
      candidate,
      { transactionManager: runtime.transactionManager },
    );
    const otherSourceId = randomUUID();
    await runtime.client.begin(async (transaction) => {
      await transaction`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status, source_name
        ) values (
          ${otherSourceId}, ${`https://official.example.test/${prefix}/${otherSourceId}`},
          'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Other Official Source'
        )
      `;
      await transaction`
        insert into opportunity_source_bindings (
          opportunity_id, source_id, role, is_primary, is_active
        ) values (${fixture.opportunityId}, ${otherSourceId}, 'SUPPORTING', false, true)
      `;
    });

    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: fixture.adminUserId }),
        { ...candidate, sourceId: otherSourceId },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("serializes concurrent Native verification into one successor and one replay", async () => {
    const fixture = await createNativeFixture();
    const input = nativeInput(fixture, "2026-09-01T02:00:00.000Z");
    const [left, right] = await Promise.all([
      verifyOpportunity(
        createAdminCommandContext({
          adminUserId: fixture.adminUserId,
          occurredAt: new Date("2026-08-23T14:15:16.000Z"),
        }),
        input,
        { transactionManager: runtime.transactionManager },
      ),
      verifyOpportunity(
        createAdminCommandContext({
          adminUserId: fixture.adminUserId,
          occurredAt: new Date("2026-08-23T14:15:17.000Z"),
        }),
        input,
        { transactionManager: runtime.transactionManager },
      ),
    ]);

    expect([left.outcome, right.outcome].sort()).toEqual([
      "CHANGED",
      "IDEMPOTENT_REPLAY",
    ]);
    expect(left.currentVersionId).toBe(right.currentVersionId);
    expect(left.opportunityChangeId).toBe(right.opportunityChangeId);
    const [counts] = await runtime.client<
      {
        versions: number;
        current_versions: number;
        branches: number;
        changes: number;
        outbox: number;
      }[]
    >`
      select
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId}) as versions,
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId} and is_current) as current_versions,
        (select count(*)::int from opportunity_versions where supersedes_version_id = ${fixture.versionId}) as branches,
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id in (
          select id from opportunity_changes where opportunity_id = ${fixture.opportunityId}
        )) as outbox
    `;
    expect(counts).toEqual({
      versions: 2,
      current_versions: 1,
      branches: 1,
      changes: 1,
      outbox: 1,
    });
  });

  it("rolls back Native truth, Evidence, Change, and Audit when Outbox enqueue fails", async () => {
    const fixture = await createNativeFixture();
    await expect(
      verifyOpportunity(
        createAdminCommandContext({
          adminUserId: fixture.adminUserId,
          occurredAt: new Date("2026-08-23T15:16:17.000Z"),
        }),
        nativeInput(fixture, "2026-09-01T02:00:00.000Z"),
        {
          transactionManager: runtime.transactionManager,
          canonicalChangeDependencies: {
            ...defaultCanonicalChangeDependencies,
            enqueueOutbox: async () => {
              throw new Error("forced outbox failure");
            },
          },
        },
      ),
    ).rejects.toThrow("forced outbox failure");

    const [counts] = await runtime.client<
      {
        versions: number;
        evidence: number;
        changes: number;
        audits: number;
        outbox: number;
      }[]
    >`
      select
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId}) as versions,
        (select count(*)::int from opportunity_version_evidence e
          join opportunity_versions v on v.id = e.opportunity_version_id
          where v.opportunity_id = ${fixture.opportunityId}) as evidence,
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from audit_logs where entity_id = ${fixture.opportunityId}) as audits,
        (select count(*)::int from outbox_events where aggregate_id in (
          select id from opportunity_changes where opportunity_id = ${fixture.opportunityId}
        )) as outbox
    `;
    expect(counts).toEqual({
      versions: 1,
      evidence: 1,
      changes: 0,
      audits: 0,
      outbox: 0,
    });
    const [current] = await runtime.client<
      { verification_state: string; is_current: boolean }[]
    >`select verification_state, is_current from opportunity_versions where id = ${fixture.versionId}`;
    expect(current).toEqual({
      verification_state: "VERIFIED",
      is_current: true,
    });
  });

  it("keeps Legacy EventVersion as truth owner and canonicalizes its change exactly once", async () => {
    const fixture = await createLegacyFixture();
    const occurredAt = new Date("2026-08-23T16:17:18.000Z");
    const result = await verifyOpportunity(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt,
      }),
      legacyInput(fixture, "2026-09-05"),
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toMatchObject({
      opportunityId: fixture.opportunityId,
      truthMode: "LEGACY_BACKED",
      outcome: "CHANGED",
      previousVersionId: fixture.eventVersionId,
      currentVersionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      changeType: "DEADLINE_CHANGED",
      materiality: "NOTIFIABLE",
      opportunityChangeId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      outboxEnqueued: true,
    });
    const eventVersions = await runtime.client<
      {
        id: string;
        version_no: number;
        verification_status: string;
        is_current: boolean;
      }[]
    >`
      select id, version_no, verification_status, is_current
      from admission_event_versions where admission_event_id = ${fixture.eventId}
      order by version_no
    `;
    expect(eventVersions).toEqual([
      {
        id: fixture.eventVersionId,
        version_no: 1,
        verification_status: "SUPERSEDED",
        is_current: false,
      },
      {
        id: result.currentVersionId,
        version_no: 2,
        verification_status: "VERIFIED",
        is_current: true,
      },
    ]);
    const [counts] = await runtime.client<
      {
        canonical_versions: number;
        legacy_changes: number;
        canonical_changes: number;
        outbox: number;
      }[]
    >`
      select
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId}) as canonical_versions,
        (select count(*)::int from meaningful_changes where admission_event_id = ${fixture.eventId}) as legacy_changes,
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as canonical_changes,
        (select count(*)::int from outbox_events where aggregate_id = ${result.opportunityChangeId}) as outbox
    `;
    expect(counts).toEqual({
      canonical_versions: 0,
      legacy_changes: 1,
      canonical_changes: 1,
      outbox: 1,
    });
    const [change] = await runtime.client<
      {
        legacy_admission_event_id: string;
        legacy_meaningful_change_id: string;
      }[]
    >`
      select legacy_admission_event_id, legacy_meaningful_change_id
      from opportunity_changes where id = ${result.opportunityChangeId}
    `;
    expect(change?.legacy_admission_event_id).toBe(fixture.eventId);
    expect(change?.legacy_meaningful_change_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps a verified Legacy DRAFT change out of the customer Outbox", async () => {
    const fixture = await createLegacyFixture();
    await runtime.client`
      update opportunities set publication_state='DRAFT', published_at=null
      where id=${fixture.opportunityId}
    `;

    const result = await verifyOpportunity(
      createAdminCommandContext({ adminUserId: fixture.adminUserId }),
      legacyInput(fixture, "2026-09-05"),
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toMatchObject({
      truthMode: "LEGACY_BACKED",
      outcome: "CHANGED",
      opportunityChangeId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      outboxEnqueued: false,
    });
    const [outbox] = await runtime.client<{ count: number }[]>`
      select count(*)::int from outbox_events
      where aggregate_id=${result.opportunityChangeId}
    `;
    expect(outbox?.count).toBe(0);
  });

  it("routes identical Legacy truth to Observation and Audit only", async () => {
    const fixture = await createLegacyFixture();
    const result = await verifyOpportunity(
      createAdminCommandContext({ adminUserId: fixture.adminUserId }),
      legacyInput(fixture, "2026-08-31"),
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toMatchObject({
      truthMode: "LEGACY_BACKED",
      outcome: "NO_CHANGE",
      previousVersionId: fixture.eventVersionId,
      currentVersionId: fixture.eventVersionId,
      evidenceId: null,
      opportunityChangeId: null,
      outboxEnqueued: false,
    });
    const [counts] = await runtime.client<
      {
        versions: number;
        observations: number;
        meaningful_changes: number;
        canonical_changes: number;
        outbox: number;
      }[]
    >`
      select
        (select count(*)::int from admission_event_versions where admission_event_id=${fixture.eventId}) as versions,
        (select count(*)::int from source_observations where source_id=${fixture.sourceId}) as observations,
        (select count(*)::int from meaningful_changes where admission_event_id=${fixture.eventId}) as meaningful_changes,
        (select count(*)::int from opportunity_changes where opportunity_id=${fixture.opportunityId}) as canonical_changes,
        (select count(*)::int from outbox_events where aggregate_id in (select id from opportunity_changes where opportunity_id=${fixture.opportunityId})) as outbox
    `;
    expect(counts).toEqual({
      versions: 1,
      observations: 1,
      meaningful_changes: 0,
      canonical_changes: 0,
      outbox: 0,
    });
  });

  it("returns the committed Legacy signal on exact retry without duplicating any lineage", async () => {
    const fixture = await createLegacyFixture();
    const request = legacyInput(fixture, "2026-09-05");
    const first = await verifyOpportunity(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt: new Date("2026-08-23T17:18:19.000Z"),
      }),
      request,
      { transactionManager: runtime.transactionManager },
    );
    const retry = await verifyOpportunity(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt: new Date("2026-08-23T17:19:19.000Z"),
      }),
      request,
      { transactionManager: runtime.transactionManager },
    );

    expect(retry).toMatchObject({
      outcome: "IDEMPOTENT_REPLAY",
      previousVersionId: fixture.eventVersionId,
      currentVersionId: first.currentVersionId,
      opportunityChangeId: first.opportunityChangeId,
      outboxEnqueued: true,
    });
    const [counts] = await runtime.client<
      {
        versions: number;
        current_versions: number;
        meaningful_changes: number;
        canonical_changes: number;
        outbox: number;
      }[]
    >`
      select
        (select count(*)::int from admission_event_versions where admission_event_id=${fixture.eventId}) as versions,
        (select count(*)::int from admission_event_versions where admission_event_id=${fixture.eventId} and is_current) as current_versions,
        (select count(*)::int from meaningful_changes where admission_event_id=${fixture.eventId}) as meaningful_changes,
        (select count(*)::int from opportunity_changes where opportunity_id=${fixture.opportunityId}) as canonical_changes,
        (select count(*)::int from outbox_events where aggregate_id=${first.opportunityChangeId}) as outbox
    `;
    expect(counts).toEqual({
      versions: 2,
      current_versions: 1,
      meaningful_changes: 1,
      canonical_changes: 1,
      outbox: 1,
    });
  });

  it("rejects Legacy replay through a Source that did not evidence the committed EventVersion", async () => {
    const fixture = await createLegacyFixture();
    const request = legacyInput(fixture, "2026-09-05");
    await verifyOpportunity(
      createAdminCommandContext({ adminUserId: fixture.adminUserId }),
      request,
      { transactionManager: runtime.transactionManager },
    );
    const otherSourceId = randomUUID();
    await runtime.client.begin(async (transaction) => {
      await transaction`
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status, source_name
        ) values (
          ${otherSourceId}, ${`https://official.example.test/${prefix}/${otherSourceId}`},
          'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Other Legacy Source'
        )
      `;
      await transaction`
        insert into opportunity_source_bindings (
          opportunity_id, source_id, role, is_primary, is_active
        ) values (${fixture.opportunityId}, ${otherSourceId}, 'SUPPORTING', false, true)
      `;
    });

    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: fixture.adminUserId }),
        { ...request, sourceId: otherSourceId },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("resolves Legacy replay by immutable EventVersion origin when change timestamps collide", async () => {
    const fixture = await createLegacyFixture();
    const occurredAt = new Date("2026-08-23T19:20:21.000Z");
    const first = await verifyOpportunity(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt,
      }),
      legacyInput(fixture, "2026-09-05"),
      { transactionManager: runtime.transactionManager },
    );
    const secondRequest = {
      ...legacyInput(fixture, "2026-09-10"),
      expectedCurrentVersionId: first.currentVersionId,
    };
    const second = await verifyOpportunity(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt,
      }),
      secondRequest,
      { transactionManager: runtime.transactionManager },
    );
    const replay = await verifyOpportunity(
      createAdminCommandContext({ adminUserId: fixture.adminUserId }),
      secondRequest,
      { transactionManager: runtime.transactionManager },
    );

    expect(second.opportunityChangeId).not.toBe(first.opportunityChangeId);
    expect(replay).toMatchObject({
      outcome: "IDEMPOTENT_REPLAY",
      currentVersionId: second.currentVersionId,
      opportunityChangeId: second.opportunityChangeId,
    });
  });

  it("rejects direct strategy calls for the wrong persisted truth mode", async () => {
    const native = await createNativeFixture();
    const legacy = await createLegacyFixture();
    const context = createAdminCommandContext({
      adminUserId: native.adminUserId,
    });

    await expect(
      runtime.transactionManager.run((executor) =>
        verifyNativeOpportunityInTransaction(
          executor,
          context,
          nativeInput(
            {
              ...native,
              opportunityId: legacy.opportunityId,
              versionId: legacy.eventVersionId,
            },
            "2026-09-01T02:00:00.000Z",
          ) as never,
        ),
      ),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(
      runtime.transactionManager.run((executor) =>
        verifyLegacyBackedOpportunityInTransaction(
          executor,
          context,
          legacyInput(
            {
              ...legacy,
              opportunityId: native.opportunityId,
              eventVersionId: native.versionId,
            },
            "2026-09-05",
          ) as never,
        ),
      ),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });

  it("rolls back all Legacy truth and signals when Outbox enqueue fails", async () => {
    const fixture = await createLegacyFixture();
    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: fixture.adminUserId }),
        legacyInput(fixture, "2026-09-05"),
        {
          transactionManager: runtime.transactionManager,
          canonicalChangeDependencies: {
            ...defaultCanonicalChangeDependencies,
            enqueueOutbox: async () => {
              throw new Error("forced Legacy Outbox failure");
            },
          },
        },
      ),
    ).rejects.toThrow("forced Legacy Outbox failure");

    const [state] = await runtime.client<
      {
        versions: number;
        evidence: number;
        current_version_id: string;
        meaningful_changes: number;
        canonical_changes: number;
        audits: number;
        outbox: number;
      }[]
    >`
      select
        (select count(*)::int from admission_event_versions where admission_event_id=${fixture.eventId}) as versions,
        (select count(*)::int from event_version_evidence e join admission_event_versions v on v.id=e.event_version_id where v.admission_event_id=${fixture.eventId}) as evidence,
        (select id from admission_event_versions where admission_event_id=${fixture.eventId} and is_current) as current_version_id,
        (select count(*)::int from meaningful_changes where admission_event_id=${fixture.eventId}) as meaningful_changes,
        (select count(*)::int from opportunity_changes where opportunity_id=${fixture.opportunityId}) as canonical_changes,
        (select count(*)::int from audit_logs where entity_id=${fixture.opportunityId}) as audits,
        (select count(*)::int from outbox_events where aggregate_id in (select id from opportunity_changes where opportunity_id=${fixture.opportunityId})) as outbox
    `;
    expect(state).toEqual({
      versions: 1,
      evidence: 1,
      current_version_id: fixture.eventVersionId,
      meaningful_changes: 0,
      canonical_changes: 0,
      audits: 0,
      outbox: 0,
    });
  });

  it("rejects inactive canonical binding and mismatched Evidence before Native truth mutation", async () => {
    const inactive = await createNativeFixture();
    await runtime.client`
      update opportunity_source_bindings set is_active=false,
        unbound_at='2026-08-23T20:21:22.000Z'
      where opportunity_id=${inactive.opportunityId} and source_id=${inactive.sourceId}
    `;
    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: inactive.adminUserId }),
        nativeInput(inactive, "2026-09-01T02:00:00.000Z"),
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });

    const mismatch = await createNativeFixture();
    const otherSourceId = randomUUID();
    const [observation] = await runtime.client<{ id: string }[]>`
      with source as (
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status, source_name
        ) values (
          ${otherSourceId}, ${`https://official.example.test/${prefix}/${otherSourceId}`},
          'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Mismatched Source'
        ) returning id
      )
      insert into source_observations (source_id, observed_at, outcome)
      select id, '2026-08-23T20:21:22.000Z', 'CHANGED' from source
      returning id::text
    `;
    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: mismatch.adminUserId }),
        {
          ...nativeInput(mismatch, "2026-09-01T02:00:00.000Z"),
          evidence: { observationId: observation!.id, evidenceRole: "PRIMARY" },
        },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });

    const rows = await runtime.client<
      { opportunity_id: string; versions: number }[]
    >`
      select opportunity_id, count(*)::int as versions from opportunity_versions
      where opportunity_id in (${inactive.opportunityId}, ${mismatch.opportunityId})
      group by opportunity_id order by opportunity_id
    `;
    expect(rows).toEqual(
      expect.arrayContaining([
        { opportunity_id: inactive.opportunityId, versions: 1 },
        { opportunity_id: mismatch.opportunityId, versions: 1 },
      ]),
    );
  });

  it("rejects a Legacy target whose explicit AdmissionEvent bridge is missing", async () => {
    const fixture = await createLegacyFixture();

    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: fixture.adminUserId }),
        legacyInput(fixture, "2026-09-05"),
        {
          transactionManager: runtime.transactionManager,
          persistence: {
            ...defaultVerifyOpportunityPersistence,
            getLegacyAdmissionEventLinkForUpdate: async () => null,
          },
        },
      ),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const [state] = await runtime.client<
      {
        versions: number;
        meaningful_changes: number;
        canonical_changes: number;
      }[]
    >`
      select
        (select count(*)::int from admission_event_versions where admission_event_id=${fixture.eventId}) as versions,
        (select count(*)::int from meaningful_changes where admission_event_id=${fixture.eventId}) as meaningful_changes,
        (select count(*)::int from opportunity_changes where opportunity_id=${fixture.opportunityId}) as canonical_changes
    `;
    expect(state).toEqual({
      versions: 1,
      meaningful_changes: 0,
      canonical_changes: 0,
    });
  });

  it("rejects invalid Native and Legacy date windows as typed validation errors", async () => {
    const native = await createNativeFixture();
    const invalidNative = nativeInput(native, "2026-09-01T01:00:00.000Z");
    invalidNative.proposedState.applicationOpenAt = "2026-09-10T00:00:00.000Z";
    invalidNative.proposedState.applicationCloseAt = "2026-09-01T00:00:00.000Z";
    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: native.adminUserId }),
        invalidNative,
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const legacy = await createLegacyFixture();
    const invalidCalendar = legacyInput(legacy, "2026-99-99");
    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: legacy.adminUserId }),
        invalidCalendar,
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const reversedLegacy = legacyInput(legacy, "2026-07-01");
    await expect(
      verifyOpportunity(
        createAdminCommandContext({ adminUserId: legacy.adminUserId }),
        reversedLegacy,
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const [counts] = await runtime.client<
      {
        native_versions: number;
        legacy_versions: number;
        changes: number;
      }[]
    >`
      select
        (select count(*)::int from opportunity_versions where opportunity_id=${native.opportunityId}) as native_versions,
        (select count(*)::int from admission_event_versions where admission_event_id=${legacy.eventId}) as legacy_versions,
        (select count(*)::int from opportunity_changes where opportunity_id in (${native.opportunityId}, ${legacy.opportunityId})) as changes
    `;
    expect(counts).toEqual({
      native_versions: 1,
      legacy_versions: 1,
      changes: 0,
    });
  });
});
