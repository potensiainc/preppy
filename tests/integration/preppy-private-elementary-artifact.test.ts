import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import { migrateDatabase } from "@/src/db/migrate";
import {
  getRuntimeDatabase,
  closeRuntimeDatabase,
  type RuntimeDatabaseResources,
} from "@/src/infrastructure/db/runtime.server";
import {
  loadPrivateElementaryBootstrapTargets,
  PRIVATE_ELEMENTARY_SEED_PATH,
} from "@/src/modules/institution-detail-bootstrap/contracts";
import { createBootstrapArtifact } from "@/src/modules/institution-detail-bootstrap/artifact.server";
import {
  runBootstrapArtifacts,
  readBootstrapArtifactCounts,
  bootstrapApprovalChecksum,
} from "@/src/modules/institution-detail-bootstrap/artifact-runner.server";
import {
  artifactTestCollection,
  artifactTestTime,
} from "@/tests/support/private-elementary-artifact";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const testUrl = process.env.TEST_DATABASE_URL!;
if (!testUrl) throw new Error("TEST_DATABASE_URL required");
assertDedicatedTestDatabaseUrl(testUrl);
const databaseName = `preppy_artifact_${randomUUID().replaceAll("-", "")}_test`;
const isolatedUrl = new URL(testUrl);
isolatedUrl.pathname = `/${databaseName}`;
const maintenance = postgres(testUrl, { max: 1 });
let runtime: RuntimeDatabaseResources;
let loaded: Awaited<ReturnType<typeof loadPrivateElementaryBootstrapTargets>>;

beforeAll(async () => {
  await maintenance`create database ${maintenance(databaseName)}`;
  await migrateDatabase(isolatedUrl.href);
  runtime = getRuntimeDatabase({
    DATABASE_URL: isolatedUrl.href,
    DATABASE_MAX_CONNECTIONS: 2,
    NODE_ENV: "test",
  });
  const seed = await loadPrivateElementaryBootstrapTargets(
    resolve(PRIVATE_ELEMENTARY_SEED_PATH),
  );
  loaded = {
    ...seed,
    targets: seed.targets.map((t) => ({
      ...t,
      institutionId: t.institutionId ?? randomUUID(),
    })),
  };
  for (const target of loaded.targets)
    await runtime.client`
    insert into institutions (id,slug,display_name,category,operational_state,publication_state,region_code,address_line,website_url,published_at)
    values (${target.institutionId!},${target.slug},${target.institutionName},'PRIVATE_ELEMENTARY','ACTIVE','PUBLISHED',${target.regionCode},${target.address},${target.websiteUrl},now())`;
});
afterAll(async () => {
  await closeRuntimeDatabase();
  await maintenance`drop database if exists ${maintenance(databaseName)}`;
  await maintenance.end({ timeout: 5 });
});
function artifact(slug: string) {
  return createBootstrapArtifact(
    artifactTestCollection(loaded.targets.find((t) => t.slug === slug)!),
    loaded.seedSha256,
    artifactTestTime,
  );
}
function run(values: readonly unknown[], mode: "dry-run" | "apply") {
  return runBootstrapArtifacts(values, {
    mode,
    executor: runtime.executor,
    transactionManager: runtime.transactionManager,
    allowlist: loaded.targets,
    seedSha256: loaded.seedSha256,
    expectedArtifactChecksum: bootstrapApprovalChecksum(values),
    now: () => new Date("2026-08-30T08:01:00.000Z"),
  });
}

