import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  admissionEventVersions,
  institutionSourceBindings,
  institutions,
  meaningfulChanges,
  opportunities,
  opportunityAdmissionEventLinks,
  opportunityChanges,
  opportunitySourceBindings,
  opportunityVersionEvidence,
  opportunityVersions,
  outboxEvents,
  sourceMonitorConfigs,
  sourceObservations,
  sourceSnapshots,
  sources,
} from "@/src/db/schema";
import type {
  DatabaseExecutor,
  TransactionExecutor,
} from "@/src/infrastructure/db/runtime.server";

export async function findSourceForUpdate(
  executor: TransactionExecutor,
  sourceId: string,
) {
  const [source] = await executor.drizzle
    .select()
    .from(sources)
    .where(eq(sources.id, sourceId))
    .for("update")
    .limit(1);

  return source ?? null;
}

export async function findSourcesForUpdate(
  executor: TransactionExecutor,
  sourceIds: readonly string[],
) {
  if (sourceIds.length === 0) return [];
  return executor.drizzle
    .select()
    .from(sources)
    .where(inArray(sources.id, [...sourceIds]))
    .orderBy(asc(sources.id))
    .for("update");
}

export async function findSourceSnapshot(
  executor: DatabaseExecutor,
  snapshotId: string,
) {
  const [snapshot] = await executor.drizzle
    .select()
    .from(sourceSnapshots)
    .where(eq(sourceSnapshots.id, snapshotId))
    .limit(1);

  return snapshot ?? null;
}

export async function insertSourceObservation(
  executor: TransactionExecutor,
  input: {
    sourceId: string;
    observedAt: Date;
    outcome: string;
    httpStatus?: number;
    finalUrl?: string;
    contentHash?: string;
    textHash?: string;
    responseBytes?: bigint;
    durationMs?: number;
    errorCode?: string;
    errorMessage?: string;
    snapshotId?: string;
    etag?: string;
    lastModified?: string;
  },
) {
  const [observation] = await executor.drizzle
    .insert(sourceObservations)
    .values(input)
    .returning();

  return observation!;
}

export async function updateSourceLifecycle(
  executor: TransactionExecutor,
  input: {
    sourceId: string;
    lifecycleStatus: "DISCOVERED" | "ACTIVE" | "PAUSED" | "RETIRED";
    updatedAt: Date;
  },
) {
  const [source] = await executor.drizzle
    .update(sources)
    .set({
      lifecycleStatus: input.lifecycleStatus,
      updatedAt: input.updatedAt,
    })
    .where(eq(sources.id, input.sourceId))
    .returning();

  return source ?? null;
}

export async function updateSourceCanonicalUrl(
  executor: TransactionExecutor,
  input: { sourceId: string; canonicalUrl: string; updatedAt: Date },
) {
  const [source] = await executor.drizzle
    .update(sources)
    .set({ canonicalUrl: input.canonicalUrl, updatedAt: input.updatedAt })
    .where(eq(sources.id, input.sourceId))
    .returning();
  return source ?? null;
}

export async function insertReplacementSource(
  executor: TransactionExecutor,
  input: {
    canonicalUrl: string;
    sourceType: string;
    authorityLevel: string;
    sourceName: string;
    requiresJs: boolean;
    contentTypeHint: string | null;
    occurredAt: Date;
  },
) {
  const [source] = await executor.drizzle
    .insert(sources)
    .values({
      canonicalUrl: input.canonicalUrl,
      sourceType: input.sourceType,
      authorityLevel: input.authorityLevel,
      lifecycleStatus: "ACTIVE",
      sourceName: input.sourceName,
      requiresJs: input.requiresJs,
      contentTypeHint: input.contentTypeHint,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    })
    .returning();
  return source!;
}

export async function findSourceMonitorConfigForUpdate(
  executor: TransactionExecutor,
  sourceId: string,
) {
  const [config] = await executor.drizzle
    .select()
    .from(sourceMonitorConfigs)
    .where(eq(sourceMonitorConfigs.sourceId, sourceId))
    .for("update")
    .limit(1);
  return config ?? null;
}

