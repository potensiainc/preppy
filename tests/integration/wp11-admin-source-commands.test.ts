import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { AdminCommandContext } from "@/src/application/context";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  handleAdminBindInstitutionSourceRequest,
  handleAdminBindOpportunitySourceRequest,
  handleAdminMarkSourceUnavailableRequest,
  handleAdminMoveSourceRequest,
  handleAdminUnbindInstitutionSourceRequest,
  handleAdminUnbindOpportunitySourceRequest,
} from "@/src/modules/admin/http/source-commands.server";
import {
  bindInstitutionSource,
  defaultSourceCommandPersistence,
  markSourceMoved,
} from "@/src/modules/monitoring/source-commands.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousDatabaseMaxConnections = process.env.DATABASE_MAX_CONNECTIONS;
process.env.DATABASE_URL = databaseUrl;
process.env.DATABASE_MAX_CONNECTIONS = "8";

const appBaseUrl = "https://preppy.example";
const prefix = `wp11-source-${randomUUID()}`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 8,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

type Fixture = Readonly<{
  adminUserId: string;
  institutionId: string;
  opportunityId: string;
  opportunityVersionId: string;
  sourceId: string;
  canonicalUrl: string;
}>;

async function insertSource(
  label: string,
  lifecycleStatus = "ACTIVE",
): Promise<string> {
  const sourceId = randomUUID();
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${sourceId}, ${`https://official.example.test/${prefix}/${label}/${sourceId}`},
      'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', ${lifecycleStatus},
      ${`WP-11 ${label}`}
    )
  `;
  await runtime.client`
    insert into source_monitor_configs (
      source_id, collection_strategy, monitoring_profile, is_enabled
    ) values (${sourceId}, 'MANUAL', 'MANUAL', true)
  `;
  return sourceId;
}

async function insertFixture(): Promise<Fixture> {
  const adminUserId = randomUUID();
  const institutionId = randomUUID();
  const opportunityId = randomUUID();
  const opportunityVersionId = randomUUID();
  const sourceId = await insertSource("primary");
  const canonicalUrl = `https://official.example.test/${prefix}/primary/${sourceId}`;
  await runtime.client`
    insert into admin_users (
      id, external_auth_subject, email, display_name, status
    ) values (
      ${adminUserId}, ${`${prefix}-admin-${adminUserId}`},
      ${`${prefix}-${adminUserId}@example.test`}, 'WP-11 Operator', 'ACTIVE'
    )
  `;
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${institutionId}, ${`${prefix}-institution-${institutionId}`},
      'WP-11 Institution', 'ENGLISH_KINDERGARTEN', 'ACTIVE', 'DRAFT'
    )
  `;
  await runtime.client`
    insert into institution_source_bindings (
      institution_id, source_id, role, is_primary, is_active
    ) values (${institutionId}, ${sourceId}, 'OFFICIAL_MAIN', true, true)
  `;
  await runtime.client`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode, publication_state
    ) values (
      ${opportunityId}, ${institutionId},
      ${`${prefix}-opportunity-${opportunityId}`},
      'APPLICATION', 'NATIVE', 'DRAFT'
    )
  `;
  await runtime.client`
    insert into opportunity_versions (
      id, opportunity_id, version_number, verification_state, business_state,
      is_current, title, verified_at
    ) values (
      ${opportunityVersionId}, ${opportunityId}, 1, 'VERIFIED', 'OPEN', true,
      'Existing truth', '2026-08-01T01:02:03.000Z'
    )
  `;
  await runtime.client`
    insert into opportunity_source_bindings (
      opportunity_id, source_id, role, is_primary, is_active
    ) values (${opportunityId}, ${sourceId}, 'PRIMARY_NOTICE', true, true)
  `;
  await runtime.client`
    insert into opportunity_version_evidence (
      opportunity_version_id, source_id, evidence_role
    ) values (${opportunityVersionId}, ${sourceId}, 'PRIMARY')
  `;
  return {
    adminUserId,
    institutionId,
    opportunityId,
    opportunityVersionId,
    sourceId,
    canonicalUrl,
  };
}

function request(path: string, body: unknown, method = "POST"): Request {
  return new Request(`${appBaseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", origin: appBaseUrl },
    body: JSON.stringify(body),
  });
}

function pipeline(
  fixture: Fixture,
  occurredAt = new Date("2026-08-24T10:00:00.000Z"),
  correlationId = randomUUID(),
) {
  return {
    requireCurrentAdmin: async () => ({
      adminUserId: fixture.adminUserId,
      displayName: "WP-11 Operator",
    }),
    getAppBaseUrl: () => appBaseUrl,
    createContext: ({
      adminUserId,
      reason,
    }: {
      adminUserId: string;
      reason: string;
    }) => ({
      adminUserId,
      reason,
      occurredAt,
      correlationId,
    }),
  };
}

type AuditRow = Readonly<{
  action_type: string;
  entity_type: string;
  entity_id: string;
  admin_user_id: string;
  after_data: Record<string, unknown>;
  created_at: string;
}>;

async function auditRows(
  fixture: Fixture,
  input: { actionType?: string; entityType?: string; entityId?: string } = {},
): Promise<AuditRow[]> {
  return runtime.client<AuditRow[]>`
    select action_type, entity_type, entity_id, admin_user_id,
           after_data, created_at
    from audit_logs
    where admin_user_id=${fixture.adminUserId}
      and (${input.actionType ?? null}::text is null or action_type=${input.actionType ?? null})
      and (${input.entityType ?? null}::text is null or entity_type=${input.entityType ?? null})
      and (${input.entityId ?? null}::uuid is null or entity_id=${input.entityId ?? null})
    order by id
  `;
}

