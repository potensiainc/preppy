import { randomUUID } from "node:crypto";

import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { createNodeHttpTransport } from "@/src/modules/http-collector/http-transport.server";
import { collectReviewedAdmissionSource } from "@/src/modules/live-admissions/collection.server";
import { parseLiveAdmissionReviewManifest } from "@/src/modules/live-admissions/cli.server";
import { PRODUCTION_FIVE_SCHOOL_TARGETS } from "@/src/modules/live-admissions/production-contract";
import {
  inspectProductionSchoolRolloutState,
  runProductionFiveSchoolRollout,
} from "@/src/modules/live-admissions/production-rollout.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
import {
  startHttpCollectorFixture,
  type HttpCollectorFixture,
} from "@/tests/support/http-collector-fixture";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
}
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const lock = postgres(databaseUrl, { max: 1 });
const ownerTarget = PRODUCTION_FIVE_SCHOOL_TARGETS[0]!;
const yaleTarget = PRODUCTION_FIVE_SCHOOL_TARGETS[4]!;
const nonSelectedInstitutionIds = PRODUCTION_FIVE_SCHOOL_TARGETS.slice(1).map(
  (target) => target.institutionId,
);
const [
  myongjiInstitutionId,
  younghoonInstitutionId,
  uchonInstitutionId,
  yaleInstitutionId,
] = nonSelectedInstitutionIds as [string, string, string, string];
const rootSourceId = randomUUID();
const operatorAdminId = randomUUID();
let fixture: HttpCollectorFixture;
let testTarget: (typeof PRODUCTION_FIVE_SCHOOL_TARGETS)[number];

function rolloutDependencies() {
  return {
    executor: runtime.executor,
    transactionManager: runtime.transactionManager,
    targets: [testTarget],
    now: () => new Date("2026-08-29T06:41:17.296Z"),
    collectReviewed: (
      input: Parameters<typeof collectReviewedAdmissionSource>[0],
      dependencies: Parameters<typeof collectReviewedAdmissionSource>[1],
    ) =>
      collectReviewedAdmissionSource(input, {
        ...dependencies,
        baseTransport: createNodeHttpTransport({
          resolver: async () => [{ address: "127.0.0.1", family: 4 as const }],
          assertAddressSafe: () => undefined,
          now: () => new Date("2026-08-29T06:40:16.118Z"),
        }),
        now: () => new Date("2026-08-29T06:40:16.118Z"),
        sleep: async () => undefined,
        clockMs: () => 0,
      }),
  } as const;
}

async function scopedCounts() {
  const [row] = await runtime.client<
    Array<{
      institutions: number;
      sources: number;
      observations: number;
      snapshots: number;
      opportunities: number;
      versions: number;
      evidence: number;
      outboxEvents: number;
      notifications: number;
      notificationDeliveries: number;
      notificationDeliveryAttempts: number;
      meaningfulChanges: number;
      opportunityChanges: number;
    }>
  >`
    select
      (select count(*)::int from institutions where id=${ownerTarget.institutionId}) as institutions,
      (select count(*)::int from sources s join institution_source_bindings b
        on b.source_id=s.id where b.institution_id=${ownerTarget.institutionId}) as sources,
      (select count(*)::int from source_observations so where so.source_id in
        (select source_id from institution_source_bindings where institution_id=${ownerTarget.institutionId})) as observations,
      (select count(*)::int from source_snapshots ss where ss.source_id in
        (select source_id from institution_source_bindings where institution_id=${ownerTarget.institutionId})) as snapshots,
      (select count(*)::int from opportunities where institution_id=${ownerTarget.institutionId}) as opportunities,
      (select count(*)::int from opportunity_versions where opportunity_id in
        (select id from opportunities where institution_id=${ownerTarget.institutionId})) as versions,
      (select count(*)::int from opportunity_version_evidence where opportunity_version_id in
        (select v.id from opportunity_versions v join opportunities o on o.id=v.opportunity_id
          where o.institution_id=${ownerTarget.institutionId})) as evidence,
      (select count(*)::int from outbox_events) as "outboxEvents",
      (select count(*)::int from notifications) as notifications,
      (select count(*)::int from notification_deliveries) as "notificationDeliveries",
      (select count(*)::int from notification_delivery_attempts) as "notificationDeliveryAttempts",
      (select count(*)::int from meaningful_changes) as "meaningfulChanges",
      (select count(*)::int from opportunity_changes) as "opportunityChanges"
  `;
  return row!;
}

