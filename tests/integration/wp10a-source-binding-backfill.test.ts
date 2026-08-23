import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  applySourceBindingBackfill,
  MIGRATION_SOURCE_BINDING_BACKFILL_CONTEXT,
  preflightSourceBindingBackfill,
} from "@/src/infrastructure/db/source-binding-backfill.server";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

const primaryDatabaseName = new URL(databaseUrl).pathname.slice(1);
const isolatedDatabaseBase = primaryDatabaseName
  .replace(/(?:^|_)(?:test|verify\d*)$/, "")
  .replace(/[^a-zA-Z0-9_]/g, "_")
  .slice(0, 28);
const isolatedDatabaseName = `${isolatedDatabaseBase}_wp10a_verify${`${Date.now()}${randomUUID().replace(/\D/g, "")}`.slice(0, 20)}`;
if (!/^[A-Za-z0-9_]+_verify\d+$/.test(isolatedDatabaseName)) {
  throw new Error("WP-10A isolated database name must be identifier-safe");
}
const isolatedDatabaseUrl = new URL(databaseUrl);
isolatedDatabaseUrl.pathname = `/${isolatedDatabaseName}`;
assertDedicatedTestDatabaseUrl(isolatedDatabaseUrl.toString());
const maintenanceDatabaseUrl = new URL(databaseUrl);
maintenanceDatabaseUrl.pathname = "/postgres";

