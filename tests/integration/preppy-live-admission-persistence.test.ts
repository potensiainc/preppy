import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { collectReviewedAdmissionSource } from "@/src/modules/live-admissions/collection.server";
import { extractLiveAdmissionProposal } from "@/src/modules/live-admissions/extractor";
import { prepareLiveAdmissionDraft } from "@/src/modules/live-admissions/preparation.server";
import { reviewAndPublishLiveAdmissionDraft } from "@/src/modules/live-admissions/review.server";
import { createNodeHttpTransport } from "@/src/modules/http-collector/http-transport.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
import {
  startHttpCollectorFixture,
  type HttpCollectorFixture,
} from "@/tests/support/http-collector-fixture";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL must be set for integration tests");
assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 4,
  NODE_ENV: "test",
});
const lockSql = postgres(databaseUrl, { max: 1 });
const institutionIds = new Set<string>();
const sourceIds = new Set<string>();
const opportunityIds = new Set<string>();
const adminUserIds = new Set<string>();
let fixture: HttpCollectorFixture;

async function insertSeededInstitution() {
  const institutionId = randomUUID();
  const rootSourceId = randomUUID();
  institutionIds.add(institutionId);
  sourceIds.add(rootSourceId);
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${institutionId}, ${`live-school-${institutionId}`}, 'Live Fixture School',
      'PRIVATE_ELEMENTARY', 'ACTIVE', 'DRAFT'
    )
  `;
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name, requires_js, content_type_hint
    ) values (
      ${rootSourceId},
      ${`http://school.fixture.test:${fixture.port}/`},
      'OFFICIAL_SCHOOL_PAGE', 'PRIMARY', 'ACTIVE',
      'Live Fixture School official website', false, 'text/html'
    )
  `;
  await runtime.client`
    insert into institution_source_bindings (
      institution_id, source_id, role, is_primary, is_active
    ) values (${institutionId}, ${rootSourceId}, 'OFFICIAL_MAIN', true, true)
  `;
  return { institutionId, rootSourceId };
}

function collectionDependencies() {
  return {
    executor: runtime.executor,
    transactionManager: runtime.transactionManager,
    baseTransport: createNodeHttpTransport({
      resolver: async () => [{ address: "127.0.0.1", family: 4 as const }],
      assertAddressSafe: () => undefined,
      now: () => new Date("2026-08-29T03:04:05.000Z"),
    }),
    now: () => new Date("2026-08-29T03:04:05.000Z"),
    sleep: async () => undefined,
    clockMs: () => 0,
  };
}

beforeAll(async () => {
  await lockSql`select pg_advisory_lock(hashtext('preppy-live-admission-persistence-tests'))`;
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
          "<title>2027학년도 입학 안내</title><p>원서접수 2026년 10월 5일 ~ 2026년 10월 9일</p>",
        );
      return;
    }
    if (request.url === "/") {
      response
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(
          "<title>Live Fixture School</title><a href='/admissions'>2027학년도 입학 안내</a>",
        );
      return;
    }
    response.writeHead(404, { "content-type": "text/html" }).end("missing");
  });
});

afterEach(async () => {
  const institutions = [...institutionIds];
  const sources = [...sourceIds];
  const opportunities = [...opportunityIds];
  const adminUsers = [...adminUserIds];
  if (
    sources.length > 0 ||
    institutions.length > 0 ||
    opportunities.length > 0
  ) {
    await runtime.client.begin(async (transaction) => {
      if (opportunities.length > 0) {
        await transaction`delete from opportunity_version_evidence where opportunity_version_id in (select id from opportunity_versions where opportunity_id in ${transaction(opportunities)})`;
        await transaction`delete from opportunity_source_bindings where opportunity_id in ${transaction(opportunities)}`;
        await transaction`delete from opportunity_versions where opportunity_id in ${transaction(opportunities)}`;
        await transaction`delete from opportunities where id in ${transaction(opportunities)}`;
      }
      if (sources.length > 0) {
        await transaction`delete from source_observations where source_id in ${transaction(sources)}`;
        await transaction`delete from source_snapshots where source_id in ${transaction(sources)}`;
        await transaction`delete from institution_source_bindings where source_id in ${transaction(sources)}`;
        await transaction`delete from sources where id in ${transaction(sources)}`;
      }
      if (institutions.length > 0) {
        await transaction`delete from institutions where id in ${transaction(institutions)}`;
      }
      if (adminUsers.length > 0) {
        await transaction`delete from admin_users where id in ${transaction(adminUsers)}`;
      }
    });
  }
  sourceIds.clear();
  institutionIds.clear();
  opportunityIds.clear();
  adminUserIds.clear();
});

afterAll(async () => {
  await fixture.close();
  await lockSql`select pg_advisory_unlock(hashtext('preppy-live-admission-persistence-tests'))`;
  await lockSql.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

describe("five-school reviewed Source promotion and collection", () => {
  it("reuses the canonical OFFICIAL_MAIN Source for a reviewed root URL", async () => {
    // Catches duplicate Source rows caused only by trailing-slash normalization.
    const seeded = await insertSeededInstitution();
    const rootUrl = `http://school.fixture.test:${fixture.port}/`;
    await runtime.client`
      update sources
      set canonical_url=${`http://school.fixture.test:${fixture.port}`}
      where id=${seeded.rootSourceId}
    `;

    const result = await collectReviewedAdmissionSource(
      {
        institutionId: seeded.institutionId,
        rootSourceId: seeded.rootSourceId,
        admissionUrl: rootUrl,
        sourceName: "Live Fixture School official website",
        sourceType: "OFFICIAL_SCHOOL_PAGE",
        institutionBindingRole: "ADMISSIONS",
      },
      collectionDependencies(),
    );
    sourceIds.add(result.sourceId);

    expect(result.sourceId).toBe(seeded.rootSourceId);
    const [stored] = await runtime.client<
      { source_count: number; roles: string[] }[]
    >`
      select count(distinct s.id)::int as source_count,
        array_agg(distinct b.role order by b.role) as roles
      from sources s
      join institution_source_bindings b on b.source_id=s.id
      where s.id=${seeded.rootSourceId}
    `;
    expect(stored).toEqual({
      source_count: 1,
      roles: ["ADMISSIONS", "OFFICIAL_MAIN"],
    });
  });

  it("promotes one reviewed same-domain admission URL and persists its official Snapshot and Observation", async () => {
    // Catches unreviewed bulk promotion or evidence attributed to the root Source.
    const seeded = await insertSeededInstitution();
    const admissionUrl = `http://school.fixture.test:${fixture.port}/admissions`;

    const result = await collectReviewedAdmissionSource(
      {
        institutionId: seeded.institutionId,
        rootSourceId: seeded.rootSourceId,
        admissionUrl,
        sourceName: "Live Fixture School admissions",
        sourceType: "OFFICIAL_ADMISSION_PAGE",
        institutionBindingRole: "ADMISSIONS",
      },
      collectionDependencies(),
    );
    sourceIds.add(result.sourceId);

    expect(result).toMatchObject({
      institutionId: seeded.institutionId,
      canonicalUrl: admissionUrl,
      collectedAt: "2026-08-29T03:04:05.000Z",
      pagesFetched: 1,
      snapshotCreated: true,
    });
    expect(result.snapshotId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.observationId).toMatch(/^[1-9]\d*$/);

    const [stored] = await runtime.client<
      {
        source_type: string;
        role: string;
        snapshot_source_id: string;
        observation_source_id: string;
      }[]
    >`
      select s.source_type, b.role,
        ss.source_id as snapshot_source_id,
        so.source_id as observation_source_id
      from sources s
      join institution_source_bindings b on b.source_id=s.id
      join source_snapshots ss on ss.source_id=s.id
      join source_observations so on so.source_id=s.id and so.snapshot_id=ss.id
      where s.id=${result.sourceId}
    `;
    expect(stored).toEqual({
      source_type: "OFFICIAL_ADMISSION_PAGE",
      role: "ADMISSIONS",
      snapshot_source_id: result.sourceId,
      observation_source_id: result.sourceId,
    });
    expect(
      fixture.requests.filter((entry) => entry.url === "/admissions"),
    ).toHaveLength(1);
  });
});

