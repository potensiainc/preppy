import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createAdminCommandContext } from "@/src/application/context";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  bindInstitutionSource,
  bindOpportunitySource,
  confirmNoChange,
  defaultSourceCommandPersistence,
  markSourceMoved,
  markSourceUnavailable,
  recordSourceObservation,
  unbindInstitutionSource,
  unbindOpportunitySource,
} from "@/src/modules/monitoring/source-commands.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp10b-source-${randomUUID()}`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

async function insertAdmin() {
  const id = randomUUID();
  await runtime.client`
    insert into admin_users (
      id, external_auth_subject, email, display_name, status
    ) values (
      ${id}, ${`${prefix}-admin-${id}`}, ${`${prefix}-${id}@example.test`},
      'WP-10B Admin', 'ACTIVE'
    )
  `;
  return id;
}

async function insertSourceFixture() {
  const institutionId = randomUUID();
  const sourceId = randomUUID();
  const opportunityId = randomUUID();
  const opportunityVersionId = randomUUID();
  const verifiedAt = "2026-08-01T01:02:03.000Z";

  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${institutionId}, ${`${prefix}-institution-${institutionId}`},
      'WP-10B Institution', 'ENGLISH_KINDERGARTEN', 'ACTIVE', 'DRAFT'
    )
  `;
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${sourceId}, ${`https://official.example.test/${prefix}/${sourceId}`},
      'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP-10B Source'
    )
  `;
  await runtime.client`
    insert into source_monitor_configs (
      source_id, collection_strategy, monitoring_profile, is_enabled
    ) values (${sourceId}, 'MANUAL', 'MANUAL', true)
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
      ${opportunityId}, ${institutionId}, ${`${prefix}-opportunity-${opportunityId}`},
      'APPLICATION', 'NATIVE', 'DRAFT'
    )
  `;
  await runtime.client`
    insert into opportunity_versions (
      id, opportunity_id, version_number, verification_state, business_state,
      is_current, title, verified_at
    ) values (
      ${opportunityVersionId}, ${opportunityId}, 1, 'VERIFIED', 'OPEN', true,
      'Existing truth', ${verifiedAt}
    )
  `;

  return {
    institutionId,
    sourceId,
    opportunityId,
    opportunityVersionId,
    verifiedAt,
  };
}

async function insertDetachedSource() {
  const sourceId = randomUUID();
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${sourceId}, ${`https://official.example.test/${prefix}/${sourceId}`},
      'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Detached WP-10B Source'
    )
  `;
  await runtime.client`
    insert into source_monitor_configs (
      source_id, collection_strategy, monitoring_profile, is_enabled
    ) values (${sourceId}, 'HTTP', 'STANDARD_SEASONAL', true)
  `;
  return sourceId;
}

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`delete from audit_logs where action_type like 'WP10B_%'`;
    await transaction`
      delete from opportunity_version_evidence
      where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from source_observations
      where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from source_snapshots
      where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from institution_source_bindings
      where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from opportunity_source_bindings
      where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
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
      delete from source_monitor_configs
      where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`delete from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}-%`}`;
    await transaction`delete from admin_users where external_auth_subject like ${`${prefix}-%`}`;
  });
}

describe("WP-10B Source commands", () => {
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

  it("records ConfirmNoChange as Observation and Audit without mutating truth or signals", async () => {
    const adminUserId = await insertAdmin();
    const fixture = await insertSourceFixture();
    const occurredAt = new Date("2026-08-23T04:05:06.000Z");
    const context = createAdminCommandContext({ adminUserId, occurredAt });

    const before = await runtime.client<
      {
        versions: number;
        changes: number;
        outbox: number;
        notifications: number;
        deliveries: number;
      }[]
    >`
      select
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId}) as versions,
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id = ${fixture.opportunityId}) as outbox,
        (select count(*)::int from notifications where opportunity_id = ${fixture.opportunityId}) as notifications,
        (select count(*)::int from notification_deliveries d
          join notifications n on n.id = d.notification_id
          where n.opportunity_id = ${fixture.opportunityId}) as deliveries
    `;

    const result = await confirmNoChange(
      context,
      { sourceId: fixture.sourceId, note: "Official page reviewed." },
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toEqual({
      sourceId: fixture.sourceId,
      observationId: expect.stringMatching(/^[1-9]\d*$/),
      checkedAt: occurredAt.toISOString(),
    });
    const observations = await runtime.client<
      { id: string; outcome: string; observed_at: string }[]
    >`
      select id::text, outcome, observed_at
      from source_observations
      where source_id = ${fixture.sourceId}
    `;
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      id: result.observationId,
      outcome: "UNCHANGED",
    });
    expect(new Date(observations[0]!.observed_at)).toEqual(occurredAt);
    const audits = await runtime.client<
      { entity_id: string; after_data: Record<string, unknown> }[]
    >`
      select entity_id, after_data
      from audit_logs
      where action_type = 'WP10B_CONFIRM_NO_CHANGE'
    `;
    expect(audits).toEqual([
      {
        entity_id: fixture.sourceId,
        after_data: {
          correlationId: context.correlationId,
          metadata: {
            sourceId: fixture.sourceId,
            observationId: result.observationId,
            outcomeCode: "UNCHANGED",
          },
        },
      },
    ]);

    const after = await runtime.client<typeof before>`
      select
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId}) as versions,
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id = ${fixture.opportunityId}) as outbox,
        (select count(*)::int from notifications where opportunity_id = ${fixture.opportunityId}) as notifications,
        (select count(*)::int from notification_deliveries d
          join notifications n on n.id = d.notification_id
          where n.opportunity_id = ${fixture.opportunityId}) as deliveries
    `;
    expect(after).toEqual(before);

    const [currentVersion] = await runtime.client<
      { verified_at: string; verification_state: string; is_current: boolean }[]
    >`
      select verified_at, verification_state, is_current
      from opportunity_versions where id = ${fixture.opportunityVersionId}
    `;
    expect(currentVersion).toMatchObject({
      verification_state: "VERIFIED",
      is_current: true,
    });
    expect(new Date(currentVersion!.verified_at)).toEqual(
      new Date(fixture.verifiedAt),
    );
  });

  it("records Source unavailability as operational evidence without changing product truth", async () => {
    const adminUserId = await insertAdmin();
    const fixture = await insertSourceFixture();
    const occurredAt = new Date("2026-08-23T05:06:07.000Z");
    const context = createAdminCommandContext({
      adminUserId,
      occurredAt,
      reason: "SOURCE_CHECK_FAILED",
    });

    const result = await markSourceUnavailable(
      context,
      {
        sourceId: fixture.sourceId,
        outcome: "TIMEOUT",
        errorCode: "UPSTREAM_TIMEOUT",
        durationMs: 30_000,
        pauseSource: true,
      },
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toEqual({
      sourceId: fixture.sourceId,
      observationId: expect.stringMatching(/^[1-9]\d*$/),
      checkedAt: occurredAt.toISOString(),
      lifecycleStatus: "PAUSED",
    });
    const [source] = await runtime.client<
      { lifecycle_status: string }[]
    >`select lifecycle_status from sources where id = ${fixture.sourceId}`;
    expect(source?.lifecycle_status).toBe("PAUSED");

    const [observation] = await runtime.client<
      { outcome: string; error_code: string; duration_ms: number }[]
    >`
      select outcome, error_code, duration_ms
      from source_observations where id = ${result.observationId}
    `;
    expect(observation).toEqual({
      outcome: "TIMEOUT",
      error_code: "UPSTREAM_TIMEOUT",
      duration_ms: 30_000,
    });
    const [audit] = await runtime.client<
      { after_data: Record<string, unknown> }[]
    >`
      select after_data from audit_logs
      where action_type = 'WP10B_MARK_SOURCE_UNAVAILABLE'
    `;
    expect(audit?.after_data).toEqual({
      correlationId: context.correlationId,
      reason: "SOURCE_CHECK_FAILED",
      metadata: {
        sourceId: fixture.sourceId,
        observationId: result.observationId,
        outcomeCode: "TIMEOUT",
      },
    });

    const [effects] = await runtime.client<
      {
        versions: number;
        changes: number;
        outbox: number;
        notifications: number;
      }[]
    >`
      select
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId}) as versions,
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id = ${fixture.opportunityId}) as outbox,
        (select count(*)::int from notifications where opportunity_id = ${fixture.opportunityId}) as notifications
    `;
    expect(effects).toEqual({
      versions: 1,
      changes: 0,
      outbox: 0,
      notifications: 0,
    });
  });

  it("records a changed Source check with same-Source Snapshot provenance only", async () => {
    const adminUserId = await insertAdmin();
    const fixture = await insertSourceFixture();
    const snapshotId = randomUUID();
    const occurredAt = new Date("2026-08-23T06:07:08.000Z");
    const context = createAdminCommandContext({ adminUserId, occurredAt });
    await runtime.client`
      insert into source_snapshots (
        id, source_id, captured_at, content_hash, text_hash, mime_type
      ) values (
        ${snapshotId}, ${fixture.sourceId}, ${occurredAt.toISOString()},
        'content-hash-v2', 'text-hash-v2', 'text/html'
      )
    `;

    const result = await recordSourceObservation(
      context,
      {
        sourceId: fixture.sourceId,
        outcome: "CHANGED",
        snapshotId,
        contentHash: "content-hash-v2",
        textHash: "text-hash-v2",
        httpStatus: 200,
      },
      { transactionManager: runtime.transactionManager },
    );

    const [observation] = await runtime.client<
      {
        outcome: string;
        snapshot_id: string;
        content_hash: string;
        text_hash: string;
      }[]
    >`
      select outcome, snapshot_id, content_hash, text_hash
      from source_observations where id = ${result.observationId}
    `;
    expect(observation).toEqual({
      outcome: "CHANGED",
      snapshot_id: snapshotId,
      content_hash: "content-hash-v2",
      text_hash: "text-hash-v2",
    });
    const [counts] = await runtime.client<
      { versions: number; changes: number; outbox: number }[]
    >`
      select
        (select count(*)::int from opportunity_versions where opportunity_id = ${fixture.opportunityId}) as versions,
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id = ${fixture.opportunityId}) as outbox
    `;
    expect(counts).toEqual({ versions: 1, changes: 0, outbox: 0 });
  });

  it("rolls back the Observation when same-transaction Audit persistence fails", async () => {
    const adminUserId = await insertAdmin();
    const fixture = await insertSourceFixture();
    const context = createAdminCommandContext({
      adminUserId,
      occurredAt: new Date("2026-08-23T07:08:09.000Z"),
    });

    await expect(
      confirmNoChange(
        context,
        { sourceId: fixture.sourceId },
        {
          transactionManager: runtime.transactionManager,
          persistence: {
            ...defaultSourceCommandPersistence,
            writeAudit: async () => {
              throw new Error("forced audit failure");
            },
          },
        },
      ),
    ).rejects.toThrow("forced audit failure");

    const [counts] = await runtime.client<
      { observations: number; audits: number }[]
    >`
      select
        (select count(*)::int from source_observations where source_id = ${fixture.sourceId}) as observations,
        (select count(*)::int from audit_logs where entity_id = ${fixture.sourceId}) as audits
    `;
    expect(counts).toEqual({ observations: 0, audits: 0 });
  });

  it("binds, unbinds, and reactivates canonical Source bindings without product signals", async () => {
    const adminUserId = await insertAdmin();
    const fixture = await insertSourceFixture();
    const sourceId = await insertDetachedSource();
    const occurredAt = new Date("2026-08-23T08:09:10.000Z");
    const context = createAdminCommandContext({
      adminUserId,
      occurredAt,
      reason: "SOURCE_BINDING_CHANGED",
    });

    const institutionBind = await bindInstitutionSource(
      context,
      {
        institutionId: fixture.institutionId,
        sourceId,
        role: "ADMISSIONS",
        isPrimary: false,
      },
      { transactionManager: runtime.transactionManager },
    );
    expect(institutionBind).toMatchObject({
      targetType: "INSTITUTION",
      targetId: fixture.institutionId,
      sourceId,
      role: "ADMISSIONS",
      state: "ACTIVE",
      created: true,
      reactivated: false,
    });
    const duplicate = await bindInstitutionSource(
      context,
      {
        institutionId: fixture.institutionId,
        sourceId,
        role: "ADMISSIONS",
        isPrimary: false,
      },
      { transactionManager: runtime.transactionManager },
    );
    expect(duplicate).toMatchObject({ created: false, reactivated: false });

    const opportunityBind = await bindOpportunitySource(
      context,
      {
        opportunityId: fixture.opportunityId,
        sourceId,
        role: "PRIMARY_NOTICE",
        isPrimary: true,
      },
      { transactionManager: runtime.transactionManager },
    );
    expect(opportunityBind).toMatchObject({
      targetType: "OPPORTUNITY",
      targetId: fixture.opportunityId,
      state: "ACTIVE",
      created: true,
    });

    const institutionUnbind = await unbindInstitutionSource(
      context,
      { institutionId: fixture.institutionId, sourceId, role: "ADMISSIONS" },
      { transactionManager: runtime.transactionManager },
    );
    expect(institutionUnbind).toMatchObject({
      state: "INACTIVE",
      changed: true,
    });
    const duplicateUnbind = await unbindInstitutionSource(
      context,
      { institutionId: fixture.institutionId, sourceId, role: "ADMISSIONS" },
      { transactionManager: runtime.transactionManager },
    );
    expect(duplicateUnbind).toMatchObject({
      state: "INACTIVE",
      changed: false,
    });
    const reactivated = await bindInstitutionSource(
      context,
      {
        institutionId: fixture.institutionId,
        sourceId,
        role: "ADMISSIONS",
        isPrimary: false,
      },
      { transactionManager: runtime.transactionManager },
    );
    expect(reactivated).toMatchObject({
      state: "ACTIVE",
      created: false,
      reactivated: true,
    });

    const opportunityUnbind = await unbindOpportunitySource(
      context,
      {
        opportunityId: fixture.opportunityId,
        sourceId,
        role: "PRIMARY_NOTICE",
      },
      { transactionManager: runtime.transactionManager },
    );
    expect(opportunityUnbind).toMatchObject({
      state: "INACTIVE",
      changed: true,
    });

    const [effects] = await runtime.client<
      { changes: number; outbox: number; notifications: number }[]
    >`
      select
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id = ${fixture.opportunityId}) as outbox,
        (select count(*)::int from notifications where opportunity_id = ${fixture.opportunityId}) as notifications
    `;
    expect(effects).toEqual({ changes: 0, outbox: 0, notifications: 0 });

    const [institutionRow] = await runtime.client<
      { is_active: boolean; unbound_at: string | null }[]
    >`
      select is_active, unbound_at from institution_source_bindings
      where institution_id = ${fixture.institutionId}
        and source_id = ${sourceId} and role = 'ADMISSIONS'
    `;
    expect(institutionRow).toEqual({ is_active: true, unbound_at: null });
    const [opportunityRow] = await runtime.client<
      { is_active: boolean; unbound_at: string | null }[]
    >`
      select is_active, unbound_at from opportunity_source_bindings
      where opportunity_id = ${fixture.opportunityId}
        and source_id = ${sourceId} and role = 'PRIMARY_NOTICE'
    `;
    expect(opportunityRow?.is_active).toBe(false);
    expect(new Date(opportunityRow!.unbound_at!)).toEqual(occurredAt);
  });

  it("corrects a Source URL only with explicit provenance continuity and preserves identity", async () => {
    const adminUserId = await insertAdmin();
    const fixture = await insertSourceFixture();
    const occurredAt = new Date("2026-08-23T09:10:11.000Z");
    const newUrl = `https://official.example.test/${prefix}/admissions-corrected`;
    const context = createAdminCommandContext({
      adminUserId,
      occurredAt,
      reason: "PROVENANCE_CONTINUITY_CONFIRMED",
    });
    await runtime.client`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, evidence_role
      ) values (${fixture.opportunityVersionId}, ${fixture.sourceId}, 'PRIMARY')
    `;

    const result = await markSourceMoved(
      context,
      {
        sourceId: fixture.sourceId,
        moveMode: "URL_CORRECTION",
        newUrl,
        provenanceContinuityConfirmed: true,
      },
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toEqual({
      moveMode: "URL_CORRECTION",
      oldSourceId: fixture.sourceId,
      newSourceId: fixture.sourceId,
      canonicalUrl: newUrl,
      transferredInstitutionBindings: 0,
      transferredOpportunityBindings: 0,
    });
    const [source] = await runtime.client<
      { id: string; canonical_url: string; lifecycle_status: string }[]
    >`select id, canonical_url, lifecycle_status from sources where id = ${fixture.sourceId}`;
    expect(source).toEqual({
      id: fixture.sourceId,
      canonical_url: newUrl,
      lifecycle_status: "ACTIVE",
    });
    const [evidence] = await runtime.client<{ source_id: string }[]>`
      select source_id from opportunity_version_evidence
      where opportunity_version_id = ${fixture.opportunityVersionId}
    `;
    expect(evidence?.source_id).toBe(fixture.sourceId);
    const [binding] = await runtime.client<
      { source_id: string; is_active: boolean }[]
    >`
      select source_id, is_active from institution_source_bindings
      where institution_id = ${fixture.institutionId} and role = 'OFFICIAL_MAIN'
    `;
    expect(binding).toEqual({ source_id: fixture.sourceId, is_active: true });
    const [signals] = await runtime.client<
      { changes: number; outbox: number; notifications: number }[]
    >`
      select
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id = ${fixture.opportunityId}) as outbox,
        (select count(*)::int from notifications where opportunity_id = ${fixture.opportunityId}) as notifications
    `;
    expect(signals).toEqual({ changes: 0, outbox: 0, notifications: 0 });
  });

  it("replaces Source identity atomically while preserving historical Evidence", async () => {
    const adminUserId = await insertAdmin();
    const fixture = await insertSourceFixture();
    const occurredAt = new Date("2026-08-23T10:11:12.000Z");
    const replacementUrl = `https://official.example.test/${prefix}/replacement`;
    const context = createAdminCommandContext({
      adminUserId,
      occurredAt,
      reason: "SOURCE_PROVENANCE_REPLACED",
    });
    await runtime.client`
      insert into opportunity_source_bindings (
        opportunity_id, source_id, role, is_primary, is_active
      ) values (
        ${fixture.opportunityId}, ${fixture.sourceId}, 'PRIMARY_NOTICE', true, true
      )
    `;
    await runtime.client`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, evidence_role
      ) values (${fixture.opportunityVersionId}, ${fixture.sourceId}, 'PRIMARY')
    `;

    const result = await markSourceMoved(
      context,
      {
        sourceId: fixture.sourceId,
        moveMode: "SOURCE_REPLACEMENT",
        replacement: {
          kind: "CREATE",
          canonicalUrl: replacementUrl,
          sourceName: "Replacement Official Source",
        },
      },
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toMatchObject({
      moveMode: "SOURCE_REPLACEMENT",
      oldSourceId: fixture.sourceId,
      newSourceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      canonicalUrl: replacementUrl,
      transferredInstitutionBindings: 1,
      transferredOpportunityBindings: 1,
    });
    expect(result.newSourceId).not.toBe(fixture.sourceId);
    const sourceRows = await runtime.client<
      { id: string; lifecycle_status: string; canonical_url: string }[]
    >`
      select id, lifecycle_status, canonical_url from sources
      where id in (${fixture.sourceId}, ${result.newSourceId}) order by id
    `;
    expect(sourceRows).toEqual(
      expect.arrayContaining([
        {
          id: fixture.sourceId,
          lifecycle_status: "RETIRED",
          canonical_url: expect.stringContaining(fixture.sourceId),
        },
        {
          id: result.newSourceId,
          lifecycle_status: "ACTIVE",
          canonical_url: replacementUrl,
        },
      ]),
    );
    const institutionBindings = await runtime.client<
      { source_id: string; is_active: boolean; unbound_at: string | null }[]
    >`
      select source_id, is_active, unbound_at
      from institution_source_bindings
      where institution_id = ${fixture.institutionId} and role = 'OFFICIAL_MAIN'
      order by source_id
    `;
    expect(institutionBindings).toHaveLength(2);
    expect(institutionBindings).toEqual(
      expect.arrayContaining([
        {
          source_id: fixture.sourceId,
          is_active: false,
          unbound_at: expect.any(String),
        },
        {
          source_id: result.newSourceId,
          is_active: true,
          unbound_at: null,
        },
      ]),
    );
    const opportunityBindings = await runtime.client<
      { source_id: string; is_active: boolean }[]
    >`
      select source_id, is_active from opportunity_source_bindings
      where opportunity_id = ${fixture.opportunityId} and role = 'PRIMARY_NOTICE'
      order by source_id
    `;
    expect(opportunityBindings).toEqual(
      expect.arrayContaining([
        { source_id: fixture.sourceId, is_active: false },
        { source_id: result.newSourceId, is_active: true },
      ]),
    );
    const [evidence] = await runtime.client<{ source_id: string }[]>`
      select source_id from opportunity_version_evidence
      where opportunity_version_id = ${fixture.opportunityVersionId}
    `;
    expect(evidence?.source_id).toBe(fixture.sourceId);
    const [monitorConfig] = await runtime.client<
      { collection_strategy: string; monitoring_profile: string }[]
    >`
      select collection_strategy, monitoring_profile
      from source_monitor_configs where source_id = ${result.newSourceId}
    `;
    expect(monitorConfig).toEqual({
      collection_strategy: "MANUAL",
      monitoring_profile: "MANUAL",
    });
    const [signals] = await runtime.client<
      { changes: number; outbox: number; notifications: number }[]
    >`
      select
        (select count(*)::int from opportunity_changes where opportunity_id = ${fixture.opportunityId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id = ${fixture.opportunityId}) as outbox,
        (select count(*)::int from notifications where opportunity_id = ${fixture.opportunityId}) as notifications
    `;
    expect(signals).toEqual({ changes: 0, outbox: 0, notifications: 0 });
  });

  it("reuses an explicit active replacement Source without cloning or overwriting its config", async () => {
    const adminUserId = await insertAdmin();
    const fixture = await insertSourceFixture();
    const replacementSourceId = await insertDetachedSource();
    const occurredAt = new Date("2026-08-23T10:12:13.000Z");
    await runtime.client`
      update source_monitor_configs set custom_interval_minutes=4321,
        max_attempts=7 where source_id=${replacementSourceId}
    `;

    const result = await markSourceMoved(
      createAdminCommandContext({
        adminUserId,
        occurredAt,
        reason: "SOURCE_PROVENANCE_REPLACED",
      }),
      {
        sourceId: fixture.sourceId,
        moveMode: "SOURCE_REPLACEMENT",
        replacement: { kind: "REUSE", replacementSourceId },
      },
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toMatchObject({
      oldSourceId: fixture.sourceId,
      newSourceId: replacementSourceId,
      transferredInstitutionBindings: 1,
      transferredOpportunityBindings: 0,
    });
    const [config] = await runtime.client<
      {
        collection_strategy: string;
        custom_interval_minutes: number;
        max_attempts: number;
      }[]
    >`
      select collection_strategy, custom_interval_minutes, max_attempts
      from source_monitor_configs where source_id=${replacementSourceId}
    `;
    expect(config).toEqual({
      collection_strategy: "HTTP",
      custom_interval_minutes: 4321,
      max_attempts: 7,
    });
    const bindings = await runtime.client<
      { source_id: string; is_active: boolean }[]
    >`
      select source_id, is_active from institution_source_bindings
      where institution_id=${fixture.institutionId} and role='OFFICIAL_MAIN'
      order by source_id
    `;
    expect(bindings).toEqual(
      expect.arrayContaining([
        { source_id: fixture.sourceId, is_active: false },
        { source_id: replacementSourceId, is_active: true },
      ]),
    );
  });

  it("rejects REUSE when Source type or authority is incompatible", async () => {
    const adminUserId = await insertAdmin();
    const fixture = await insertSourceFixture();
    const replacementSourceId = await insertDetachedSource();
    await runtime.client`
      update sources set authority_level='DISCOVERY_ONLY'
      where id=${replacementSourceId}
    `;

    await expect(
      markSourceMoved(
        createAdminCommandContext({
          adminUserId,
          reason: "SOURCE_PROVENANCE_REPLACED",
        }),
        {
          sourceId: fixture.sourceId,
          moveMode: "SOURCE_REPLACEMENT",
          replacement: { kind: "REUSE", replacementSourceId },
        },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const [state] = await runtime.client<
      {
        lifecycle_status: string;
        active_old_bindings: number;
        active_new_bindings: number;
      }[]
    >`
      select
        (select lifecycle_status from sources where id=${fixture.sourceId}) as lifecycle_status,
        (select count(*)::int from institution_source_bindings where institution_id=${fixture.institutionId} and source_id=${fixture.sourceId} and is_active) as active_old_bindings,
        (select count(*)::int from institution_source_bindings where institution_id=${fixture.institutionId} and source_id=${replacementSourceId} and is_active) as active_new_bindings
    `;
    expect(state).toEqual({
      lifecycle_status: "ACTIVE",
      active_old_bindings: 1,
      active_new_bindings: 0,
    });
  });

  it("fully rolls back replacement Source creation and binding transfer when final Audit fails", async () => {
    const adminUserId = await insertAdmin();
    const fixture = await insertSourceFixture();
    const replacementUrl = `https://official.example.test/${prefix}/rollback-replacement`;

    await expect(
      markSourceMoved(
        createAdminCommandContext({
          adminUserId,
          reason: "SOURCE_PROVENANCE_REPLACED",
        }),
        {
          sourceId: fixture.sourceId,
          moveMode: "SOURCE_REPLACEMENT",
          replacement: {
            kind: "CREATE",
            canonicalUrl: replacementUrl,
            sourceName: "Rolled Back Replacement",
          },
        },
        {
          transactionManager: runtime.transactionManager,
          persistence: {
            ...defaultSourceCommandPersistence,
            writeAudit: async (entry, executor) => {
              if (entry.actionType === "WP10B_SOURCE_REPLACED") {
                throw new Error("forced replacement Audit failure");
              }
              return defaultSourceCommandPersistence.writeAudit(
                entry,
                executor,
              );
            },
          },
        },
      ),
    ).rejects.toThrow("forced replacement Audit failure");

    const [state] = await runtime.client<
      {
        old_lifecycle: string;
        old_active_bindings: number;
        replacement_sources: number;
        replacement_configs: number;
        audits: number;
      }[]
    >`
      select
        (select lifecycle_status from sources where id=${fixture.sourceId}) as old_lifecycle,
        (select count(*)::int from institution_source_bindings where institution_id=${fixture.institutionId} and source_id=${fixture.sourceId} and is_active) as old_active_bindings,
        (select count(*)::int from sources where canonical_url=${replacementUrl}) as replacement_sources,
        (select count(*)::int from source_monitor_configs where source_id in (select id from sources where canonical_url=${replacementUrl})) as replacement_configs,
        (select count(*)::int from audit_logs where admin_user_id=${adminUserId} and action_type like 'WP10B_%') as audits
    `;
    expect(state).toEqual({
      old_lifecycle: "ACTIVE",
      old_active_bindings: 1,
      replacement_sources: 0,
      replacement_configs: 0,
      audits: 0,
    });
  });
});
