import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAdminCommandContext } from "@/src/application/context";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { handleAdminVerifyOpportunityRequest } from "@/src/modules/admin/http/verify-opportunity.server";
import { handleAdminVerifyInstitutionFactRequest } from "@/src/modules/admin/http/verify-institution-fact.server";
import { defaultCanonicalChangeDependencies } from "@/src/modules/monitoring/opportunity-change.server";
import {
  defaultVerifyInstitutionFactPersistence,
  verifyInstitutionFact,
} from "@/src/modules/monitoring/verify-institution-fact.server";
import { verifyOpportunity } from "@/src/modules/monitoring/verify-opportunity.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp11-verify-${randomUUID()}`;
const appBaseUrl = "https://preppy.example";
const occurredAt = new Date("2026-08-24T11:12:13.000Z");
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 8,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

type NativeFixture = Readonly<{
  adminUserId: string;
  institutionId: string;
  opportunityId: string;
  versionId: string;
  sourceId: string;
}>;
type LegacyFixture = Readonly<{
  adminUserId: string;
  institutionId: string;
  opportunityId: string;
  eventId: string;
  eventVersionId: string;
  sourceId: string;
}>;
type FactFixture = Readonly<{
  adminUserId: string;
  institutionId: string;
  sourceId: string;
  factId: string | null;
  versionId: string | null;
}>;

