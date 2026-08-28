import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";

import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { parseHttpCollectorPolicy } from "@/src/modules/http-collector/contracts";
import { createNodeHttpTransport } from "@/src/modules/http-collector/http-transport.server";
import {
  CollectorEligibilityError,
  loadEligibleOfficialMainSources,
} from "@/src/modules/http-collector/repository.server";
import { collectExplicitSources } from "@/src/modules/http-collector/service.server";
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

let fixture: HttpCollectorFixture;
let rootBody =
  '<main><h1>Welcome school</h1><a href="/candidate">Admissions</a></main>';
let rootStatus = 200;
let rootContentType = "text/html; charset=utf-8";
let gzipLevel: 0 | 9 = 0;

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function insertEligibleSource(
  options: Readonly<{
    path?: string;
    canonicalUrl?: string;
    bindingRole?: string;
    bindingActive?: boolean;
    sourceType?: string;
    sourceLifecycle?: string;
    monitor?: Readonly<{
      enabled: boolean;
      strategy: string;
      browserRequired: boolean;
    }>;
  }> = {},
) {
  const institutionId = randomUUID();
  const sourceId = randomUUID();
  institutionIds.add(institutionId);
  sourceIds.add(sourceId);
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, operational_state, publication_state
    ) values (
      ${institutionId}, ${`collector-${institutionId}`}, 'Collector Fixture School',
      'PRIVATE_ELEMENTARY', 'ACTIVE', 'DRAFT'
    )
  `;
  const canonicalUrl =
    options.canonicalUrl ??
    `http://school.fixture.test:${fixture.port}${options.path ?? `/root-${sourceId}`}`;
  await runtime.client`
    insert into sources (
      id, canonical_url, source_type, authority_level, lifecycle_status,
      source_name, requires_js, content_type_hint
    ) values (
      ${sourceId}, ${canonicalUrl}, ${options.sourceType ?? "OFFICIAL_SCHOOL_PAGE"},
      'PRIMARY', ${options.sourceLifecycle ?? "ACTIVE"}, 'Collector Fixture Root',
      false, 'text/html'
    )
  `;
  await runtime.client`
    insert into institution_source_bindings (
      institution_id, source_id, role, is_primary, is_active, unbound_at
    ) values (
      ${institutionId}, ${sourceId}, ${options.bindingRole ?? "OFFICIAL_MAIN"},
      true, ${options.bindingActive ?? true},
      ${(options.bindingActive ?? true) ? null : "2026-08-28T00:00:00.000Z"}
    )
  `;
  if (options.monitor) {
    await runtime.client`
      insert into source_monitor_configs (
        source_id, collection_strategy, monitoring_profile,
        browser_required, is_enabled
      ) values (
        ${sourceId}, ${options.monitor.strategy}, 'LOW_CHANGE',
        ${options.monitor.browserRequired}, ${options.monitor.enabled}
      )
    `;
  }
  return { institutionId, sourceId, canonicalUrl };
}

async function evidenceCounts(sourceId: string) {
  const [row] = await runtime.client<
    { snapshots: number; observations: number }[]
  >`
    select
      (select count(*)::int from source_snapshots where source_id=${sourceId}) as snapshots,
      (select count(*)::int from source_observations where source_id=${sourceId}) as observations
  `;
  return row!;
}

async function productCounts() {
  const [row] = await runtime.client<Record<string, number>[]>`
    select
      (select count(*)::int from institution_facts) as institution_facts,
      (select count(*)::int from institution_fact_versions) as institution_fact_versions,
      (select count(*)::int from opportunities) as opportunities,
      (select count(*)::int from opportunity_versions) as opportunity_versions,
      (select count(*)::int from detected_changes) as detected_changes,
      (select count(*)::int from meaningful_changes) as meaningful_changes,
      (select count(*)::int from outbox_events) as outbox_events,
      (select count(*)::int from notifications) as notifications,
      (select count(*)::int from notification_deliveries) as notification_deliveries
  `;
  return row!;
}