async function nonSelectedWriteCounts() {
  const [row] = await runtime.client<
    Array<{
      sources: number;
      observations: number;
      snapshots: number;
      opportunities: number;
      versions: number;
      evidence: number;
    }>
  >`
    select
      (select count(*)::int from sources s join institution_source_bindings b
        on b.source_id=s.id where b.institution_id in (
          ${myongjiInstitutionId}, ${younghoonInstitutionId}, ${uchonInstitutionId}, ${yaleInstitutionId}
        )) as sources,
      (select count(*)::int from source_observations so where so.source_id in
        (select source_id from institution_source_bindings
          where institution_id in (
            ${myongjiInstitutionId}, ${younghoonInstitutionId}, ${uchonInstitutionId}, ${yaleInstitutionId}
          ))) as observations,
      (select count(*)::int from source_snapshots ss where ss.source_id in
        (select source_id from institution_source_bindings
          where institution_id in (
            ${myongjiInstitutionId}, ${younghoonInstitutionId}, ${uchonInstitutionId}, ${yaleInstitutionId}
          ))) as snapshots,
      (select count(*)::int from opportunities
        where institution_id in (
          ${myongjiInstitutionId}, ${younghoonInstitutionId}, ${uchonInstitutionId}, ${yaleInstitutionId}
        )) as opportunities,
      (select count(*)::int from opportunity_versions where opportunity_id in
        (select id from opportunities
          where institution_id in (
            ${myongjiInstitutionId}, ${younghoonInstitutionId}, ${uchonInstitutionId}, ${yaleInstitutionId}
          ))) as versions,
      (select count(*)::int from opportunity_version_evidence where opportunity_version_id in
        (select v.id from opportunity_versions v join opportunities o on o.id=v.opportunity_id
          where o.institution_id in (
            ${myongjiInstitutionId}, ${younghoonInstitutionId}, ${uchonInstitutionId}, ${yaleInstitutionId}
          ))) as evidence
  `;
  return row!;
}

async function cleanupTarget() {
  await runtime.client`drop trigger if exists preppy_rollout_side_effect_test on institutions`;
  await runtime.client`drop function if exists preppy_rollout_side_effect_test()`;
  await runtime.client.begin(async (transaction) => {
    await transaction`delete from outbox_events where aggregate_id=${ownerTarget.institutionId}`;
    await transaction`
      delete from opportunity_version_evidence where opportunity_version_id in (
        select v.id from opportunity_versions v join opportunities o on o.id=v.opportunity_id
        where o.institution_id=${ownerTarget.institutionId}
      )
    `;
    await transaction`
      delete from opportunity_source_bindings where opportunity_id in (
        select id from opportunities where institution_id=${ownerTarget.institutionId}
      )
    `;
    await transaction`
      delete from opportunity_versions where opportunity_id in (
        select id from opportunities where institution_id=${ownerTarget.institutionId}
      )
    `;
    await transaction`delete from opportunities where institution_id=${ownerTarget.institutionId}`;
    await transaction`
      delete from source_observations where source_id in (
        select source_id from institution_source_bindings where institution_id=${ownerTarget.institutionId}
      )
    `;
    await transaction`
      delete from source_snapshots where source_id in (
        select source_id from institution_source_bindings where institution_id=${ownerTarget.institutionId}
      )
    `;
    await transaction`delete from institution_source_bindings where institution_id=${ownerTarget.institutionId}`;
    await transaction`delete from sources where id=${rootSourceId} or canonical_url=${testTarget.admissionUrl}`;
    await transaction`delete from institutions where id=${ownerTarget.institutionId}`;
    await transaction`delete from admin_users where id=${operatorAdminId}`;
  });
}

async function prepareOne() {
  const result = await runProductionFiveSchoolRollout(
    { mode: "prepare", slug: "kbes" },
    rolloutDependencies(),
  );
  if (result.mode !== "prepare") {
    throw new Error("Expected prepare mode result");
  }
  const record = result.records[0];
  if (!record || !("reviewInput" in record)) {
    throw new Error("Expected one prepared review input");
  }
  const manifest = parseLiveAdmissionReviewManifest({
    ...record.reviewInput,
    operatorAdminId,
  });
  return { manifest, reviewInput: record.reviewInput };
}

