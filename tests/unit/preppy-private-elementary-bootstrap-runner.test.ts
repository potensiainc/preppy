import { describe, expect, it, vi } from "vitest";

import type { PrivateElementaryBootstrapTarget } from "@/src/modules/institution-detail-bootstrap/contracts";
import type { CollectedPrivateElementarySchool } from "@/src/modules/institution-detail-bootstrap/discovery.server";
import {
  resolvePrivateElementaryProductionTargetsFromInventory,
  runPrivateElementaryBootstrap,
} from "@/src/modules/institution-detail-bootstrap/runner.server";

function target(index: number): PrivateElementaryBootstrapTarget {
  return Object.freeze({
    institutionId:
      index === 2
        ? null
        : `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    slug: `school-${index}`,
    institutionName: `학교 ${index}`,
    category: "PRIVATE_ELEMENTARY" as const,
    regionCode: "KR-11" as const,
    address: `서울특별시 테스트구 ${index}`,
    gradeRange: "초등학교(1–6)",
    offersElementary: true,
    province: "서울특별시",
    cityDistrict: "테스트구",
    registryVerifiedAt: "2026-08-27",
    websiteUrl: `https://school-${index}.example/`,
    registryName: "SCHOOLINFO" as const,
    registryExternalId: index === 2 ? null : `registry-${index}`,
    registryUrl: `https://www.schoolinfo.go.kr/record/${index}`,
  });
}

function collected(
  value: PrivateElementaryBootstrapTarget,
  knowledgeState: "NOT_FOUND" | "SCHEDULE_FOUND" = "NOT_FOUND",
): CollectedPrivateElementarySchool {
  const page = Object.freeze({
    url: value.websiteUrl,
    finalUrl: value.websiteUrl,
    sourceName: `${value.institutionName} 공식 홈페이지`,
    sourceType: "OFFICIAL_SCHOOL_PAGE" as const,
    classificationHint: "OTHER" as const,
    collectedAt: new Date("2026-08-30T00:00:00.000Z"),
    contentHash: "a".repeat(64),
    textHash: "b".repeat(64),
    normalizedText: "공식 홈페이지",
    mimeType: "text/html",
    httpStatus: 200,
    responseBytes: 10,
    durationMs: 1,
    extractionHtml: "<p>공식 홈페이지</p>",
    score: 0,
  });
  return Object.freeze({
    target: value,
    status: "COLLECTED" as const,
    partialFetchWarning: false,
    pagesScheduled: 1,
    pagesFetched: 1,
    candidateUrls: Object.freeze([]),
    pages: Object.freeze([page]),
    facts: Object.freeze([
      Object.freeze({
        factType: "OPERATING_INFO" as const,
        displayText: "공식 운영 정보",
        valueJson: Object.freeze({ text: "공식 운영 정보" }),
        evidenceExcerpt: "공식 운영 정보",
        sourceUrl: value.registryUrl,
      }),
    ]),
    admission: Object.freeze({
      proposal: Object.freeze({
        academicYearLabel: null,
        knowledgeState,
        kind: "OTHER" as const,
        businessState: "UNKNOWN" as const,
        title:
          knowledgeState === "NOT_FOUND"
            ? "입학 관련 정보 미발견"
            : "2027학년도 입학 안내",
        summary: null,
        targetAudience: null,
        eventStartAt: null,
        eventEndAt: null,
        applicationOpenAt: null,
        applicationCloseAt: null,
        actionUrl: value.websiteUrl,
        evidenceExcerpt: "bounded official search",
        warnings: Object.freeze([]),
      }),
      collectedAt: page.collectedAt,
      sourceUrl: value.websiteUrl,
    }),
    warnings: Object.freeze([]),
    errors: Object.freeze([]),
  });
}

