import "server-only";

import { eq, sql } from "drizzle-orm";

import { AuditWriter } from "@/src/application/audit-writer.server";
import {
  createMigrationCommandContext,
  type MigrationCommandContext,
} from "@/src/application/context";
import {
  institutionRegistryIdentities,
  institutions,
  institutionSourceBindings,
  sources,
} from "@/src/db/schema";
import type {
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import type { ValidatedSeedPackage } from "@/src/modules/institution-seed/contract";
import {
  planInstitutionSeedImport,
  type SeedImportInventory,
  type SeedImportPlan,
} from "@/src/modules/institution-seed/planner";
import {
  productSideEffectDelta,
  type SeedImportMode,
  type SeedImportReport,
  type SeedProductSideEffectCounts,
} from "@/src/modules/institution-seed/report";

const ADVISORY_LOCK_KEY = "preppy-institution-seed-import-v1";

export type SeedImporterDependencies = {
  transactionManager: Pick<TransactionManager, "run">;
  writeAudit?: typeof AuditWriter.write;
  afterDomainWrites?: (executor: TransactionExecutor) => Promise<void>;
};

export type InstitutionSeedImportInput = {
  validated: ValidatedSeedPackage;
  occurredAt?: Date;
};

async function acquireImportLock(executor: TransactionExecutor): Promise<void> {
  await executor.raw(
    sql`select pg_advisory_xact_lock(hashtext(${ADVISORY_LOCK_KEY}))`,
  );
}

async function readInventory(
  executor: TransactionExecutor,
): Promise<SeedImportInventory> {
  const institutionRows = await executor.drizzle
    .select({
      id: institutions.id,
      slug: institutions.slug,
      displayName: institutions.displayName,
      category: institutions.category,
      internationalSubtype: institutions.internationalSubtype,
      operationalState: institutions.operationalState,
      publicationState: institutions.publicationState,
      regionCode: institutions.regionCode,
      city: institutions.city,
      district: institutions.district,
      addressLine: institutions.addressLine,
      websiteUrl: institutions.websiteUrl,
    })
    .from(institutions);
  const registryRows = await executor.drizzle
    .select({
      id: institutionRegistryIdentities.id,
      institutionId: institutionRegistryIdentities.institutionId,
      registryName: institutionRegistryIdentities.registryName,
      registryExternalId: institutionRegistryIdentities.registryExternalId,
      registryRecordUrl: institutionRegistryIdentities.registryRecordUrl,
      registryLocator: institutionRegistryIdentities.registryLocator,
      metadataJson: institutionRegistryIdentities.metadataJson,
    })
    .from(institutionRegistryIdentities);
  const sourceRows = await executor.drizzle
    .select({
      id: sources.id,
      canonicalUrl: sources.canonicalUrl,
      sourceType: sources.sourceType,
      authorityLevel: sources.authorityLevel,
      lifecycleStatus: sources.lifecycleStatus,
      sourceName: sources.sourceName,
      requiresJs: sources.requiresJs,
      contentTypeHint: sources.contentTypeHint,
    })
    .from(sources);
  const bindingRows = await executor.drizzle
    .select({
      institutionId: institutionSourceBindings.institutionId,
      sourceId: institutionSourceBindings.sourceId,
      role: institutionSourceBindings.role,
      isPrimary: institutionSourceBindings.isPrimary,
      isActive: institutionSourceBindings.isActive,
    })
    .from(institutionSourceBindings);

  return {
    institutions: institutionRows,
    registryIdentities: registryRows.map((row) => ({
      ...row,
      registryName: row.registryName as "SCHOOLINFO" | "ISI",
    })),
    sources: sourceRows,
    bindings: bindingRows,
  };
}

async function observeProductSideEffects(
  executor: TransactionExecutor,
): Promise<SeedProductSideEffectCounts> {
  const [row] = (await executor.raw(sql`
    select
      (select count(*)::int from institution_facts) as "institutionFacts",
      (select count(*)::int from opportunities) as "opportunities",
      (select count(*)::int from source_observations) as "sourceObservations",
      (select count(*)::int from source_snapshots) as "sourceSnapshots",
      (select count(*)::int from source_monitor_configs) as "sourceMonitorConfigs",
      (select count(*)::int from detected_changes) as "detectedChanges",
      (select count(*)::int from meaningful_changes) as "meaningfulChanges",
      (select count(*)::int from outbox_events) as "outboxEvents",
      (select count(*)::int from notifications) as "notifications",
      (select count(*)::int from notification_deliveries) as "notificationDeliveries",
      (select count(*)::int from notification_delivery_attempts) as "notificationDeliveryAttempts",
      (select count(*)::int from email_provider_events) as "emailProviderEvents"
  `)) as unknown as SeedProductSideEffectCounts[];
  if (!row) throw new Error("Seed Product side-effect counts are unavailable.");
  return row;
}

async function persistPlan(
  executor: TransactionExecutor,
  plan: SeedImportPlan,
  occurredAt: Date,
): Promise<void> {
  for (const action of plan.institutionActions) {
    if (action.institutionOperation === "CREATE") {
      await executor.drizzle.insert(institutions).values({
        ...action.desiredInstitution,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
    }
    if (action.registryOperation === "CREATE") {
      await executor.drizzle.insert(institutionRegistryIdentities).values({
        ...action.desiredRegistryIdentity,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
    } else if (action.registryOperation === "UPDATE") {
      await executor.drizzle
        .update(institutionRegistryIdentities)
        .set({
          registryRecordUrl: action.desiredRegistryIdentity.registryRecordUrl,
          registryLocator: action.desiredRegistryIdentity.registryLocator,
          metadataJson: action.desiredRegistryIdentity.metadataJson,
          updatedAt: occurredAt,
        })
        .where(
          eq(
            institutionRegistryIdentities.id,
            action.desiredRegistryIdentity.id,
          ),
        );
    }
  }

  for (const action of plan.sourceActions) {
    if (action.operation !== "CREATE") continue;
    await executor.drizzle.insert(sources).values({
      ...action.desiredSource,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });
  }

  for (const action of plan.bindingActions) {
    if (action.operation !== "UPSERT") continue;
    await executor.drizzle
      .insert(institutionSourceBindings)
      .values({
        ...action.desiredBinding,
        boundAt: occurredAt,
        unboundAt: null,
      })
      .onConflictDoUpdate({
        target: [
          institutionSourceBindings.institutionId,
          institutionSourceBindings.sourceId,
          institutionSourceBindings.role,
        ],
        set: {
          isPrimary: action.desiredBinding.isPrimary,
          isActive: true,
          boundAt: occurredAt,
          unboundAt: null,
        },
      });
  }
}

function report(
  mode: SeedImportMode,
  applied: boolean,
  context: MigrationCommandContext,
  plan: SeedImportPlan,
  auditWritten: boolean,
  before: SeedProductSideEffectCounts,
  after: SeedProductSideEffectCounts,
): SeedImportReport {
  return {
    mode,
    applied,
    context,
    plan,
    audit: {
      actionType: "SEED_BOOTSTRAP_IMPORT",
      written: auditWritten,
    },
    productSideEffects: {
      before,
      after,
      delta: productSideEffectDelta(before, after),
    },
  };
}

async function runImport(
  mode: SeedImportMode,
  input: InstitutionSeedImportInput,
  dependencies: SeedImporterDependencies,
): Promise<SeedImportReport> {
  const context = createMigrationCommandContext({
    occurredAt: input.occurredAt,
  });
  return dependencies.transactionManager.run(async (executor) => {
    await acquireImportLock(executor);
    const inventory = await readInventory(executor);
    const plan = planInstitutionSeedImport(input.validated, inventory);
    const before = await observeProductSideEffects(executor);

    if (mode === "dry-run" || !plan.applyAllowed) {
      return report(mode, false, context, plan, false, before, before);
    }

    await persistPlan(executor, plan, context.occurredAt);
    await dependencies.afterDomainWrites?.(executor);
    await (dependencies.writeAudit ?? AuditWriter.write)(
      {
        adminUserId: null,
        actionType: "SEED_BOOTSTRAP_IMPORT",
        entityType: "INSTITUTION_SEED",
        entityId: null,
        correlationId: context.correlationId,
        reason: "MIGRATION",
        occurredAt: context.occurredAt,
        metadata: {
          outcomeCode: "APPLIED",
          contentFingerprint: `sha256:${plan.checksum}`,
        },
      },
      executor,
    );
    const after = await observeProductSideEffects(executor);
    return report("apply", true, context, plan, true, before, after);
  });
}

export function dryRunInstitutionSeedImport(
  input: InstitutionSeedImportInput,
  dependencies: SeedImporterDependencies,
): Promise<SeedImportReport> {
  return runImport("dry-run", input, dependencies);
}

export function applyInstitutionSeedImport(
  input: InstitutionSeedImportInput,
  dependencies: SeedImporterDependencies,
): Promise<SeedImportReport> {
  return runImport("apply", input, dependencies);
}