describe("offline artifact canonical persistence", () => {
  it("rejects replacement of an approved artifact before any database write", async () => {
    const approved = artifact("lila");
    const replaced = artifact("kyonggi");
    const before = await readBootstrapArtifactCounts(runtime.executor);
    await expect(
      runBootstrapArtifacts([replaced], {
        mode: "apply",
        executor: runtime.executor,
        transactionManager: runtime.transactionManager,
        allowlist: loaded.targets,
        seedSha256: loaded.seedSha256,
        expectedArtifactChecksum: approved.artifactChecksum,
        now: () => artifactTestTime,
      }),
    ).rejects.toThrow();
    expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(before);
  });
  it("dry-runs with zero writes, reuses baseline, and idempotently persists provenance without HTTP", async () => {
    const input = artifact("lila");
    const baseline = artifactTestCollection(
      loaded.targets.find((t) => t.slug === "lila")!,
    );
    const baselineArtifact = createBootstrapArtifact(
      {
        ...baseline,
        status: "SCHOOL_FETCH_FAILED",
        pages: [],
        facts: baseline.facts.slice(0, 2),
        admission: null,
      },
      loaded.seedSha256,
      artifactTestTime,
    );
    const httpRequest = vi.spyOn(http, "request").mockImplementation(() => {
      throw new Error("Offline persistence cannot fetch");
    });
    const httpsRequest = vi.spyOn(https, "request").mockImplementation(() => {
      throw new Error("Offline persistence cannot fetch");
    });
    syncBuiltinESMExports();
    try {
      const before = await readBootstrapArtifactCounts(runtime.executor);
      const dry = await run([input], "dry-run");
      expect(dry).toMatchObject({
        selected: 1,
        artifactsValid: 1,
        artifactsRejected: 0,
        schoolsPersisted: 0,
        databaseWrites: 0,
      });
      expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(
        before,
      );
      await run([baselineArtifact], "apply");
      const first = await run([input], "apply");
      expect(first).toMatchObject({
        schoolsPersisted: 1,
        schoolsFailed: 0,
        factsPersisted: 3,
      });
      expect(first.records[0]?.created).toMatchObject({
        facts: 1,
        factVersions: 1,
        opportunities: 1,
        opportunityVersions: 1,
      });
      const afterFirst = await readBootstrapArtifactCounts(runtime.executor);
      const second = await run([input], "apply");
      expect(
        Object.values(second.records[0]!.created!).every(
          (value) => value === 0,
        ),
      ).toBe(true);
      expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(
        afterFirst,
      );
      const rows = await runtime.client`
        select v.verified_at, so.observed_at, s.canonical_url, ss.normalized_text, e.id as evidence_id
        from opportunities o join opportunity_versions v on v.opportunity_id=o.id and v.is_current and v.verification_state='VERIFIED'
        join opportunity_version_evidence e on e.opportunity_version_id=v.id
        join sources s on s.id=e.source_id
        join source_observations so on so.id=e.source_observation_id and so.source_id=s.id
        join source_snapshots ss on ss.id=e.source_snapshot_id and ss.id=so.snapshot_id
        where o.institution_id=${input.target.institutionId}`;
      expect(rows).toHaveLength(1);
      expect(new Date(rows[0]!.observed_at).toISOString()).toBe(
        "2026-08-30T07:59:00.000Z",
      );
      expect(new Date(rows[0]!.verified_at).toISOString()).toBe(
        "2026-08-30T08:01:00.000Z",
      );
      expect(rows[0]!.canonical_url).toBe(input.admission!.sourceUrl);
      expect(rows[0]!.normalized_text).toContain(
        input.admission!.evidenceExcerpt,
      );
      expect(
        Object.values(first.sideEffects).every((value) => value === 0),
      ).toBe(true);
      expect(httpRequest).not.toHaveBeenCalled();
      expect(httpsRequest).not.toHaveBeenCalled();
    } finally {
      httpRequest.mockRestore();
      httpsRequest.mockRestore();
      syncBuiltinESMExports();
    }
  });

  it("rejects malformed or duplicate artifacts with zero writes", async () => {
    const before = await readBootstrapArtifactCounts(runtime.executor);
    const input = artifact("kyonggi");
    expect(
      await run([{ ...input, artifactChecksum: "0".repeat(64) }], "apply"),
    ).toMatchObject({ artifactsRejected: 1, schoolsPersisted: 0 });
    expect(await run([input, input], "apply")).toMatchObject({
      artifactsRejected: 2,
      schoolsPersisted: 0,
    });
    expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(before);
  });

  it("rolls back one failed school's writes while preserving a different successful school", async () => {
    const failed = artifact("kyonggi");
    const successful = artifact("kumsung");
    await runtime.client.unsafe(
      `create function artifact_test_failure() returns trigger language plpgsql as $$ begin if exists (select 1 from institution_facts where id=new.institution_fact_id and institution_id='${failed.target.institutionId}'::uuid) then raise exception 'test-induced failure'; end if; return new; end $$`,
    );
    await runtime.client`create trigger artifact_test_failure before insert on institution_fact_versions for each row execute function artifact_test_failure()`;
    try {
      const report = await run([failed, successful], "apply");
      expect(report).toMatchObject({
        selected: 2,
        artifactsValid: 2,
        schoolsPersisted: 1,
        schoolsFailed: 1,
        exitCode: 1,
      });
      const [failedCount] =
        await runtime.client`select count(*)::int as facts from institution_facts where institution_id=${failed.target.institutionId}`;
      const [successCount] =
        await runtime.client`select count(*)::int as facts from institution_facts where institution_id=${successful.target.institutionId}`;
      expect(failedCount!.facts).toBe(0);
      expect(successCount!.facts).toBe(3);
      expect(
        Object.values(report.sideEffects).every((value) => value === 0),
      ).toBe(true);
    } finally {
      await runtime.client`drop trigger artifact_test_failure on institution_fact_versions`;
      await runtime.client`drop function artifact_test_failure()`;
    }
  });
});
