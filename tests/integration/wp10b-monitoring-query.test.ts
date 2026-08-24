import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { getMonitoringQueue } from "@/src/modules/monitoring/queue-query.server";
import { listLatestSourceObservations } from "@/src/modules/monitoring/repository.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp10b-monitoring-query-${randomUUID()}`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

async function insertInstitution() {
  const id = randomUUID();
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${id}, ${`${prefix}-institution-${id}`}, 'Native English Kindergarten',
      'ENGLISH_KINDERGARTEN', 'ACTIVE', 'PUBLISHED'
    )
  `;
  return id;
}

async function insertSource(profile: string) {
  const id = randomUUID();
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${id}, ${`https://official.example.test/${prefix}/${id}`},
      'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP-10B Source'
    )
  `;
  await runtime.client`
    insert into source_monitor_configs (
      source_id, collection_strategy, monitoring_profile, is_enabled
    ) values (${id}, 'HTTP', ${profile}, true)
  `;
  return id;
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
      delete from opportunity_source_bindings
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
      delete from opportunity_versions
      where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}-%`}
      )
    `;
    await transaction`delete from opportunities where slug like ${`${prefix}-%`}`;
    await transaction`delete from source_monitor_configs where source_id in (
      select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
    )`;
    await transaction`delete from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}-%`}`;
  });
}

