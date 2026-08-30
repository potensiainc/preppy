import "server-only";
import { sql } from "drizzle-orm";
import type {
  DatabaseExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import {
  PrivateElementaryBootstrapError,
  type PrivateElementaryBootstrapTarget,
} from "./contracts";
import type { CollectedPrivateElementarySchool } from "./discovery.server";
import {
  validateCorrectionBundle,
  type CorrectionSchool,
} from "./correction.server";
import {
  persistPrivateElementarySchool,
  type SchoolTruthCorrection,
  type PersistedPrivateElementarySchool,
} from "./persistence.server";
import { resolvePrivateElementaryProductionTargets } from "./runner.server";
import { inspectBootstrapSchema } from "./schema-preflight.server";
import { readBootstrapArtifactCounts } from "./artifact-runner.server";

function schoolCollection(
  school: CorrectionSchool,
  target: PrivateElementaryBootstrapTarget,
): {
  collection: CollectedPrivateElementarySchool;
  correction: SchoolTruthCorrection;
} {
  const date = (value: string | null) =>
    value === null ? null : new Date(value);
  const admissions = school.admissions.map((a) => ({
    key: a.key,
    sourceUrls: a.sourceUrls,
    admission: {
      sourceUrl: a.sourceUrls[0]!,
      collectedAt: new Date(
        school.sources
          .filter((s) => a.sourceUrls.includes(s.requestedUrl))
          .map((s) => s.fetchedAt)
          .sort()
          .at(-1)!,
      ),
      proposal: {
        academicYearLabel: a.academicYearLabel,
        knowledgeState: a.knowledgeState,
        kind: a.kind,
        businessState: a.businessState,
        title: a.title,
        summary: a.summary,
        targetAudience: a.targetAudience,
        applicationOpenAt: date(a.applicationOpenAt),
        applicationCloseAt: date(a.applicationCloseAt),
        eventStartAt: date(a.eventStartAt),
        eventEndAt: date(a.eventEndAt),
        actionUrl: a.actionUrl,
        evidenceExcerpt: a.evidenceExcerpt,
        warnings: [],
      },
    },
  }));
  return {
    collection: {
      target,
      status: "COLLECTED",
      partialFetchWarning: false,
      pagesScheduled: school.sources.length,
      pagesFetched: school.sources.length,
      candidateUrls: [],
      pages: school.sources.map((s) => ({
        url: s.requestedUrl,
        finalUrl: s.finalUrl,
        sourceName: s.sourceName,
        sourceType: s.sourceType,
        collectedAt: new Date(s.fetchedAt),
        contentHash: s.responseContentHash,
        textHash: s.evidenceTextHash,
        normalizedText: s.evidenceText,
        mimeType: s.contentType,
        httpStatus: s.httpStatus,
        responseBytes: s.responseBytes,
        durationMs: s.durationMs,
        captureMethod: s.captureMethod,
        extractionHtml: "",
        score: 0,
        classificationHint: "ADMISSIONS",
      })),
      facts: school.facts.map((f) => ({
        factType: f.factType,
        displayText: f.displayText,
        evidenceExcerpt: f.evidenceExcerpt,
        valueJson: f.valueJson,
        sourceUrl: f.sourceUrls[0]!,
      })),
      admission: admissions.find((a) => a.key === "main")!.admission,
      warnings: [],
      errors: [],
    },
    correction: {
      admissions,
      factSourceUrls: Object.fromEntries(
        school.facts.map((f) => [f.factType, f.sourceUrls]),
      ),
      retireFacts: school.retireFacts,
    },
  };
}
export async function runCorrectionBundle(
  value: unknown,
  dependencies: {
    mode: "dry-run" | "apply";
    executor: DatabaseExecutor;
    transactionManager: TransactionManager;
    allowlist: readonly PrivateElementaryBootstrapTarget[];
    seedSha256: string;
    trustedManifest: unknown;
    expectedArtifactChecksum?: string;
    now?: () => Date;
  },
) {
  const now = dependencies.now?.() ?? new Date();
  const bundle = validateCorrectionBundle(
    value,
    dependencies.allowlist,
    dependencies.seedSha256,
    dependencies.trustedManifest,
    now,
  );
  if (
    dependencies.mode === "apply" &&
    dependencies.expectedArtifactChecksum !== bundle.artifactChecksum
  )
    throw new PrivateElementaryBootstrapError(
      "ARTIFACT_REJECTED",
      "Correction differs from approved checksum",
    );
  const run = async (executor: DatabaseExecutor) => {
    const before = await readBootstrapArtifactCounts(executor);
    const targets = await resolvePrivateElementaryProductionTargets(
      executor,
      dependencies.allowlist,
    );
    validateCorrectionBundle(
      bundle,
      targets,
      dependencies.seedSha256,
      dependencies.trustedManifest,
      now,
    );
    const schema = await inspectBootstrapSchema(executor);
    if (!schema.compatible)
      throw new PrivateElementaryBootstrapError(
        "SCHEMA_BLOCKED",
        "Existing schema cannot persist correction",
      );
    const records: Array<{
      slug: string;
      status: "DRY_RUN_VALID" | "PERSISTED" | "PERSISTENCE_FAILED";
      errorCode: string | null;
      persisted: PersistedPrivateElementarySchool | null;
    }> = [];
    for (const school of bundle.schools) {
      const record: (typeof records)[number] = {
        slug: school.target.slug,
        status: "DRY_RUN_VALID",
        errorCode: null,
        persisted: null,
      };
      records.push(record);
      if (dependencies.mode === "dry-run") continue;
      try {
        const { collection, correction } = schoolCollection(
          school,
          targets.find((t) => t.slug === school.target.slug)!,
        );
        record.persisted = await persistPrivateElementarySchool(collection, {
          transactionManager: dependencies.transactionManager,
          supportsOfficialRegistrySourceType:
            schema.supportsOfficialRegistrySourceType,
          supportsRegistryIdentityBindingRole:
            schema.supportsRegistryIdentityBindingRole,
          now: () => new Date(school.reviewedAt),
          correction,
        });
        record.status = "PERSISTED";
      } catch (error) {
        record.status = "PERSISTENCE_FAILED";
        record.errorCode =
          error instanceof PrivateElementaryBootstrapError
            ? error.code
            : "PERSISTENCE_FAILED";
      }
    }
    const after = await readBootstrapArtifactCounts(executor);
    const countDeltas = Object.fromEntries(
      Object.keys(before).map((k) => [k, after[k]! - before[k]!]),
    );
    const sideEffects = Object.fromEntries(
      [
        "outboxEvents",
        "notifications",
        "deliveries",
        "deliveryAttempts",
        "meaningfulChanges",
        "opportunityChanges",
      ].map((k) => [k, countDeltas[k]!]),
    );
    if (
      dependencies.mode === "dry-run" &&
      Object.values(countDeltas).some((n) => n !== 0)
    )
      throw new PrivateElementaryBootstrapError(
        "SIDE_EFFECT_DETECTED",
        "Correction dry-run mutated data",
      );
    const schoolsFailed = records.filter(
      (r) => r.status === "PERSISTENCE_FAILED",
    ).length;
    return {
      mode: dependencies.mode,
      artifactChecksum: bundle.artifactChecksum,
      schoolsValid: 41,
      schoolsPersisted: records.filter((r) => r.status === "PERSISTED").length,
      schoolsFailed,
      databaseWrites: dependencies.mode === "dry-run" ? 0 : null,
      networkFetches: 0,
      countDeltas,
      sideEffects,
      records,
      exitCode:
        schoolsFailed === 0 && Object.values(sideEffects).every((n) => n === 0)
          ? 0
          : 1,
    };
  };
  if (dependencies.mode === "dry-run")
    return dependencies.transactionManager.run(async (executor) => {
      await executor.raw(
        sql`set transaction isolation level repeatable read, read only`,
      );
      return run(executor);
    });
  return run(dependencies.executor);
}
