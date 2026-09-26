import "server-only";

import { sql } from "drizzle-orm";

import {
  institutionFacts,
  institutionFactVersions,
  institutionFactVersionEvidence,
  institutionRegistryIdentities,
  institutions,
  institutionSectionCoverages,
  institutionSourceBindings,
  opportunities,
  opportunityVersions,
  opportunityVersionEvidence,
  sourceObservations,
  sources,
  sourceSnapshots,
} from "@/src/db/schema";
import type {
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import type { InternationalSchoolImportPackage } from "./artifact-schema";
import {
  planInternationalSchoolImport,
  type ImportCountSet,
  type InternationalSchoolImportPlan,
} from "./planner.server";
import { validateInternationalSchoolPackage } from "./validator";

export type InternationalSchoolImportMode = "dry-run" | "apply";

export type InternationalSchoolImportInput = Readonly<{
  packageValue: InternationalSchoolImportPackage;
  expectedChecksum?: string;
  occurredAt?: Date;
}>;

export type InternationalSchoolImportDependencies = Readonly<{
  transactionManager: Pick<TransactionManager, "run">;
  afterDomainWrites?: (executor: TransactionExecutor) => Promise<void>;
}>;

export type InternationalSchoolImportSideEffects = Readonly<{
  outboxEvents: number;
  notifications: number;
  notificationDeliveries: number;
  alerts: number;
  updates: number;
  detectedChanges: number;
  meaningfulChanges: number;
  opportunityChanges: number;
}>;

export type InternationalSchoolImportReport = Readonly<{
  mode: InternationalSchoolImportMode;
  applied: boolean;
  packageId: string;
  packageChecksum: string;
  plan: InternationalSchoolImportPlan;
  appliedCounts: ImportCountSet;
  sideEffects: InternationalSchoolImportSideEffects;
}>;

function zeroAppliedCounts(
  plan: InternationalSchoolImportPlan,
): ImportCountSet {
  return Object.fromEntries(
    Object.keys(plan.created).map((key) => [key, 0]),
  ) as ImportCountSet;
}

async function observeSideEffects(
  executor: TransactionExecutor,
): Promise<InternationalSchoolImportSideEffects> {
  const [row] = (await executor.raw(sql`
    select
      (select count(*)::int from outbox_events) as "outboxEvents",
      (select count(*)::int from notifications) as "notifications",
      (select count(*)::int from notification_deliveries) as "notificationDeliveries",
      (select count(*)::int from alerts) as alerts,
      (select count(*)::int from updates) as updates,
      (select count(*)::int from detected_changes) as "detectedChanges",
      (select count(*)::int from meaningful_changes) as "meaningfulChanges",
      (select count(*)::int from opportunity_changes) as "opportunityChanges"
  `)) as unknown as InternationalSchoolImportSideEffects[];
  if (!row) throw new Error("반입 부수 효과 합계를 확인하지 못했어요.");
  return row;
}

function sideEffectDelta(
  before: InternationalSchoolImportSideEffects,
  after: InternationalSchoolImportSideEffects,
): InternationalSchoolImportSideEffects {
  return {
    outboxEvents: after.outboxEvents - before.outboxEvents,
    notifications: after.notifications - before.notifications,
    notificationDeliveries:
      after.notificationDeliveries - before.notificationDeliveries,
    alerts: after.alerts - before.alerts,
    updates: after.updates - before.updates,
    detectedChanges: after.detectedChanges - before.detectedChanges,
    meaningfulChanges: after.meaningfulChanges - before.meaningfulChanges,
    opportunityChanges: after.opportunityChanges - before.opportunityChanges,
  };
}

async function observationIdsByReference(
  executor: TransactionExecutor,
  plan: InternationalSchoolImportPlan,
): Promise<Map<string, bigint>> {
  const references = plan.actions.observations.map(
    (action) => action.desired.observationRef,
  );
  if (references.length === 0) return new Map();
  const rows = (await executor.raw(sql`
    select
      id,
      metadata->>'artifactObservationRef' as "observationRef"
    from source_observations
    where metadata->>'artifactObservationRef' in (${sql.join(
      references.map((reference) => sql`${reference}`),
      sql`, `,
    )})
  `)) as unknown as Array<{ id: bigint | string; observationRef: string }>;
  return new Map(
    rows.map((row) => [row.observationRef, BigInt(row.id)] as const),
  );
}

async function persistPlan(
  executor: TransactionExecutor,
  plan: InternationalSchoolImportPlan,
  occurredAt: Date,
) {
  for (const action of plan.actions.institutions) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(institutions).values({
      ...action.desired,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }
  for (const action of plan.actions.registryIdentities) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(institutionRegistryIdentities).values({
      ...action.desired,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }
  for (const action of plan.actions.sources) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(sources).values({
      ...action.desired,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }
  for (const action of plan.actions.snapshots) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(sourceSnapshots).values({
      ...action.desired,
      createdAt: occurredAt,
    });
  }
  for (const action of plan.actions.observations) {
    if (action.operation !== "CREATE") continue;
    const { observationRef, ...desired } = action.desired;
    void observationRef;
    await executor.drizzle.insert(sourceObservations).values({
      ...desired,
      createdAt: occurredAt,
    });
  }
  for (const action of plan.actions.bindings) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(institutionSourceBindings).values({
      ...action.desired,
      boundAt: occurredAt,
    });
  }
  for (const action of plan.actions.coverages) {
    if (action.operation === "NONE") continue;
    await executor.drizzle
      .insert(institutionSectionCoverages)
      .values({
        ...action.desired,
        section: action.desired
          .section as (typeof institutionSectionCoverages.$inferInsert)["section"],
        status: action.desired
          .status as (typeof institutionSectionCoverages.$inferInsert)["status"],
        createdAt: occurredAt,
        updatedAt: occurredAt,
      })
      .onConflictDoUpdate({
        target: [
          institutionSectionCoverages.institutionId,
          institutionSectionCoverages.section,
        ],
        set: {
          status: action.desired
            .status as (typeof institutionSectionCoverages.$inferInsert)["status"],
          sourceId: action.desired.sourceId,
          sourceSnapshotId: action.desired.sourceSnapshotId,
          academicYearLabel: action.desired.academicYearLabel,
          publicNote: action.desired.publicNote,
          internalNote: action.desired.internalNote,
          lastCollectedAt: action.desired.lastCollectedAt,
          lastCheckedAt: action.desired.lastCheckedAt,
          updatedAt: occurredAt,
        },
      });
  }
  for (const action of plan.actions.facts) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(institutionFacts).values({
      ...action.desired,
      factType: action.desired
        .factType as (typeof institutionFacts.$inferInsert)["factType"],
      createdAt: occurredAt,
    });
  }
  for (const action of plan.actions.factVersions) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(institutionFactVersions).values({
      ...action.desired,
      createdAt: occurredAt,
    });
  }
  for (const action of plan.actions.opportunities) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(opportunities).values({
      ...action.desired,
      kind: action.desired.kind as (typeof opportunities.$inferInsert)["kind"],
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }
  for (const action of plan.actions.opportunityVersions) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(opportunityVersions).values({
      id: action.desired.id,
      opportunityId: action.desired.opportunityId,
      versionNumber: action.desired.versionNumber,
      supersedesVersionId: action.desired.supersedesVersionId,
      verificationState: action.desired.verificationState,
      isCurrent: action.desired.isCurrent,
      title: action.desired.title,
      businessState: action.desired
        .businessState as (typeof opportunityVersions.$inferInsert)["businessState"],
      eventStartAt: action.desired.eventStartsAt,
      applicationCloseAt: action.desired.applicationClosesAt,
      actionUrl: action.desired.actionUrl,
      verifiedAt: action.desired.verifiedAt,
      createdAt: occurredAt,
    });
  }

  const observationIds = await observationIdsByReference(executor, plan);
  for (const action of plan.actions.factVersionEvidence) {
    if (action.operation !== "CREATE") continue;
    const observationId = observationIds.get(
      action.desired.sourceObservationRef,
    );
    if (observationId === undefined) {
      throw new Error(
        `공식 사실 근거 observation을 찾지 못했어요: ${action.desired.sourceObservationRef}`,
      );
    }
    await executor.drizzle.insert(institutionFactVersionEvidence).values({
      id: action.desired.id,
      institutionFactVersionId: action.desired.institutionFactVersionId,
      sourceId: action.desired.sourceId,
      sourceObservationId: observationId,
      sourceSnapshotId: action.desired.sourceSnapshotId,
      evidenceRole: action.desired.evidenceRole,
      createdAt: occurredAt,
    });
  }
  for (const action of plan.actions.opportunityVersionEvidence) {
    if (action.operation !== "CREATE") continue;
    const observationId = observationIds.get(
      action.desired.sourceObservationRef,
    );
    if (observationId === undefined) {
      throw new Error(
        `공식 행사 근거 observation을 찾지 못했어요: ${action.desired.sourceObservationRef}`,
      );
    }
    await executor.drizzle.insert(opportunityVersionEvidence).values({
      id: action.desired.id,
      opportunityVersionId: action.desired.opportunityVersionId,
      sourceId: action.desired.sourceId,
      sourceObservationId: observationId,
      sourceSnapshotId: action.desired.sourceSnapshotId,
      evidenceRole: action.desired.evidenceRole,
      createdAt: occurredAt,
    });
  }
}