beforeAll(async () => {
  await lockSql`select pg_advisory_lock(hashtext('preppy-http-collector-persistence-tests'))`;
  await migrateDatabase(databaseUrl);
  fixture = await startHttpCollectorFixture((request, response) => {
    const path = request.url ?? "/";
    if (path === "/robots.txt") {
      response
        .writeHead(200, { "content-type": "text/plain" })
        .end("User-agent: *\nAllow: /\n");
      return;
    }
    if (path === "/redirect-root") {
      response.writeHead(302, { location: "/root" }).end();
      return;
    }
    if (path === "/redirect-effective-origin") {
      response
        .writeHead(302, {
          location: `http://www.school.fixture.test:${fixture.port}/root`,
        })
        .end("redirect evidence");
      return;
    }
    if (path === "/redirect-external-evidence") {
      response
        .writeHead(302, {
          location: `http://external.fixture.test:${fixture.port}/never`,
        })
        .end("persisted redirect evidence");
      return;
    }
    if (path === "/candidate") {
      response
        .writeHead(200, { "content-type": "text/html" })
        .end("<p>Ephemeral candidate body</p>");
      return;
    }
    if (path === "/status/404") {
      response
        .writeHead(404, { "content-type": "text/html; charset=utf-8" })
        .end("missing");
      return;
    }
    if (path.startsWith("/batch-root-")) {
      response
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end("<p>batch</p>");
      return;
    }
    if (path === "/gzip-root") {
      const encoded = gzipSync(Buffer.from(rootBody), { level: gzipLevel });
      response
        .writeHead(rootStatus, {
          "content-type": rootContentType,
          "content-encoding": "gzip",
          "content-length": String(encoded.length),
        })
        .end(encoded);
      return;
    }
    response
      .writeHead(rootStatus, { "content-type": rootContentType })
      .end(rootBody);
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  const ids = [...sourceIds];
  const institutions = [...institutionIds];
  if (ids.length > 0) {
    await runtime.client.begin(async (transaction) => {
      await transaction`delete from source_observations where source_id in ${transaction(ids)}`;
      await transaction`delete from source_snapshots where source_id in ${transaction(ids)}`;
      await transaction`delete from source_monitor_configs where source_id in ${transaction(ids)}`;
      await transaction`delete from institution_source_bindings where source_id in ${transaction(ids)}`;
      await transaction`delete from sources where id in ${transaction(ids)}`;
      await transaction`delete from institutions where id in ${transaction(institutions)}`;
    });
  }
  sourceIds.clear();
  institutionIds.clear();
  rootBody =
    '<main><h1>Welcome school</h1><a href="/candidate">Admissions</a></main>';
  rootStatus = 200;
  rootContentType = "text/html; charset=utf-8";
  gzipLevel = 0;
});

afterAll(async () => {
  await fixture.close();
  await lockSql`select pg_advisory_unlock(hashtext('preppy-http-collector-persistence-tests'))`;
  await lockSql.end({ timeout: 5 });
  await closeRuntimeDatabase();
});

function collectionDependencies() {
  return {
    executor: runtime.executor,
    transactionManager: runtime.transactionManager,
    baseTransport: createNodeHttpTransport({
      resolver: async () => [{ address: "127.0.0.1", family: 4 }],
      assertAddressSafe: () => undefined,
      now: () => new Date("2026-08-28T02:03:04.000Z"),
    }),
    now: () => new Date("2026-08-28T02:03:04.000Z"),
    sleep: async () => undefined,
    clockMs: () => 0,
  };
}

describe("explicit OFFICIAL_MAIN eligibility", () => {
  it("allows absent monitor config but rejects a present disabled/non-HTTP/browser config", async () => {
    const absent = await insertEligibleSource();
    await expect(
      loadEligibleOfficialMainSources(runtime.executor, [absent.sourceId]),
    ).resolves.toMatchObject([{ sourceId: absent.sourceId }]);

    for (const monitor of [
      { enabled: false, strategy: "HTTP", browserRequired: false },
      { enabled: true, strategy: "BROWSER", browserRequired: false },
      { enabled: true, strategy: "HTTP", browserRequired: true },
    ]) {
      const fixtureSource = await insertEligibleSource({ monitor });
      await expect(
        loadEligibleOfficialMainSources(runtime.executor, [
          fixtureSource.sourceId,
        ]),
      ).rejects.toBeInstanceOf(CollectorEligibilityError);
    }
  });

  it("rejects inactive/wrong-role bindings and wrong Source type/lifecycle", async () => {
    for (const options of [
      { bindingActive: false },
      { bindingRole: "ADMISSIONS" },
      { sourceType: "OTHER" },
      { sourceLifecycle: "PAUSED" },
    ]) {
      const source = await insertEligibleSource(options);
      await expect(
        loadEligibleOfficialMainSources(runtime.executor, [source.sourceId]),
      ).rejects.toMatchObject({ code: "SOURCE_NOT_ELIGIBLE" });
    }
  });
});

describe("root-only collector persistence", () => {
  it("keeps default dry-run free of Snapshot and Observation writes", async () => {
    const source = await insertEligibleSource();
    const result = await collectExplicitSources(
      {
        sourceIds: [source.sourceId],
        mode: "dry-run",
        policy: parseHttpCollectorPolicy({ minimumHostDelayMs: 0 }),
      },
      collectionDependencies(),
    );
    expect(result).toMatchObject({
      mode: "dry-run",
      applied: false,
      persistence: [],
    });
    expect(await evidenceCounts(source.sourceId)).toEqual({
      snapshots: 0,
      observations: 0,
    });
  });

  it("persists root evidence, dedupes identical content, classifies changes, and leaves Product tables untouched", async () => {
    const source = await insertEligibleSource();
    const baseline = await productCounts();
    const policy = parseHttpCollectorPolicy({ minimumHostDelayMs: 0 });

    const first = await collectExplicitSources(
      { sourceIds: [source.sourceId], mode: "apply", policy },
      collectionDependencies(),
    );
    expect(first).toMatchObject({ mode: "apply", applied: true });
    expect(await evidenceCounts(source.sourceId)).toEqual({
      snapshots: 1,
      observations: 1,
    });
    const [firstSnapshot] = await runtime.client<
      {
        id: string;
        raw_body: Buffer;
        content_hash: string;
        text_hash: string;
      }[]
    >`
      select id, raw_body, content_hash, text_hash
      from source_snapshots where source_id=${source.sourceId}
    `;
    expect(firstSnapshot?.raw_body).toEqual(Buffer.from(rootBody));
    expect(firstSnapshot?.content_hash).toBe(sha256(Buffer.from(rootBody)));
    expect(firstSnapshot?.text_hash).toBe(sha256("Welcome school Admissions"));
    const [firstObservation] = await runtime.client<
      {
        outcome: string;
        snapshot_id: string;
        metadata: Record<string, unknown>;
      }[]
    >`
      select outcome, snapshot_id, metadata
      from source_observations where source_id=${source.sourceId} order by id desc limit 1
    `;
    expect(firstObservation).toMatchObject({
      outcome: "SUCCESS",
      snapshot_id: firstSnapshot?.id,
      metadata: {
        collectorVersion: "preppy-static-http/1.0",
        fetchClassification: "FETCH_SUCCESS",
        changeClassification: null,
      },
    });
    expect(JSON.stringify(firstObservation?.metadata)).not.toContain(
      "Welcome school",
    );

    await collectExplicitSources(
      { sourceIds: [source.sourceId], mode: "apply", policy },
      collectionDependencies(),
    );
    expect(await evidenceCounts(source.sourceId)).toEqual({
      snapshots: 1,
      observations: 2,
    });
    const [unchanged] = await runtime.client<
      { outcome: string; snapshot_id: string }[]
    >`select outcome, snapshot_id from source_observations
       where source_id=${source.sourceId} order by id desc limit 1`;
    expect(unchanged).toEqual({
      outcome: "UNCHANGED",
      snapshot_id: firstSnapshot?.id,
    });

    rootBody =
      '<div>Welcome school <span><a href="/candidate">Admissions</a></span></div>';
    await collectExplicitSources(
      { sourceIds: [source.sourceId], mode: "apply", policy },
      collectionDependencies(),
    );
    expect(await evidenceCounts(source.sourceId)).toEqual({
      snapshots: 2,
      observations: 3,
    });
    const [markup] = await runtime.client<
      { outcome: string; metadata: Record<string, unknown> }[]
    >`select outcome, metadata from source_observations
       where source_id=${source.sourceId} order by id desc limit 1`;
    expect(markup).toMatchObject({
      outcome: "CHANGED",
      metadata: { changeClassification: "MARKUP_ONLY" },
    });

    rootBody =
      '<div>Welcome schools <span><a href="/candidate">Admissions</a></span></div>';
    await collectExplicitSources(
      { sourceIds: [source.sourceId], mode: "apply", policy },
      collectionDependencies(),
    );
    expect(await evidenceCounts(source.sourceId)).toEqual({
      snapshots: 3,
      observations: 4,
    });
    const [textChanged] = await runtime.client<
      { outcome: string; metadata: Record<string, unknown> }[]
    >`select outcome, metadata from source_observations
       where source_id=${source.sourceId} order by id desc limit 1`;
    expect(textChanged).toMatchObject({
      outcome: "CHANGED",
      metadata: { changeClassification: "TEXT_CHANGED" },
    });

    rootStatus = 500;
    await collectExplicitSources(
      { sourceIds: [source.sourceId], mode: "apply", policy },
      collectionDependencies(),
    );
    expect(await evidenceCounts(source.sourceId)).toEqual({
      snapshots: 3,
      observations: 5,
    });
    const [failed] = await runtime.client<
      { outcome: string; error_code: string; snapshot_id: string | null }[]
    >`select outcome, error_code, snapshot_id from source_observations
       where source_id=${source.sourceId} order by id desc limit 1`;
    expect(failed).toEqual({
      outcome: "ACCESS_ERROR",
      error_code: "HTTP_5XX",
      snapshot_id: null,
    });

    expect(await productCounts()).toEqual(baseline);
  });

  it("stores and hashes decoded gzip entity bytes rather than transfer bytes", async () => {
    const source = await insertEligibleSource({ path: "/gzip-root" });
    await collectExplicitSources(
      {
        sourceIds: [source.sourceId],
        mode: "apply",
        policy: parseHttpCollectorPolicy({ minimumHostDelayMs: 0 }),
      },
      collectionDependencies(),
    );
    const [snapshot] = await runtime.client<
      { raw_body: Buffer; content_hash: string }[]
    >`
      select raw_body, content_hash from source_snapshots
      where source_id=${source.sourceId}
    `;
    expect(snapshot?.raw_body).toEqual(Buffer.from(rootBody));
    expect(snapshot?.raw_body).not.toEqual(gzipSync(Buffer.from(rootBody)));
    expect(snapshot?.content_hash).toBe(sha256(Buffer.from(rootBody)));
  });

  it("dedupes the same decoded entity across different gzip compression levels", async () => {
    const source = await insertEligibleSource({ path: "/gzip-root" });
    const policy = parseHttpCollectorPolicy({ minimumHostDelayMs: 0 });
    gzipLevel = 0;
    await collectExplicitSources(
      { sourceIds: [source.sourceId], mode: "apply", policy },
      collectionDependencies(),
    );
    gzipLevel = 9;
    await collectExplicitSources(
      { sourceIds: [source.sourceId], mode: "apply", policy },
      collectionDependencies(),
    );

    expect(await evidenceCounts(source.sourceId)).toEqual({
      snapshots: 1,
      observations: 2,
    });
    const snapshots = await runtime.client<
      { raw_body: Buffer; content_hash: string }[]
    >`
      select raw_body, content_hash from source_snapshots
      where source_id=${source.sourceId}
    `;
    expect(snapshots).toEqual([
      {
        raw_body: Buffer.from(rootBody),
        content_hash: sha256(Buffer.from(rootBody)),
      },
    ]);
    const observations = await runtime.client<{ outcome: string }[]>`
      select outcome from source_observations
      where source_id=${source.sourceId} order by observed_at, created_at, id
    `;
    expect(observations).toEqual([
      { outcome: "SUCCESS" },
      { outcome: "UNCHANGED" },
    ]);
  });

  it("keeps same-domain root redirects as evidence without mutating Source canonical URL", async () => {
    const source = await insertEligibleSource({ path: "/redirect-root" });
    await collectExplicitSources(
      {
        sourceIds: [source.sourceId],
        mode: "apply",
        policy: parseHttpCollectorPolicy({ minimumHostDelayMs: 0 }),
      },
      collectionDependencies(),
    );
    const [row] = await runtime.client<
      {
        canonical_url: string;
        final_url: string;
        metadata: Record<string, unknown>;
      }[]
    >`
      select source.canonical_url, observation.final_url, observation.metadata
      from sources source
      join source_observations observation on observation.source_id=source.id
      where source.id=${source.sourceId}
    `;
    expect(row).toMatchObject({
      canonical_url: source.canonicalUrl,
      final_url: `http://school.fixture.test:${fixture.port}/root`,
      metadata: {
        requestedUrl: source.canonicalUrl,
        redirectChain: [expect.objectContaining({ status: 302 })],
      },
    });
  });

  it("persists the decoded redirect failure body length in Observation evidence", async () => {
    const source = await insertEligibleSource({
      path: "/redirect-external-evidence",
    });
    const before = fixture.requests.length;
    const run = await collectExplicitSources(
      {
        sourceIds: [source.sourceId],
        mode: "apply",
        policy: parseHttpCollectorPolicy({ minimumHostDelayMs: 0 }),
      },
      collectionDependencies(),
    );
    expect(run.persistence).toEqual([
      expect.objectContaining({
        sourceId: source.sourceId,
        outcome: "ACCESS_ERROR",
        errorCode: "REDIRECT_EXTERNAL_HOST",
      }),
    ]);
    const [observation] = await runtime.client<
      { outcome: string; error_code: string; response_bytes: number }[]
    >`
      select outcome, error_code, response_bytes::int
      from source_observations
      where source_id=${source.sourceId}
    `;
    expect(observation).toEqual({
      outcome: "ACCESS_ERROR",
      error_code: "REDIRECT_EXTERNAL_HOST",
      response_bytes: Buffer.byteLength("persisted redirect evidence"),
    });
    expect(
      fixture.requests.slice(before).map((request) => request.url),
    ).not.toContain("/never");
  });

  it("persists bounded ordered robots decisions for each effective redirect origin", async () => {
    const source = await insertEligibleSource({
      path: "/redirect-effective-origin",
    });
    await collectExplicitSources(
      {
        sourceIds: [source.sourceId],
        mode: "apply",
        policy: parseHttpCollectorPolicy({ minimumHostDelayMs: 0 }),
      },
      collectionDependencies(),
    );
    const [row] = await runtime.client<
      { metadata: { robotsDecisions: Record<string, unknown>[] } }[]
    >`
      select metadata from source_observations
      where source_id=${source.sourceId}
    `;
    expect(row?.metadata.robotsDecisions).toEqual([
      expect.objectContaining({
        origin: `http://school.fixture.test:${fixture.port}`,
        decision: "ALLOW",
      }),
      expect.objectContaining({
        origin: `http://www.school.fixture.test:${fixture.port}`,
        decision: "ALLOW",
      }),
    ]);
    expect(row?.metadata.robotsDecisions).toHaveLength(2);
    expect(JSON.stringify(row?.metadata.robotsDecisions)).not.toContain(
      "redirect evidence",
    );
  });

  it("uses the latest successful Observation as current state across A to B to A to A", async () => {
    const source = await insertEligibleSource();
    const policy = parseHttpCollectorPolicy({ minimumHostDelayMs: 0 });
    const a =
      '<main><h1>State A</h1><a href="/candidate">Admissions</a></main>';
    const b =
      '<main><h1>State B</h1><a href="/candidate">Admissions</a></main>';

    for (const body of [a, b, a, a]) {
      rootBody = body;
      await collectExplicitSources(
        { sourceIds: [source.sourceId], mode: "apply", policy },
        collectionDependencies(),
      );
    }

    expect(await evidenceCounts(source.sourceId)).toEqual({
      snapshots: 2,
      observations: 4,
    });
    const observations = await runtime.client<
      { outcome: string; snapshot_id: string }[]
    >`
      select outcome, snapshot_id
      from source_observations
      where source_id=${source.sourceId}
      order by id
    `;
    expect(observations.map((observation) => observation.outcome)).toEqual([
      "SUCCESS",
      "CHANGED",
      "CHANGED",
      "UNCHANGED",
    ]);
    expect(observations[2]?.snapshot_id).toBe(observations[0]?.snapshot_id);
    expect(observations[3]?.snapshot_id).toBe(observations[0]?.snapshot_id);
  });

  it("persists a 404 root as NOT_FOUND without a Snapshot", async () => {
    const source = await insertEligibleSource({ path: "/status/404" });
    const run = await collectExplicitSources(
      {
        sourceIds: [source.sourceId],
        mode: "apply",
        policy: parseHttpCollectorPolicy({ minimumHostDelayMs: 0 }),
      },
      collectionDependencies(),
    );

    expect(run.persistence).toEqual([
      expect.objectContaining({
        sourceId: source.sourceId,
        outcome: "NOT_FOUND",
        errorCode: "HTTP_4XX",
        snapshotId: null,
        snapshotCreated: false,
      }),
    ]);
    expect(await evidenceCounts(source.sourceId)).toEqual({
      snapshots: 0,
      observations: 1,
    });
    const [observation] = await runtime.client<
      {
        outcome: string;
        error_code: string;
        metadata: Record<string, unknown>;
      }[]
    >`
      select outcome, error_code, metadata
      from source_observations
      where source_id=${source.sourceId}
    `;
    expect(observation).toMatchObject({
      outcome: "NOT_FOUND",
      error_code: "HTTP_4XX",
      metadata: { fetchClassification: "FETCH_FAILED" },
    });
  });

  it("isolates an invalid canonical URL between two valid explicit Sources", async () => {
    const first = await insertEligibleSource();
    const invalid = await insertEligibleSource({
      canonicalUrl: "not a valid collector URL",
    });
    const third = await insertEligibleSource();
    const baseline = await productCounts();
    const transactionSpy = vi.spyOn(runtime.transactionManager, "run");

    const run = await collectExplicitSources(
      {
        sourceIds: [first.sourceId, invalid.sourceId, third.sourceId],
        mode: "apply",
        policy: parseHttpCollectorPolicy({ minimumHostDelayMs: 0 }),
      },
      collectionDependencies(),
    );

    expect(
      run.sources.map((source) =>
        source.root.kind === "SUCCESS" ? "SUCCESS" : source.root.code,
      ),
    ).toEqual(["SUCCESS", "INVALID_URL", "SUCCESS"]);
    expect(run.persistence).toEqual([
      expect.objectContaining({ sourceId: first.sourceId, outcome: "SUCCESS" }),
      expect.objectContaining({
        sourceId: invalid.sourceId,
        outcome: "ACCESS_ERROR",
        errorCode: "INVALID_URL",
        snapshotId: null,
      }),
      expect.objectContaining({ sourceId: third.sourceId, outcome: "SUCCESS" }),
    ]);
    expect(await evidenceCounts(first.sourceId)).toEqual({
      snapshots: 1,
      observations: 1,
    });
    expect(await evidenceCounts(invalid.sourceId)).toEqual({
      snapshots: 0,
      observations: 1,
    });
    expect(await evidenceCounts(third.sourceId)).toEqual({
      snapshots: 1,
      observations: 1,
    });
    expect(await productCounts()).toEqual(baseline);
    expect(transactionSpy).toHaveBeenCalledTimes(3);
  });

  it("shares one decoded-byte ledger across a ten-Source run and stops at exhaustion", async () => {
    const sources = [];
    for (let index = 0; index < 10; index += 1) {
      sources.push(
        await insertEligibleSource({ path: `/batch-root-${index}` }),
      );
    }

    const run = await collectExplicitSources(
      {
        sourceIds: sources.map((source) => source.sourceId),
        mode: "dry-run",
        policy: parseHttpCollectorPolicy({
          minimumHostDelayMs: 0,
          maxResponseBytesPerPage: 64,
          maxTotalBytesPerRun: 100,
        }),
      },
      collectionDependencies(),
    );

    expect(run.sources.length).toBeLessThan(10);
    expect(run.persistence).toEqual([]);
    expect(run.runBudget).toMatchObject({
      maximumBytes: 100,
      remainingBytes: 0,
      exhausted: true,
      exceeded: true,
    });
    expect(run.runBudget.consumedBytes).toBeGreaterThan(100);
    expect(run.runBudget.consumedBytes).toBeLessThanOrEqual(164);
  });
});