function expectExactAudit(
  row: AuditRow,
  expected: {
    actionType: string;
    entityType: string;
    entityId: string;
    fixture: Fixture;
    occurredAt: Date;
    correlationId: string;
    reason: string;
    metadata: Record<string, unknown>;
  },
) {
  expect({ ...row, created_at: new Date(row.created_at) }).toEqual({
    action_type: expected.actionType,
    entity_type: expected.entityType,
    entity_id: expected.entityId,
    admin_user_id: expected.fixture.adminUserId,
    after_data: {
      correlationId: expected.correlationId,
      reason: expected.reason,
      metadata: expected.metadata,
    },
    created_at: expected.occurredAt,
  });
}

async function productSignalCounts(fixture: Fixture) {
  const [counts] = await runtime.client<
    {
      opportunity_versions: number;
      fact_versions: number;
      changes: number;
      notifications: number;
      outbox: number;
    }[]
  >`
    select
      (select count(*)::int from opportunity_versions where opportunity_id=${fixture.opportunityId}) as opportunity_versions,
      (select count(*)::int from institution_fact_versions where institution_fact_id in (
        select id from institution_facts where institution_id=${fixture.institutionId}
      )) as fact_versions,
      (select count(*)::int from opportunity_changes where opportunity_id=${fixture.opportunityId}) as changes,
      (select count(*)::int from notifications where opportunity_id=${fixture.opportunityId}) as notifications,
      (select count(*)::int from outbox_events where aggregate_id in (${fixture.opportunityId}, ${fixture.institutionId}, ${fixture.sourceId})) as outbox
  `;
  return counts!;
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`
      delete from audit_logs where admin_user_id in (
        select id from admin_users where external_auth_subject like ${`${prefix}-%`}
      )
    `;
    await transaction`
      delete from opportunity_version_evidence where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from source_observations where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from institution_source_bindings where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from opportunity_source_bindings where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from opportunity_versions where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}-%`}
      )
    `;
    await transaction`delete from opportunities where slug like ${`${prefix}-%`}`;
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
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousDatabaseMaxConnections === undefined) {
    delete process.env.DATABASE_MAX_CONNECTIONS;
  } else {
    process.env.DATABASE_MAX_CONNECTIONS = previousDatabaseMaxConnections;
  }
});

describe("WP-11 Admin Source command HTTP integration", () => {
  it("records the exact unavailable observation/lifecycle/Audit and zero truth or product signals", async () => {
    const fixture = await insertFixture();
    const before = await productSignalCounts(fixture);
    const occurredAt = new Date("2026-08-24T11:00:00.000Z");
    const correlationId = randomUUID();
    const response = await handleAdminMarkSourceUnavailableRequest(
      request(`/api/admin/sources/${fixture.sourceId}/unavailable`, {
        outcome: "TIMEOUT",
        httpStatus: 504,
        finalUrl: fixture.canonicalUrl,
        durationMs: 30_000,
        errorCode: "UPSTREAM_TIMEOUT",
        errorMessage: "Official Source timed out",
        pauseSource: true,
      }),
      { sourceId: fixture.sourceId },
      pipeline(fixture, occurredAt, correlationId),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    const [source] = await runtime.client<{ lifecycle_status: string }[]>`
      select lifecycle_status from sources where id=${fixture.sourceId}
    `;
    const [observation] = await runtime.client<
      {
        outcome: string;
        http_status: number;
        final_url: string;
        error_code: string;
        error_message: string;
      }[]
    >`
      select outcome, http_status, final_url, error_code, error_message
      from source_observations where source_id=${fixture.sourceId}
    `;
    const [audit] = await auditRows(fixture);
    expect(source?.lifecycle_status).toBe("PAUSED");
    expect(observation).toEqual({
      outcome: "TIMEOUT",
      http_status: 504,
      final_url: fixture.canonicalUrl,
      error_code: "UPSTREAM_TIMEOUT",
      error_message: "Official Source timed out",
    });
    expect(payload.correlationId).toBe(correlationId);
    expectExactAudit(audit!, {
      actionType: "WP10B_MARK_SOURCE_UNAVAILABLE",
      entityType: "SOURCE",
      entityId: fixture.sourceId,
      fixture,
      occurredAt,
      correlationId,
      reason: "SOURCE_TIMEOUT",
      metadata: {
        sourceId: fixture.sourceId,
        observationId: payload.data.observationId,
        outcomeCode: "TIMEOUT",
      },
    });
    expect(await productSignalCounts(fixture)).toEqual(before);
  });

  it("rejects fragment, secret-bearing, credential, scheme, and noncanonical unavailable final URLs before effects", async () => {
    const fixture = await insertFixture();
    const beforeSignals = await productSignalCounts(fixture);
    const invalidUrls = [
      "https://official.example.test/page#access_token=secret",
      "https://user:secret@official.example.test/page",
      "ftp://official.example.test/page",
      " HTTPS://official.example.test/page",
      "HTTPS://official.example.test/page",
      "https:\\official.example.test\\page",
      "https://official.example.test/a/../page",
    ] as const;
    for (const finalUrl of invalidUrls) {
      const response = await handleAdminMarkSourceUnavailableRequest(
        request(`/api/admin/sources/${fixture.sourceId}/unavailable`, {
          outcome: "ACCESS_ERROR",
          finalUrl,
          pauseSource: true,
        }),
        { sourceId: fixture.sourceId },
        pipeline(fixture),
      );
      expect(response.status, finalUrl).toBe(400);
    }
    const observations = await runtime.client`
      select id from source_observations where source_id=${fixture.sourceId}
    `;
    expect(observations).toHaveLength(0);
    expect(await auditRows(fixture)).toHaveLength(0);
    const [source] = await runtime.client<{ lifecycle_status: string }[]>`
      select lifecycle_status from sources where id=${fixture.sourceId}
    `;
    expect(source?.lifecycle_status).toBe("ACTIVE");
    expect(await productSignalCounts(fixture)).toEqual(beforeSignals);
  });

  it("corrects only the same Source URL and preserves bindings/Evidence with zero product signals", async () => {
    const fixture = await insertFixture();
    const before = await productSignalCounts(fixture);
    const occurredAt = new Date("2026-08-24T12:00:00.000Z");
    const correlationId = randomUUID();
    const correctedUrl = `https://official.example.test/${prefix}/corrected/${fixture.sourceId}`;
    const response = await handleAdminMoveSourceRequest(
      request(`/api/admin/sources/${fixture.sourceId}/moved`, {
        moveMode: "URL_CORRECTION",
        newUrl: correctedUrl,
        provenanceContinuityConfirmed: true,
      }),
      { sourceId: fixture.sourceId },
      pipeline(fixture, occurredAt, correlationId),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data).toMatchObject({
      moveMode: "URL_CORRECTION",
      oldSourceId: fixture.sourceId,
      newSourceId: fixture.sourceId,
      canonicalUrl: correctedUrl,
    });
    const [source] = await runtime.client<
      { id: string; canonical_url: string; lifecycle_status: string }[]
    >`select id, canonical_url, lifecycle_status from sources where id=${fixture.sourceId}`;
    const [evidence] = await runtime.client<{ source_id: string }[]>`
      select source_id from opportunity_version_evidence
      where opportunity_version_id=${fixture.opportunityVersionId}
    `;
    const [institutionBinding] = await runtime.client<
      { source_id: string; is_active: boolean }[]
    >`
      select source_id, is_active from institution_source_bindings
      where institution_id=${fixture.institutionId} and role='OFFICIAL_MAIN'
    `;
    expect(source).toEqual({
      id: fixture.sourceId,
      canonical_url: correctedUrl,
      lifecycle_status: "ACTIVE",
    });
    expect(evidence?.source_id).toBe(fixture.sourceId);
    expect(institutionBinding).toEqual({
      source_id: fixture.sourceId,
      is_active: true,
    });
    expect(payload.correlationId).toBe(correlationId);
    const [audit] = await auditRows(fixture);
    expectExactAudit(audit!, {
      actionType: "WP10B_SOURCE_URL_CORRECTED",
      entityType: "SOURCE",
      entityId: fixture.sourceId,
      fixture,
      occurredAt,
      correlationId,
      reason: "SOURCE_URL_CORRECTION_CONFIRMED",
      metadata: {
        sourceId: fixture.sourceId,
        outcomeCode: "URL_CORRECTED",
        moveMode: "URL_CORRECTION",
      },
    });
    expect(await productSignalCounts(fixture)).toEqual(before);
  });

  it("replaces Source identity atomically while historical Evidence remains on the old Source", async () => {
    const fixture = await insertFixture();
    const before = await productSignalCounts(fixture);
    const occurredAt = new Date("2026-08-24T13:00:00.000Z");
    const correlationId = randomUUID();
    const replacementUrl = `https://official.example.test/${prefix}/replacement/${randomUUID()}`;
    const response = await handleAdminMoveSourceRequest(
      request(`/api/admin/sources/${fixture.sourceId}/moved`, {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: {
          kind: "CREATE",
          canonicalUrl: replacementUrl,
          sourceName: "Replacement official Source",
        },
      }),
      { sourceId: fixture.sourceId },
      pipeline(fixture, occurredAt, correlationId),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.correlationId).toBe(correlationId);
    const newSourceId = payload.data.newSourceId as string;
    expect(newSourceId).not.toBe(fixture.sourceId);
    const sourceRows = await runtime.client<
      { id: string; lifecycle_status: string }[]
    >`
      select id, lifecycle_status from sources
      where id in (${fixture.sourceId}, ${newSourceId})
    `;
    expect(sourceRows).toEqual(
      expect.arrayContaining([
        { id: fixture.sourceId, lifecycle_status: "RETIRED" },
        { id: newSourceId, lifecycle_status: "ACTIVE" },
      ]),
    );
    const [evidence] = await runtime.client<{ source_id: string }[]>`
      select source_id from opportunity_version_evidence
      where opportunity_version_id=${fixture.opportunityVersionId}
    `;
    expect(evidence?.source_id).toBe(fixture.sourceId);
    const activeInstitution = await runtime.client<{ source_id: string }[]>`
      select source_id from institution_source_bindings
      where institution_id=${fixture.institutionId} and role='OFFICIAL_MAIN' and is_active
    `;
    const activeOpportunity = await runtime.client<{ source_id: string }[]>`
      select source_id from opportunity_source_bindings
      where opportunity_id=${fixture.opportunityId} and role='PRIMARY_NOTICE' and is_active
    `;
    expect(activeInstitution).toEqual([{ source_id: newSourceId }]);
    expect(activeOpportunity).toEqual([{ source_id: newSourceId }]);
    const replacementOutbox = await runtime.client`
      select id from outbox_events where aggregate_id=${newSourceId}
    `;
    expect(replacementOutbox).toHaveLength(0);
    const audits = await auditRows(fixture);
    expect(audits).toHaveLength(3);
    expectExactAudit(audits[0]!, {
      actionType: "WP10B_BIND_INSTITUTION_SOURCE",
      entityType: "INSTITUTION_SOURCE_BINDING",
      entityId: fixture.institutionId,
      fixture,
      occurredAt,
      correlationId,
      reason: "SOURCE_REPLACEMENT_CONFIRMED",
      metadata: { sourceId: newSourceId, outcomeCode: "CREATED" },
    });
    expectExactAudit(audits[1]!, {
      actionType: "WP10B_BIND_OPPORTUNITY_SOURCE",
      entityType: "OPPORTUNITY_SOURCE_BINDING",
      entityId: fixture.opportunityId,
      fixture,
      occurredAt,
      correlationId,
      reason: "SOURCE_REPLACEMENT_CONFIRMED",
      metadata: { sourceId: newSourceId, outcomeCode: "CREATED" },
    });
    expectExactAudit(audits[2]!, {
      actionType: "WP10B_SOURCE_REPLACED",
      entityType: "SOURCE",
      entityId: fixture.sourceId,
      fixture,
      occurredAt,
      correlationId,
      reason: "SOURCE_REPLACEMENT_CONFIRMED",
      metadata: {
        sourceId: fixture.sourceId,
        targetId: newSourceId,
        outcomeCode: "SOURCE_REPLACED",
        moveMode: "SOURCE_REPLACEMENT",
      },
    });
    expect(await productSignalCounts(fixture)).toEqual(before);
  });

  it("reuses an explicit active Source through the real HTTP adapter without rewriting its config or historical Evidence", async () => {
    const fixture = await insertFixture();
    const replacementSourceId = await insertSource("reuse-target");
    await runtime.client`
      update source_monitor_configs
      set collection_strategy='HTTP', monitoring_profile='STANDARD_SEASONAL',
          custom_interval_minutes=4321, max_attempts=7
      where source_id=${replacementSourceId}
    `;
    const before = await productSignalCounts(fixture);
    const occurredAt = new Date("2026-08-24T14:00:00.000Z");
    const correlationId = randomUUID();
    const response = await handleAdminMoveSourceRequest(
      request(`/api/admin/sources/${fixture.sourceId}/moved`, {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: { kind: "REUSE", replacementSourceId },
      }),
      { sourceId: fixture.sourceId },
      pipeline(fixture, occurredAt, correlationId),
    );
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      correlationId,
      data: {
        moveMode: "SOURCE_REPLACEMENT",
        oldSourceId: fixture.sourceId,
        newSourceId: replacementSourceId,
        transferredInstitutionBindings: 1,
        transferredOpportunityBindings: 1,
      },
    });
    const sourceRows = await runtime.client<
      { id: string; lifecycle_status: string }[]
    >`
      select id, lifecycle_status from sources
      where id in (${fixture.sourceId}, ${replacementSourceId})
    `;
    expect(sourceRows).toEqual(
      expect.arrayContaining([
        { id: fixture.sourceId, lifecycle_status: "RETIRED" },
        { id: replacementSourceId, lifecycle_status: "ACTIVE" },
      ]),
    );
    const [replacementConfig] = await runtime.client<
      {
        collection_strategy: string;
        monitoring_profile: string;
        custom_interval_minutes: number;
        max_attempts: number;
      }[]
    >`
      select collection_strategy, monitoring_profile,
             custom_interval_minutes, max_attempts
      from source_monitor_configs where source_id=${replacementSourceId}
    `;
    expect(replacementConfig).toEqual({
      collection_strategy: "HTTP",
      monitoring_profile: "STANDARD_SEASONAL",
      custom_interval_minutes: 4321,
      max_attempts: 7,
    });
    const [evidence] = await runtime.client<{ source_id: string }[]>`
      select source_id from opportunity_version_evidence
      where opportunity_version_id=${fixture.opportunityVersionId}
    `;
    expect(evidence?.source_id).toBe(fixture.sourceId);
    const activeInstitution = await runtime.client<{ source_id: string }[]>`
      select source_id from institution_source_bindings
      where institution_id=${fixture.institutionId} and role='OFFICIAL_MAIN'
        and is_active
    `;
    const activeOpportunity = await runtime.client<{ source_id: string }[]>`
      select source_id from opportunity_source_bindings
      where opportunity_id=${fixture.opportunityId} and role='PRIMARY_NOTICE'
        and is_active
    `;
    expect(activeInstitution).toEqual([{ source_id: replacementSourceId }]);
    expect(activeOpportunity).toEqual([{ source_id: replacementSourceId }]);
    const audits = await auditRows(fixture);
    expect(audits).toHaveLength(3);
    expectExactAudit(audits[0]!, {
      actionType: "WP10B_BIND_INSTITUTION_SOURCE",
      entityType: "INSTITUTION_SOURCE_BINDING",
      entityId: fixture.institutionId,
      fixture,
      occurredAt,
      correlationId,
      reason: "SOURCE_REPLACEMENT_CONFIRMED",
      metadata: { sourceId: replacementSourceId, outcomeCode: "CREATED" },
    });
    expectExactAudit(audits[1]!, {
      actionType: "WP10B_BIND_OPPORTUNITY_SOURCE",
      entityType: "OPPORTUNITY_SOURCE_BINDING",
      entityId: fixture.opportunityId,
      fixture,
      occurredAt,
      correlationId,
      reason: "SOURCE_REPLACEMENT_CONFIRMED",
      metadata: { sourceId: replacementSourceId, outcomeCode: "CREATED" },
    });
    expectExactAudit(audits[2]!, {
      actionType: "WP10B_SOURCE_REPLACED",
      entityType: "SOURCE",
      entityId: fixture.sourceId,
      fixture,
      occurredAt,
      correlationId,
      reason: "SOURCE_REPLACEMENT_CONFIRMED",
      metadata: {
        sourceId: fixture.sourceId,
        targetId: replacementSourceId,
        outcomeCode: "SOURCE_REPLACED",
        moveMode: "SOURCE_REPLACEMENT",
      },
    });
    const replacementOutbox = await runtime.client`
      select id from outbox_events where aggregate_id=${replacementSourceId}
    `;
    expect(replacementOutbox).toHaveLength(0);
    expect(await productSignalCounts(fixture)).toEqual(before);
  });

  it("keeps binding replay/unbind/reactivation exact, rejects conflicts, serializes primaries, and rolls back forced Audit failure", async () => {
    const fixture = await insertFixture();
    const beforeSignals = await productSignalCounts(fixture);
    const candidateSourceId = await insertSource("candidate");
    const createdAt = new Date("2026-08-24T15:00:00.000Z");
    const createdCorrelationId = randomUUID();
    const bindBody = {
      sourceId: candidateSourceId,
      role: "ADMISSIONS",
      isPrimary: false,
    };
    const first = await handleAdminBindInstitutionSourceRequest(
      request(
        `/api/admin/institutions/${fixture.institutionId}/source-bindings`,
        bindBody,
      ),
      { institutionId: fixture.institutionId },
      pipeline(fixture, createdAt, createdCorrelationId),
    );
    const replay = await handleAdminBindInstitutionSourceRequest(
      request(
        `/api/admin/institutions/${fixture.institutionId}/source-bindings`,
        bindBody,
      ),
      { institutionId: fixture.institutionId },
      pipeline(fixture, new Date("2026-08-24T15:01:00.000Z"), randomUUID()),
    );
    expect(first.status).toBe(200);
    const firstPayload = await first.json();
    expect(firstPayload).toMatchObject({
      correlationId: createdCorrelationId,
      data: { created: true },
    });
    expect(replay.status).toBe(200);
    expect((await replay.json()).data).toMatchObject({
      created: false,
      reactivated: false,
    });
    expect(
      await auditRows(fixture, {
        actionType: "WP10B_BIND_INSTITUTION_SOURCE",
        entityType: "INSTITUTION_SOURCE_BINDING",
        entityId: fixture.institutionId,
      }),
    ).toHaveLength(1);

    const unbindPath = {
      institutionId: fixture.institutionId,
      sourceId: candidateSourceId,
      role: "ADMISSIONS",
    };
    const unboundAt = new Date("2026-08-24T15:02:00.000Z");
    const unboundCorrelationId = randomUUID();
    const unbound = await handleAdminUnbindInstitutionSourceRequest(
      request("/api/admin/unbind", {}, "DELETE"),
      unbindPath,
      pipeline(fixture, unboundAt, unboundCorrelationId),
    );
    const inactiveReplay = await handleAdminUnbindInstitutionSourceRequest(
      request("/api/admin/unbind", {}, "DELETE"),
      unbindPath,
      pipeline(fixture, new Date("2026-08-24T15:03:00.000Z"), randomUUID()),
    );
    expect(unbound.status).toBe(200);
    expect(await unbound.json()).toMatchObject({
      correlationId: unboundCorrelationId,
      data: { changed: true },
    });
    expect(inactiveReplay.status).toBe(200);
    expect((await inactiveReplay.json()).data).toMatchObject({
      changed: false,
    });
    const reactivatedAt = new Date("2026-08-24T15:04:00.000Z");
    const reactivatedCorrelationId = randomUUID();
    const reactivated = await handleAdminBindInstitutionSourceRequest(
      request(
        `/api/admin/institutions/${fixture.institutionId}/source-bindings`,
        bindBody,
      ),
      { institutionId: fixture.institutionId },
      pipeline(fixture, reactivatedAt, reactivatedCorrelationId),
    );
    expect(await reactivated.json()).toMatchObject({
      correlationId: reactivatedCorrelationId,
      data: { created: false, reactivated: true },
    });
    const lifecycleAudits = await auditRows(fixture, {
      entityType: "INSTITUTION_SOURCE_BINDING",
      entityId: fixture.institutionId,
    });
    expect(lifecycleAudits).toHaveLength(3);
    expectExactAudit(lifecycleAudits[0]!, {
      actionType: "WP10B_BIND_INSTITUTION_SOURCE",
      entityType: "INSTITUTION_SOURCE_BINDING",
      entityId: fixture.institutionId,
      fixture,
      occurredAt: createdAt,
      correlationId: createdCorrelationId,
      reason: "SOURCE_BINDING_UPDATED",
      metadata: { sourceId: candidateSourceId, outcomeCode: "CREATED" },
    });
    expectExactAudit(lifecycleAudits[1]!, {
      actionType: "WP10B_UNBIND_INSTITUTION_SOURCE",
      entityType: "INSTITUTION_SOURCE_BINDING",
      entityId: fixture.institutionId,
      fixture,
      occurredAt: unboundAt,
      correlationId: unboundCorrelationId,
      reason: "SOURCE_BINDING_UPDATED",
      metadata: { sourceId: candidateSourceId, outcomeCode: "DEACTIVATED" },
    });
    expectExactAudit(lifecycleAudits[2]!, {
      actionType: "WP10B_BIND_INSTITUTION_SOURCE",
      entityType: "INSTITUTION_SOURCE_BINDING",
      entityId: fixture.institutionId,
      fixture,
      occurredAt: reactivatedAt,
      correlationId: reactivatedCorrelationId,
      reason: "SOURCE_BINDING_UPDATED",
      metadata: { sourceId: candidateSourceId, outcomeCode: "REACTIVATED" },
    });

    const primaryConflict = await handleAdminBindInstitutionSourceRequest(
      request(
        `/api/admin/institutions/${fixture.institutionId}/source-bindings`,
        {
          sourceId: candidateSourceId,
          role: "OFFICIAL_MAIN",
          isPrimary: true,
        },
      ),
      { institutionId: fixture.institutionId },
      pipeline(fixture),
    );
    expect(primaryConflict.status).toBe(409);

    const retiredSourceId = await insertSource("retired", "RETIRED");
    const lifecycleConflict = await handleAdminBindInstitutionSourceRequest(
      request(
        `/api/admin/institutions/${fixture.institutionId}/source-bindings`,
        {
          sourceId: retiredSourceId,
          role: "TUITION",
          isPrimary: false,
        },
      ),
      { institutionId: fixture.institutionId },
      pipeline(fixture),
    );
    expect(lifecycleConflict.status).toBe(403);
    expect(
      await auditRows(fixture, {
        entityType: "INSTITUTION_SOURCE_BINDING",
        entityId: fixture.institutionId,
      }),
    ).toHaveLength(3);

    const concurrentA = await insertSource("concurrent-a");
    const concurrentB = await insertSource("concurrent-b");
    const concurrentAt = new Date("2026-08-24T16:00:00.000Z");
    const concurrentCorrelationA = randomUUID();
    const concurrentCorrelationB = randomUUID();
    const concurrent = await Promise.all([
      handleAdminBindInstitutionSourceRequest(
        request("/api/admin/bind", {
          sourceId: concurrentA,
          role: "TUITION",
          isPrimary: true,
        }),
        { institutionId: fixture.institutionId },
        pipeline(fixture, concurrentAt, concurrentCorrelationA),
      ),
      handleAdminBindInstitutionSourceRequest(
        request("/api/admin/bind", {
          sourceId: concurrentB,
          role: "TUITION",
          isPrimary: true,
        }),
        { institutionId: fixture.institutionId },
        pipeline(fixture, concurrentAt, concurrentCorrelationB),
      ),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const activePrimary = await runtime.client<{ source_id: string }[]>`
      select source_id from institution_source_bindings
      where institution_id=${fixture.institutionId} and role='TUITION'
        and is_primary and is_active
    `;
    expect(activePrimary).toHaveLength(1);
    const successfulConcurrent = concurrent.find(
      (response) => response.status === 200,
    )!;
    const successfulConcurrentPayload = await successfulConcurrent.json();
    const [concurrentAudit] = (
      await auditRows(fixture, {
        actionType: "WP10B_BIND_INSTITUTION_SOURCE",
        entityType: "INSTITUTION_SOURCE_BINDING",
        entityId: fixture.institutionId,
      })
    ).slice(-1);
    expectExactAudit(concurrentAudit!, {
      actionType: "WP10B_BIND_INSTITUTION_SOURCE",
      entityType: "INSTITUTION_SOURCE_BINDING",
      entityId: fixture.institutionId,
      fixture,
      occurredAt: concurrentAt,
      correlationId: successfulConcurrentPayload.correlationId,
      reason: "SOURCE_BINDING_UPDATED",
      metadata: {
        sourceId: activePrimary[0]!.source_id,
        outcomeCode: "CREATED",
      },
    });

    const rollbackSourceId = await insertSource("rollback");
    const failed = await handleAdminBindInstitutionSourceRequest(
      request("/api/admin/bind", {
        sourceId: rollbackSourceId,
        role: "CURRICULUM",
        isPrimary: false,
      }),
      { institutionId: fixture.institutionId },
      {
        ...pipeline(fixture),
        bindInstitutionSource: (context: AdminCommandContext, input: unknown) =>
          bindInstitutionSource(context, input, {
            transactionManager: runtime.transactionManager,
            persistence: {
              ...defaultSourceCommandPersistence,
              writeAudit: async () => {
                throw new Error("forced private Audit failure");
              },
            },
          }),
      },
    );
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("forced private");
    const rolledBack = await runtime.client`
      select source_id from institution_source_bindings
      where institution_id=${fixture.institutionId}
        and source_id=${rollbackSourceId} and role='CURRICULUM'
    `;
    expect(rolledBack).toHaveLength(0);
    expect(
      await auditRows(fixture, {
        entityType: "INSTITUTION_SOURCE_BINDING",
        entityId: fixture.institutionId,
      }),
    ).toHaveLength(4);
    expect(await productSignalCounts(fixture)).toEqual(beforeSignals);
  });

  it("exercises the complete Opportunity bind/unbind HTTP matrix with exact replay and Audit envelopes", async () => {
    const fixture = await insertFixture();
    const beforeSignals = await productSignalCounts(fixture);
    const candidateSourceId = await insertSource("opportunity-candidate");
    const bindBody = {
      sourceId: candidateSourceId,
      role: "DETAILS",
      isPrimary: false,
    };
    const createdAt = new Date("2026-08-24T17:00:00.000Z");
    const createdCorrelationId = randomUUID();
    const created = await handleAdminBindOpportunitySourceRequest(
      request(
        `/api/admin/opportunities/${fixture.opportunityId}/source-bindings`,
        bindBody,
      ),
      { opportunityId: fixture.opportunityId },
      pipeline(fixture, createdAt, createdCorrelationId),
    );
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      correlationId: createdCorrelationId,
      data: { created: true, reactivated: false },
    });

    const replay = await handleAdminBindOpportunitySourceRequest(
      request(
        `/api/admin/opportunities/${fixture.opportunityId}/source-bindings`,
        bindBody,
      ),
      { opportunityId: fixture.opportunityId },
      pipeline(fixture, new Date("2026-08-24T17:01:00.000Z"), randomUUID()),
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({
      data: { created: false, reactivated: false },
    });
    expect(
      await auditRows(fixture, {
        entityType: "OPPORTUNITY_SOURCE_BINDING",
        entityId: fixture.opportunityId,
      }),
    ).toHaveLength(1);

    const unboundAt = new Date("2026-08-24T17:02:00.000Z");
    const unboundCorrelationId = randomUUID();
    const unbindPath = {
      opportunityId: fixture.opportunityId,
      sourceId: candidateSourceId,
      role: "DETAILS",
    };
    const unbound = await handleAdminUnbindOpportunitySourceRequest(
      request(
        `/api/admin/opportunities/${fixture.opportunityId}/source-bindings/${candidateSourceId}/DETAILS`,
        {},
        "DELETE",
      ),
      unbindPath,
      pipeline(fixture, unboundAt, unboundCorrelationId),
    );
    expect(unbound.status).toBe(200);
    expect(await unbound.json()).toMatchObject({
      correlationId: unboundCorrelationId,
      data: { changed: true },
    });

    const inactiveReplay = await handleAdminUnbindOpportunitySourceRequest(
      request(
        `/api/admin/opportunities/${fixture.opportunityId}/source-bindings/${candidateSourceId}/DETAILS`,
        {},
        "DELETE",
      ),
      unbindPath,
      pipeline(fixture, new Date("2026-08-24T17:03:00.000Z"), randomUUID()),
    );
    expect(inactiveReplay.status).toBe(200);
    expect(await inactiveReplay.json()).toMatchObject({
      data: { changed: false },
    });
    expect(
      await auditRows(fixture, {
        entityType: "OPPORTUNITY_SOURCE_BINDING",
        entityId: fixture.opportunityId,
      }),
    ).toHaveLength(2);

    const reactivatedAt = new Date("2026-08-24T17:04:00.000Z");
    const reactivatedCorrelationId = randomUUID();
    const reactivated = await handleAdminBindOpportunitySourceRequest(
      request(
        `/api/admin/opportunities/${fixture.opportunityId}/source-bindings`,
        bindBody,
      ),
      { opportunityId: fixture.opportunityId },
      pipeline(fixture, reactivatedAt, reactivatedCorrelationId),
    );
    expect(reactivated.status).toBe(200);
    expect(await reactivated.json()).toMatchObject({
      correlationId: reactivatedCorrelationId,
      data: { created: false, reactivated: true },
    });

    const audits = await auditRows(fixture, {
      entityType: "OPPORTUNITY_SOURCE_BINDING",
      entityId: fixture.opportunityId,
    });
    expect(audits).toHaveLength(3);
    expectExactAudit(audits[0]!, {
      actionType: "WP10B_BIND_OPPORTUNITY_SOURCE",
      entityType: "OPPORTUNITY_SOURCE_BINDING",
      entityId: fixture.opportunityId,
      fixture,
      occurredAt: createdAt,
      correlationId: createdCorrelationId,
      reason: "SOURCE_BINDING_UPDATED",
      metadata: { sourceId: candidateSourceId, outcomeCode: "CREATED" },
    });
    expectExactAudit(audits[1]!, {
      actionType: "WP10B_UNBIND_OPPORTUNITY_SOURCE",
      entityType: "OPPORTUNITY_SOURCE_BINDING",
      entityId: fixture.opportunityId,
      fixture,
      occurredAt: unboundAt,
      correlationId: unboundCorrelationId,
      reason: "SOURCE_BINDING_UPDATED",
      metadata: { sourceId: candidateSourceId, outcomeCode: "DEACTIVATED" },
    });
    expectExactAudit(audits[2]!, {
      actionType: "WP10B_BIND_OPPORTUNITY_SOURCE",
      entityType: "OPPORTUNITY_SOURCE_BINDING",
      entityId: fixture.opportunityId,
      fixture,
      occurredAt: reactivatedAt,
      correlationId: reactivatedCorrelationId,
      reason: "SOURCE_BINDING_UPDATED",
      metadata: { sourceId: candidateSourceId, outcomeCode: "REACTIVATED" },
    });

    const primaryConflict = await handleAdminBindOpportunitySourceRequest(
      request("/api/admin/opportunity-primary-conflict", {
        sourceId: candidateSourceId,
        role: "PRIMARY_NOTICE",
        isPrimary: true,
      }),
      { opportunityId: fixture.opportunityId },
      pipeline(fixture),
    );
    expect(primaryConflict.status).toBe(409);

    const retiredSourceId = await insertSource(
      "opportunity-retired",
      "RETIRED",
    );
    const lifecycleConflict = await handleAdminBindOpportunitySourceRequest(
      request("/api/admin/opportunity-lifecycle-conflict", {
        sourceId: retiredSourceId,
        role: "SUPPORTING",
        isPrimary: false,
      }),
      { opportunityId: fixture.opportunityId },
      pipeline(fixture),
    );
    expect(lifecycleConflict.status).toBe(403);

    const roleMismatch = await handleAdminBindOpportunitySourceRequest(
      request("/api/admin/opportunity-role-mismatch", {
        sourceId: candidateSourceId,
        role: "TUITION",
        isPrimary: false,
      }),
      { opportunityId: fixture.opportunityId },
      pipeline(fixture),
    );
    expect(roleMismatch.status).toBe(400);
    const institutionRoleMismatch =
      await handleAdminBindInstitutionSourceRequest(
        request("/api/admin/institution-role-mismatch", {
          sourceId: candidateSourceId,
          role: "PRIMARY_NOTICE",
          isPrimary: false,
        }),
        { institutionId: fixture.institutionId },
        pipeline(fixture),
      );
    expect(institutionRoleMismatch.status).toBe(400);
    expect(
      await auditRows(fixture, {
        entityType: "OPPORTUNITY_SOURCE_BINDING",
        entityId: fixture.opportunityId,
      }),
    ).toHaveLength(3);
    expect(await productSignalCounts(fixture)).toEqual(beforeSignals);
  });

  it("fully rolls back Source replacement when Audit fails", async () => {
    const fixture = await insertFixture();
    const replacementUrl = `https://official.example.test/${prefix}/rollback-move/${randomUUID()}`;
    const failed = await handleAdminMoveSourceRequest(
      request("/api/admin/move", {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: {
          kind: "CREATE",
          canonicalUrl: replacementUrl,
          sourceName: "Must roll back",
        },
      }),
      { sourceId: fixture.sourceId },
      {
        ...pipeline(fixture),
        markSourceMoved: (context: AdminCommandContext, input: unknown) =>
          markSourceMoved(context, input, {
            transactionManager: runtime.transactionManager,
            persistence: {
              ...defaultSourceCommandPersistence,
              writeAudit: async (input, executor) => {
                if (input.actionType === "WP10B_SOURCE_REPLACED") {
                  throw new Error("forced private final Audit failure");
                }
                return defaultSourceCommandPersistence.writeAudit(
                  input,
                  executor,
                );
              },
            },
          }),
      },
    );
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("forced private");
    const [oldSource] = await runtime.client<
      { canonical_url: string; lifecycle_status: string }[]
    >`
      select canonical_url, lifecycle_status from sources where id=${fixture.sourceId}
    `;
    expect(oldSource).toEqual({
      canonical_url: fixture.canonicalUrl,
      lifecycle_status: "ACTIVE",
    });
    const replacement = await runtime.client`
      select id from sources where canonical_url=${replacementUrl}
    `;
    expect(replacement).toHaveLength(0);
    const replacementConfig = await runtime.client`
      select source_id from source_monitor_configs
      where source_id in (select id from sources where canonical_url=${replacementUrl})
    `;
    expect(replacementConfig).toHaveLength(0);
    const activeInstitutionBindings = await runtime.client<
      { source_id: string }[]
    >`
      select source_id from institution_source_bindings
      where institution_id=${fixture.institutionId} and role='OFFICIAL_MAIN' and is_active
    `;
    const activeOpportunityBindings = await runtime.client<
      { source_id: string }[]
    >`
      select source_id from opportunity_source_bindings
      where opportunity_id=${fixture.opportunityId} and role='PRIMARY_NOTICE'
        and is_active
    `;
    expect(activeInstitutionBindings).toEqual([
      { source_id: fixture.sourceId },
    ]);
    expect(activeOpportunityBindings).toEqual([
      { source_id: fixture.sourceId },
    ]);
    const [oldConfig] = await runtime.client<
      { collection_strategy: string; monitoring_profile: string }[]
    >`
      select collection_strategy, monitoring_profile
      from source_monitor_configs where source_id=${fixture.sourceId}
    `;
    expect(oldConfig).toEqual({
      collection_strategy: "MANUAL",
      monitoring_profile: "MANUAL",
    });
    const [evidence] = await runtime.client<{ source_id: string }[]>`
      select source_id from opportunity_version_evidence
      where opportunity_version_id=${fixture.opportunityVersionId}
    `;
    expect(evidence?.source_id).toBe(fixture.sourceId);
    expect(await auditRows(fixture)).toHaveLength(0);
  });

  it("fully restores a reused Source and its config when only the final replacement Audit fails", async () => {
    const fixture = await insertFixture();
    const replacementSourceId = await insertSource("rollback-reuse");
    await runtime.client`
      update source_monitor_configs
      set collection_strategy='HTTP', monitoring_profile='STANDARD_SEASONAL',
          custom_interval_minutes=2468, max_attempts=9
      where source_id=${replacementSourceId}
    `;
    const beforeSignals = await productSignalCounts(fixture);
    const failed = await handleAdminMoveSourceRequest(
      request("/api/admin/move-reuse", {
        moveMode: "SOURCE_REPLACEMENT",
        replacement: { kind: "REUSE", replacementSourceId },
      }),
      { sourceId: fixture.sourceId },
      {
        ...pipeline(fixture),
        markSourceMoved: (context: AdminCommandContext, input: unknown) =>
          markSourceMoved(context, input, {
            transactionManager: runtime.transactionManager,
            persistence: {
              ...defaultSourceCommandPersistence,
              writeAudit: async (auditInput, executor) => {
                if (auditInput.actionType === "WP10B_SOURCE_REPLACED") {
                  throw new Error("forced private final Audit failure");
                }
                return defaultSourceCommandPersistence.writeAudit(
                  auditInput,
                  executor,
                );
              },
            },
          }),
      },
    );
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("forced private");
    const sources = await runtime.client<
      { id: string; lifecycle_status: string }[]
    >`
      select id, lifecycle_status from sources
      where id in (${fixture.sourceId}, ${replacementSourceId})
    `;
    expect(sources).toEqual(
      expect.arrayContaining([
        { id: fixture.sourceId, lifecycle_status: "ACTIVE" },
        { id: replacementSourceId, lifecycle_status: "ACTIVE" },
      ]),
    );
    const [replacementConfig] = await runtime.client<
      {
        collection_strategy: string;
        monitoring_profile: string;
        custom_interval_minutes: number;
        max_attempts: number;
      }[]
    >`
      select collection_strategy, monitoring_profile,
             custom_interval_minutes, max_attempts
      from source_monitor_configs where source_id=${replacementSourceId}
    `;
    expect(replacementConfig).toEqual({
      collection_strategy: "HTTP",
      monitoring_profile: "STANDARD_SEASONAL",
      custom_interval_minutes: 2468,
      max_attempts: 9,
    });
    const institutionBindings = await runtime.client<
      { source_id: string; is_active: boolean }[]
    >`
      select source_id, is_active from institution_source_bindings
      where institution_id=${fixture.institutionId} and role='OFFICIAL_MAIN'
    `;
    const opportunityBindings = await runtime.client<
      { source_id: string; is_active: boolean }[]
    >`
      select source_id, is_active from opportunity_source_bindings
      where opportunity_id=${fixture.opportunityId} and role='PRIMARY_NOTICE'
    `;
    expect(institutionBindings).toEqual([
      { source_id: fixture.sourceId, is_active: true },
    ]);
    expect(opportunityBindings).toEqual([
      { source_id: fixture.sourceId, is_active: true },
    ]);
    const [evidence] = await runtime.client<{ source_id: string }[]>`
      select source_id from opportunity_version_evidence
      where opportunity_version_id=${fixture.opportunityVersionId}
    `;
    expect(evidence?.source_id).toBe(fixture.sourceId);
    expect(await auditRows(fixture)).toHaveLength(0);
    expect(await productSignalCounts(fixture)).toEqual(beforeSignals);
  });
});