const sql = postgres(isolatedDatabaseUrl.toString(), { max: 4 });
const schemaLockSql = postgres(isolatedDatabaseUrl.toString(), { max: 1 });
const runtime = getRuntimeDatabase({
  DATABASE_URL: isolatedDatabaseUrl.toString(),
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const prefix = "wp10a-backfill-";
const execFileAsync = promisify(execFile);
const fixedBoundAt = new Date("2026-08-20T00:00:00.000Z");
const fixedUnboundAt = new Date("2026-08-21T00:00:00.000Z");

async function resetIsolatedDatabase() {
  const maintenance = postgres(maintenanceDatabaseUrl.toString(), { max: 1 });
  try {
    await maintenance`select pg_terminate_backend(pid)
      from pg_stat_activity
      where datname = ${isolatedDatabaseName} and pid <> pg_backend_pid()`;
    await maintenance`drop database if exists ${maintenance(isolatedDatabaseName)}`;
  } finally {
    await maintenance.end({ timeout: 5 });
  }
}

async function source(sourceType = "OFFICIAL_ADMISSION_PAGE", name = "Source") {
  const id = randomUUID();
  await sql`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name
    ) values (
      ${id}, ${`https://official.example.test/${prefix}${id}`}, ${sourceType},
      'PRIMARY', 'ACTIVE', ${`${prefix}${name}`}
    )
  `;
  return id;
}

async function institution(category = "PRIVATE_ELEMENTARY") {
  const id = randomUUID();
  await sql`
    insert into institutions (id, slug, display_name, category)
    values (${id}, ${`${prefix}${id}`}, 'WP-10A Institution', ${category})
  `;
  return id;
}

async function schoolGraph(
  options: {
    sourceRole?: string;
    sourceType?: string;
    isActive?: boolean;
    withBridge?: boolean;
    withCycle?: boolean;
    createBinding?: boolean;
  } = {},
) {
  const schoolId = randomUUID();
  const institutionId = await institution();
  const sourceId = await source(options.sourceType);
  const cycleId = options.withCycle ? randomUUID() : null;
  await sql`
    insert into schools (id, slug, canonical_name, school_type, lifecycle_status)
    values (
      ${schoolId}, ${`${prefix}school-${schoolId}`}, 'WP-10A School',
      'PRIVATE_ELEMENTARY', 'ACTIVE'
    )
  `;
  if (cycleId) {
    await sql`
      insert into admission_cycles (
        id, school_id, academic_year, lifecycle_status, admission_mode,
        internal_notes
      ) values (${cycleId}, ${schoolId}, 2099, 'PLANNED', 'UNKNOWN', ${prefix})
    `;
  }
  if (options.withBridge !== false) {
    await sql`
      insert into institution_school_links (
        institution_id, school_id, link_reason
      ) values (${institutionId}, ${schoolId}, ${prefix})
    `;
  }
  if (options.createBinding !== false) {
    await sql`
      insert into source_bindings (
        id, source_id, school_id, admission_cycle_id, source_role, is_active,
        created_at, updated_at
      ) values (
        ${randomUUID()}, ${sourceId}, ${schoolId}, ${cycleId},
        ${options.sourceRole ?? "PRIMARY_ADMISSIONS"},
        ${options.isActive ?? true}, ${fixedBoundAt},
        ${options.isActive === false ? fixedUnboundAt : fixedBoundAt}
      )
    `;
  }
  return { institutionId, schoolId, sourceId, cycleId };
}

async function opportunity(
  institutionId: string,
  truthMode: "NATIVE" | "LEGACY_BACKED" = "NATIVE",
) {
  const id = randomUUID();
  await sql`
    insert into opportunities (
      id, institution_id, slug, kind, truth_mode, publication_state
    ) values (
      ${id}, ${institutionId}, ${`${prefix}${id}`}, 'APPLICATION',
      ${truthMode}, 'DRAFT'
    )
  `;
  return id;
}

async function nativeEvidence(evidenceRole = "PRIMARY") {
  const institutionId = await institution("ENGLISH_KINDERGARTEN");
  const opportunityId = await opportunity(institutionId);
  const versionId = randomUUID();
  const sourceId = await source("OFFICIAL_NOTICE_BOARD", "Native Evidence");
  await sql`
    insert into opportunity_versions (
      id, opportunity_id, truth_mode, version_number, verification_state,
      business_state, is_current, title, verified_at, created_at
    ) values (
      ${versionId}, ${opportunityId}, 'NATIVE', 1, 'VERIFIED', 'OPEN', true,
      'WP-10A Native Opportunity', ${fixedBoundAt}, ${fixedBoundAt}
    )
  `;
  await sql`
    insert into opportunity_version_evidence (
      id, opportunity_version_id, source_id, evidence_role, created_at
    ) values (
      ${randomUUID()}, ${versionId}, ${sourceId}, ${evidenceRole},
      ${fixedBoundAt}
    )
  `;
  return { institutionId, opportunityId, sourceId, versionId };
}

async function ineligibleNativeEvidence() {
  const institutionId = await institution("ENGLISH_KINDERGARTEN");
  const opportunityId = await opportunity(institutionId);
  const versionId = randomUUID();
  const sourceId = await source("OFFICIAL_NOTICE_BOARD", "Ineligible Evidence");
  await sql`
    insert into opportunity_versions (
      id, opportunity_id, truth_mode, version_number, verification_state,
      business_state, is_current, title, created_at
    ) values (
      ${versionId}, ${opportunityId}, 'NATIVE', 1, 'UNVERIFIED', 'OPEN', false,
      'WP-10A Ineligible Native Opportunity', ${fixedBoundAt}
    )
  `;
  await sql`
    insert into opportunity_version_evidence (
      id, opportunity_version_id, source_id, evidence_role, created_at
    ) values (
      ${randomUUID()}, ${versionId}, ${sourceId}, 'PRIMARY', ${fixedBoundAt}
    )
  `;
  return { institutionId, opportunityId, sourceId, versionId };
}

async function legacyEvidence(
  options: {
    isPrimary?: boolean;
    mismatchedObservationSource?: boolean;
  } = {},
) {
  const graph = await schoolGraph();
  const opportunityId = await opportunity(graph.institutionId, "LEGACY_BACKED");
  const eventId = randomUUID();
  const versionId = randomUUID();
  const evidenceSourceId = await source(
    "OFFICIAL_NOTICE_BOARD",
    "Legacy Evidence",
  );
  const cycleId = graph.cycleId ?? randomUUID();
  if (!graph.cycleId) {
    await sql`
      insert into admission_cycles (
        id, school_id, academic_year, lifecycle_status, admission_mode,
        internal_notes
      ) values (${cycleId}, ${graph.schoolId}, 2098, 'PLANNED', 'UNKNOWN', ${prefix})
    `;
  }
  await sql`
    insert into admission_events (
      id, admission_cycle_id, event_key, event_type, canonical_title,
      importance, actionability, is_public
    ) values (
      ${eventId}, ${cycleId}, ${`${prefix}${eventId}`}, 'APPLICATION',
      'WP-10A Legacy Event', 'NORMAL', 'ACTION_REQUIRED', false
    )
  `;
  await sql`
    insert into opportunity_admission_event_links (
      opportunity_id, institution_id, truth_mode, admission_event_id,
      admission_cycle_id, school_id
    ) values (
      ${opportunityId}, ${graph.institutionId}, 'LEGACY_BACKED', ${eventId},
      ${cycleId}, ${graph.schoolId}
    )
  `;
  await sql`
    insert into admission_event_versions (
      id, admission_event_id, version_no, is_current, verification_status,
      knowledge_state, event_status, display_title, verified_at, created_at
    ) values (
      ${versionId}, ${eventId}, 1, true, 'VERIFIED', 'KNOWN', 'ACTIVE',
      'WP-10A Legacy Version', ${fixedBoundAt}, ${fixedBoundAt}
    )
  `;
  let observationId: bigint | null = null;
  if (options.mismatchedObservationSource) {
    const otherSourceId = await source("OFFICIAL_NOTICE_BOARD", "Other Source");
    const [observation] = await sql<{ id: bigint }[]>`
      insert into source_observations (
        source_id, observed_at, outcome, final_url
      ) values (
        ${otherSourceId}, ${fixedBoundAt}, 'SUCCESS',
        ${`https://official.example.test/${prefix}observation`}
      ) returning id
    `;
    observationId = observation.id;
  }
  await sql`
    insert into event_version_evidence (
      id, event_version_id, source_id, source_observation_id, is_primary,
      created_at
    ) values (
      ${randomUUID()}, ${versionId}, ${evidenceSourceId},
      ${observationId?.toString() ?? null},
      ${options.isPrimary ?? true}, ${fixedBoundAt}
    )
  `;
  return {
    institutionId: graph.institutionId,
    opportunityId,
    sourceId: evidenceSourceId,
    eventId,
    versionId,
    cycleId,
  };
}

async function productSignalCounts() {
  const [row] = await sql<
    {
      opportunityChanges: number;
      notifications: number;
      deliveries: number;
      outbox: number;
      alerts: number;
    }[]
  >`
    select
      (select count(*)::int from opportunity_changes) as "opportunityChanges",
      (select count(*)::int from notifications) as notifications,
      (select count(*)::int from notification_deliveries) as deliveries,
      (select count(*)::int from outbox_events) as outbox,
      (select count(*)::int from alerts) as alerts
  `;
  return row;
}

async function cleanup() {
  await sql.begin(async (transaction) => {
    await transaction.unsafe("set local session_replication_role = replica");
    await transaction`
      delete from opportunity_source_bindings where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}%`}
      )
    `;
    await transaction`
      delete from institution_source_bindings where institution_id in (
        select id from institutions where slug like ${`${prefix}%`}
      )
    `;
    await transaction`
      delete from opportunity_version_evidence where opportunity_version_id in (
        select version.id from opportunity_versions version
        join opportunities opportunity on opportunity.id=version.opportunity_id
        where opportunity.slug like ${`${prefix}%`}
      )
    `;
    await transaction`
      delete from opportunity_versions where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}%`}
      )
    `;
    await transaction`
      delete from event_version_evidence where event_version_id in (
        select version.id from admission_event_versions version
        join admission_events event on event.id=version.admission_event_id
        where event.event_key like ${`${prefix}%`}
      )
    `;
    await transaction`
      delete from admission_event_versions where admission_event_id in (
        select id from admission_events where event_key like ${`${prefix}%`}
      )
    `;
    await transaction`
      delete from opportunity_admission_event_links where opportunity_id in (
        select id from opportunities where slug like ${`${prefix}%`}
      )
    `;
    await transaction`delete from opportunities where slug like ${`${prefix}%`}`;
    await transaction`delete from admission_events where event_key like ${`${prefix}%`}`;
    await transaction`delete from source_bindings where source_id in (
      select id from sources where canonical_url like ${`https://official.example.test/${prefix}%`}
    )`;
    await transaction`delete from admission_cycles where internal_notes = ${prefix}`;
    await transaction`delete from institution_school_links where link_reason = ${prefix}`;
    await transaction`delete from schools where slug like ${`${prefix}%`}`;
    await transaction`delete from institutions where slug like ${`${prefix}%`}`;
    await transaction`delete from source_observations where source_id in (
      select id from sources where canonical_url like ${`https://official.example.test/${prefix}%`}
    )`;
    await transaction`delete from sources where canonical_url like ${`https://official.example.test/${prefix}%`}`;
  });
}

describe("WP-10A deterministic Source binding backfill", () => {
  beforeAll(async () => {
    await resetIsolatedDatabase();
    const maintenance = postgres(maintenanceDatabaseUrl.toString(), { max: 1 });
    try {
      await maintenance`create database ${maintenance(isolatedDatabaseName)}`;
    } finally {
      await maintenance.end({ timeout: 5 });
    }
    await schemaLockSql`
      select pg_advisory_lock(hashtext('admissionradar-schema-tests'))
    `;
    await migrateDatabase(isolatedDatabaseUrl.toString());
  });

  afterEach(cleanup);

  afterAll(async () => {
    await schemaLockSql`
      select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))
    `;
    await schemaLockSql.end({ timeout: 5 });
    await sql.end({ timeout: 5 });
    await closeRuntimeDatabase();
    await resetIsolatedDatabase();
  });

  it("maps only approved legacy Institution roles and reports unsafe roles as NOT_IMPORTED", async () => {
    const officialMain = await schoolGraph({
      sourceRole: "PRIMARY_ADMISSIONS",
      sourceType: "OFFICIAL_SCHOOL_PAGE",
    });
    const admissions = await schoolGraph({ sourceRole: "NOTICE_BOARD" });
    const application = await schoolGraph({ sourceRole: "APPLICATION" });
    const other = await schoolGraph({ sourceRole: "OTHER" });
    const notImported = await schoolGraph({ sourceRole: "ELIGIBILITY" });

    const report = await preflightSourceBindingBackfill(runtime.executor);
    expect(report.context).toEqual(MIGRATION_SOURCE_BINDING_BACKFILL_CONTEXT);
    expect(report.productionStateVerified).toBe(false);
    expect(report.blockingIssues).toEqual([]);
    expect(report.notImported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNSAFE_LEGACY_ROLE",
          institutionId: notImported.institutionId,
          sourceId: notImported.sourceId,
        }),
      ]),
    );

    await applySourceBindingBackfill({
      transactionManager: runtime.transactionManager,
    });
    const rows = await sql<
      {
        institutionId: string;
        sourceId: string;
        role: string;
        isPrimary: boolean;
      }[]
    >`
      select institution_id as "institutionId", source_id as "sourceId",
        role, is_primary as "isPrimary"
      from institution_source_bindings
      where institution_id in (
        ${officialMain.institutionId}, ${admissions.institutionId},
        ${application.institutionId}, ${other.institutionId},
        ${notImported.institutionId}
      ) order by role, institution_id
    `;
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          institutionId: officialMain.institutionId,
          sourceId: officialMain.sourceId,
          role: "OFFICIAL_MAIN",
          isPrimary: true,
        },
        {
          institutionId: admissions.institutionId,
          sourceId: admissions.sourceId,
          role: "ADMISSIONS",
          isPrimary: false,
        },
        {
          institutionId: application.institutionId,
          sourceId: application.sourceId,
          role: "APPLICATION",
          isPrimary: false,
        },
        {
          institutionId: other.institutionId,
          sourceId: other.sourceId,
          role: "OTHER",
          isPrimary: false,
        },
      ]),
    );
    expect(
      rows.some((row) => row.institutionId === notImported.institutionId),
    ).toBe(false);
  });

  it("imports only current VERIFIED direct Native and bridged legacy Opportunity Evidence", async () => {
    const native = await nativeEvidence(" primary ");
    const legacy = await legacyEvidence({ isPrimary: false });

    await applySourceBindingBackfill({
      transactionManager: runtime.transactionManager,
    });

    const rows = await sql<
      {
        opportunityId: string;
        sourceId: string;
        role: string;
        isPrimary: boolean;
      }[]
    >`
      select opportunity_id as "opportunityId", source_id as "sourceId",
        role, is_primary as "isPrimary"
      from opportunity_source_bindings
      where opportunity_id in (${native.opportunityId}, ${legacy.opportunityId})
      order by opportunity_id
    `;
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          opportunityId: native.opportunityId,
          sourceId: native.sourceId,
          role: "PRIMARY_NOTICE",
          isPrimary: true,
        },
        {
          opportunityId: legacy.opportunityId,
          sourceId: legacy.sourceId,
          role: "SUPPORTING",
          isPrimary: false,
        },
      ]),
    );
  });

  it("is idempotent and skips an exact partial canonical row", async () => {
    const first = await schoolGraph({ sourceRole: "NOTICE_BOARD" });
    const second = await schoolGraph({ sourceRole: "APPLICATION" });
    await sql`
      insert into institution_source_bindings (
        institution_id, source_id, role, is_primary, is_active, bound_at,
        unbound_at
      ) values (
        ${first.institutionId}, ${first.sourceId}, 'ADMISSIONS', false, true,
        ${fixedBoundAt}, null
      )
    `;

    const firstApply = await applySourceBindingBackfill({
      transactionManager: runtime.transactionManager,
    });
    const secondApply = await applySourceBindingBackfill({
      transactionManager: runtime.transactionManager,
    });

    expect(firstApply.institution).toEqual({ inserted: 1, skipped: 1 });
    expect(secondApply.institution).toEqual({ inserted: 0, skipped: 2 });
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from institution_source_bindings
      where institution_id in (${first.institutionId}, ${second.institutionId})
    `;
    expect(count).toBe(2);
  });

  it("serializes concurrent apply calls with the advisory lock", async () => {
    const graph = await schoolGraph({ sourceRole: "APPLICATION" });

    const results = await Promise.all([
      applySourceBindingBackfill({
        transactionManager: runtime.transactionManager,
      }),
      applySourceBindingBackfill({
        transactionManager: runtime.transactionManager,
      }),
    ]);

    expect(results.map((result) => result.institution.inserted).sort()).toEqual(
      [0, 1],
    );
    expect(results.map((result) => result.institution.skipped).sort()).toEqual([
      0, 1,
    ]);
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from institution_source_bindings
      where institution_id = ${graph.institutionId}
    `;
    expect(count).toBe(1);
  });

  it("keeps the CLI read-only by default and mutates only with --apply", async () => {
    const graph = await schoolGraph({ sourceRole: "NOTICE_BOARD" });
    const env = {
      ...process.env,
      DATABASE_URL: isolatedDatabaseUrl.toString(),
      NODE_ENV: "test" as const,
    };
    const cliArguments = [
      join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      "--tsconfig",
      "scripts/db/tsconfig.json",
      "scripts/db/backfill-source-bindings.ts",
    ];

    const dryRun = await execFileAsync(process.execPath, cliArguments, {
      cwd: process.cwd(),
      env,
    });
    expect(dryRun.stdout).toContain('"productionStateVerified": false');
    const [{ dryRunCount }] = await sql<{ dryRunCount: number }[]>`
      select count(*)::int as "dryRunCount"
      from institution_source_bindings
      where institution_id = ${graph.institutionId}
    `;
    expect(dryRunCount).toBe(0);

    const applied = await execFileAsync(
      process.execPath,
      [...cliArguments, "--apply"],
      { cwd: process.cwd(), env },
    );
    expect(applied.stdout).toContain('"inserted": 1');
    const [{ applyCount }] = await sql<{ applyCount: number }[]>`
      select count(*)::int as "applyCount"
      from institution_source_bindings
      where institution_id = ${graph.institutionId}
    `;
    expect(applyCount).toBe(1);

    let invalidArgumentFailure: unknown;
    try {
      await execFileAsync(process.execPath, [...cliArguments, "--unexpected"], {
        cwd: process.cwd(),
        env,
      });
    } catch (error) {
      invalidArgumentFailure = error;
    }
    expect(invalidArgumentFailure).toMatchObject({
      code: 1,
      stderr: "Usage: npm run db:backfill:source-bindings [--apply]\n",
    });
    const [{ invalidArgumentCount }] = await sql<
      { invalidArgumentCount: number }[]
    >`
      select count(*)::int as "invalidArgumentCount"
      from institution_source_bindings
      where institution_id = ${graph.institutionId}
    `;
    expect(invalidArgumentCount).toBe(1);
  });

  it("blocks an existing canonical row with contradictory lifecycle or primary state", async () => {
    const graph = await schoolGraph({ sourceRole: "NOTICE_BOARD" });
    await sql`
      insert into institution_source_bindings (
        institution_id, source_id, role, is_primary, is_active, bound_at,
        unbound_at
      ) values (
        ${graph.institutionId}, ${graph.sourceId}, 'ADMISSIONS', true, false,
        ${fixedBoundAt}, ${fixedUnboundAt}
      )
    `;
    const report = await preflightSourceBindingBackfill(runtime.executor);
    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CONFLICTING_EXISTING_CANONICAL_BINDING",
          institutionId: graph.institutionId,
          sourceId: graph.sourceId,
        }),
      ]),
    );
    await expect(
      applySourceBindingBackfill({
        transactionManager: runtime.transactionManager,
      }),
    ).rejects.toThrow("Source binding backfill preflight failed");
  });

  it("blocks a legacy School without an Institution bridge", async () => {
    const graph = await schoolGraph({ withBridge: false });
    const report = await preflightSourceBindingBackfill(runtime.executor);
    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SCHOOL_MISSING_INSTITUTION_BRIDGE",
          schoolId: graph.schoolId,
          sourceId: graph.sourceId,
        }),
      ]),
    );
  });

  it("blocks orphan and cross-School legacy Cycle relationships", async () => {
    const orphan = await schoolGraph({ createBinding: false });
    const mismatched = await schoolGraph({ createBinding: false });
    const otherCycle = await schoolGraph({
      createBinding: false,
      withCycle: true,
    });
    const orphanCycleId = randomUUID();
    await sql.begin(async (transaction) => {
      await transaction.unsafe("set local session_replication_role = replica");
      await transaction`
        insert into source_bindings (
          id, source_id, school_id, admission_cycle_id, source_role, is_active,
          created_at, updated_at
        ) values
          (${randomUUID()}, ${orphan.sourceId}, ${orphan.schoolId},
            ${orphanCycleId}, 'NOTICE_BOARD', true, ${fixedBoundAt}, ${fixedBoundAt}),
          (${randomUUID()}, ${mismatched.sourceId}, ${mismatched.schoolId},
            ${otherCycle.cycleId}, 'NOTICE_BOARD', true, ${fixedBoundAt}, ${fixedBoundAt})
      `;
    });

    const report = await preflightSourceBindingBackfill(runtime.executor);
    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "ORPHAN_CYCLE",
          sourceId: orphan.sourceId,
          cycleId: orphanCycleId,
        }),
        expect.objectContaining({
          code: "CYCLE_SCHOOL_MISMATCH",
          sourceId: mismatched.sourceId,
          cycleId: otherCycle.cycleId,
        }),
      ]),
    );
    expect(
      report.institutionActions.some(
        (action) =>
          action.sourceId === orphan.sourceId ||
          action.sourceId === mismatched.sourceId,
      ),
    ).toBe(false);
  });

  it("does not fan a Cycle Source out to multiple Opportunities", async () => {
    const graph = await schoolGraph({ withCycle: true });
    const first = await opportunity(graph.institutionId);
    const second = await opportunity(graph.institutionId);
    const report = await preflightSourceBindingBackfill(runtime.executor);
    expect(report.notImported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "AMBIGUOUS_OPPORTUNITY_SCOPE",
          sourceId: graph.sourceId,
          cycleId: graph.cycleId,
        }),
      ]),
    );
    await applySourceBindingBackfill({
      transactionManager: runtime.transactionManager,
    });
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from opportunity_source_bindings
      where opportunity_id in (${first}, ${second})
    `;
    expect(count).toBe(0);
  });

  it("blocks multiple active primary OFFICIAL_MAIN candidates", async () => {
    const first = await schoolGraph({
      sourceRole: "PRIMARY_ADMISSIONS",
      sourceType: "OFFICIAL_SCHOOL_PAGE",
    });
    const secondSourceId = await source("OFFICIAL_SCHOOL_PAGE", "Second Main");
    await sql`
      insert into source_bindings (
        id, source_id, school_id, source_role, is_active, created_at,
        updated_at
      ) values (
        ${randomUUID()}, ${secondSourceId}, ${first.schoolId},
        'PRIMARY_ADMISSIONS', true, ${fixedBoundAt}, ${fixedBoundAt}
      )
    `;
    const report = await preflightSourceBindingBackfill(runtime.executor);
    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MULTIPLE_ACTIVE_PRIMARY_OFFICIAL_MAIN",
          institutionId: first.institutionId,
        }),
      ]),
    );
  });

  it("blocks legacy Evidence whose Observation belongs to another Source", async () => {
    const legacy = await legacyEvidence({ mismatchedObservationSource: true });
    const report = await preflightSourceBindingBackfill(runtime.executor);
    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "EVIDENCE_SOURCE_MISMATCH",
          opportunityId: legacy.opportunityId,
          sourceId: legacy.sourceId,
        }),
      ]),
    );
  });

  it("reports ineligible Native and missing legacy Evidence as NOT_IMPORTED", async () => {
    const native = await ineligibleNativeEvidence();
    const legacy = await legacyEvidence();
    await sql`
      delete from event_version_evidence
      where event_version_id = ${legacy.versionId}
    `;

    const report = await preflightSourceBindingBackfill(runtime.executor);
    expect(report.notImported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "INELIGIBLE_OPPORTUNITY_EVIDENCE",
          opportunityId: native.opportunityId,
          sourceId: native.sourceId,
        }),
        expect.objectContaining({
          code: "NO_LEGACY_EVENT_EVIDENCE",
          opportunityId: legacy.opportunityId,
        }),
      ]),
    );
    expect(
      report.opportunityActions.some(
        (action) =>
          action.opportunityId === native.opportunityId ||
          action.opportunityId === legacy.opportunityId,
      ),
    ).toBe(false);
  });

  it("blocks an orphan AdmissionEvent in an explicit Opportunity bridge", async () => {
    const legacy = await legacyEvidence();
    await sql.begin(async (transaction) => {
      await transaction.unsafe("set local session_replication_role = replica");
      await transaction`delete from admission_events where id = ${legacy.eventId}`;
    });
    try {
      const report = await preflightSourceBindingBackfill(runtime.executor);
      expect(report.blockingIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "ORPHAN_ADMISSION_EVENT",
            opportunityId: legacy.opportunityId,
          }),
        ]),
      );
    } finally {
      await sql`
        insert into admission_events (
          id, admission_cycle_id, event_key, event_type, canonical_title,
          importance, actionability, is_public
        ) values (
          ${legacy.eventId}, ${legacy.cycleId},
          ${`${prefix}${legacy.eventId}`}, 'APPLICATION',
          'WP-10A Legacy Event', 'NORMAL', 'ACTION_REQUIRED', false
        )
      `;
    }
  });

  it("rolls the whole apply back and emits zero Product signals on failure", async () => {
    const institutionCandidate = await schoolGraph({
      sourceRole: "NOTICE_BOARD",
    });
    const opportunityCandidate = await nativeEvidence("PRIMARY");
    const before = await productSignalCounts();
    await sql.unsafe(`
      create function wp10a_backfill_test_failure() returns trigger
      language plpgsql as $$ begin raise exception 'forced WP-10A failure'; end $$
    `);
    await sql.unsafe(`
      create trigger wp10a_backfill_test_failure
      before insert on opportunity_source_bindings
      for each row execute function wp10a_backfill_test_failure()
    `);
    try {
      let failure: unknown;
      try {
        await applySourceBindingBackfill({
          transactionManager: runtime.transactionManager,
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error & { cause?: Error }).cause?.message).toContain(
        "forced WP-10A failure",
      );
    } finally {
      await sql`drop trigger if exists wp10a_backfill_test_failure on opportunity_source_bindings`;
      await sql`drop function if exists wp10a_backfill_test_failure()`;
    }
    const [counts] = await sql<
      { institutions: number; opportunities: number }[]
    >`
      select
        (select count(*)::int from institution_source_bindings
          where institution_id=${institutionCandidate.institutionId}) as institutions,
        (select count(*)::int from opportunity_source_bindings
          where opportunity_id=${opportunityCandidate.opportunityId}) as opportunities
    `;
    expect(counts).toEqual({ institutions: 0, opportunities: 0 });
    expect(await productSignalCounts()).toEqual(before);
  });
});