export async function insertSourceMonitorConfigCopy(
  executor: TransactionExecutor,
  input: {
    sourceId: string;
    collectionStrategy: string;
    monitoringProfile: string;
    customIntervalMinutes: number | null;
    seasonalEnabled: boolean;
    browserRequired: boolean;
    maxAttempts: number;
    isEnabled: boolean;
    occurredAt: Date;
  },
) {
  const [config] = await executor.drizzle
    .insert(sourceMonitorConfigs)
    .values({
      sourceId: input.sourceId,
      collectionStrategy: input.collectionStrategy,
      monitoringProfile: input.monitoringProfile,
      customIntervalMinutes: input.customIntervalMinutes,
      seasonalEnabled: input.seasonalEnabled,
      browserRequired: input.browserRequired,
      maxAttempts: input.maxAttempts,
      isEnabled: input.isEnabled,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    })
    .returning();
  return config!;
}

export async function listActiveInstitutionBindingsForSourceForUpdate(
  executor: TransactionExecutor,
  sourceId: string,
) {
  return executor.drizzle
    .select()
    .from(institutionSourceBindings)
    .where(
      and(
        eq(institutionSourceBindings.sourceId, sourceId),
        eq(institutionSourceBindings.isActive, true),
      ),
    )
    .orderBy(
      asc(institutionSourceBindings.institutionId),
      asc(institutionSourceBindings.role),
    )
    .for("update");
}

export async function listActiveOpportunityBindingsForSourceForUpdate(
  executor: TransactionExecutor,
  sourceId: string,
) {
  return executor.drizzle
    .select()
    .from(opportunitySourceBindings)
    .where(
      and(
        eq(opportunitySourceBindings.sourceId, sourceId),
        eq(opportunitySourceBindings.isActive, true),
      ),
    )
    .orderBy(
      asc(opportunitySourceBindings.opportunityId),
      asc(opportunitySourceBindings.role),
    )
    .for("update");
}

export async function findInstitutionSourceBindingForUpdate(
  executor: TransactionExecutor,
  input: { institutionId: string; sourceId: string; role: string },
) {
  const [binding] = await executor.drizzle
    .select()
    .from(institutionSourceBindings)
    .where(
      and(
        eq(institutionSourceBindings.institutionId, input.institutionId),
        eq(institutionSourceBindings.sourceId, input.sourceId),
        eq(institutionSourceBindings.role, input.role as never),
      ),
    )
    .for("update")
    .limit(1);

  return binding ?? null;
}

export async function findActiveInstitutionPrimaryBinding(
  executor: TransactionExecutor,
  input: { institutionId: string; role: string },
) {
  const [binding] = await executor.drizzle
    .select()
    .from(institutionSourceBindings)
    .where(
      and(
        eq(institutionSourceBindings.institutionId, input.institutionId),
        eq(institutionSourceBindings.role, input.role as never),
        eq(institutionSourceBindings.isPrimary, true),
        eq(institutionSourceBindings.isActive, true),
      ),
    )
    .for("update")
    .limit(1);

  return binding ?? null;
}

export async function insertInstitutionSourceBinding(
  executor: TransactionExecutor,
  input: {
    institutionId: string;
    sourceId: string;
    role: (typeof institutionSourceBindings.$inferInsert)["role"];
    isPrimary: boolean;
    boundAt: Date;
  },
) {
  const [binding] = await executor.drizzle
    .insert(institutionSourceBindings)
    .values({ ...input, isActive: true, unboundAt: null })
    .returning();
  return binding!;
}

export async function activateInstitutionSourceBinding(
  executor: TransactionExecutor,
  input: {
    institutionId: string;
    sourceId: string;
    role: string;
    isPrimary: boolean;
    boundAt: Date;
  },
) {
  const [binding] = await executor.drizzle
    .update(institutionSourceBindings)
    .set({
      isPrimary: input.isPrimary,
      isActive: true,
      boundAt: input.boundAt,
      unboundAt: null,
    })
    .where(
      and(
        eq(institutionSourceBindings.institutionId, input.institutionId),
        eq(institutionSourceBindings.sourceId, input.sourceId),
        eq(institutionSourceBindings.role, input.role as never),
        eq(institutionSourceBindings.isActive, false),
      ),
    )
    .returning();
  return binding ?? null;
}