async function insertAdminInstitution(label: string) {
  const adminUserId = randomUUID();
  const institutionId = randomUUID();
  await runtime.client`
    insert into admin_users (id, external_auth_subject, email, display_name, status)
    values (
      ${adminUserId}, ${`${prefix}-admin-${adminUserId}`},
      ${`${prefix}-${adminUserId}@example.test`}, 'WP-11 Verifier', 'ACTIVE'
    )
  `;
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${institutionId}, ${`${prefix}-institution-${institutionId}`}, ${label},
      'ENGLISH_KINDERGARTEN', 'ACTIVE', 'PUBLISHED'
    )
  `;
  return { adminUserId, institutionId };
}

async function insertSource(): Promise<string> {
  const sourceId = randomUUID();
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status, source_name
    ) values (
      ${sourceId}, ${`https://official.example.test/${prefix}/${sourceId}`},
      'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP-11 Official Source'
    )
  `;
  return sourceId;
}

async function createNativeFixture(): Promise<NativeFixture> {
  const { adminUserId, institutionId } = await insertAdminInstitution(
    "WP-11 Native Institution",
  );
  const sourceId = await insertSource();
  const opportunityId = randomUUID();
  const versionId = randomUUID();
  await runtime.client`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode, publication_state, published_at
    ) values (
      ${opportunityId}, ${institutionId}, ${`${prefix}-opportunity-${opportunityId}`},
      'APPLICATION', 'NATIVE', 'DRAFT', null
    )
  `;
  await runtime.client`
    insert into opportunity_versions (
      id, opportunity_id, truth_mode, version_number, verification_state,
      business_state, is_current, title, summary, target_audience,
      event_start_at, event_end_at, application_open_at, application_close_at,
      action_url, location_text, verified_at, verified_by_admin_id,
      content_fingerprint
    ) values (
      ${versionId}, ${opportunityId}, 'NATIVE', 1, 'VERIFIED', 'OPEN', true,
      '2027 Admissions', 'Apply during the official window.', 'Families',
      '2026-09-01T01:00:00.000Z', '2026-09-01T03:00:00.000Z',
      '2026-08-01T00:00:00.000Z', '2026-08-31T23:59:59.000Z',
      'https://apply.example.test/native', 'Main campus',
      '2026-08-01T01:02:03.000Z', ${adminUserId}, 'fixture-v1'
    )
  `;
  await runtime.client`
    insert into opportunity_version_evidence (
      opportunity_version_id, source_id, evidence_role
    ) values (${versionId}, ${sourceId}, 'PRIMARY')
  `;
  await runtime.client`
    insert into opportunity_source_bindings (
      opportunity_id, source_id, role, is_primary, is_active
    ) values (${opportunityId}, ${sourceId}, 'PRIMARY_NOTICE', true, true)
  `;
  await runtime.client`
    update opportunities
    set publication_state='PUBLISHED', published_at='2026-08-01T00:00:00.000Z'
    where id=${opportunityId}
  `;
  return { adminUserId, institutionId, opportunityId, versionId, sourceId };
}

async function createLegacyFixture(): Promise<LegacyFixture> {
  const { adminUserId, institutionId } = await insertAdminInstitution(
    "WP-11 Legacy Institution",
  );
  const sourceId = await insertSource();
  const schoolId = randomUUID();
  const cycleId = randomUUID();
  const eventId = randomUUID();
  const eventVersionId = randomUUID();
  const opportunityId = randomUUID();
  await runtime.client`
    insert into schools (id, slug, canonical_name, school_type, lifecycle_status)
    values (${schoolId}, ${`${prefix}-school-${schoolId}`}, 'WP-11 School', 'PRIVATE_ELEMENTARY', 'ACTIVE')
  `;
  await runtime.client`
    insert into institution_school_links (institution_id, school_id, link_reason)
    values (${institutionId}, ${schoolId}, ${prefix})
  `;
  await runtime.client`
    insert into admission_cycles (
      id, school_id, academic_year, lifecycle_status, admission_mode, internal_notes
    ) values (${cycleId}, ${schoolId}, 2027, 'ACTIVE', 'FIXED_WINDOW', ${prefix})
  `;
  await runtime.client`
    insert into admission_events (
      id, admission_cycle_id, event_key, event_type, canonical_title,
      importance, actionability, is_public
    ) values (
      ${eventId}, ${cycleId}, ${`${prefix}-event-${eventId}`}, 'APPLICATION',
      '2027 Application', 'HIGH', 'ACTION_REQUIRED', true
    )
  `;
  await runtime.client`
    insert into admission_event_versions (
      id, admission_event_id, version_no, is_current, verification_status,
      knowledge_state, event_status, display_title, event_start_date,
      event_start_time, event_end_date, event_end_time, registration_open_date,
      registration_open_time, registration_close_date, registration_close_time,
      timezone, action_url, verified_at, verified_by_admin_id
    ) values (
      ${eventVersionId}, ${eventId}, 1, true, 'VERIFIED', 'KNOWN', 'ACTIVE',
      '2027 Application', '2026-08-01', '09:00:00', '2026-08-31', '18:00:00',
      '2026-08-01', '09:00:00', '2026-08-31', '18:00:00', 'Asia/Seoul',
      'https://apply.example.test/legacy', '2026-08-01T01:02:03.000Z', ${adminUserId}
    )
  `;
  await runtime.client`
    insert into event_version_evidence (event_version_id, source_id, is_primary)
    values (${eventVersionId}, ${sourceId}, true)
  `;
  await runtime.client`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode, publication_state, published_at
    ) values (
      ${opportunityId}, ${institutionId}, ${`${prefix}-opportunity-${opportunityId}`},
      'APPLICATION', 'LEGACY_BACKED', 'DRAFT', null
    )
  `;
  await runtime.client`
    insert into opportunity_admission_event_links (
      opportunity_id, institution_id, truth_mode, admission_event_id,
      admission_cycle_id, school_id
    ) values (
      ${opportunityId}, ${institutionId}, 'LEGACY_BACKED', ${eventId},
      ${cycleId}, ${schoolId}
    )
  `;
  await runtime.client`
    insert into opportunity_source_bindings (
      opportunity_id, source_id, role, is_primary, is_active
    ) values (${opportunityId}, ${sourceId}, 'PRIMARY_NOTICE', true, true)
  `;
  await runtime.client`
    update opportunities
    set publication_state='PUBLISHED', published_at='2026-08-01T00:00:00.000Z'
    where id=${opportunityId}
  `;
  return {
    adminUserId,
    institutionId,
    opportunityId,
    eventId,
    eventVersionId,
    sourceId,
  };
}

async function createFactFixture(existing: boolean): Promise<FactFixture> {
  const { adminUserId, institutionId } = await insertAdminInstitution(
    "WP-11 Fact Institution",
  );
  const sourceId = await insertSource();
  const factId = existing ? randomUUID() : null;
  const versionId = existing ? randomUUID() : null;
  await runtime.client`
    insert into institution_source_bindings (
      institution_id, source_id, role, is_primary, is_active
    ) values (${institutionId}, ${sourceId}, 'TUITION', true, true)
  `;
  if (factId && versionId) {
    await runtime.client`
      insert into institution_facts (id, institution_id, fact_type)
      values (${factId}, ${institutionId}, 'TUITION')
    `;
    await runtime.client`
      insert into institution_fact_versions (
        id, institution_fact_id, version_number, verification_state, is_current,
        value_json, display_text, verified_at, verified_by_admin_id
      ) values (
        ${versionId}, ${factId}, 1, 'VERIFIED', true,
        ${JSON.stringify({ amount: 1_000_000, currency: "KRW" })}::jsonb,
        'KRW 1,000,000', '2026-08-01T00:00:00.000Z', ${adminUserId}
      )
    `;
    await runtime.client`
      insert into institution_fact_version_evidence (
        institution_fact_version_id, source_id, evidence_role
      ) values (${versionId}, ${sourceId}, 'PRIMARY')
    `;
  }
  return { adminUserId, institutionId, sourceId, factId, versionId };
}

const nativeState = {
  businessState: "OPEN",
  title: "2027 Admissions",
  summary: "Apply during the official window.",
  targetAudience: "Families",
  eventStartAt: "2026-09-01T01:00:00.000Z",
  eventEndAt: "2026-09-01T03:00:00.000Z",
  applicationOpenAt: "2026-08-01T00:00:00.000Z",
  applicationCloseAt: "2026-08-31T23:59:59.000Z",
  actionUrl: "https://apply.example.test/native",
  locationText: "Main campus",
  validFrom: null,
  validUntil: null,
} as const;

const legacyState = {
  knowledgeState: "KNOWN",
  eventStatus: "ACTIVE",
  displayTitle: "2027 Application",
  eventStartDate: "2026-08-01",
  eventStartTime: "09:00:00",
  eventEndDate: "2026-08-31",
  eventEndTime: "18:00:00",
  registrationOpenDate: "2026-08-01",
  registrationOpenTime: "09:00:00",
  registrationCloseDate: "2026-08-31",
  registrationCloseTime: "18:00:00",
  timezone: "Asia/Seoul",
  venue: null,
  actionUrl: "https://apply.example.test/legacy",
  officialNotes: null,
} as const;

function opportunityBody(
  fixture: NativeFixture | LegacyFixture,
  proposedState: unknown,
) {
  return {
    expectedCurrentVersionId:
      "versionId" in fixture ? fixture.versionId : fixture.eventVersionId,
    proposedState,
    sourceId: fixture.sourceId,
    evidence: { evidenceRole: "PRIMARY" },
  };
}

function factBody(
  fixture: FactFixture,
  amount: number,
  expectedCurrentVersionId = fixture.versionId,
) {
  return {
    expectedCurrentVersionId,
    proposedState: {
      valueJson: { currency: "KRW", amount },
      displayText: `KRW ${amount.toLocaleString("en-US")}`,
      validFrom: null,
      validUntil: null,
    },
    sourceId: fixture.sourceId,
    evidence: { evidenceRole: "PRIMARY" },
  };
}

function request(path: string, body: unknown): Request {
  return new Request(`${appBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appBaseUrl },
    body: JSON.stringify(body),
  });
}

