import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  applyOpportunityBackfill,
  opportunityIdForAdmissionEvent,
  preflightOpportunityBackfill,
} from "@/src/infrastructure/db/opportunity-backfill.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const rawSql = postgres(databaseUrl, { max: 1 });
const execFileAsync = promisify(execFile);
const testPrefix = "wp-02a-backfill-";
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 3,
  NODE_ENV: "test",
});

type Graph = {
  institutionId: string;
  institutionSlug: string;
  schoolId: string;
  cycleId: string;
  eventId: string;
  eventKey: string;
};

async function createGraph(
  overrides: Partial<{
    institutionId: string;
    schoolId: string;
    cycleId: string;
    eventId: string;
    eventType: string;
    eventKey: string;
    canonicalTitle: string;
    academicYear: number;
    createInstitutionBridge: boolean;
  }> = {},
): Promise<Graph> {
  const institutionId = overrides.institutionId ?? randomUUID();
  const schoolId = overrides.schoolId ?? randomUUID();
  const cycleId = overrides.cycleId ?? randomUUID();
  const eventId = overrides.eventId ?? randomUUID();
  const institutionSlug = `${testPrefix}institution-${institutionId}`;
  const eventKey = overrides.eventKey ?? `${testPrefix}event-${eventId}`;

  await rawSql`
    insert into institutions (id, slug, display_name, category)
    values (${institutionId}, ${institutionSlug}, 'WP-02A Institution', 'PRIVATE_ELEMENTARY')
  `;
  await rawSql`
    insert into schools (
      id, slug, canonical_name, school_type, lifecycle_status, country_code,
      is_public
    ) values (
      ${schoolId}, ${`${testPrefix}school-${schoolId}`}, 'WP-02A School',
      'PRIVATE_ELEMENTARY', 'ACTIVE', 'KR', false
    )
  `;
  if (overrides.createInstitutionBridge !== false) {
    await rawSql`
      insert into institution_school_links (institution_id, school_id, link_reason)
      values (${institutionId}, ${schoolId}, 'WP-02A_TEST')
    `;
  }
  await rawSql`
    insert into admission_cycles (
      id, school_id, academic_year, lifecycle_status, admission_mode,
      is_public_focus, internal_notes
    ) values (
      ${cycleId}, ${schoolId}, ${overrides.academicYear ?? 2098}, 'ACTIVE',
      'FIXED_WINDOW', false, ${testPrefix}
    )
  `;
  await rawSql`
    insert into admission_events (
      id, admission_cycle_id, event_key, event_type, canonical_title,
      occurrence_no, importance, actionability, is_public
    ) values (
      ${eventId}, ${cycleId}, ${eventKey}, ${overrides.eventType ?? "BRIEFING"},
      ${overrides.canonicalTitle ?? `${testPrefix}Event`}, 1, 'NORMAL',
      'INFORMATIONAL', false
    )
  `;

  return {
    institutionId,
    institutionSlug,
    schoolId,
    cycleId,
    eventId,
    eventKey,
  };
}

async function createSecondEvent(
  graph: Graph,
  overrides: Partial<{
    cycleId: string;
    eventId: string;
    eventKey: string;
    eventType: string;
    academicYear: number;
  }> = {},
) {
  const cycleId = overrides.cycleId ?? randomUUID();
  const eventId = overrides.eventId ?? randomUUID();
  const eventKey = overrides.eventKey ?? `${testPrefix}event-${eventId}`;
  await rawSql`
    insert into admission_cycles (
      id, school_id, academic_year, lifecycle_status, admission_mode,
      is_public_focus, internal_notes
    ) values (
      ${cycleId}, ${graph.schoolId}, ${overrides.academicYear ?? 2099},
      'ACTIVE', 'FIXED_WINDOW', false, ${testPrefix}
    )
  `;
  await rawSql`
    insert into admission_events (
      id, admission_cycle_id, event_key, event_type, canonical_title,
      occurrence_no, importance, actionability, is_public
    ) values (
      ${eventId}, ${cycleId}, ${eventKey}, ${overrides.eventType ?? "OPEN_HOUSE"},
      ${`${testPrefix}Second Event`}, 1, 'NORMAL', 'INFORMATIONAL', false
    )
  `;
  return { cycleId, eventId, eventKey };
}

async function resetFixtures() {
  await rawSql`
    delete from opportunity_admission_event_links
    where admission_event_id in (
      select id from admission_events where canonical_title like ${`${testPrefix}%`}
    ) or opportunity_id in (
      select id from opportunities where slug like ${`${testPrefix}%`}
    )
  `;
  await rawSql`delete from opportunities where slug like ${`${testPrefix}%`}`;
  await rawSql`
    delete from admission_events
    where canonical_title like ${`${testPrefix}%`}
  `;
  await rawSql`delete from admission_cycles where internal_notes = ${testPrefix}`;
  await rawSql`
    delete from institution_school_links
    where school_id in (select id from schools where slug like ${`${testPrefix}%`})
  `;
  await rawSql`delete from institutions where slug like ${`${testPrefix}%`}`;
  await rawSql`delete from schools where slug like ${`${testPrefix}%`}`;
}