export async function deactivateInstitutionSourceBinding(
  executor: TransactionExecutor,
  input: {
    institutionId: string;
    sourceId: string;
    role: string;
    unboundAt: Date;
  },
) {
  const [binding] = await executor.drizzle
    .update(institutionSourceBindings)
    .set({ isActive: false, unboundAt: input.unboundAt })
    .where(
      and(
        eq(institutionSourceBindings.institutionId, input.institutionId),
        eq(institutionSourceBindings.sourceId, input.sourceId),
        eq(institutionSourceBindings.role, input.role as never),
        eq(institutionSourceBindings.isActive, true),
      ),
    )
    .returning();
  return binding ?? null;
}

export async function findOpportunitySourceBindingForUpdate(
  executor: TransactionExecutor,
  input: { opportunityId: string; sourceId: string; role: string },
) {
  const [binding] = await executor.drizzle
    .select()
    .from(opportunitySourceBindings)
    .where(
      and(
        eq(opportunitySourceBindings.opportunityId, input.opportunityId),
        eq(opportunitySourceBindings.sourceId, input.sourceId),
        eq(opportunitySourceBindings.role, input.role as never),
      ),
    )
    .for("update")
    .limit(1);
  return binding ?? null;
}

export async function findActiveOpportunityPrimaryBinding(
  executor: TransactionExecutor,
  input: { opportunityId: string; role: string },
) {
  const [binding] = await executor.drizzle
    .select()
    .from(opportunitySourceBindings)
    .where(
      and(
        eq(opportunitySourceBindings.opportunityId, input.opportunityId),
        eq(opportunitySourceBindings.role, input.role as never),
        eq(opportunitySourceBindings.isPrimary, true),
        eq(opportunitySourceBindings.isActive, true),
      ),
    )
    .for("update")
    .limit(1);
  return binding ?? null;
}

export async function insertOpportunitySourceBinding(
  executor: TransactionExecutor,
  input: {
    opportunityId: string;
    sourceId: string;
    role: (typeof opportunitySourceBindings.$inferInsert)["role"];
    isPrimary: boolean;
    boundAt: Date;
  },
) {
  const [binding] = await executor.drizzle
    .insert(opportunitySourceBindings)
    .values({ ...input, isActive: true, unboundAt: null })
    .returning();
  return binding!;
}

export async function activateOpportunitySourceBinding(
  executor: TransactionExecutor,
  input: {
    opportunityId: string;
    sourceId: string;
    role: string;
    isPrimary: boolean;
    boundAt: Date;
  },
) {
  const [binding] = await executor.drizzle
    .update(opportunitySourceBindings)
    .set({
      isPrimary: input.isPrimary,
      isActive: true,
      boundAt: input.boundAt,
      unboundAt: null,
    })
    .where(
      and(
        eq(opportunitySourceBindings.opportunityId, input.opportunityId),
        eq(opportunitySourceBindings.sourceId, input.sourceId),
        eq(opportunitySourceBindings.role, input.role as never),
        eq(opportunitySourceBindings.isActive, false),
      ),
    )
    .returning();
  return binding ?? null;
}

export async function deactivateOpportunitySourceBinding(
  executor: TransactionExecutor,
  input: {
    opportunityId: string;
    sourceId: string;
    role: string;
    unboundAt: Date;
  },
) {
  const [binding] = await executor.drizzle
    .update(opportunitySourceBindings)
    .set({ isActive: false, unboundAt: input.unboundAt })
    .where(
      and(
        eq(opportunitySourceBindings.opportunityId, input.opportunityId),
        eq(opportunitySourceBindings.sourceId, input.sourceId),
        eq(opportunitySourceBindings.role, input.role as never),
        eq(opportunitySourceBindings.isActive, true),
      ),
    )
    .returning();
  return binding ?? null;
}