beforeAll(async () => {
  await lock`select pg_advisory_lock(hashtext('admissionradar-schema-tests'))`;
  await lock`select pg_advisory_lock(hashtext('preppy-seed-import-tests'))`;
  await lock`select pg_advisory_lock(hashtext('preppy-live-admission-persistence-tests'))`;
  await migrateDatabase(databaseUrl);
  fixture = await startHttpCollectorFixture((request, response) => {
    if (request.url === "/robots.txt") {
      response
        .writeHead(200, { "content-type": "text/plain" })
        .end("User-agent: *\nAllow: /\n");
      return;
    }
    if (request.url === "/admissions") {
      response
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(
          "<title>2027학년도 입학 안내</title><p>원서접수 2026년 11월 7일 ~ 2026년 11월 12일</p>",
        );
      return;
    }
    if (request.url === "/") {
      response
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(
          "<title>경복초등학교</title><a href='/admissions'>2027학년도 입학 안내</a>",
        );
      return;
    }
    response.writeHead(404, { "content-type": "text/html" }).end("missing");
  });
  testTarget = Object.freeze({
    ...ownerTarget,
    admissionUrl: `http://school.fixture.test:${fixture.port}/admissions`,
  });
});

beforeEach(async () => {
  await cleanupTarget();
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${ownerTarget.institutionId}, ${ownerTarget.slug}, ${ownerTarget.institutionName},
      'PRIVATE_ELEMENTARY', 'ACTIVE', 'DRAFT'
    )
  `;
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name, requires_js, content_type_hint
    ) values (
      ${rootSourceId}, ${`http://school.fixture.test:${fixture.port}/`},
      'OFFICIAL_SCHOOL_PAGE', 'PRIMARY', 'ACTIVE',
      '경복초등학교 공식 홈페이지', false, 'text/html'
    )
  `;
  await runtime.client`
    insert into institution_source_bindings (
      institution_id, source_id, role, is_primary, is_active
    ) values (${ownerTarget.institutionId}, ${rootSourceId}, 'OFFICIAL_MAIN', true, true)
  `;
  await runtime.client`
    insert into admin_users (
      id, external_auth_subject, email, display_name, status
    ) values (
      ${operatorAdminId}, ${`production-rollout-test-${operatorAdminId}`},
      ${`production-rollout-${operatorAdminId}@example.invalid`},
      'Production Rollout Test Operator', 'ACTIVE'
    )
  `;
});

afterEach(cleanupTarget);

afterAll(async () => {
  if (fixture !== undefined) await fixture.close();
  await lock`select pg_advisory_unlock(hashtext('preppy-live-admission-persistence-tests'))`;
  await lock`select pg_advisory_unlock(hashtext('preppy-seed-import-tests'))`;
  await lock`select pg_advisory_unlock(hashtext('admissionradar-schema-tests'))`;
  await lock.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("one-time production five-school rollout on disposable PostgreSQL", () => {
  it("keeps inspect read-only, prepares only DRAFT/UNVERIFIED, reviews explicitly, and skips an identical repeat", async () => {
    const beforeInspect = await scopedCounts();
    const inspected = await runProductionFiveSchoolRollout(
      { mode: "inspect" },
      rolloutDependencies(),
    );
    expect(inspected).toMatchObject({
      mode: "inspect",
      migration: { status: "MATCH", latest: "0012_loving_trauma" },
      records: [{ state: "READY", stage: "PREPARE" }],
    });
    expect(await scopedCounts()).toEqual(beforeInspect);

    const { manifest, reviewInput } = await prepareOne();
    expect(manifest.approvedProposal).toMatchObject({
      academicYearLabel: "2027학년도",
      warnings: ["TARGET_ACADEMIC_YEAR_NOT_FOUND"],
    });
    const prepared = await inspectProductionSchoolRolloutState(
      runtime.executor,
      testTarget,
    );
    expect(prepared).toMatchObject({
      state: "READY",
      stage: "REVIEW",
      opportunityId: manifest.opportunityId,
      preparedVersionId: manifest.expectedVersionId,
      sourceId: manifest.sourceId,
      observationId: manifest.observationId,
      snapshotId: manifest.snapshotId,
    });
    const [preparedOpportunity] = await runtime.client<Array<{ slug: string }>>`
      select slug from opportunities where id=${manifest.opportunityId}
    `;
    expect(preparedOpportunity?.slug).toBe(
      `live-admissions-${ownerTarget.institutionId}-2027`,
    );
    const [draft] = await runtime.client<
      Array<{
        institutionState: string;
        opportunityState: string;
        verificationState: string;
        verifiedAt: string | null;
        isCurrent: boolean;
      }>
    >`
      select i.publication_state as "institutionState",
        o.publication_state as "opportunityState",
        v.verification_state as "verificationState", v.verified_at as "verifiedAt",
        v.is_current as "isCurrent"
      from institutions i join opportunities o on o.institution_id=i.id
      join opportunity_versions v on v.opportunity_id=o.id
      where i.id=${ownerTarget.institutionId}
    `;
    expect(draft).toEqual({
      institutionState: "DRAFT",
      opportunityState: "DRAFT",
      verificationState: "UNVERIFIED",
      verifiedAt: null,
      isCurrent: false,
    });

    const afterPrepare = await scopedCounts();
    const repeatedPrepare = await runProductionFiveSchoolRollout(
      { mode: "prepare", slug: "kbes" },
      rolloutDependencies(),
    );
    expect(repeatedPrepare).toMatchObject({
      mode: "prepare",
      records: [{ reviewInput }],
    });
    expect(await scopedCounts()).toEqual(afterPrepare);

    const beforeReview = await scopedCounts();
    const reviewJson = JSON.parse(JSON.stringify(manifest)) as unknown;
    const reviewed = await runProductionFiveSchoolRollout(
      { mode: "review", filePath: "review-one.json" },
      {
        ...rolloutDependencies(),
        readJsonFile: async () => reviewJson,
      },
    );
    expect(reviewed).toMatchObject({
      mode: "review",
      reviewed: {
        sideEffectDelta: {
          outboxEvents: 0,
          notifications: 0,
          notificationDeliveries: 0,
          notificationDeliveryAttempts: 0,
          meaningfulChanges: 0,
          opportunityChanges: 0,
        },
      },
      state: { state: "ALREADY_PUBLISHED" },
    });
    const afterFirstReview = await scopedCounts();
    expect(afterFirstReview).toMatchObject({
      institutions: beforeReview.institutions,
      sources: beforeReview.sources,
      observations: beforeReview.observations,
      snapshots: beforeReview.snapshots,
      opportunities: beforeReview.opportunities,
      versions: beforeReview.versions + 1,
      evidence: beforeReview.evidence + 1,
      outboxEvents: beforeReview.outboxEvents,
      notifications: beforeReview.notifications,
      notificationDeliveries: beforeReview.notificationDeliveries,
      notificationDeliveryAttempts: beforeReview.notificationDeliveryAttempts,
      meaningfulChanges: beforeReview.meaningfulChanges,
      opportunityChanges: beforeReview.opportunityChanges,
    });

    const repeated = await runProductionFiveSchoolRollout(
      { mode: "review", filePath: "review-one.json" },
      {
        ...rolloutDependencies(),
        readJsonFile: async () => reviewJson,
      },
    );
    expect(repeated).toMatchObject({
      mode: "review",
      state: { state: "ALREADY_PUBLISHED" },
    });
    expect(repeated).not.toHaveProperty("reviewed");
    expect(await scopedCounts()).toEqual(afterFirstReview);

    const repeatedPrepareAfterPublish = await runProductionFiveSchoolRollout(
      { mode: "prepare", slug: "kbes" },
      rolloutDependencies(),
    );
    expect(repeatedPrepareAfterPublish).toMatchObject({
      mode: "prepare",
      records: [{ target: "kbes", state: { state: "ALREADY_PUBLISHED" } }],
    });
    expect(await scopedCounts()).toEqual(afterFirstReview);
  });

  it("prepares only selected kbes when yale is blocked and leaves every other school write table unchanged", async () => {
    const dependencies = rolloutDependencies();
    const collectedInstitutionIds: string[] = [];
    const beforeOthers = await nonSelectedWriteCounts();

    const result = await runProductionFiveSchoolRollout(
      { mode: "prepare", slug: "kbes" },
      {
        ...dependencies,
        targets: [testTarget, yaleTarget],
        collectReviewed: async (input, collectionDependencies) => {
          collectedInstitutionIds.push(input.institutionId);
          return dependencies.collectReviewed(input, collectionDependencies);
        },
      },
    );

    expect(collectedInstitutionIds).toEqual([ownerTarget.institutionId]);
    expect(result).toMatchObject({
      mode: "prepare",
      records: [{ target: { slug: "kbes" } }],
      after: [
        { slug: "kbes", state: "READY", stage: "REVIEW" },
        { slug: "yale", state: "BLOCKED" },
      ],
    });
    expect(await nonSelectedWriteCounts()).toEqual(beforeOthers);
  });

  it("rejects selected blocked yale without invoking the ready kbes write path", async () => {
    const dependencies = rolloutDependencies();
    const before = await scopedCounts();
    const collectedInstitutionIds: string[] = [];

    await expect(
      runProductionFiveSchoolRollout(
        { mode: "prepare", slug: "yale" },
        {
          ...dependencies,
          targets: [testTarget, yaleTarget],
          collectReviewed: async (input, collectionDependencies) => {
            collectedInstitutionIds.push(input.institutionId);
            return dependencies.collectReviewed(input, collectionDependencies);
          },
        },
      ),
    ).rejects.toMatchObject({ code: "STATE_BLOCKED" });

    expect(collectedInstitutionIds).toEqual([]);
    expect(await scopedCounts()).toEqual(before);
  });

  it("keeps bootstrap Opportunity identity Institution-scoped without a hardcoded 2026 suffix", async () => {
    const foreignInstitutionId = randomUUID();
    const foreignOpportunityId = randomUUID();
    await runtime.client`
      insert into institutions (
        id, slug, display_name, category, operational_state, publication_state
      ) values (
        ${foreignInstitutionId}, ${`foreign-school-${foreignInstitutionId}`},
        'Foreign Fixture School', 'PRIVATE_ELEMENTARY', 'ACTIVE', 'DRAFT'
      )
    `;
    await runtime.client`
      insert into opportunities (
        id, institution_id, slug, kind, truth_mode, publication_state
      ) values (
        ${foreignOpportunityId}, ${foreignInstitutionId},
        ${`live-admissions-${ownerTarget.institutionId}-2026`},
        'RECRUITMENT', 'NATIVE', 'DRAFT'
      )
    `;

    try {
      expect(
        await inspectProductionSchoolRolloutState(runtime.executor, testTarget),
      ).toMatchObject({ state: "READY", stage: "PREPARE" });

      const { manifest } = await prepareOne();
      expect(manifest.approvedProposal).toMatchObject({
        academicYearLabel: "2027학년도",
        warnings: ["TARGET_ACADEMIC_YEAR_NOT_FOUND"],
      });
      expect(
        await inspectProductionSchoolRolloutState(runtime.executor, testTarget),
      ).toMatchObject({
        state: "READY",
        stage: "REVIEW",
        opportunityId: manifest.opportunityId,
      });
      const [foreign] = await runtime.client<Array<{ institutionId: string }>>`
        select institution_id as "institutionId"
        from opportunities where id=${foreignOpportunityId}
      `;
      expect(foreign).toEqual({ institutionId: foreignInstitutionId });
    } finally {
      await runtime.client`delete from opportunities where id=${foreignOpportunityId}`;
      await runtime.client`delete from institutions where id=${foreignInstitutionId}`;
    }
  });

  it("rolls back the complete review transaction when a product side effect is induced", async () => {
    const { manifest } = await prepareOne();
    const reviewJson = JSON.parse(JSON.stringify(manifest)) as unknown;
    const before = await scopedCounts();
    await runtime.client.unsafe(`
      create function preppy_rollout_side_effect_test() returns trigger
      language plpgsql as $$
      begin
        insert into outbox_events(event_type, aggregate_type, aggregate_id, payload)
        values ('TEST_SIDE_EFFECT', 'INSTITUTION', new.id, '{}'::jsonb);
        return new;
      end;
      $$
    `);
    await runtime.client.unsafe(`
      create trigger preppy_rollout_side_effect_test
      after update of publication_state on institutions
      for each row execute function preppy_rollout_side_effect_test()
    `);

    await expect(
      runProductionFiveSchoolRollout(
        { mode: "review", filePath: "review-one.json" },
        {
          ...rolloutDependencies(),
          readJsonFile: async () => reviewJson,
        },
      ),
    ).rejects.toMatchObject({ code: "SIDE_EFFECT_DETECTED" });

    expect(await scopedCounts()).toEqual(before);
    expect(
      await inspectProductionSchoolRolloutState(runtime.executor, testTarget),
    ).toMatchObject({ state: "READY", stage: "REVIEW" });
  });

  it("classifies two institution-scoped bootstrap Opportunities as conflict and performs no additional writes", async () => {
    await runtime.client`
      insert into opportunities (
        institution_id, slug, kind, truth_mode, publication_state
      ) values (
        ${ownerTarget.institutionId},
        ${`live-admissions-${ownerTarget.institutionId}-2026`},
        'RECRUITMENT', 'NATIVE', 'DRAFT'
      ), (
        ${ownerTarget.institutionId},
        ${`live-admissions-${ownerTarget.institutionId}-2027`},
        'RECRUITMENT', 'NATIVE', 'DRAFT'
      )
    `;
    const before = await scopedCounts();
    expect(
      await inspectProductionSchoolRolloutState(runtime.executor, testTarget),
    ).toMatchObject({
      state: "CONFLICT",
      reason: "OPPORTUNITY_IDENTITY_CONFLICT",
    });

    await expect(
      runProductionFiveSchoolRollout(
        { mode: "prepare", slug: "kbes" },
        rolloutDependencies(),
      ),
    ).rejects.toMatchObject({ code: "STATE_CONFLICT" });
    expect(await scopedCounts()).toEqual(before);
  });
});