function commonDependencies(adminUserId: string) {
  return {
    requireCurrentAdmin: async () => ({ adminUserId, displayName: "Verifier" }),
    getAppBaseUrl: () => appBaseUrl,
    createContext: ({ reason }: { adminUserId: string; reason: string }) =>
      createAdminCommandContext({ adminUserId, occurredAt, reason }),
    createErrorCorrelationId: randomUUID,
  };
}

function opportunityDependencies(
  fixture: NativeFixture | LegacyFixture,
  options: Parameters<typeof verifyOpportunity>[2] = {
    transactionManager: runtime.transactionManager,
  },
) {
  return {
    ...commonDependencies(fixture.adminUserId),
    verifyOpportunity: (
      context: Parameters<typeof verifyOpportunity>[0],
      input: unknown,
    ) => verifyOpportunity(context, input, options),
  };
}

function factDependencies(
  fixture: FactFixture,
  options: Parameters<typeof verifyInstitutionFact>[2] = {
    transactionManager: runtime.transactionManager,
  },
) {
  return {
    ...commonDependencies(fixture.adminUserId),
    verifyInstitutionFact: (
      context: Parameters<typeof verifyInstitutionFact>[0],
      input: unknown,
    ) => verifyInstitutionFact(context, input, options),
  };
}

async function opportunityCounts(fixture: NativeFixture | LegacyFixture) {
  const [counts] = await runtime.client<
    {
      native_versions: number;
      event_versions: number;
      evidence: number;
      observations: number;
      changes: number;
      audits: number;
      outbox: number;
      notifications: number;
      deliveries: number;
    }[]
  >`
    select
      (select count(*)::int from opportunity_versions where opportunity_id=${fixture.opportunityId}) as native_versions,
      (select count(*)::int from admission_event_versions where admission_event_id=${"eventId" in fixture ? fixture.eventId : randomUUID()}) as event_versions,
      ((select count(*)::int from opportunity_version_evidence e join opportunity_versions v on v.id=e.opportunity_version_id where v.opportunity_id=${fixture.opportunityId}) +
       (select count(*)::int from event_version_evidence e join admission_event_versions v on v.id=e.event_version_id where v.admission_event_id=${"eventId" in fixture ? fixture.eventId : randomUUID()})) as evidence,
      (select count(*)::int from source_observations where source_id=${fixture.sourceId}) as observations,
      (select count(*)::int from opportunity_changes where opportunity_id=${fixture.opportunityId}) as changes,
      (select count(*)::int from audit_logs where entity_id=${fixture.opportunityId}) as audits,
      (select count(*)::int from outbox_events where aggregate_id in (select id from opportunity_changes where opportunity_id=${fixture.opportunityId})) as outbox,
      (select count(*)::int from notifications where opportunity_id=${fixture.opportunityId}) as notifications,
      (select count(*)::int from notification_deliveries d join notifications n on n.id=d.notification_id where n.opportunity_id=${fixture.opportunityId}) as deliveries
  `;
  return counts!;
}