export async function findActiveOpportunitySourceBindingForUpdate(
  executor: TransactionExecutor,
  input: { opportunityId: string; sourceId: string },
) {
  const [binding] = await executor.drizzle
    .select()
    .from(opportunitySourceBindings)
    .where(
      and(
        eq(opportunitySourceBindings.opportunityId, input.opportunityId),
        eq(opportunitySourceBindings.sourceId, input.sourceId),
        eq(opportunitySourceBindings.isActive, true),
      ),
    )
    .for("update")
    .limit(1);
  return binding ?? null;
}

export async function findActiveInstitutionSourceBindingForUpdate(
  executor: TransactionExecutor,
  input: { institutionId: string; sourceId: string },
) {
  const [binding] = await executor.drizzle
    .select()
    .from(institutionSourceBindings)
    .where(
      and(
        eq(institutionSourceBindings.institutionId, input.institutionId),
        eq(institutionSourceBindings.sourceId, input.sourceId),
        eq(institutionSourceBindings.isActive, true),
      ),
    )
    .for("update")
    .limit(1);
  return binding ?? null;
}

export async function findSourceObservation(
  executor: DatabaseExecutor,
  observationId: bigint,
) {
  const [observation] = await executor.drizzle
    .select()
    .from(sourceObservations)
    .where(eq(sourceObservations.id, observationId))
    .limit(1);
  return observation ?? null;
}

export async function supersedeCurrentOpportunityVersion(
  executor: TransactionExecutor,
  input: { versionId: string; opportunityId: string },
) {
  const [version] = await executor.drizzle
    .update(opportunityVersions)
    .set({ verificationState: "SUPERSEDED", isCurrent: false })
    .where(
      and(
        eq(opportunityVersions.id, input.versionId),
        eq(opportunityVersions.opportunityId, input.opportunityId),
        eq(opportunityVersions.isCurrent, true),
      ),
    )
    .returning();
  return version ?? null;
}

export async function insertOpportunityVersion(
  executor: TransactionExecutor,
  input: typeof opportunityVersions.$inferInsert,
) {
  const [version] = await executor.drizzle
    .insert(opportunityVersions)
    .values(input)
    .returning();
  return version!;
}

export async function insertOpportunityVersionEvidence(
  executor: TransactionExecutor,
  input: typeof opportunityVersionEvidence.$inferInsert,
) {
  const [evidence] = await executor.drizzle
    .insert(opportunityVersionEvidence)
    .values(input)
    .returning();
  return evidence!;
}

export async function findOpportunityVersionEvidenceForSource(
  executor: DatabaseExecutor,
  input: { opportunityVersionId: string; sourceId: string },
) {
  const [evidence] = await executor.drizzle
    .select()
    .from(opportunityVersionEvidence)
    .where(
      and(
        eq(
          opportunityVersionEvidence.opportunityVersionId,
          input.opportunityVersionId,
        ),
        eq(opportunityVersionEvidence.sourceId, input.sourceId),
      ),
    )
    .limit(1);
  return evidence ?? null;
}

export async function insertOpportunityChange(
  executor: TransactionExecutor,
  input: typeof opportunityChanges.$inferInsert,
) {
  const [change] = await executor.drizzle
    .insert(opportunityChanges)
    .values(input)
    .returning();
  return change!;
}

export async function findOpportunityChangeByDedupeKey(
  executor: DatabaseExecutor,
  dedupeKey: string,
) {
  const [change] = await executor.drizzle
    .select()
    .from(opportunityChanges)
    .where(eq(opportunityChanges.dedupeKey, dedupeKey))
    .limit(1);
  return change ?? null;
}

export async function findNativeOpportunityChangeByDestinationVersion(
  executor: DatabaseExecutor,
  input: { opportunityId: string; versionId: string },
) {
  const [change] = await executor.drizzle
    .select()
    .from(opportunityChanges)
    .where(
      and(
        eq(opportunityChanges.opportunityId, input.opportunityId),
        eq(opportunityChanges.toNativeVersionId, input.versionId),
      ),
    )
    .limit(1);
  return change ?? null;
}