describe("WP-10B query-driven Monitoring Queue", () => {
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

  it("projects only active canonical bindings and has no read side effects", async () => {
    const institutionId = await insertInstitution();
    const institutionSourceId = await insertSource("LOW_CHANGE");
    const opportunitySourceId = await insertSource("CRITICAL_SEASONAL");
    const evidenceOnlySourceId = await insertSource("LOW_CHANGE");
    const inactiveSourceId = await insertSource("LOW_CHANGE");
    const opportunityId = randomUUID();
    const versionId = randomUUID();
    const observedAt = new Date("2026-08-22T00:00:00.000Z");

    await runtime.client`
      insert into institution_source_bindings (
        institution_id, source_id, role, is_primary, is_active, unbound_at
      ) values (
        ${institutionId}, ${institutionSourceId}, 'OFFICIAL_MAIN', true, true, null
      ), (
        ${institutionId}, ${inactiveSourceId}, 'OTHER', false, false,
        '2026-08-20T00:00:00.000Z'
      )
    `;
    await runtime.client`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state,
        published_at
      ) values (
        ${opportunityId}, ${institutionId}, ${`${prefix}-opportunity-${opportunityId}`},
        'APPLICATION', 'NATIVE', 'DRAFT', null
      )
    `;
    await runtime.client`
      insert into opportunity_versions (
        id, opportunity_id, version_number, verification_state,
        business_state, is_current, title, verified_at,
        application_close_at
      ) values (
        ${versionId}, ${opportunityId}, 1, 'VERIFIED', 'OPEN', true,
        '2027 Admissions', '2026-08-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z'
      )
    `;
    await runtime.client`
      insert into opportunity_source_bindings (
        opportunity_id, source_id, role, is_primary, is_active
      ) values (
        ${opportunityId}, ${opportunitySourceId}, 'PRIMARY_NOTICE', true, true
      )
    `;
    await runtime.client`
      insert into opportunity_version_evidence (
        opportunity_version_id, source_id, evidence_role
      ) values (${versionId}, ${evidenceOnlySourceId}, 'SUPPORTING')
    `;
    await runtime.client`
      update opportunities
      set publication_state = 'PUBLISHED',
          published_at = '2026-08-01T00:00:00.000Z'
      where id = ${opportunityId}
    `;
    await runtime.client`
      insert into source_observations (source_id, observed_at, outcome)
      values (${opportunitySourceId}, ${observedAt.toISOString()}, 'UNCHANGED')
    `;

    const before = await runtime.client<
      { observations: number; audits: number; outbox: number }[]
    >`
      select
        (select count(*)::int from source_observations where source_id in (
          ${institutionSourceId}, ${opportunitySourceId}, ${evidenceOnlySourceId}, ${inactiveSourceId}
        )) as observations,
        (select count(*)::int from audit_logs where action_type like 'WP10B_%') as audits,
        (select count(*)::int from outbox_events where event_type = 'OPPORTUNITY_CHANGE_PUBLISHED') as outbox
    `;

    const rows = await getMonitoringQueue(
      {},
      { executor: runtime.executor, now: new Date("2026-08-23T00:00:00.000Z") },
    );
    const ours = rows.filter((row) => row.institution.id === institutionId);

    expect(ours).toHaveLength(2);
    expect(ours.map((row) => row.source.id)).toEqual([
      opportunitySourceId,
      institutionSourceId,
    ]);
    expect(ours[0]).toMatchObject({
      targetType: "OPPORTUNITY",
      targetId: opportunityId,
      priority: "P0_ACTIVE",
      dueState: "DUE",
      lastCheckedAt: observedAt.toISOString(),
      currentTruthSummary: {
        kind: "OPPORTUNITY",
        businessState: "OPEN",
        title: "2027 Admissions",
      },
    });
    expect(ours[1]).toMatchObject({
      bindingId: `INSTITUTION:${institutionId}:${institutionSourceId}:OFFICIAL_MAIN`,
      targetType: "INSTITUTION",
      targetId: institutionId,
      priority: "P0_ACTIVE",
      dueState: "DUE",
      lastCheckedAt: null,
      currentTruthSummary: {
        kind: "INSTITUTION",
        operationalState: "ACTIVE",
        publicationState: "PUBLISHED",
      },
    });

    const after = await runtime.client<
      { observations: number; audits: number; outbox: number }[]
    >`
      select
        (select count(*)::int from source_observations where source_id in (
          ${institutionSourceId}, ${opportunitySourceId}, ${evidenceOnlySourceId}, ${inactiveSourceId}
        )) as observations,
        (select count(*)::int from audit_logs where action_type like 'WP10B_%') as audits,
        (select count(*)::int from outbox_events where event_type = 'OPPORTUNITY_CHANGE_PUBLISHED') as outbox
    `;
    expect(after).toEqual(before);
  });

  it("ignores past opportunity dates when selecting Institution P1 priority", async () => {
    const institutionId = await insertInstitution();
    const sourceId = await insertSource("STANDARD_SEASONAL");
    await runtime.client`
      insert into institution_source_bindings (
        institution_id, source_id, role, is_primary, is_active
      ) values (${institutionId}, ${sourceId}, 'OFFICIAL_MAIN', true, true)
    `;
    for (const [businessState, applicationOpenAt] of [
      ["CLOSED", "2026-01-01T00:00:00.000Z"],
      ["UPCOMING", "2026-09-01T00:00:00.000Z"],
    ] as const) {
      const opportunityId = randomUUID();
      const versionId = randomUUID();
      await runtime.client.begin(async (transaction) => {
        await transaction`
          insert into opportunities (
            id, institution_id, slug, kind, truth_mode, publication_state
          ) values (
            ${opportunityId}, ${institutionId}, ${`${prefix}-opportunity-${opportunityId}`},
            'APPLICATION', 'NATIVE', 'DRAFT'
          )
        `;
        await transaction`
          insert into opportunity_versions (
            id, opportunity_id, version_number, verification_state,
            business_state, is_current, title, application_open_at, verified_at
          ) values (
            ${versionId}, ${opportunityId}, 1, 'VERIFIED', ${businessState}, true,
            ${`${businessState} Admissions`}, ${applicationOpenAt},
            '2026-08-01T00:00:00.000Z'
          )
        `;
        await transaction`
          insert into opportunity_version_evidence (
            opportunity_version_id, source_id, evidence_role
          ) values (${versionId}, ${sourceId}, 'PRIMARY')
        `;
        await transaction`
          update opportunities set publication_state='PUBLISHED',
            published_at='2026-08-01T00:00:00.000Z' where id=${opportunityId}
        `;
      });
    }

    const rows = await getMonitoringQueue(
      { targetType: ["INSTITUTION"] },
      { executor: runtime.executor, now: new Date("2026-08-23T00:00:00.000Z") },
    );
    const row = rows.find(
      (candidate) =>
        candidate.targetId === institutionId &&
        candidate.source.id === sourceId,
    );
    expect(row).toMatchObject({ priority: "P1_UPCOMING", dueState: "DUE" });
  });

  it("returns the highest same-time observation ID with runtime schema types", async () => {
    // Mutation caught: raw PostgreSQL int8 leaks as a string or latest-observation tie-breaking stops using descending ID.
    const sourceId = await insertSource("LOW_CHANGE");
    const observedAt = "2026-08-23T00:00:00.000Z";
    await runtime.client`
      insert into source_observations (source_id, observed_at, outcome)
      values (${sourceId}, ${observedAt}, 'UNCHANGED'),
        (${sourceId}, ${observedAt}, 'CHANGED')
    `;

    const rows = await listLatestSourceObservations(runtime.executor, [
      sourceId,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sourceId,
      outcome: "CHANGED",
    });
    expect(typeof rows[0]!.id).toBe("bigint");
    expect(rows[0]!.observedAt).toBeInstanceOf(Date);
  });
});
