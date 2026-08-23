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
  defaultVerifyInstitutionFactPersistence,
  verifyInstitutionFact,
} from "@/src/modules/monitoring/verify-institution-fact.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp10b-fact-${randomUUID()}`;
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 8,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });

type FactFixture = {
  adminUserId: string;
  institutionId: string;
  sourceId: string;
  factId: string | null;
  versionId: string | null;
};

async function createFixture(existing: boolean): Promise<FactFixture> {
  const adminUserId = randomUUID();
  const institutionId = randomUUID();
  const sourceId = randomUUID();
  const factId = existing ? randomUUID() : null;
  const versionId = existing ? randomUUID() : null;

  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into admin_users (
        id, external_auth_subject, email, display_name, status
      ) values (
        ${adminUserId}, ${`${prefix}-admin-${adminUserId}`},
        ${`${prefix}-${adminUserId}@example.test`}, 'WP-10B Fact Verifier', 'ACTIVE'
      )
    `;
    await transaction`
      insert into institutions (
        id, slug, display_name, category, operational_state, publication_state
      ) values (
        ${institutionId}, ${`${prefix}-institution-${institutionId}`},
        'WP-10B Fact Institution', 'ENGLISH_KINDERGARTEN', 'ACTIVE', 'PUBLISHED'
      )
    `;
    await transaction`
      insert into sources (
        id, canonical_url, source_type, authority_level, lifecycle_status,
        source_name
      ) values (
        ${sourceId}, ${`https://official.example.test/${prefix}/${sourceId}`},
        'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'WP-10B Fact Source'
      )
    `;
    await transaction`
      insert into institution_source_bindings (
        institution_id, source_id, role, is_primary, is_active
      ) values (${institutionId}, ${sourceId}, 'TUITION', true, true)
    `;
    if (factId && versionId) {
      await transaction`
        insert into institution_facts (id, institution_id, fact_type)
        values (${factId}, ${institutionId}, 'TUITION')
      `;
      await transaction`
        insert into institution_fact_versions (
          id, institution_fact_id, version_number, verification_state,
          is_current, value_json, display_text, verified_at,
          verified_by_admin_id
        ) values (
          ${versionId}, ${factId}, 1, 'VERIFIED', true,
          ${JSON.stringify({ amount: 1000000, currency: "KRW" })}::jsonb,
          'KRW 1,000,000', '2026-08-01T00:00:00.000Z', ${adminUserId}
        )
      `;
      await transaction`
        insert into institution_fact_version_evidence (
          institution_fact_version_id, source_id, evidence_role
        ) values (${versionId}, ${sourceId}, 'PRIMARY')
      `;
    }
  });

  return { adminUserId, institutionId, sourceId, factId, versionId };
}

function input(
  fixture: FactFixture,
  amount: number,
  expectedCurrentVersionId = fixture.versionId,
) {
  return {
    institutionId: fixture.institutionId,
    factType: "TUITION",
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

async function cleanup() {
  await runtime.client.begin(async (transaction) => {
    await transaction`
      delete from institution_fact_version_evidence where institution_fact_version_id in (
        select version.id from institution_fact_versions version
        join institution_facts fact on fact.id = version.institution_fact_id
        join institutions institution on institution.id = fact.institution_id
        where institution.slug like ${`${prefix}-%`}
      )
    `;
    await transaction`
      delete from institution_fact_versions where institution_fact_id in (
        select fact.id from institution_facts fact
        join institutions institution on institution.id = fact.institution_id
        where institution.slug like ${`${prefix}-%`}
      )
    `;
    await transaction`
      delete from institution_facts where institution_id in (
        select id from institutions where slug like ${`${prefix}-%`}
      )
    `;
    await transaction`
      delete from source_observations where source_id in (
        select id from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}
      )
    `;
    await transaction`
      delete from institution_source_bindings where institution_id in (
        select id from institutions where slug like ${`${prefix}-%`}
      )
    `;
    await transaction`
      delete from audit_logs where entity_id in (
        select id from institutions where slug like ${`${prefix}-%`}
      )
    `;
    await transaction`delete from sources where canonical_url like ${`https://official.example.test/${prefix}/%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}-%`}`;
    await transaction`delete from admin_users where external_auth_subject like ${`${prefix}-%`}`;
  });
}

describe("WP-10B Institution Fact verification", () => {
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

  it("creates missing logical Fact as verified v1 with Evidence and no product signal", async () => {
    const fixture = await createFixture(false);
    const occurredAt = new Date("2026-08-23T17:18:19.000Z");
    const result = await verifyInstitutionFact(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt,
      }),
      input(fixture, 1200000, null),
      { transactionManager: runtime.transactionManager },
    );

    expect(result).toMatchObject({
      institutionId: fixture.institutionId,
      factType: "TUITION",
      outcome: "CREATED",
      previousVersionId: null,
      currentVersionId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      evidenceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      verifiedAt: occurredAt.toISOString(),
    });
    const [counts] = await runtime.client<
      {
        facts: number;
        versions: number;
        current_versions: number;
        evidence: number;
        changes: number;
        outbox: number;
        notifications: number;
        deliveries: number;
      }[]
    >`
      select
        (select count(*)::int from institution_facts where institution_id = ${fixture.institutionId}) as facts,
        (select count(*)::int from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id where f.institution_id=${fixture.institutionId}) as versions,
        (select count(*)::int from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id where f.institution_id=${fixture.institutionId} and v.is_current) as current_versions,
        (select count(*)::int from institution_fact_version_evidence e join institution_fact_versions v on v.id=e.institution_fact_version_id join institution_facts f on f.id=v.institution_fact_id where f.institution_id=${fixture.institutionId}) as evidence,
        (select count(*)::int from opportunity_changes c join opportunities o on o.id=c.opportunity_id where o.institution_id=${fixture.institutionId}) as changes,
        (select count(*)::int from outbox_events where aggregate_id=${fixture.institutionId}) as outbox,
        (select count(*)::int from notifications n join opportunities o on o.id=n.opportunity_id where o.institution_id=${fixture.institutionId}) as notifications,
        (select count(*)::int from notification_deliveries d join notifications n on n.id=d.notification_id join opportunities o on o.id=n.opportunity_id where o.institution_id=${fixture.institutionId}) as deliveries
    `;
    expect(counts).toEqual({
      facts: 1,
      versions: 1,
      current_versions: 1,
      evidence: 1,
      changes: 0,
      outbox: 0,
      notifications: 0,
      deliveries: 0,
    });
  });

  it("supersedes changed Fact truth but routes normalized identical truth to Observation only", async () => {
    const fixture = await createFixture(true);
    const changed = await verifyInstitutionFact(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt: new Date("2026-08-23T18:19:20.000Z"),
      }),
      input(fixture, 1200000),
      { transactionManager: runtime.transactionManager },
    );
    const unchanged = await verifyInstitutionFact(
      createAdminCommandContext({
        adminUserId: fixture.adminUserId,
        occurredAt: new Date("2026-08-23T18:20:20.000Z"),
      }),
      input(fixture, 1200000, changed.currentVersionId),
      { transactionManager: runtime.transactionManager },
    );

    expect(changed).toMatchObject({
      outcome: "CHANGED",
      previousVersionId: fixture.versionId,
    });
    expect(unchanged).toMatchObject({
      outcome: "NO_CHANGE",
      previousVersionId: changed.currentVersionId,
      currentVersionId: changed.currentVersionId,
      evidenceId: null,
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
      select id, version_number, verification_state, is_current, supersedes_version_id
      from institution_fact_versions where institution_fact_id=${fixture.factId}
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
        id: changed.currentVersionId,
        version_number: 2,
        verification_state: "VERIFIED",
        is_current: true,
        supersedes_version_id: fixture.versionId,
      },
    ]);
    const [counts] = await runtime.client<
      { observations: number; outbox: number }[]
    >`
      select
        (select count(*)::int from source_observations where source_id=${fixture.sourceId}) as observations,
        (select count(*)::int from outbox_events where aggregate_id in (${fixture.institutionId}, ${fixture.factId})) as outbox
    `;
    expect(counts).toEqual({ observations: 1, outbox: 0 });
  });

  it("rejects evidence owned by another Source before any Fact mutation", async () => {
    const fixture = await createFixture(true);
    const otherSourceId = randomUUID();
    const [observation] = await runtime.client<{ id: string }[]>`
      with source as (
        insert into sources (
          id, canonical_url, source_type, authority_level, lifecycle_status, source_name
        ) values (
          ${otherSourceId}, ${`https://official.example.test/${prefix}/${otherSourceId}`},
          'OFFICIAL_ADMISSION_PAGE', 'PRIMARY', 'ACTIVE', 'Other Source'
        ) returning id
      )
      insert into source_observations (source_id, observed_at, outcome)
      select id, '2026-08-23T19:20:21.000Z', 'CHANGED' from source
      returning id::text
    `;

    await expect(
      verifyInstitutionFact(
        createAdminCommandContext({ adminUserId: fixture.adminUserId }),
        {
          ...input(fixture, 1300000),
          evidence: { observationId: observation!.id, evidenceRole: "PRIMARY" },
        },
        { transactionManager: runtime.transactionManager },
      ),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    const [count] = await runtime.client<{ versions: number }[]>`
      select count(*)::int as versions from institution_fact_versions
      where institution_fact_id=${fixture.factId}
    `;
    expect(count?.versions).toBe(1);
  });

  it("serializes concurrent successors so only one stale expected version wins", async () => {
    const fixture = await createFixture(true);
    const attempts = await Promise.allSettled([
      verifyInstitutionFact(
        createAdminCommandContext({ adminUserId: fixture.adminUserId }),
        input(fixture, 1400000),
        { transactionManager: runtime.transactionManager },
      ),
      verifyInstitutionFact(
        createAdminCommandContext({ adminUserId: fixture.adminUserId }),
        input(fixture, 1500000),
        { transactionManager: runtime.transactionManager },
      ),
    ]);

    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "CONFLICT" } });
    const [counts] = await runtime.client<
      {
        versions: number;
        current_versions: number;
        branches: number;
      }[]
    >`
      select
        count(*)::int as versions,
        count(*) filter (where is_current)::int as current_versions,
        count(*) filter (where supersedes_version_id=${fixture.versionId})::int as branches
      from institution_fact_versions where institution_fact_id=${fixture.factId}
    `;
    expect(counts).toEqual({ versions: 2, current_versions: 1, branches: 1 });
  });

  it("rolls back Fact lineage and Evidence when Audit fails", async () => {
    const fixture = await createFixture(true);
    await expect(
      verifyInstitutionFact(
        createAdminCommandContext({ adminUserId: fixture.adminUserId }),
        input(fixture, 1600000),
        {
          transactionManager: runtime.transactionManager,
          persistence: {
            ...defaultVerifyInstitutionFactPersistence,
            writeAudit: async () => {
              throw new Error("forced Fact Audit failure");
            },
          },
        },
      ),
    ).rejects.toThrow("forced Fact Audit failure");

    const [counts] = await runtime.client<
      {
        versions: number;
        evidence: number;
        current_versions: number;
        audits: number;
      }[]
    >`
      select
        (select count(*)::int from institution_fact_versions where institution_fact_id=${fixture.factId}) as versions,
        (select count(*)::int from institution_fact_version_evidence e join institution_fact_versions v on v.id=e.institution_fact_version_id where v.institution_fact_id=${fixture.factId}) as evidence,
        (select count(*)::int from institution_fact_versions where institution_fact_id=${fixture.factId} and is_current) as current_versions,
        (select count(*)::int from audit_logs where entity_id=${fixture.institutionId}) as audits
    `;
    expect(counts).toEqual({
      versions: 1,
      evidence: 1,
      current_versions: 1,
      audits: 0,
    });
  });
});