async function runImport(
  mode: InternationalSchoolImportMode,
  input: InternationalSchoolImportInput,
  dependencies: InternationalSchoolImportDependencies,
): Promise<InternationalSchoolImportReport> {
  const validation = validateInternationalSchoolPackage(input.packageValue);
  if (validation.status !== "PASS") {
    throw new Error(
      `Package validation failed: ${validation.errors
        .map((error) => error.message)
        .join(" ")}`,
    );
  }
  if (mode === "apply") {
    if (
      !input.expectedChecksum ||
      !/^[a-f0-9]{64}$/u.test(input.expectedChecksum)
    ) {
      throw new Error("Apply requires an exact 64-character checksum.");
    }
    if (input.expectedChecksum !== validation.packageChecksum) {
      throw new Error(
        "Expected checksum does not match the reviewed package checksum.",
      );
    }
  }

  return dependencies.transactionManager.run(async (executor) => {
    if (mode === "apply") {
      await executor.raw(
        sql`select pg_advisory_xact_lock(hashtext(${`preppy-international-school-import:${input.packageValue.snapshot.packageId}`}))`,
      );
      const insideValidation = validateInternationalSchoolPackage(
        input.packageValue,
      );
      if (
        insideValidation.status !== "PASS" ||
        insideValidation.packageChecksum !== input.expectedChecksum
      ) {
        throw new Error(
          "Package checksum changed before the transaction apply.",
        );
      }
    }

    const plan = await planInternationalSchoolImport(
      executor,
      input.packageValue,
    );
    const before = await observeSideEffects(executor);
    if (mode === "dry-run" || !plan.applyAllowed) {
      return {
        mode,
        applied: false,
        packageId: plan.packageId,
        packageChecksum: plan.packageChecksum,
        plan,
        appliedCounts: zeroAppliedCounts(plan),
        sideEffects: sideEffectDelta(before, before),
      };
    }

    await persistPlan(executor, plan, input.occurredAt ?? new Date());
    await dependencies.afterDomainWrites?.(executor);
    const after = await observeSideEffects(executor);
    const delta = sideEffectDelta(before, after);
    if (Object.values(delta).some((value) => value !== 0)) {
      throw new Error(
        "International-school backfill produced product signals.",
      );
    }
    return {
      mode: "apply",
      applied: true,
      packageId: plan.packageId,
      packageChecksum: plan.packageChecksum,
      plan,
      appliedCounts: plan.created,
      sideEffects: delta,
    };
  });
}

export function dryRunInternationalSchoolImport(
  input: InternationalSchoolImportInput,
  dependencies: InternationalSchoolImportDependencies,
) {
  return runImport("dry-run", input, dependencies);
}

export function applyInternationalSchoolImport(
  input: InternationalSchoolImportInput,
  dependencies: InternationalSchoolImportDependencies,
) {
  return runImport("apply", input, dependencies);
}