export async function findLegacyOpportunityChangeByEventVersion(
  executor: DatabaseExecutor,
  input: {
    opportunityId: string;
    admissionEventId: string;
    eventVersionId: string;
  },
) {
  const [change] = await executor.drizzle
    .select({
      id: opportunityChanges.id,
      changeType: opportunityChanges.changeType,
      materiality: opportunityChanges.materiality,
    })
    .from(opportunityChanges)
    .innerJoin(
      meaningfulChanges,
      eq(meaningfulChanges.id, opportunityChanges.legacyMeaningfulChangeId),
    )
    .where(
      and(
        eq(opportunityChanges.opportunityId, input.opportunityId),
        eq(opportunityChanges.legacyAdmissionEventId, input.admissionEventId),
        sql`${meaningfulChanges.afterData} ->> 'wp10bEventVersionId' = ${input.eventVersionId}`,
      ),
    )
    .limit(1);
  return change ?? null;
}

export async function findOutboxEventByDedupeKey(
  executor: DatabaseExecutor,
  dedupeKey: string,
) {
  const [event] = await executor.drizzle
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.dedupeKey, dedupeKey))
    .limit(1);
  return event ?? null;
}

export async function listInstitutionMonitoringBindings(
  executor: DatabaseExecutor,
) {
  return executor.drizzle
    .select({
      targetId: institutionSourceBindings.institutionId,
      role: institutionSourceBindings.role,
      isPrimary: institutionSourceBindings.isPrimary,
      institutionId: institutions.id,
      institutionSlug: institutions.slug,
      institutionDisplayName: institutions.displayName,
      institutionCategory: institutions.category,
      institutionOperationalState: institutions.operationalState,
      institutionPublicationState: institutions.publicationState,
      sourceId: sources.id,
      sourceCanonicalUrl: sources.canonicalUrl,
      sourceType: sources.sourceType,
      sourceAuthorityLevel: sources.authorityLevel,
      sourceLifecycleStatus: sources.lifecycleStatus,
      sourceName: sources.sourceName,
      collectionStrategy: sourceMonitorConfigs.collectionStrategy,
      monitoringProfile: sourceMonitorConfigs.monitoringProfile,
      customIntervalMinutes: sourceMonitorConfigs.customIntervalMinutes,
      monitorEnabled: sourceMonitorConfigs.isEnabled,
    })
    .from(institutionSourceBindings)
    .innerJoin(
      institutions,
      eq(institutions.id, institutionSourceBindings.institutionId),
    )
    .innerJoin(sources, eq(sources.id, institutionSourceBindings.sourceId))
    .innerJoin(
      sourceMonitorConfigs,
      eq(sourceMonitorConfigs.sourceId, sources.id),
    )
    .where(
      and(
        eq(institutionSourceBindings.isActive, true),
        eq(sources.lifecycleStatus, "ACTIVE"),
      ),
    );
}

export async function listOpportunityMonitoringBindings(
  executor: DatabaseExecutor,
) {
  return executor.drizzle
    .select({
      targetId: opportunitySourceBindings.opportunityId,
      role: opportunitySourceBindings.role,
      isPrimary: opportunitySourceBindings.isPrimary,
      opportunityId: opportunities.id,
      opportunitySlug: opportunities.slug,
      opportunityKind: opportunities.kind,
      opportunityTruthMode: opportunities.truthMode,
      opportunityPublicationState: opportunities.publicationState,
      institutionId: institutions.id,
      institutionSlug: institutions.slug,
      institutionDisplayName: institutions.displayName,
      institutionCategory: institutions.category,
      institutionOperationalState: institutions.operationalState,
      institutionPublicationState: institutions.publicationState,
      sourceId: sources.id,
      sourceCanonicalUrl: sources.canonicalUrl,
      sourceType: sources.sourceType,
      sourceAuthorityLevel: sources.authorityLevel,
      sourceLifecycleStatus: sources.lifecycleStatus,
      sourceName: sources.sourceName,
      collectionStrategy: sourceMonitorConfigs.collectionStrategy,
      monitoringProfile: sourceMonitorConfigs.monitoringProfile,
      customIntervalMinutes: sourceMonitorConfigs.customIntervalMinutes,
      monitorEnabled: sourceMonitorConfigs.isEnabled,
    })
    .from(opportunitySourceBindings)
    .innerJoin(
      opportunities,
      eq(opportunities.id, opportunitySourceBindings.opportunityId),
    )
    .innerJoin(institutions, eq(institutions.id, opportunities.institutionId))
    .innerJoin(sources, eq(sources.id, opportunitySourceBindings.sourceId))
    .innerJoin(
      sourceMonitorConfigs,
      eq(sourceMonitorConfigs.sourceId, sources.id),
    )
    .where(
      and(
        eq(opportunitySourceBindings.isActive, true),
        eq(sources.lifecycleStatus, "ACTIVE"),
      ),
    );
}