async function factCounts(fixture: FactFixture) {
  const [counts] = await runtime.client<
    {
      facts: number;
      versions: number;
      evidence: number;
      observations: number;
      audits: number;
      outbox: number;
      notifications: number;
      deliveries: number;
    }[]
  >`
    select
      (select count(*)::int from institution_facts where institution_id=${fixture.institutionId}) as facts,
      (select count(*)::int from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id where f.institution_id=${fixture.institutionId}) as versions,
      (select count(*)::int from institution_fact_version_evidence e join institution_fact_versions v on v.id=e.institution_fact_version_id join institution_facts f on f.id=v.institution_fact_id where f.institution_id=${fixture.institutionId}) as evidence,
      (select count(*)::int from source_observations where source_id=${fixture.sourceId}) as observations,
      (select count(*)::int from audit_logs where entity_id=${fixture.institutionId}) as audits,
      (select count(*)::int from outbox_events where aggregate_id=${fixture.institutionId}) as outbox,
      (select count(*)::int from notifications n join opportunities o on o.id=n.opportunity_id where o.institution_id=${fixture.institutionId}) as notifications,
      (select count(*)::int from notification_deliveries d join notifications n on n.id=d.notification_id join opportunities o on o.id=n.opportunity_id where o.institution_id=${fixture.institutionId}) as deliveries
  `;
  return counts!;
}

type PersistedAudit = Readonly<{
  action_type: string;
  entity_type: string;
  entity_id: string;
  admin_user_id: string;
  after_data: {
    correlationId: string;
    reason: string;
    metadata: Record<string, unknown>;
  };
  created_at: string;
}>;

async function auditRows(entityId: string): Promise<PersistedAudit[]> {
  return runtime.client<PersistedAudit[]>`
    select action_type, entity_type, entity_id, admin_user_id,
           after_data, created_at
    from audit_logs
    where entity_id=${entityId}
    order by id
  `;
}

function exactAudit(
  row: PersistedAudit,
  expected: Omit<PersistedAudit, "created_at">,
): void {
  expect({
    ...row,
    created_at: new Date(row.created_at).toISOString(),
  }).toEqual({
    ...expected,
    created_at: occurredAt.toISOString(),
  });
}

