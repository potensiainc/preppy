import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type {
  DatabaseExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import type { PrivateElementaryBootstrapTarget } from "./contracts";
import { PrivateElementaryBootstrapError } from "./contracts";
import { validateBootstrapArtifact, artifactChecksum } from "./artifact.server";
import { bootstrapArtifactSchema } from "./artifact-schema";
import { resolvePrivateElementaryProductionTargets } from "./runner.server";
import { inspectBootstrapSchema } from "./schema-preflight.server";
import {
  persistPrivateElementarySchool,
  type BootstrapCreatedCounts,
} from "./persistence.server";

const effectKeys = [
  "outboxEvents",
  "notifications",
  "deliveries",
  "deliveryAttempts",
  "meaningfulChanges",
  "opportunityChanges",
] as const;
export function bootstrapApprovalChecksum(values: readonly unknown[]): string {
  return values.length === 1
    ? artifactChecksum(values[0])
    : createHash("sha256")
        .update(JSON.stringify(values.map((value) => artifactChecksum(value))))
        .digest("hex");
}
export async function readBootstrapArtifactCounts(
  executor: DatabaseExecutor,
): Promise<Record<string, number>> {
  const rows = await executor.raw(sql`select
    (select count(*)::int from institutions) as institutions,
    (select count(*)::int from sources) as sources,
    (select count(*)::int from institution_source_bindings) as bindings,
    (select count(*)::int from source_snapshots) as snapshots,
    (select count(*)::int from source_observations) as observations,
    (select count(*)::int from institution_facts) as facts,
    (select count(*)::int from institution_fact_versions) as "factVersions",
    (select count(*)::int from institution_fact_version_evidence) as "factEvidence",
    (select count(*)::int from opportunities) as opportunities,
    (select count(*)::int from opportunity_versions) as "opportunityVersions",
    (select count(*)::int from opportunity_version_evidence) as "opportunityEvidence",
    (select count(*)::int from opportunity_source_bindings) as "opportunityBindings",
    (select count(*)::int from outbox_events) as "outboxEvents",
    (select count(*)::int from notifications) as notifications,
    (select count(*)::int from notification_deliveries) as deliveries,
    (select count(*)::int from notification_delivery_attempts) as "deliveryAttempts",
    (select count(*)::int from meaningful_changes) as "meaningfulChanges",
    (select count(*)::int from opportunity_changes) as "opportunityChanges"`);
  return (rows as unknown as Record<string, number>[])[0]!;
}
type ArtifactRecord = {
  slug: string | null;
  status: "REJECTED" | "DRY_RUN_VALID" | "PERSISTED" | "PERSISTENCE_FAILED";
  errorCode: string | null;
  artifactChecksum: string | null;
  classification: string | null;
  facts: number;
  admissionKnowledge: string | null;
  academicYear: string | null;
  created: BootstrapCreatedCounts | null;
  preview: Record<string, unknown> | null;
};
export async function runBootstrapArtifacts(
  values: readonly unknown[],
  dependencies: Readonly<{
    mode: "dry-run" | "apply";
    executor: DatabaseExecutor;
    transactionManager: TransactionManager;
    allowlist: readonly PrivateElementaryBootstrapTarget[];
    seedSha256: string;
    expectedArtifactChecksum?: string;
    now?: () => Date;
  }>,
) {
  if (values.length < 1 || values.length > 41)
    throw new PrivateElementaryBootstrapError(
      "INVOCATION_REJECTED",
      "Artifact batch size rejected",
    );
  const now = dependencies.now?.() ?? new Date();
  const approvalChecksum = bootstrapApprovalChecksum(values);
  if (
    dependencies.mode === "apply" &&
    dependencies.expectedArtifactChecksum !== approvalChecksum
  )
    throw new PrivateElementaryBootstrapError(
      "ARTIFACT_REJECTED",
      "Artifact differs from the approved checksum",
    );
  const records: ArtifactRecord[] = [];
  const candidates = values.map((value) =>
    bootstrapArtifactSchema.safeParse(value),
  );
  const duplicateSlugs = new Set(
    candidates.flatMap((item, index) =>
      item.success &&
      candidates.some(
        (other, j) =>
          j !== index &&
          other.success &&
          other.data.target.slug === item.data.target.slug,
      )
        ? [item.data.target.slug]
        : [],
    ),
  );
  const execute = async (executor: DatabaseExecutor) => {
    const before = await readBootstrapArtifactCounts(executor);
    const resolved = await resolvePrivateElementaryProductionTargets(
      executor,
      dependencies.allowlist,
    );
    const schema = await inspectBootstrapSchema(executor);
    if (!schema.compatible)
      throw new PrivateElementaryBootstrapError(
        "SCHEMA_BLOCKED",
        "Artifact persistence requires existing bootstrap schema",
      );
    for (let i = 0; i < values.length; i++) {
      const candidate = candidates[i]!;
      const record: ArtifactRecord = {
        slug: null,
        status: "REJECTED",
        errorCode: "ARTIFACT_REJECTED",
        artifactChecksum: null,
        classification: null,
        facts: 0,
        admissionKnowledge: null,
        academicYear: null,
        created: null,
        preview: null,
      };
      records.push(record);
      let collection;
      try {
        if (
          !candidate.success ||
          duplicateSlugs.has(candidate.data.target.slug)
        )
          continue;
        collection = validateBootstrapArtifact(
          values[i],
          resolved,
          dependencies.seedSha256,
          now,
        );
      } catch {
        continue;
      }
      const artifact = candidate.data;
      record.slug = collection.target.slug;
      record.artifactChecksum = artifact.artifactChecksum;
      record.classification = artifact.classification;
      record.facts = collection.facts.length;
      record.admissionKnowledge =
        collection.admission?.proposal.knowledgeState ?? null;
      record.academicYear =
        collection.admission?.proposal.academicYearLabel ?? null;
      const existing = (await executor.raw(
        sql`select fact_type as "factType" from institution_facts where institution_id=${collection.target.institutionId}`,
      )) as unknown as Array<{ factType: string }>;
      record.preview = {
        institutionId: collection.target.institutionId,
        institutionName: collection.target.institutionName,
        websiteCollection: artifact.collection.websiteCollection,
        existingFacts: existing.length,
        expectedNewFacts: collection.facts.filter(
          (f) => !existing.some((e) => e.factType === f.factType),
        ).length,
        facts: artifact.facts,
        admission: artifact.admission,
        sources: artifact.sources,
        collection: artifact.collection.pages.map((p) => ({
          requestedUrl: p.requestedUrl,
          finalUrl: p.finalUrl,
          collectedAt: p.collectedAt,
          httpStatus: p.httpStatus,
          contentType: p.contentType,
        })),
        verifiedAt: null,
      };
      record.errorCode = null;
      if (dependencies.mode === "dry-run") {
        record.status = "DRY_RUN_VALID";
        continue;
      }
      try {
        const persisted = await persistPrivateElementarySchool(collection, {
          transactionManager: dependencies.transactionManager,
          supportsOfficialRegistrySourceType:
            schema.supportsOfficialRegistrySourceType,
          supportsRegistryIdentityBindingRole:
            schema.supportsRegistryIdentityBindingRole,
          now: () => now,
        });
        record.status = "PERSISTED";
        record.created = persisted.created;
        record.preview = {
          ...record.preview,
          opportunityId: persisted.opportunityId,
          opportunityVersionId: persisted.opportunityVersionId,
          verifiedAt: persisted.admissionVerifiedAt,
        };
      } catch (error) {
        record.status = "PERSISTENCE_FAILED";
        record.errorCode =
          error instanceof PrivateElementaryBootstrapError
            ? error.code
            : "PERSISTENCE_FAILED";
      }
    }
    const after = await readBootstrapArtifactCounts(executor);
    const sideEffects = Object.fromEntries(
      effectKeys.map((key) => [key, after[key]! - before[key]!]),
    );
    const countDeltas = Object.fromEntries(
      Object.keys(before).map((key) => [key, after[key]! - before[key]!]),
    );
    if (
      dependencies.mode === "dry-run" &&
      Object.values(countDeltas).some((value) => value !== 0)
    )
      throw new PrivateElementaryBootstrapError(
        "SIDE_EFFECT_DETECTED",
        "Dry-run database counts changed",
      );
    const admissions = {
      SCHEDULE_FOUND: 0,
      GUIDANCE_FOUND: 0,
      NOT_ANNOUNCED: 0,
      NOT_FOUND: 0,
    };
    const academicYears: Record<string, number> = {};
    for (const record of records.filter(
      (r) => r.status === "PERSISTED" || r.status === "DRY_RUN_VALID",
    )) {
      if (record.admissionKnowledge)
        admissions[record.admissionKnowledge as keyof typeof admissions]++;
      if (record.admissionKnowledge)
        academicYears[record.academicYear ?? "unknown"] =
          (academicYears[record.academicYear ?? "unknown"] ?? 0) + 1;
    }
    const rejected = records.filter((r) => r.status === "REJECTED").length;
    const failed = records.filter(
      (r) => r.status === "PERSISTENCE_FAILED",
    ).length;
    return {
      mode: dependencies.mode,
      approvalChecksum,
      selected: values.length,
      artifactsValid: values.length - rejected,
      artifactsRejected: rejected,
      schoolsPersisted: records.filter((r) => r.status === "PERSISTED").length,
      schoolsFailed: failed,
      factsPersisted: records
        .filter((r) => r.status === "PERSISTED")
        .reduce((n, r) => n + r.facts, 0),
      admissions,
      academicYears,
      sideEffects,
      countDeltas,
      databaseWrites: dependencies.mode === "dry-run" ? 0 : null,
      networkFetches: 0,
      records,
      exitCode:
        rejected === 0 &&
        failed === 0 &&
        Object.values(sideEffects).every((n) => n === 0)
          ? (0 as const)
          : (1 as const),
    };
  };
  if (dependencies.mode === "dry-run")
    return dependencies.transactionManager.run(async (executor) => {
      await executor.raw(
        sql`set transaction isolation level repeatable read, read only`,
      );
      return execute(executor);
    });
  return execute(dependencies.executor);
}