export async function listLatestSourceObservations(
  executor: DatabaseExecutor,
  sourceIds: readonly string[],
) {
  if (sourceIds.length === 0) return [];

  const rows = await executor.drizzle
    .select({
      sourceId: sourceObservations.sourceId,
      observedAt: sourceObservations.observedAt,
      outcome: sourceObservations.outcome,
      id: sourceObservations.id,
    })
    .from(sourceObservations)
    .where(inArray(sourceObservations.sourceId, [...sourceIds]))
    .orderBy(
      asc(sourceObservations.sourceId),
      desc(sourceObservations.observedAt),
      desc(sourceObservations.id),
    );

  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.sourceId)) return false;
    seen.add(row.sourceId);
    return true;
  });
}

export async function listCurrentNativeOpportunityTruth(
  executor: DatabaseExecutor,
  institutionIds: readonly string[],
) {
  if (institutionIds.length === 0) return [];

  return executor.drizzle
    .select({
      opportunityId: opportunities.id,
      institutionId: opportunities.institutionId,
      publicationState: opportunities.publicationState,
      businessState: opportunityVersions.businessState,
      title: opportunityVersions.title,
      eventStartAt: opportunityVersions.eventStartAt,
      applicationOpenAt: opportunityVersions.applicationOpenAt,
    })
    .from(opportunities)
    .innerJoin(
      opportunityVersions,
      and(
        eq(opportunityVersions.opportunityId, opportunities.id),
        eq(opportunityVersions.isCurrent, true),
      ),
    )
    .where(
      and(
        inArray(opportunities.institutionId, [...institutionIds]),
        eq(opportunities.truthMode, "NATIVE"),
        eq(opportunities.publicationState, "PUBLISHED"),
      ),
    );
}

export async function listCurrentLegacyOpportunityTruth(
  executor: DatabaseExecutor,
  institutionIds: readonly string[],
) {
  if (institutionIds.length === 0) return [];

  return executor.drizzle
    .select({
      opportunityId: opportunities.id,
      institutionId: opportunities.institutionId,
      publicationState: opportunities.publicationState,
      eventStatus: admissionEventVersions.eventStatus,
      title: admissionEventVersions.displayTitle,
      eventStartDate: admissionEventVersions.eventStartDate,
      registrationOpenDate: admissionEventVersions.registrationOpenDate,
    })
    .from(opportunities)
    .innerJoin(
      opportunityAdmissionEventLinks,
      eq(opportunityAdmissionEventLinks.opportunityId, opportunities.id),
    )
    .innerJoin(
      admissionEventVersions,
      and(
        eq(
          admissionEventVersions.admissionEventId,
          opportunityAdmissionEventLinks.admissionEventId,
        ),
        eq(admissionEventVersions.isCurrent, true),
      ),
    )
    .where(
      and(
        inArray(opportunities.institutionId, [...institutionIds]),
        eq(opportunities.truthMode, "LEGACY_BACKED"),
        eq(opportunities.publicationState, "PUBLISHED"),
      ),
    );
}