describe("private elementary Production inventory", () => {
  it("resolves pending IDs by exact slug/name/category and rejects scope drift", () => {
    const targets = [target(1), target(2)];
    const inventory = targets.map((value, index) => ({
      id: value.institutionId ?? "00000000-0000-4000-8000-000000000002",
      slug: value.slug,
      displayName: value.institutionName,
      category: "PRIVATE_ELEMENTARY",
      publicationState: "PUBLISHED",
      index,
    }));
    const resolved = resolvePrivateElementaryProductionTargetsFromInventory(
      targets,
      inventory,
    );
    expect(resolved[1]?.institutionId).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
    expect(() =>
      resolvePrivateElementaryProductionTargetsFromInventory(targets, [
        ...inventory,
        {
          id: "00000000-0000-4000-8000-000000000099",
          slug: "unexpected",
          displayName: "Unexpected",
          category: "PRIVATE_ELEMENTARY",
          publicationState: "PUBLISHED",
          index: 99,
        },
      ]),
    ).toThrow(/exact/i);
  });
});

describe("private elementary bootstrap runner", () => {
  it("continues after per-school failures and reports a non-zero final outcome", async () => {
    const targets = [target(1), target(2), target(3)].map((value, index) => ({
      ...value,
      institutionId:
        value.institutionId ??
        `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    const collect = vi.fn(async ({ target: value }) => {
      if (value.slug === "school-1") {
        return Object.freeze({
          ...collected(value),
          status: "SCHOOL_FETCH_FAILED" as const,
          facts: Object.freeze([]),
          admission: null,
          errors: Object.freeze(["TIMEOUT"]),
        });
      }
      return collected(value);
    });
    const persist = vi.fn(async (value: CollectedPrivateElementarySchool) => {
      if (value.target.slug === "school-2") throw new Error("constraint");
      return Object.freeze({
        institutionId: value.target.institutionId!,
        slug: value.target.slug,
        status: "PERSISTED" as const,
        created: Object.freeze({
          sources: 1,
          bindings: 1,
          snapshots: 1,
          observations: 1,
          facts: 1,
          factVersions: 1,
          factEvidence: 1,
          opportunities: 1,
          opportunityVersions: 1,
          opportunityEvidence: 1,
          opportunityBindings: 1,
        }),
        sideEffectDelta: Object.freeze({
          outboxEvents: 0,
          notifications: 0,
          deliveries: 0,
          deliveryAttempts: 0,
          meaningfulChanges: 0,
          opportunityChanges: 0,
        }),
        factVersionIds: Object.freeze([]),
        opportunityId: "00000000-0000-4000-8000-000000000010",
        opportunityVersionId: "00000000-0000-4000-8000-000000000011",
        admissionVerifiedAt: "2026-08-30T00:01:00.000Z",
      });
    });

    const report = await runPrivateElementaryBootstrap(
      {
        mode: "apply",
        slug: null,
        work: "both",
        production: true,
        acknowledgement: "PREPPY-41-SCHOOL-2026-BOOTSTRAP",
      },
      {
        executor: {} as never,
        transactionManager: {} as never,
        allowlist: targets,
        schemaCompatibility: {
          compatible: true,
          missingColumns: [],
          missingConstraintValues: [],
          supportsOfficialRegistrySourceType: false,
          supportsRegistryIdentityBindingRole: false,
          migrationLedgerInspected: false,
        },
        resolvedTargets: targets,
        collectionRuntime: {} as never,
        collect,
        persist,
      },
    );

    expect(collect).toHaveBeenCalledTimes(3);
    expect(persist).toHaveBeenCalledTimes(3);
    expect(report).toMatchObject({
      attempted: 3,
      persisted: 2,
      failed: 1,
      registryBootstrap: { succeeded: 2, failed: 1 },
      websiteCollection: { succeeded: 2, failed: 1 },
      schoolsWithBaselineFacts: 2,
      exitCode: 1,
      sideEffects: {
        outboxEvents: 0,
        notifications: 0,
        deliveries: 0,
        meaningfulChanges: 0,
      },
    });
    expect(report.records.map((record) => record.status)).toEqual([
      "PERSISTED",
      "PERSISTENCE_FAILED",
      "PERSISTED",
    ]);
    expect(report.records[0]).toMatchObject({
      registryBootstrap: "SUCCESS",
      websiteCollection: "FETCH_FAILED",
      admissionKnowledge: "FETCH_FAILED",
    });
    expect(report.records[2]?.sideEffectDelta).toEqual({
      outboxEvents: 0,
      notifications: 0,
      deliveries: 0,
      deliveryAttempts: 0,
      meaningfulChanges: 0,
      opportunityChanges: 0,
    });
  });

  it("treats NOT_FOUND as a successful dry-run result with no persistence", async () => {
    const value = { ...target(1), institutionId: target(1).institutionId! };
    const persist = vi.fn();
    const report = await runPrivateElementaryBootstrap(
      {
        mode: "dry-run",
        slug: value.slug,
        work: "both",
        production: false,
        acknowledgement: null,
      },
      {
        executor: {} as never,
        transactionManager: {} as never,
        allowlist: [value],
        schemaCompatibility: {
          compatible: true,
          missingColumns: [],
          missingConstraintValues: [],
          supportsOfficialRegistrySourceType: false,
          supportsRegistryIdentityBindingRole: false,
          migrationLedgerInspected: false,
        },
        resolvedTargets: [value],
        collectionRuntime: {} as never,
        collect: async () => collected(value),
        persist,
      },
    );

    expect(report).toMatchObject({
      attempted: 1,
      readyToPersist: 1,
      persisted: 0,
      failed: 0,
      exitCode: 0,
      admissions: { NOT_FOUND: 1 },
    });
    expect(persist).not.toHaveBeenCalled();
  });

  it("prepares baseline facts even when collection throws and never writes in dry-run", async () => {
    const value = { ...target(1), institutionId: target(1).institutionId! };
    const report = await runPrivateElementaryBootstrap(
      {
        mode: "dry-run",
        slug: null,
        work: "both",
        production: true,
        acknowledgement: null,
      },
      {
        executor: {} as never,
        transactionManager: {} as never,
        allowlist: [value],
        resolvedTargets: [value],
        collectionRuntime: {} as never,
        schemaCompatibility: {
          compatible: true,
          missingColumns: [],
          missingConstraintValues: [],
          supportsOfficialRegistrySourceType: false,
          supportsRegistryIdentityBindingRole: false,
          migrationLedgerInspected: false,
        },
        collect: async () => {
          throw new Error("robots unavailable");
        },
        persist: async () => {
          throw new Error("dry-run must not write");
        },
      },
    );
    expect(report).toMatchObject({
      readyToPersist: 1,
      registryBootstrap: { succeeded: 1, failed: 0 },
      websiteCollection: { succeeded: 0, failed: 1 },
      schoolsWithBaselineFacts: 1,
      factCounts: { OPERATING_INFO: 1, TARGET_AGE_GRADE: 1 },
      admissions: { FETCH_FAILED: 1 },
    });
  });

  it("reports stale source years separately from publishable current admissions", async () => {
    const value = { ...target(1), institutionId: target(1).institutionId! };
    const input = collected(value);
    const report = await runPrivateElementaryBootstrap(
      {
        mode: "dry-run",
        slug: null,
        work: "both",
        production: true,
        acknowledgement: null,
      },
      {
        executor: {} as never,
        transactionManager: {} as never,
        allowlist: [value],
        resolvedTargets: [value],
        collectionRuntime: {} as never,
        schemaCompatibility: {
          compatible: true,
          missingColumns: [],
          missingConstraintValues: [],
          supportsOfficialRegistrySourceType: false,
          supportsRegistryIdentityBindingRole: false,
          migrationLedgerInspected: false,
        },
        collect: async () => ({
          ...input,
          admission: {
            ...input.admission!,
            proposal: {
              ...input.admission!.proposal,
              academicYearLabel: "2025학년도",
            },
          },
        }),
      },
    );
    expect(report.academicYears).toMatchObject({ staleSkipped: 1, unknown: 0 });
    expect(report.records[0]).toMatchObject({
      academicYear: "2025학년도",
      admissionPublicationEligible: false,
      warnings: ["STALE_ADMISSION_CYCLE_NOT_PUBLISHED"],
    });
  });
});
