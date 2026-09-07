import "server-only";

import { eq, sql } from "drizzle-orm";

import {
  institutionFacts,
  institutionFactVersions,
  institutionFactVersionEvidence,
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
import type { EnglishKindergartenImportPackage } from "@/src/modules/english-kindergarten-import/artifact-schema";
import {
  planEnglishKindergartenImport,
  type EnglishKindergartenImportPlan,
  type ImportCountSet,
} from "@/src/modules/english-kindergarten-import/planner.server";
import { validateEnglishKindergartenPackage } from "@/src/modules/english-kindergarten-import/validator";

export type EnglishKindergartenImportMode = "dry-run" | "apply";

export type EnglishKindergartenImportInput = Readonly<{
  packageValue: EnglishKindergartenImportPackage;
  expectedChecksum?: string;
  occurredAt?: Date;
}>;

export type EnglishKindergartenImportDependencies = Readonly<{
  transactionManager: Pick<TransactionManager, "run">;
  afterDomainWrites?: (executor: TransactionExecutor) => Promise<void>;
}>;

export type EnglishKindergartenImportReport = Readonly<{
  mode: EnglishKindergartenImportMode;
  applied: boolean;
  packageId: string;
  packageChecksum: string;
  plan: EnglishKindergartenImportPlan;
  appliedCounts: ImportCountSet;
  sideEffects: Readonly<{
    outboxEvents: number;
    notifications: number;
    deliveries: number;
    meaningfulChanges: number;
  }>;
}>;

type SideEffectCounts = EnglishKindergartenImportReport["sideEffects"];

function zeroAppliedCounts(plan: EnglishKindergartenImportPlan) {
  return Object.fromEntries(
    Object.keys(plan.created).map((key) => [key, 0]),
  ) as ImportCountSet;
}

async function observeSideEffects(
  executor: TransactionExecutor,
): Promise<SideEffectCounts> {
  const [row] = (await executor.raw(sql`
    select
      (select count(*)::int from outbox_events) as "outboxEvents",
      (select count(*)::int from notifications) as "notifications",
      (select count(*)::int from notification_deliveries) as "deliveries",
      (select count(*)::int from meaningful_changes) as "meaningfulChanges"
  `)) as unknown as SideEffectCounts[];
  if (!row) throw new Error("반입 부수 효과 합계를 확인하지 못했어요.");
  return row;
}

function sideEffectDelta(before: SideEffectCounts, after: SideEffectCounts) {
  return {
    outboxEvents: after.outboxEvents - before.outboxEvents,
    notifications: after.notifications - before.notifications,
    deliveries: after.deliveries - before.deliveries,
    meaningfulChanges: after.meaningfulChanges - before.meaningfulChanges,
  };
}

async function persistPlan(
  executor: TransactionExecutor,
  plan: EnglishKindergartenImportPlan,
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
    await executor.drizzle.insert(sourceObservations).values({
      ...action.desired,
      createdAt: occurredAt,
    });
  }
  for (const action of plan.actions.bindings) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(institutionSourceBindings).values({
      ...action.desired,
      boundAt: occurredAt,
      unboundAt: null,
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
    if (action.previousCurrentId) {
      await executor.drizzle
        .update(institutionFactVersions)
        .set({ isCurrent: false, verificationState: "SUPERSEDED" })
        .where(eq(institutionFactVersions.id, action.previousCurrentId));
    }
    await executor.drizzle.insert(institutionFactVersions).values({
      ...action.desired,
      createdAt: occurredAt,
    });
  }
  for (const action of plan.actions.factEvidence) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(institutionFactVersionEvidence).values({
      id: action.id,
      institutionFactVersionId: action.versionId,
      sourceId: action.sourceId,
      sourceObservationId: null,
      sourceSnapshotId: action.sourceSnapshotId,
      evidenceRole: action.evidenceRole,
      createdAt: occurredAt,
    });
  }
  for (const action of plan.actions.opportunities) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(opportunities).values({
      ...action.desired,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }
  for (const action of plan.actions.opportunityVersions) {
    if (action.operation !== "CREATE") continue;
    if (action.previousCurrentId) {
      await executor.drizzle
        .update(opportunityVersions)
        .set({ isCurrent: false, verificationState: "SUPERSEDED" })
        .where(eq(opportunityVersions.id, action.previousCurrentId));
    }
    await executor.drizzle.insert(opportunityVersions).values({
      ...action.desired,
      businessState: action.desired
        .businessState as (typeof opportunityVersions.$inferInsert)["businessState"],
      createdAt: occurredAt,
    });
  }
  for (const action of plan.actions.opportunityEvidence) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(opportunityVersionEvidence).values({
      id: action.id,
      opportunityVersionId: action.versionId,
      sourceId: action.sourceId,
      sourceObservationId: null,
      sourceSnapshotId: action.sourceSnapshotId,
      evidenceRole: action.evidenceRole,
      createdAt: occurredAt,
    });
  }
}

async function runImport(
  mode: EnglishKindergartenImportMode,
  input: EnglishKindergartenImportInput,
  dependencies: EnglishKindergartenImportDependencies,
): Promise<EnglishKindergartenImportReport> {
  const validation = validateEnglishKindergartenPackage(input.packageValue);
  if (validation.status !== "PASS") {
    throw new Error(
      `Package validation failed: ${validation.errors.join(" ")}`,
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
        sql`select pg_advisory_xact_lock(hashtext(${`preppy-english-kindergarten-import:${input.packageValue.snapshot.packageId}`}))`,
      );
      const insideValidation = validateEnglishKindergartenPackage(
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

    const plan = await planEnglishKindergartenImport(
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
        "English-kindergarten backfill produced product signals.",
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

export function dryRunEnglishKindergartenImport(
  input: EnglishKindergartenImportInput,
  dependencies: EnglishKindergartenImportDependencies,
) {
  return runImport("dry-run", input, dependencies);
}

export function applyEnglishKindergartenImport(
  input: EnglishKindergartenImportInput,
  dependencies: EnglishKindergartenImportDependencies,
) {
  return runImport("apply", input, dependencies);
}