async function sideEffectCounts() {
  const [row] = await runtime.client<
    {
      outbox_events: number;
      notifications: number;
      notification_deliveries: number;
      notification_delivery_attempts: number;
    }[]
  >`
    select
      (select count(*)::int from outbox_events) as outbox_events,
      (select count(*)::int from notifications) as notifications,
      (select count(*)::int from notification_deliveries) as notification_deliveries,
      (select count(*)::int from notification_delivery_attempts) as notification_delivery_attempts
  `;
  return row!;
}

describe("five-school automatic canonical preparation", () => {
  it("creates only DRAFT and UNVERIFIED truth with exact evidence and no product side effects", async () => {
    // Catches accidental auto-verification, public exposure, or notification publication.
    const seeded = await insertSeededInstitution();
    const admissionUrl = `http://school.fixture.test:${fixture.port}/admissions`;
    const collection = await collectReviewedAdmissionSource(
      {
        institutionId: seeded.institutionId,
        rootSourceId: seeded.rootSourceId,
        admissionUrl,
        sourceName: "Live Fixture School admissions",
        sourceType: "OFFICIAL_ADMISSION_PAGE",
        institutionBindingRole: "ADMISSIONS",
      },
      collectionDependencies(),
    );
    sourceIds.add(collection.sourceId);
    const proposal = extractLiveAdmissionProposal({
      html: "<title>2027학년도 입학 안내</title><p>원서접수 2026년 10월 5일 ~ 2026년 10월 9일</p>",
      sourceUrl: admissionUrl,
      classificationHint: "ADMISSIONS",
      targetAcademicYearLabel: "2027학년도",
      referenceTime: new Date("2026-08-29T00:00:00.000Z"),
    });
    const before = await sideEffectCounts();

    const prepared = await prepareLiveAdmissionDraft(
      {
        institutionId: seeded.institutionId,
        sourceId: collection.sourceId,
        observationId: collection.observationId,
        snapshotId: collection.snapshotId,
        proposal,
      },
      {
        transactionManager: runtime.transactionManager,
        now: () => new Date("2026-08-29T03:05:00.000Z"),
      },
    );
    opportunityIds.add(prepared.opportunityId);

    const [stored] = await runtime.client<
      {
        opportunity_state: string;
        truth_mode: string;
        verification_state: string;
        is_current: boolean;
        verified_at: Date | string | null;
        verified_by_admin_id: string | null;
        evidence_source_id: string;
        source_observation_id: string;
        source_snapshot_id: string;
        public_rows: number;
      }[]
    >`
      select o.publication_state as opportunity_state, o.truth_mode,
        v.verification_state, v.is_current, v.verified_at,
        v.verified_by_admin_id, e.source_id as evidence_source_id,
        e.source_observation_id::text, e.source_snapshot_id,
        (
          select count(*)::int from opportunities public_o
          join institutions public_i on public_i.id=public_o.institution_id
          join opportunity_versions public_v on public_v.opportunity_id=public_o.id
          where public_o.id=o.id
            and public_i.publication_state='PUBLISHED'
            and public_o.publication_state='PUBLISHED'
            and public_v.is_current=true
            and public_v.verification_state='VERIFIED'
        ) as public_rows
      from opportunities o
      join opportunity_versions v on v.opportunity_id=o.id
      join opportunity_version_evidence e on e.opportunity_version_id=v.id
      where o.id=${prepared.opportunityId}
    `;
    expect(stored).toEqual({
      opportunity_state: "DRAFT",
      truth_mode: "NATIVE",
      verification_state: "UNVERIFIED",
      is_current: false,
      verified_at: null,
      verified_by_admin_id: null,
      evidence_source_id: collection.sourceId,
      source_observation_id: collection.observationId,
      source_snapshot_id: collection.snapshotId,
      public_rows: 0,
    });
    expect(prepared).toMatchObject({
      institutionId: seeded.institutionId,
      sourceId: collection.sourceId,
      observationId: collection.observationId,
      snapshotId: collection.snapshotId,
      versionNumber: 1,
      created: true,
    });
    expect(prepared.contentFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(await sideEffectCounts()).toEqual(before);
  });
});

describe("five-school explicit local operator review", () => {
  it("supersedes extracted v1, verifies v2 at review time, then publishes with zero side effects", async () => {
    // Catches collector time copied into verification or publication before verified truth.
    const seeded = await insertSeededInstitution();
    const admissionUrl = `http://school.fixture.test:${fixture.port}/admissions`;
    const collection = await collectReviewedAdmissionSource(
      {
        institutionId: seeded.institutionId,
        rootSourceId: seeded.rootSourceId,
        admissionUrl,
        sourceName: "Live Fixture School admissions",
        sourceType: "OFFICIAL_ADMISSION_PAGE",
        institutionBindingRole: "ADMISSIONS",
      },
      collectionDependencies(),
    );
    sourceIds.add(collection.sourceId);
    const proposal = extractLiveAdmissionProposal({
      html: "<title>2027학년도 입학 안내</title><p>원서접수 2026년 10월 5일 ~ 2026년 10월 9일</p>",
      sourceUrl: admissionUrl,
      classificationHint: "ADMISSIONS",
      targetAcademicYearLabel: "2027학년도",
      referenceTime: new Date("2026-08-29T00:00:00.000Z"),
    });
    const prepared = await prepareLiveAdmissionDraft(
      {
        institutionId: seeded.institutionId,
        sourceId: collection.sourceId,
        observationId: collection.observationId,
        snapshotId: collection.snapshotId,
        proposal,
      },
      {
        transactionManager: runtime.transactionManager,
        now: () => new Date("2026-08-29T03:05:00.000Z"),
      },
    );
    opportunityIds.add(prepared.opportunityId);
    const operatorAdminId = randomUUID();
    adminUserIds.add(operatorAdminId);
    await runtime.client`
      insert into admin_users (
        id, external_auth_subject, email, display_name, status
      ) values (
        ${operatorAdminId}, ${`local-review-${operatorAdminId}`},
        ${`local-review-${operatorAdminId}@example.invalid`},
        'Local Five School Reviewer', 'ACTIVE'
      )
    `;
    const before = await sideEffectCounts();

    const reviewed = await reviewAndPublishLiveAdmissionDraft(
      {
        institutionId: prepared.institutionId,
        opportunityId: prepared.opportunityId,
        expectedVersionId: prepared.versionId,
        expectedContentFingerprint: prepared.contentFingerprint,
        sourceId: prepared.sourceId,
        observationId: prepared.observationId,
        snapshotId: prepared.snapshotId,
        operatorAdminId,
        approvedProposal: proposal,
      },
      {
        transactionManager: runtime.transactionManager,
        now: () => new Date("2026-08-29T05:06:07.000Z"),
      },
    );

    expect(reviewed).toMatchObject({
      institutionId: seeded.institutionId,
      opportunityId: prepared.opportunityId,
      supersededVersionId: prepared.versionId,
      verifiedVersionNumber: 2,
      lastCollectedAt: "2026-08-29T03:04:05.000Z",
      lastVerifiedAt: "2026-08-29T05:06:07.000Z",
      institutionPublicationState: "PUBLISHED",
      opportunityPublicationState: "PUBLISHED",
      sideEffectDelta: {
        outboxEvents: 0,
        notifications: 0,
        notificationDeliveries: 0,
        notificationDeliveryAttempts: 0,
      },
    });
    expect(reviewed.verifiedVersionId).not.toBe(prepared.versionId);

    const versions = await runtime.client<
      {
        id: string;
        version_number: number;
        verification_state: string;
        is_current: boolean;
        supersedes_version_id: string | null;
        verified_at: string | null;
        verified_by_admin_id: string | null;
        evidence_count: number;
      }[]
    >`
      select v.id, v.version_number, v.verification_state, v.is_current,
        v.supersedes_version_id, v.verified_at, v.verified_by_admin_id,
        (select count(*)::int from opportunity_version_evidence e
          where e.opportunity_version_id=v.id
            and e.source_id=${collection.sourceId}
            and e.source_observation_id=${collection.observationId}::bigint
            and e.source_snapshot_id=${collection.snapshotId}) as evidence_count
      from opportunity_versions v
      where v.opportunity_id=${prepared.opportunityId}
      order by v.version_number
    `;
    const normalizedVersions = versions.map((version) => ({
      ...version,
      verified_at:
        version.verified_at === null
          ? null
          : new Date(version.verified_at).toISOString(),
    }));
    expect(normalizedVersions).toEqual([
      {
        id: prepared.versionId,
        version_number: 1,
        verification_state: "SUPERSEDED",
        is_current: false,
        supersedes_version_id: null,
        verified_at: null,
        verified_by_admin_id: null,
        evidence_count: 1,
      },
      {
        id: reviewed.verifiedVersionId,
        version_number: 2,
        verification_state: "VERIFIED",
        is_current: true,
        supersedes_version_id: prepared.versionId,
        verified_at: "2026-08-29T05:06:07.000Z",
        verified_by_admin_id: operatorAdminId,
        evidence_count: 1,
      },
    ]);
    expect(await sideEffectCounts()).toEqual(before);
  });
});
