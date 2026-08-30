import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import {
  persistPrivateElementarySchool,
  type SchoolTruthCorrection,
} from "@/src/modules/institution-detail-bootstrap/persistence.server";
import { artifactTestCollection } from "@/tests/support/private-elementary-artifact";
import { readBootstrapArtifactCounts } from "@/src/modules/institution-detail-bootstrap/artifact-runner.server";
import { getInstitutionBySlug } from "@/src/modules/public/institution-query.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
import { runCorrectionBundle } from "@/src/modules/institution-detail-bootstrap/correction-runner.server";
import {
  correctionChecksum,
  validateCorrectionBundle,
} from "@/src/modules/institution-detail-bootstrap/correction.server";
import {
  correctionFixture,
  correctionTestTime,
  hashText,
} from "@/tests/support/private-elementary-correction";

const testUrl = process.env.TEST_DATABASE_URL!;
assertDedicatedTestDatabaseUrl(testUrl);
const dbName = `correction_${randomUUID().replaceAll("-", "")}_test`;
const isolated = new URL(testUrl);
isolated.pathname = `/${dbName}`;
const maintenance = postgres(testUrl, { max: 1 });
let runtime: RuntimeDatabaseResources;
let loaded: Awaited<ReturnType<typeof loadPrivateElementaryBootstrapTargets>>;
beforeAll(async () => {
  await maintenance`create database ${maintenance(dbName)}`;
  await migrateDatabase(isolated.href);
  runtime = getRuntimeDatabase({
    DATABASE_URL: isolated.href,
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
  for (const t of loaded.targets)
    await runtime.client`insert into institutions (id,slug,display_name,category,operational_state,publication_state,region_code,address_line,website_url,published_at) values (${t.institutionId!},${t.slug},${t.institutionName},'PRIVATE_ELEMENTARY','ACTIVE','PUBLISHED',${t.regionCode},${t.address},${t.websiteUrl},now())`;
});
afterAll(async () => {
  await closeRuntimeDatabase();
  await maintenance`drop database if exists ${maintenance(dbName)}`;
  await maintenance.end();
});
function collection(slug: string) {
  return artifactTestCollection(loaded.targets.find((t) => t.slug === slug)!);
}
const reviewedAt = new Date("2026-08-30T08:30:00.000Z");
function persist(c: ReturnType<typeof collection>, correction?: unknown) {
  return persistPrivateElementarySchool(c, {
    transactionManager: runtime.transactionManager,
    supportsOfficialRegistrySourceType: false,
    supportsRegistryIdentityBindingRole: false,
    now: () => reviewedAt,
    ...(correction ? { correction } : {}),
  } as Parameters<typeof persistPrivateElementarySchool>[1]);
}
describe("school-atomic truth correction", () => {
  it("replaces false NOT_FOUND with main plus two sessions, keeps multiple sources, and is idempotent", async () => {
    const c = collection("donggwang");
    const old = {
      ...c,
      admission: {
        ...c.admission!,
        proposal: {
          ...c.admission!.proposal,
          academicYearLabel: null,
          title: "입학 관련 정보 미발견",
          summary: null,
          applicationOpenAt: null,
          applicationCloseAt: null,
          knowledgeState: "NOT_FOUND" as const,
          businessState: "UNKNOWN" as const,
        },
      },
    };
    const prior = await persist(old);
    const admissions = [
      {
        key: "main",
        admission: c.admission!,
        sourceUrls: c.pages.map((p) => p.url),
      },
      ...["2026-10-31T01:00:00.000Z", "2026-10-31T05:00:00.000Z"].map(
        (date, n) => ({
          key: `session-${n + 1}`,
          sourceUrls: c.pages.map((p) => p.url),
          admission: {
            ...c.admission!,
            proposal: {
              ...c.admission!.proposal,
              title: `설명회 ${n + 1}`,
              kind: "INFORMATION_SESSION",
              applicationOpenAt: null,
              applicationCloseAt: null,
              eventStartAt: new Date(date),
            },
          },
        }),
      ),
    ];
    const options = { admissions, factSourceUrls: {}, retireFacts: [] };
    await persist(c, options);
    const detail = await getInstitutionBySlug(runtime.executor, "donggwang");
    expect(detail.reviewedAdmissions).toHaveLength(3);
    expect(
      detail.reviewedAdmissions.filter((a) => a.kind === "INFORMATION_SESSION"),
    ).toHaveLength(2);
    expect(
      detail.reviewedAdmissions.every(
        (a) => a.academicYearLabel === "2027학년도",
      ),
    ).toBe(true);
    expect(
      detail.reviewedAdmissions.every(
        (a) => a.knowledgeState === "SCHEDULE_FOUND",
      ),
    ).toBe(true);
    expect(
      detail.reviewedAdmissions.every(
        (a) =>
          (a as { officialSources?: unknown[] }).officialSources?.length === 2,
      ),
    ).toBe(true);
    const [retired] =
      await runtime.client`select publication_state from opportunities where id=${prior.opportunityId!}`;
    expect(retired!.publication_state).toBe("HIDDEN");
    const [version] =
      await runtime.client`select is_current,verification_state from opportunity_versions where id=${prior.opportunityVersionId!}`;
    expect(version).toMatchObject({
      is_current: false,
      verification_state: "SUPERSEDED",
    });
    const before = await readBootstrapArtifactCounts(runtime.executor);
    const again = await persist(c, options);
    expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(before);
    expect(Object.values(again.sideEffectDelta)).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it("retains unknown year and historical tuition; targets only the explicitly reviewed bad fact", async () => {
    const c = collection("kumsung");
    await persist(c);
    const [bad] =
      await runtime.client`select v.id, v.display_text from institution_fact_versions v join institution_facts f on f.id=v.institution_fact_id where f.institution_id=${c.target.institutionId!} and f.fact_type='TUITION' and v.is_current`;
    const unknown = {
      ...c,
      facts: [],
      admission: {
        ...c.admission!,
        proposal: {
          ...c.admission!.proposal,
          academicYearLabel: null,
          title: "원서접수 안내",
          summary: "확인한 원서접수 일정 · 수업료는 2026학년도 기준 별도 검토",
        },
      },
    };
    const correction = {
      admissions: [
        {
          key: "main",
          admission: unknown.admission,
          sourceUrls: [unknown.admission.sourceUrl],
        },
      ],
      factSourceUrls: {},
      retireFacts: [
        {
          factType: "TUITION",
          versionId: bad!.id,
          expectedDisplayText: bad!.display_text,
          reason: "operator reviewed invalid navigation",
        },
      ],
    };
    await persist(unknown, correction);
    const detail = await getInstitutionBySlug(runtime.executor, "kumsung");
    expect(detail.reviewedAdmissions).toHaveLength(1);
    expect(detail.reviewedAdmissions[0]!.academicYearLabel).toBeNull();
    expect(detail.verifiedFacts.map((f) => f.factType)).not.toContain(
      "TUITION",
    );
    expect(detail.verifiedFacts.map((f) => f.factType)).toContain(
      "OPERATING_INFO",
    );
  });
  it("rolls back an earlier event and retirement when a later event violates a constraint", async () => {
    const c = collection("lila");
    const before = await readBootstrapArtifactCounts(runtime.executor);
    await expect(
      persist(c, {
        admissions: [
          {
            key: "main",
            admission: c.admission!,
            sourceUrls: [c.admission!.sourceUrl],
          },
          {
            key: "bad-event",
            admission: {
              ...c.admission!,
              proposal: { ...c.admission!.proposal, title: "" },
            },
            sourceUrls: [c.admission!.sourceUrl],
          },
        ],
        factSourceUrls: {},
        retireFacts: [],
      }),
    ).rejects.toThrow();
    expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(before);
  });
  it("validates and dry-runs all 41 schools without writes then preserves original provenance on apply", async () => {
    const f = correctionFixture(loaded.targets, loaded.seedSha256);
    f.bundle.artifactChecksum = correctionChecksum(f.bundle);
    const deps = {
      executor: runtime.executor,
      transactionManager: runtime.transactionManager,
      allowlist: loaded.targets,
      seedSha256: loaded.seedSha256,
      trustedManifest: f.manifest,
      expectedArtifactChecksum: f.bundle.artifactChecksum,
      now: () => correctionTestTime,
    };
    const before = await readBootstrapArtifactCounts(runtime.executor);
    expect(
      await runCorrectionBundle(f.bundle, { ...deps, mode: "dry-run" }),
    ).toMatchObject({
      schoolsValid: 41,
      schoolsPersisted: 0,
      databaseWrites: 0,
      networkFetches: 0,
    });
    expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(before);
    expect(
      await runCorrectionBundle(f.bundle, { ...deps, mode: "apply" }),
    ).toMatchObject({
      schoolsValid: 41,
      schoolsPersisted: 41,
      schoolsFailed: 0,
    });
    const [row] =
      await runtime.client`select s.mime_type,s.content_hash,o.http_status,o.metadata,v.verified_at from source_snapshots s join source_observations o on o.snapshot_id=s.id join opportunity_version_evidence e on e.source_snapshot_id=s.id join opportunity_versions v on v.id=e.opportunity_version_id where s.mime_type='image/png' limit 1`;
    expect(row).toMatchObject({
      mime_type: "image/png",
      content_hash: f.bundle.schools[0]!.sources[0]!.responseContentHash,
      http_status: 200,
      metadata: {
        captureMethod: "HTTP_ORIGINAL_MEDIA",
        evidenceTextKind: "OPERATOR_REVIEWED_TRANSCRIPTION",
      },
    });
    expect(new Date(row!.verified_at).toISOString()).toBe(
      "2026-08-30T08:30:00.000Z",
    );
    const after = await readBootstrapArtifactCounts(runtime.executor);
    expect(
      await runCorrectionBundle(f.bundle, { ...deps, mode: "apply" }),
    ).toMatchObject({
      schoolsPersisted: 41,
      sideEffects: {
        outboxEvents: 0,
        notifications: 0,
        deliveries: 0,
        deliveryAttempts: 0,
        meaningfulChanges: 0,
        opportunityChanges: 0,
      },
    });
    expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(after);
    await expect(
      runCorrectionBundle(f.bundle, {
        ...deps,
        expectedArtifactChecksum: "0".repeat(64),
        mode: "apply",
      }),
    ).rejects.toThrow();
    expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(after);
  });
  it("rejects stale correction and changed bad-fact guards without writes", async () => {
    const c = collection("kyonggi");
    const correction = {
      admissions: [
        {
          key: "main",
          admission: c.admission!,
          sourceUrls: [c.admission!.sourceUrl],
        },
      ],
      factSourceUrls: {},
      retireFacts: [],
    };
    const before = await readBootstrapArtifactCounts(runtime.executor);
    await expect(
      persistPrivateElementarySchool(c, {
        transactionManager: runtime.transactionManager,
        supportsOfficialRegistrySourceType: false,
        supportsRegistryIdentityBindingRole: false,
        now: () => new Date("2026-08-30T08:29:00.000Z"),
        correction,
      }),
    ).rejects.toThrow("stale");
    expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(before);
    const other = collection("lila");
    await expect(
      persist(other, {
        ...correction,
        admissions: [
          {
            key: "main",
            admission: other.admission!,
            sourceUrls: [other.admission!.sourceUrl],
          },
        ],
        retireFacts: [
          {
            factType: "TUITION",
            versionId: randomUUID(),
            expectedDisplayText: "not the approved version",
            reason: "guard failure",
          },
        ],
      }),
    ).rejects.toThrow("retirement");
    expect(await readBootstrapArtifactCounts(runtime.executor)).toEqual(before);
  });
  it("keeps browser capture metadata honest and a lottery/result distinct from applications", async () => {
    const f = correctionFixture(loaded.targets, loaded.seedSha256);
    f.bundle.artifactChecksum = correctionChecksum(f.bundle);
    const bundle = validateCorrectionBundle(
      f.bundle,
      loaded.targets,
      loaded.seedSha256,
      f.manifest,
      correctionTestTime,
    );
    const school = bundle.schools.find((s) => s.target.slug === "sohwa-e")!;
    school.sources[0] = {
      ...school.sources[0]!,
      captureMethod: "BROWSER_CAPTURE",
      httpStatus: null,
      responseBytes: null,
      durationMs: null,
      contentType: "image/jpeg",
      responseContentHash: hashText("browser screenshot bytes"),
      evidenceText: "2026 학년도 추첨 2025-11-12 15:00 결과 발표 17:00",
    };
    school.sources[0]!.evidenceTextHash = hashText(
      school.sources[0]!.evidenceText,
    );
    school.facts = [];
    school.admissions = [
      {
        ...school.admissions[0]!,
        academicYearLabel: "2026학년도",
        rawAcademicYear: "2026 학년도",
        kind: "LOTTERY",
        businessState: "COMPLETED",
        title: "추첨",
        summary: "원서 접수 기간 미확인",
        applicationOpenAt: null,
        applicationCloseAt: null,
        eventStartAt: "2025-11-12T06:00:00.000Z",
        evidenceExcerpt: "2026 학년도 추첨 2025-11-12 15:00 결과 발표 17:00",
      },
    ];
    school.admissions.push({
      ...school.admissions[0]!,
      key: "result",
      kind: "RESULT_ANNOUNCEMENT",
      title: "결과 발표",
      eventStartAt: "2025-11-12T08:00:00.000Z",
    });
    bundle.artifactChecksum = correctionChecksum(bundle);
    const report = await runCorrectionBundle(bundle, {
      mode: "apply",
      executor: runtime.executor,
      transactionManager: runtime.transactionManager,
      allowlist: loaded.targets,
      seedSha256: loaded.seedSha256,
      trustedManifest: f.manifest,
      expectedArtifactChecksum: bundle.artifactChecksum,
      now: () => correctionTestTime,
    });
    expect(report.schoolsPersisted).toBe(41);
    const detail = await getInstitutionBySlug(runtime.executor, "sohwa-e");
    expect(detail.reviewedAdmissions.map((a) => a.kind).sort()).toEqual([
      "LOTTERY",
      "RESULT_ANNOUNCEMENT",
    ]);
    expect(
      detail.reviewedAdmissions.every(
        (a) =>
          a.keyDates.applicationOpensAt === null &&
          a.keyDates.applicationClosesAt === null,
      ),
    ).toBe(true);
    expect(
      detail.reviewedAdmissions.every(
        (a) => a.academicYearLabel === "2026학년도",
      ),
    ).toBe(true);
    const [capture] =
      await runtime.client`select http_status,response_bytes,duration_ms,metadata from source_observations where content_hash=${hashText("browser screenshot bytes")}`;
    expect(capture).toMatchObject({
      http_status: null,
      response_bytes: null,
      duration_ms: null,
      metadata: { captureMethod: "BROWSER_CAPTURE" },
    });
  });
  it("continues the remaining schools after one school transaction fails", async () => {
    const f = correctionFixture(loaded.targets, loaded.seedSha256);
    for (const school of f.bundle.schools)
      school.reviewedAt = "2026-08-30T08:31:00.000Z";
    f.bundle.artifactChecksum = correctionChecksum(f.bundle);
    const failed = f.bundle.schools.find((s) => s.target.slug === "kyonggi")!;
    const before = await getInstitutionBySlug(runtime.executor, "kyonggi");
    await runtime.client.unsafe(
      `create function correction_test_failure() returns trigger language plpgsql as $$ begin if exists(select 1 from opportunities where id=new.opportunity_id and institution_id='${failed.target.institutionId}'::uuid) then raise exception 'isolated test failure'; end if; return new; end $$`,
    );
    await runtime.client`create trigger correction_test_failure before insert on opportunity_versions for each row execute function correction_test_failure()`;
    try {
      const report = await runCorrectionBundle(f.bundle, {
        mode: "apply",
        executor: runtime.executor,
        transactionManager: runtime.transactionManager,
        allowlist: loaded.targets,
        seedSha256: loaded.seedSha256,
        trustedManifest: f.manifest,
        expectedArtifactChecksum: f.bundle.artifactChecksum,
        now: () => correctionTestTime,
      });
      expect(report).toMatchObject({
        schoolsPersisted: 40,
        schoolsFailed: 1,
        exitCode: 1,
      });
      expect(report.records.find((r) => r.slug === "kyonggi")!.status).toBe(
        "PERSISTENCE_FAILED",
      );
      expect(await getInstitutionBySlug(runtime.executor, "kyonggi")).toEqual(
        before,
      );
      expect(Object.values(report.sideEffects)).toEqual([0, 0, 0, 0, 0, 0]);
    } finally {
      await runtime.client`drop trigger correction_test_failure on opportunity_versions`;
      await runtime.client`drop function correction_test_failure()`;
    }
  });
  it("records a fresh acquisition and review of identical bytes without inventing HTTP data", async () => {
    const c = collection("kbes");
    const corrected = {
      ...c,
      pages: c.pages.map((p) => ({
        ...p,
        captureMethod: "HTTP_ORIGINAL_MEDIA" as const,
      })),
    };
    const correction: SchoolTruthCorrection = {
      admissions: [
        {
          key: "main",
          admission: c.admission!,
          sourceUrls: [c.admission!.sourceUrl],
        },
      ],
      factSourceUrls: {},
      retireFacts: [],
    };
    await persistPrivateElementarySchool(corrected, {
      transactionManager: runtime.transactionManager,
      supportsOfficialRegistrySourceType: false,
      supportsRegistryIdentityBindingRole: false,
      correction,
      now: () => new Date("2026-08-30T08:32:00.000Z"),
    });
    const later = new Date("2026-08-30T09:15:00.000Z");
    await persistPrivateElementarySchool(
      {
        ...corrected,
        pages: corrected.pages.map((p) => ({
          ...p,
          collectedAt: new Date("2026-08-30T09:00:00.000Z"),
        })),
      },
      {
        transactionManager: runtime.transactionManager,
        supportsOfficialRegistrySourceType: false,
        supportsRegistryIdentityBindingRole: false,
        correction,
        now: () => later,
      },
    );
    const detail = await getInstitutionBySlug(runtime.executor, "kbes");
    expect(detail.reviewedAdmissions[0]!.lastVerifiedAt).toBe(
      "2026-08-30T09:15:00.000Z",
    );
    expect(detail.reviewedAdmissions[0]!.lastCollectedAt).toBe(
      "2026-08-30T09:00:00.000Z",
    );
    expect(
      detail.verifiedFacts.every(
        (f) => f.verifiedAt === "2026-08-30T09:15:00.000Z",
      ),
    ).toBe(true);
  });
  it("publishes every fact evidence source, not only the primary source", async () => {
    const c = collection("kyonggi");
    const correction: SchoolTruthCorrection = {
      admissions: [
        {
          key: "main",
          admission: c.admission!,
          sourceUrls: [c.admission!.sourceUrl],
        },
      ],
      factSourceUrls: { TUITION: c.pages.map((p) => p.url) },
      retireFacts: [],
    };
    await persist(c, correction);
    const detail = await getInstitutionBySlug(runtime.executor, "kyonggi");
    const tuition = detail.verifiedFacts.find((f) => f.factType === "TUITION")!;
    expect(
      (tuition as { officialSources?: unknown[] }).officialSources,
    ).toHaveLength(2);
  });
  it("does not truncate the bounded set of reviewed information sessions at the legacy card limit", async () => {
    const c = collection("kumsung");
    const admissions: SchoolTruthCorrection["admissions"] = [
      {
        key: "main",
        admission: c.admission!,
        sourceUrls: [c.admission!.sourceUrl],
      },
      ...Array.from({ length: 13 }, (_, index) => ({
        key: `session-${index + 1}`,
        admission: {
          ...c.admission!,
          proposal: {
            ...c.admission!.proposal,
            kind: "INFORMATION_SESSION" as const,
            applicationOpenAt: null,
            applicationCloseAt: null,
            eventStartAt: new Date(Date.UTC(2026, 9, 1 + index, 1)),
          },
        },
        sourceUrls: [c.admission!.sourceUrl],
      })),
    ];
    await persistPrivateElementarySchool(c, {
      transactionManager: runtime.transactionManager,
      supportsOfficialRegistrySourceType: false,
      supportsRegistryIdentityBindingRole: false,
      now: () => new Date("2026-08-30T09:30:00.000Z"),
      correction: { admissions, factSourceUrls: {}, retireFacts: [] },
    });
    const detail = await getInstitutionBySlug(runtime.executor, "kumsung");
    expect(detail.reviewedAdmissions).toHaveLength(14);
  });
});