async function productSideEffectCounts() {
  const [row] = await rawSql<
    { alerts: number; deliveries: number; outboxEvents: number }[]
  >`
    select
      (select count(*)::int from alerts) as alerts,
      (select count(*)::int from alert_deliveries) as deliveries,
      (select count(*)::int from outbox_events) as "outboxEvents"
  `;
  return row ?? { alerts: 0, deliveries: 0, outboxEvents: 0 };
}

describe("Opportunity backfill", () => {
  beforeAll(async () => {
    await rawSql`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
    await migrateDatabase(databaseUrl);
  });

  afterEach(async () => {
    await resetFixtures();
  });

  afterAll(async () => {
    await rawSql`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
    await rawSql.end({ timeout: 5 });
    await closeRuntimeDatabase();
  });

  it("creates an atomic DRAFT LEGACY_BACKED root and complete bridge without Product side effects", async () => {
    const graph = await createGraph({ eventType: "BRIEFING" });
    const before = await productSideEffectCounts();
    const preflight = await preflightOpportunityBackfill(runtime.executor);

    expect(preflight.blockingIssues).toEqual([]);
    expect(preflight).toMatchObject({
      eventCount: 1,
      typeDistribution: { BRIEFING: 1 },
      planned: { create: 1, link: 1, skip: 0 },
      productionStateVerified: false,
    });
    expect(preflight.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_OPTIONAL_LEGACY_METADATA",
          eventId: graph.eventId,
        }),
      ]),
    );

    const result = await applyOpportunityBackfill({
      transactionManager: runtime.transactionManager,
    });

    expect(result).toMatchObject({
      context: { source: "MIGRATION", emitProductSignals: false },
      created: 1,
      linked: 1,
      skipped: 0,
    });
    await expect(productSideEffectCounts()).resolves.toEqual(before);
    await expect(rawSql`
      select opportunity.id, opportunity.institution_id, opportunity.slug,
        opportunity.kind, opportunity.truth_mode, opportunity.publication_state,
        link.institution_id as link_institution_id,
        link.truth_mode as link_truth_mode,
        link.admission_event_id, link.admission_cycle_id, link.school_id
      from opportunities as opportunity
      join opportunity_admission_event_links as link
        on link.opportunity_id = opportunity.id
      where opportunity.id = ${opportunityIdForAdmissionEvent(graph.eventId)}
    `).resolves.toEqual([
      {
        id: opportunityIdForAdmissionEvent(graph.eventId),
        institution_id: graph.institutionId,
        slug: `${graph.institutionSlug}-${graph.eventKey}`,
        kind: "INFORMATION_SESSION",
        truth_mode: "LEGACY_BACKED",
        publication_state: "DRAFT",
        link_institution_id: graph.institutionId,
        link_truth_mode: "LEGACY_BACKED",
        admission_event_id: graph.eventId,
        admission_cycle_id: graph.cycleId,
        school_id: graph.schoolId,
      },
    ]);
  });

  it("is idempotent on a second apply", async () => {
    await createGraph({ eventType: "APPLICATION" });

    const first = await applyOpportunityBackfill({
      transactionManager: runtime.transactionManager,
    });
    const second = await applyOpportunityBackfill({
      transactionManager: runtime.transactionManager,
    });

    expect(first).toMatchObject({ created: 1, linked: 1, skipped: 0 });
    expect(second).toMatchObject({ created: 0, linked: 0, skipped: 1 });
  });

  it("keeps the CLI read-only by default and rejects unknown arguments", async () => {
    await createGraph({ eventType: "OPEN_HOUSE" });
    const before = await rawSql<{ opportunities: number; links: number }[]>`
      select
        (select count(*)::int from opportunities) as opportunities,
        (select count(*)::int from opportunity_admission_event_links) as links
    `;
    const env = { ...process.env, DATABASE_URL: databaseUrl };
    const cliArguments = [
      join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
      "--tsconfig",
      "scripts/db/tsconfig.json",
      "scripts/db/backfill-opportunities.ts",
    ];

    const dryRun = await execFileAsync(process.execPath, cliArguments, {
      cwd: process.cwd(),
      env,
    });

    expect(dryRun.stdout).toContain('"productionStateVerified": false');
    await expect(rawSql<{ opportunities: number; links: number }[]>`
      select
        (select count(*)::int from opportunities) as opportunities,
        (select count(*)::int from opportunity_admission_event_links) as links
    `).resolves.toEqual(before);
    await expect(
      execFileAsync(process.execPath, [...cliArguments, "--unexpected"], {
        cwd: process.cwd(),
        env,
      }),
    ).rejects.toMatchObject({ code: 1 });
  });

  it("blocks an Event whose School has no Institution bridge", async () => {
    const graph = await createGraph({ createInstitutionBridge: false });

    const report = await preflightOpportunityBackfill(runtime.executor);

    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SCHOOL_MISSING_INSTITUTION_BRIDGE",
          eventId: graph.eventId,
          schoolId: graph.schoolId,
        }),
      ]),
    );
  });

  it.each(["OTHER", "UNSUPPORTED_TYPE"])(
    "blocks unmappable Event type %s",
    async (eventType) => {
      if (eventType === "UNSUPPORTED_TYPE") {
        await rawSql`
          alter table admission_events
          drop constraint admission_events_event_type_check
        `;
      }
      try {
        const graph = await createGraph({ eventType });
        const report = await preflightOpportunityBackfill(runtime.executor);

        expect(report.blockingIssues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: "UNMAPPABLE_EVENT_TYPE",
              eventId: graph.eventId,
            }),
          ]),
        );
      } finally {
        if (eventType === "UNSUPPORTED_TYPE") {
          await rawSql`
            delete from admission_events where event_type = 'UNSUPPORTED_TYPE'
          `;
          await rawSql`
            alter table admission_events
            add constraint admission_events_event_type_check
            check (event_type in ('BRIEFING', 'OPEN_HOUSE', 'APPLICATION', 'DOCUMENT_SUBMISSION', 'ASSESSMENT', 'INTERVIEW', 'LOTTERY', 'RESULT_ANNOUNCEMENT', 'REGISTRATION', 'ADDITIONAL_RECRUITMENT', 'OTHER'))
          `;
        }
      }
    },
  );

  it("blocks invalid and duplicate candidate slugs without normalization or suffixing", async () => {
    const duplicate = await createGraph({ eventKey: `${testPrefix}same-key` });
    const second = await createSecondEvent(duplicate, {
      eventKey: duplicate.eventKey,
    });
    const invalid = await createGraph({ eventKey: "Not URL Safe" });

    const report = await preflightOpportunityBackfill(runtime.executor);

    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DUPLICATE_TARGET_SLUG",
          slug: `${duplicate.institutionSlug}-${duplicate.eventKey}`,
        }),
        expect.objectContaining({
          code: "INVALID_CANONICAL_SLUG_SOURCE",
          eventId: invalid.eventId,
        }),
      ]),
    );
    expect(second.eventId).not.toBe(duplicate.eventId);
  });

  it("blocks a target slug occupied by another Opportunity", async () => {
    const graph = await createGraph();
    const slug = `${graph.institutionSlug}-${graph.eventKey}`;
    await rawSql`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state
      ) values (
        ${randomUUID()}, ${graph.institutionId}, ${slug}, 'OPEN_HOUSE',
        'NATIVE', 'DRAFT'
      )
    `;

    const report = await preflightOpportunityBackfill(runtime.executor);

    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TARGET_SLUG_OCCUPIED", slug }),
      ]),
    );
  });

  it("links an exact deterministic Opportunity that is missing only its bridge", async () => {
    const graph = await createGraph({ eventType: "INTERVIEW" });
    const opportunityId = opportunityIdForAdmissionEvent(graph.eventId);
    await rawSql`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state
      ) values (
        ${opportunityId}, ${graph.institutionId},
        ${`${graph.institutionSlug}-${graph.eventKey}`}, 'INTERVIEW',
        'LEGACY_BACKED', 'DRAFT'
      )
    `;

    const result = await applyOpportunityBackfill({
      transactionManager: runtime.transactionManager,
    });

    expect(result).toMatchObject({ created: 0, linked: 1, skipped: 0 });
  });

  it("blocks an Event bridge to a non-deterministic Opportunity", async () => {
    const graph = await createGraph({ eventType: "LOTTERY" });
    const unexpectedId = randomUUID();
    await rawSql`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state
      ) values (
        ${unexpectedId}, ${graph.institutionId},
        ${`${testPrefix}unexpected-${unexpectedId}`}, 'LOTTERY',
        'LEGACY_BACKED', 'DRAFT'
      )
    `;
    await rawSql`
      insert into opportunity_admission_event_links (
        opportunity_id, institution_id, truth_mode, admission_event_id,
        admission_cycle_id, school_id
      ) values (
        ${unexpectedId}, ${graph.institutionId}, 'LEGACY_BACKED', ${graph.eventId},
        ${graph.cycleId}, ${graph.schoolId}
      )
    `;

    const report = await preflightOpportunityBackfill(runtime.executor);

    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "EVENT_LINKED_TO_UNEXPECTED_OPPORTUNITY",
          eventId: graph.eventId,
        }),
      ]),
    );
  });

  it("blocks deterministic Opportunities with wrong Institution, truth, slug, or kind", async () => {
    const wrongInstitution = await createGraph({ eventType: "ASSESSMENT" });
    const otherInstitutionId = randomUUID();
    await rawSql`
      insert into institutions (id, slug, display_name, category)
      values (
        ${otherInstitutionId}, ${`${testPrefix}other-${otherInstitutionId}`},
        'Other Institution', 'PRIVATE_ELEMENTARY'
      )
    `;
    await rawSql`
      insert into opportunities (id, institution_id, slug, kind, truth_mode)
      values (
        ${opportunityIdForAdmissionEvent(wrongInstitution.eventId)},
        ${otherInstitutionId},
        ${`${wrongInstitution.institutionSlug}-${wrongInstitution.eventKey}`},
        'ASSESSMENT', 'LEGACY_BACKED'
      )
    `;

    const wrongTruth = await createGraph({ eventType: "REGISTRATION" });
    await rawSql`
      insert into opportunities (id, institution_id, slug, kind, truth_mode)
      values (
        ${opportunityIdForAdmissionEvent(wrongTruth.eventId)},
        ${wrongTruth.institutionId},
        ${`${wrongTruth.institutionSlug}-${wrongTruth.eventKey}`},
        'REGISTRATION', 'NATIVE'
      )
    `;

    const wrongSlug = await createGraph({ eventType: "RESULT_ANNOUNCEMENT" });
    await rawSql`
      insert into opportunities (id, institution_id, slug, kind, truth_mode)
      values (
        ${opportunityIdForAdmissionEvent(wrongSlug.eventId)},
        ${wrongSlug.institutionId}, ${`${testPrefix}wrong-slug-${randomUUID()}`},
        'RESULT_ANNOUNCEMENT', 'LEGACY_BACKED'
      )
    `;

    const wrongKind = await createGraph({ eventType: "OPEN_HOUSE" });
    await rawSql`
      insert into opportunities (id, institution_id, slug, kind, truth_mode)
      values (
        ${opportunityIdForAdmissionEvent(wrongKind.eventId)},
        ${wrongKind.institutionId},
        ${`${wrongKind.institutionSlug}-${wrongKind.eventKey}`},
        'APPLICATION', 'LEGACY_BACKED'
      )
    `;

    const report = await preflightOpportunityBackfill(runtime.executor);

    expect(report.blockingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "EXPECTED_OPPORTUNITY_INSTITUTION_MISMATCH",
          eventId: wrongInstitution.eventId,
        }),
        expect.objectContaining({
          code: "EXPECTED_OPPORTUNITY_TRUTH_MODE_MISMATCH",
          eventId: wrongTruth.eventId,
        }),
        expect.objectContaining({
          code: "EXPECTED_OPPORTUNITY_SLUG_MISMATCH",
          eventId: wrongSlug.eventId,
        }),
        expect.objectContaining({
          code: "EXPECTED_OPPORTUNITY_KIND_MISMATCH",
          eventId: wrongKind.eventId,
        }),
      ]),
    );
  });

  it("rolls back every root and bridge when a trigger forces a mid-run failure", async () => {
    const eventIds = [randomUUID(), randomUUID()].sort();
    const first = await createGraph({
      eventId: eventIds[0],
      eventType: "APPLICATION",
    });
    const second = await createGraph({
      eventId: eventIds[1],
      eventType: "DOCUMENT_SUBMISSION",
    });
    await rawSql`
      create function wp_02a_backfill_test_failure() returns trigger
      language plpgsql as $$
      begin
        if new.kind = 'DOCUMENT_SUBMISSION' then
          raise exception 'WP_02A_FORCED_FAILURE';
        end if;
        return new;
      end;
      $$
    `;
    await rawSql`
      create trigger wp_02a_backfill_test_failure
      before insert on opportunities
      for each row execute function wp_02a_backfill_test_failure()
    `;

    try {
      await expect(
        applyOpportunityBackfill({
          transactionManager: runtime.transactionManager,
        }),
      ).rejects.toThrow();
      await expect(rawSql<{ count: number }[]>`
        select count(*)::int as count from opportunities
        where id in (
          ${opportunityIdForAdmissionEvent(first.eventId)},
          ${opportunityIdForAdmissionEvent(second.eventId)}
        )
      `).resolves.toEqual([{ count: 0 }]);
      await expect(rawSql<{ count: number }[]>`
        select count(*)::int as count from opportunity_admission_event_links
        where admission_event_id in (${first.eventId}, ${second.eventId})
      `).resolves.toEqual([{ count: 0 }]);
    } finally {
      await rawSql`
        drop trigger if exists wp_02a_backfill_test_failure on opportunities
      `;
      await rawSql`drop function if exists wp_02a_backfill_test_failure()`;
    }
  });
});