async function cleanup(): Promise<void> {
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`delete from outbox_events where aggregate_id in (select c.id from opportunity_changes c join opportunities o on o.id=c.opportunity_id where o.slug like ${`${prefix}-%`})`;
    await transaction`delete from opportunity_changes where opportunity_id in (select id from opportunities where slug like ${`${prefix}-%`})`;
    await transaction`delete from meaningful_changes where admission_event_id in (select id from admission_events where event_key like ${`${prefix}-%`})`;
    await transaction`delete from audit_logs where entity_id in (select id from opportunities where slug like ${`${prefix}-%`}) or entity_id in (select id from institutions where slug like ${`${prefix}-%`})`;
    await transaction`delete from institution_fact_version_evidence where institution_fact_version_id in (select v.id from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id join institutions i on i.id=f.institution_id where i.slug like ${`${prefix}-%`})`;
    await transaction`delete from institution_fact_versions where institution_fact_id in (select f.id from institution_facts f join institutions i on i.id=f.institution_id where i.slug like ${`${prefix}-%`})`;
    await transaction`delete from institution_facts where institution_id in (select id from institutions where slug like ${`${prefix}-%`})`;
    await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select v.id from opportunity_versions v join opportunities o on o.id=v.opportunity_id where o.slug like ${`${prefix}-%`})`;
    await transaction`delete from event_version_evidence where event_version_id in (select v.id from admission_event_versions v join admission_events e on e.id=v.admission_event_id where e.event_key like ${`${prefix}-%`})`;
    await transaction`delete from source_observations where source_id in (select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`})`;
    await transaction`delete from opportunity_source_bindings where opportunity_id in (select id from opportunities where slug like ${`${prefix}-%`})`;
    await transaction`delete from institution_source_bindings where institution_id in (select id from institutions where slug like ${`${prefix}-%`})`;
    await transaction`delete from opportunity_admission_event_links where opportunity_id in (select id from opportunities where slug like ${`${prefix}-%`})`;
    await transaction`delete from opportunity_versions where opportunity_id in (select id from opportunities where slug like ${`${prefix}-%`})`;
    await transaction`delete from opportunities where slug like ${`${prefix}-%`}`;
    await transaction`delete from admission_event_versions where admission_event_id in (select id from admission_events where event_key like ${`${prefix}-%`})`;
    await transaction`delete from admission_events where event_key like ${`${prefix}-%`}`;
    await transaction`delete from admission_cycles where internal_notes=${prefix}`;
    await transaction`delete from institution_school_links where link_reason=${prefix}`;
    await transaction`delete from schools where slug like ${`${prefix}-%`}`;
    await transaction`delete from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}-%`}`;
    await transaction`delete from admin_users where external_auth_subject like ${`${prefix}-%`}`;
  });
}

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
  try {
    await migrateDatabase(databaseUrl);
  } finally {
    await schemaLockSql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
  }
});

afterEach(cleanup);

afterAll(async () => {
  await cleanup();
  await closeRuntimeDatabase();
  await schemaLockSql.end({ timeout: 5 });
});

describe("WP-11 Admin verification HTTP integration", () => {
  it("preserves Native no-change and meaningful-change lineage and product-signal rules", async () => {
    const noChange = await createNativeFixture();
    const noChangeResponse = await handleAdminVerifyOpportunityRequest(
      request(
        `/api/admin/opportunities/${noChange.opportunityId}/verify`,
        opportunityBody(noChange, nativeState),
      ),
      { opportunityId: noChange.opportunityId },
      opportunityDependencies(noChange),
    );
    expect(noChangeResponse.status).toBe(200);
    const noChangePayload = await noChangeResponse.json();
    expect(noChangePayload).toMatchObject({
      data: {
        outcome: "NO_CHANGE",
        truthMode: "NATIVE",
        outboxEnqueued: false,
      },
    });
    expect(await opportunityCounts(noChange)).toEqual({
      native_versions: 1,
      event_versions: 0,
      evidence: 1,
      observations: 1,
      changes: 0,
      audits: 1,
      outbox: 0,
      notifications: 0,
      deliveries: 0,
    });
    const [noChangeAudit] = await auditRows(noChange.opportunityId);
    exactAudit(noChangeAudit!, {
      action_type: "WP10B_VERIFY_NATIVE_NO_CHANGE",
      entity_type: "OPPORTUNITY",
      entity_id: noChange.opportunityId,
      admin_user_id: noChange.adminUserId,
      after_data: {
        correlationId: noChangePayload.correlationId,
        reason: "ADMIN_VERIFY_OPPORTUNITY",
        metadata: {
          sourceId: noChange.sourceId,
          observationId: expect.stringMatching(/^[1-9]\d*$/),
          versionId: noChange.versionId,
          outcomeCode: "UNCHANGED",
        },
      },
    });

    const changed = await createNativeFixture();
    const changedResponse = await handleAdminVerifyOpportunityRequest(
      request(
        `/api/admin/opportunities/${changed.opportunityId}/verify`,
        opportunityBody(changed, {
          ...nativeState,
          eventStartAt: "2026-09-01T02:00:00.000Z",
        }),
      ),
      { opportunityId: changed.opportunityId },
      opportunityDependencies(changed),
    );
    expect(changedResponse.status).toBe(200);
    const changedPayload = await changedResponse.json();
    expect(changedPayload).toMatchObject({
      data: {
        outcome: "CHANGED",
        truthMode: "NATIVE",
        changeType: "DATE_CHANGED",
        outboxEnqueued: true,
      },
    });
    expect(await opportunityCounts(changed)).toEqual({
      native_versions: 2,
      event_versions: 0,
      evidence: 2,
      observations: 0,
      changes: 1,
      audits: 1,
      outbox: 1,
      notifications: 0,
      deliveries: 0,
    });
    const [changedAudit] = await auditRows(changed.opportunityId);
    exactAudit(changedAudit!, {
      action_type: "WP10B_VERIFY_NATIVE_OPPORTUNITY",
      entity_type: "OPPORTUNITY",
      entity_id: changed.opportunityId,
      admin_user_id: changed.adminUserId,
      after_data: {
        correlationId: changedPayload.correlationId,
        reason: "ADMIN_VERIFY_OPPORTUNITY",
        metadata: {
          sourceId: changed.sourceId,
          versionId: changedPayload.data.currentVersionId,
          changeId: changedPayload.data.opportunityChangeId,
          changedFields: ["EVENT_START_AT"],
          outcomeCode: "NOTIFIABLE",
        },
      },
    });
  });

  it("preserves Legacy-backed no-change and meaningful-change lineage through the same adapter", async () => {
    const noChange = await createLegacyFixture();
    const noChangeResponse = await handleAdminVerifyOpportunityRequest(
      request(
        `/api/admin/opportunities/${noChange.opportunityId}/verify`,
        opportunityBody(noChange, legacyState),
      ),
      { opportunityId: noChange.opportunityId },
      opportunityDependencies(noChange),
    );
    expect(noChangeResponse.status).toBe(200);
    const noChangePayload = await noChangeResponse.json();
    expect(noChangePayload).toMatchObject({
      data: {
        outcome: "NO_CHANGE",
        truthMode: "LEGACY_BACKED",
        outboxEnqueued: false,
      },
    });
    expect(await opportunityCounts(noChange)).toEqual({
      native_versions: 0,
      event_versions: 1,
      evidence: 1,
      observations: 1,
      changes: 0,
      audits: 1,
      outbox: 0,
      notifications: 0,
      deliveries: 0,
    });
    const [noChangeAudit] = await auditRows(noChange.opportunityId);
    exactAudit(noChangeAudit!, {
      action_type: "WP10B_VERIFY_LEGACY_NO_CHANGE",
      entity_type: "OPPORTUNITY",
      entity_id: noChange.opportunityId,
      admin_user_id: noChange.adminUserId,
      after_data: {
        correlationId: noChangePayload.correlationId,
        reason: "ADMIN_VERIFY_OPPORTUNITY",
        metadata: {
          sourceId: noChange.sourceId,
          observationId: expect.stringMatching(/^[1-9]\d*$/),
          versionId: noChange.eventVersionId,
          outcomeCode: "UNCHANGED",
        },
      },
    });

    const changed = await createLegacyFixture();
    const changedResponse = await handleAdminVerifyOpportunityRequest(
      request(
        `/api/admin/opportunities/${changed.opportunityId}/verify`,
        opportunityBody(changed, {
          ...legacyState,
          registrationCloseDate: "2026-09-02",
        }),
      ),
      { opportunityId: changed.opportunityId },
      opportunityDependencies(changed),
    );
    expect(changedResponse.status).toBe(200);
    const changedPayload = await changedResponse.json();
    expect(changedPayload).toMatchObject({
      data: {
        outcome: "CHANGED",
        truthMode: "LEGACY_BACKED",
        outboxEnqueued: true,
      },
    });
    expect(await opportunityCounts(changed)).toEqual({
      native_versions: 0,
      event_versions: 2,
      evidence: 2,
      observations: 0,
      changes: 1,
      audits: 1,
      outbox: 1,
      notifications: 0,
      deliveries: 0,
    });
    const [changeOrigin] = await runtime.client<
      { legacy_meaningful_change_id: string }[]
    >`
      select legacy_meaningful_change_id
      from opportunity_changes
      where id=${changedPayload.data.opportunityChangeId}
    `;
    const [changedAudit] = await auditRows(changed.opportunityId);
    exactAudit(changedAudit!, {
      action_type: "WP10B_VERIFY_LEGACY_OPPORTUNITY",
      entity_type: "OPPORTUNITY",
      entity_id: changed.opportunityId,
      admin_user_id: changed.adminUserId,
      after_data: {
        correlationId: changedPayload.correlationId,
        reason: "ADMIN_VERIFY_OPPORTUNITY",
        metadata: {
          sourceId: changed.sourceId,
          versionId: changeOrigin!.legacy_meaningful_change_id,
          changeId: changedPayload.data.opportunityChangeId,
          changedFields: ["REGISTRATION_CLOSE_DATE"],
          outcomeCode: "NOTIFIABLE",
        },
      },
    });
  });

  it("creates, confirms, and changes Institution Fact truth with no product signals", async () => {
    const created = await createFactFixture(false);
    const createResponse = await handleAdminVerifyInstitutionFactRequest(
      request(
        `/api/admin/institutions/${created.institutionId}/facts/TUITION/verify`,
        factBody(created, 1_200_000, null),
      ),
      { institutionId: created.institutionId, factType: "TUITION" },
      factDependencies(created),
    );
    expect(createResponse.status).toBe(200);
    const createPayload = await createResponse.json();
    expect(createPayload).toMatchObject({
      data: { outcome: "CREATED", factType: "TUITION" },
    });
    expect(await factCounts(created)).toEqual({
      facts: 1,
      versions: 1,
      evidence: 1,
      observations: 0,
      audits: 1,
      outbox: 0,
      notifications: 0,
      deliveries: 0,
    });
    const [createAudit] = await auditRows(created.institutionId);
    exactAudit(createAudit!, {
      action_type: "WP10B_VERIFY_INSTITUTION_FACT_CREATED",
      entity_type: "INSTITUTION",
      entity_id: created.institutionId,
      admin_user_id: created.adminUserId,
      after_data: {
        correlationId: createPayload.correlationId,
        reason: "ADMIN_VERIFY_INSTITUTION_FACT",
        metadata: {
          sourceId: created.sourceId,
          targetId: createPayload.data.institutionFactId,
          versionId: createPayload.data.currentVersionId,
          outcomeCode: "CREATED",
        },
      },
    });

    const existing = await createFactFixture(true);
    const noChangeResponse = await handleAdminVerifyInstitutionFactRequest(
      request(
        `/api/admin/institutions/${existing.institutionId}/facts/TUITION/verify`,
        factBody(existing, 1_000_000),
      ),
      { institutionId: existing.institutionId, factType: "TUITION" },
      factDependencies(existing),
    );
    expect(noChangeResponse.status).toBe(200);
    const noChangePayload = await noChangeResponse.json();
    expect(noChangePayload).toMatchObject({
      data: { outcome: "NO_CHANGE" },
    });
    const changeResponse = await handleAdminVerifyInstitutionFactRequest(
      request(
        `/api/admin/institutions/${existing.institutionId}/facts/TUITION/verify`,
        factBody(existing, 1_300_000),
      ),
      { institutionId: existing.institutionId, factType: "TUITION" },
      factDependencies(existing),
    );
    expect(changeResponse.status).toBe(200);
    const changePayload = await changeResponse.json();
    expect(changePayload).toMatchObject({
      data: { outcome: "CHANGED" },
    });
    expect(await factCounts(existing)).toEqual({
      facts: 1,
      versions: 2,
      evidence: 2,
      observations: 1,
      audits: 2,
      outbox: 0,
      notifications: 0,
      deliveries: 0,
    });
    const [noChangeAudit, changeAudit] = await auditRows(
      existing.institutionId,
    );
    exactAudit(noChangeAudit!, {
      action_type: "WP10B_VERIFY_INSTITUTION_FACT_NO_CHANGE",
      entity_type: "INSTITUTION",
      entity_id: existing.institutionId,
      admin_user_id: existing.adminUserId,
      after_data: {
        correlationId: noChangePayload.correlationId,
        reason: "ADMIN_VERIFY_INSTITUTION_FACT",
        metadata: {
          sourceId: existing.sourceId,
          observationId: expect.stringMatching(/^[1-9]\d*$/),
          versionId: existing.versionId,
          outcomeCode: "UNCHANGED",
        },
      },
    });
    exactAudit(changeAudit!, {
      action_type: "WP10B_VERIFY_INSTITUTION_FACT_CHANGED",
      entity_type: "INSTITUTION",
      entity_id: existing.institutionId,
      admin_user_id: existing.adminUserId,
      after_data: {
        correlationId: changePayload.correlationId,
        reason: "ADMIN_VERIFY_INSTITUTION_FACT",
        metadata: {
          sourceId: existing.sourceId,
          targetId: existing.factId,
          versionId: changePayload.data.currentVersionId,
          outcomeCode: "CHANGED",
        },
      },
    });
  });

  it("returns 409 for the second stale candidate without overwrite or second effects", async () => {
    const fixture = await createNativeFixture();
    const first = await handleAdminVerifyOpportunityRequest(
      request(
        `/api/admin/opportunities/${fixture.opportunityId}/verify`,
        opportunityBody(fixture, {
          ...nativeState,
          eventStartAt: "2026-09-01T02:00:00.000Z",
        }),
      ),
      { opportunityId: fixture.opportunityId },
      opportunityDependencies(fixture),
    );
    expect(first.status).toBe(200);
    const afterFirst = await opportunityCounts(fixture);
    const second = await handleAdminVerifyOpportunityRequest(
      request(
        `/api/admin/opportunities/${fixture.opportunityId}/verify`,
        opportunityBody(fixture, {
          ...nativeState,
          eventStartAt: "2026-09-01T02:30:00.000Z",
        }),
      ),
      { opportunityId: fixture.opportunityId },
      opportunityDependencies(fixture),
    );
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      error: {
        code: "CONFLICT",
        message:
          "다른 운영자가 먼저 변경했을 수 있습니다. 최신 데이터를 다시 확인한 뒤 변경 여부를 판단해주세요.",
      },
    });
    expect(await opportunityCounts(fixture)).toEqual(afterFirst);
    const [current] = await runtime.client<{ event_start_at: string }[]>`
      select event_start_at from opportunity_versions
      where opportunity_id=${fixture.opportunityId} and is_current
    `;
    expect(new Date(current!.event_start_at).toISOString()).toBe(
      "2026-09-01T02:00:00.000Z",
    );
  });

  it("rejects inactive binding and Evidence owned by another Source with zero write", async () => {
    const inactive = await createNativeFixture();
    await runtime.client`
      update opportunity_source_bindings
      set is_active=false, unbound_at='2026-08-24T10:00:00.000Z'
      where opportunity_id=${inactive.opportunityId}
    `;
    const beforeInactive = await opportunityCounts(inactive);
    const inactiveResponse = await handleAdminVerifyOpportunityRequest(
      request(
        `/api/admin/opportunities/${inactive.opportunityId}/verify`,
        opportunityBody(inactive, { ...nativeState, title: "Changed" }),
      ),
      { opportunityId: inactive.opportunityId },
      opportunityDependencies(inactive),
    );
    expect(inactiveResponse.status).toBe(403);
    expect(await opportunityCounts(inactive)).toEqual(beforeInactive);

    const fact = await createFactFixture(true);
    const otherSourceId = await insertSource();
    const [observation] = await runtime.client<{ id: string }[]>`
      insert into source_observations (source_id, observed_at, outcome)
      values (${otherSourceId}, '2026-08-24T10:00:00.000Z', 'CHANGED')
      returning id::text
    `;
    const beforeFact = await factCounts(fact);
    const mismatch = await handleAdminVerifyInstitutionFactRequest(
      request(
        `/api/admin/institutions/${fact.institutionId}/facts/TUITION/verify`,
        {
          ...factBody(fact, 1_400_000),
          evidence: { observationId: observation!.id, evidenceRole: "PRIMARY" },
        },
      ),
      { institutionId: fact.institutionId, factType: "TUITION" },
      factDependencies(fact),
    );
    expect(mismatch.status).toBe(403);
    expect(await factCounts(fact)).toEqual(beforeFact);
  });

  it("rejects non-web Native and Legacy action URLs before any canonical effect", async () => {
    const native = await createNativeFixture();
    const beforeNative = await opportunityCounts(native);
    const nativeResponse = await handleAdminVerifyOpportunityRequest(
      request(
        `/api/admin/opportunities/${native.opportunityId}/verify`,
        opportunityBody(native, {
          ...nativeState,
          actionUrl: "https://official.exa\nmple.test/apply",
        }),
      ),
      { opportunityId: native.opportunityId },
      opportunityDependencies(native),
    );
    expect(nativeResponse.status).toBe(400);
    expect(await opportunityCounts(native)).toEqual(beforeNative);

    const legacy = await createLegacyFixture();
    const beforeLegacy = await opportunityCounts(legacy);
    const legacyResponse = await handleAdminVerifyOpportunityRequest(
      request(
        `/api/admin/opportunities/${legacy.opportunityId}/verify`,
        opportunityBody(legacy, {
          ...legacyState,
          actionUrl: "https:/official.example.test/apply",
        }),
      ),
      { opportunityId: legacy.opportunityId },
      opportunityDependencies(legacy),
    );
    expect(legacyResponse.status).toBe(400);
    expect(await opportunityCounts(legacy)).toEqual(beforeLegacy);
  });

  it("applies only approved materiality reasons at the canonical seam", async () => {
    const userImpact = await createNativeFixture();
    const userImpactResponse = await handleAdminVerifyOpportunityRequest(
      request(`/api/admin/opportunities/${userImpact.opportunityId}/verify`, {
        ...opportunityBody(userImpact, {
          ...nativeState,
          eventStartAt: "2026-09-01T02:00:00.000Z",
        }),
        materialityOverride: "NOTIFIABLE",
        overrideReason: "MATERIALITY_USER_IMPACT_CONFIRMED",
      }),
      { opportunityId: userImpact.opportunityId },
      opportunityDependencies(userImpact),
    );
    expect(userImpactResponse.status).toBe(200);
    expect(await userImpactResponse.json()).toMatchObject({
      data: { materiality: "NOTIFIABLE", outboxEnqueued: true },
    });

    const nonFacing = await createNativeFixture();
    const nonFacingResponse = await handleAdminVerifyOpportunityRequest(
      request(`/api/admin/opportunities/${nonFacing.opportunityId}/verify`, {
        ...opportunityBody(nonFacing, {
          ...nativeState,
          eventStartAt: "2026-09-01T02:00:00.000Z",
        }),
        materialityOverride: "NON_NOTIFIABLE",
        overrideReason: "MATERIALITY_NON_USER_FACING_CONFIRMED",
      }),
      { opportunityId: nonFacing.opportunityId },
      opportunityDependencies(nonFacing),
    );
    expect(nonFacingResponse.status).toBe(200);
    expect(await nonFacingResponse.json()).toMatchObject({
      data: { materiality: "NON_NOTIFIABLE", outboxEnqueued: false },
    });
  });

  it("rolls back full Opportunity and Fact roots when Outbox or Audit dependencies fail", async () => {
    const opportunity = await createNativeFixture();
    const beforeOpportunity = await opportunityCounts(opportunity);
    const failedOutbox = await handleAdminVerifyOpportunityRequest(
      request(
        `/api/admin/opportunities/${opportunity.opportunityId}/verify`,
        opportunityBody(opportunity, {
          ...nativeState,
          eventStartAt: "2026-09-01T02:00:00.000Z",
        }),
      ),
      { opportunityId: opportunity.opportunityId },
      opportunityDependencies(opportunity, {
        transactionManager: runtime.transactionManager,
        canonicalChangeDependencies: {
          ...defaultCanonicalChangeDependencies,
          enqueueOutbox: async () => {
            throw new Error("forced secret Outbox failure");
          },
        },
      }),
    );
    expect(failedOutbox.status).toBe(500);
    expect(JSON.stringify(await failedOutbox.json())).not.toContain(
      "forced secret",
    );
    expect(await opportunityCounts(opportunity)).toEqual(beforeOpportunity);

    const fact = await createFactFixture(true);
    const beforeFact = await factCounts(fact);
    const failedAudit = await handleAdminVerifyInstitutionFactRequest(
      request(
        `/api/admin/institutions/${fact.institutionId}/facts/TUITION/verify`,
        factBody(fact, 1_600_000),
      ),
      { institutionId: fact.institutionId, factType: "TUITION" },
      factDependencies(fact, {
        transactionManager: runtime.transactionManager,
        persistence: {
          ...defaultVerifyInstitutionFactPersistence,
          writeAudit: async () => {
            throw new Error("forced secret Audit failure");
          },
        },
      }),
    );
    expect(failedAudit.status).toBe(500);
    expect(JSON.stringify(await failedAudit.json())).not.toContain(
      "forced secret",
    );
    expect(await factCounts(fact)).toEqual(beforeFact);
  });
});
