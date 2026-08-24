import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

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

export type MonitoringCountCursor = Readonly<{
  targetType: "INSTITUTION" | "OPPORTUNITY";
  targetId: string;
  sourceId: string;
  role: string;
}>;

export type MonitoringCountCandidate = MonitoringCountCursor &
  Readonly<{
    institutionId: string;
    institutionOperationalState: string;
    institutionPublicationState: string;
    opportunityId: string | null;
    collectionStrategy: string;
    monitoringProfile: string;
    customIntervalMinutes: number | null;
    monitorEnabled: boolean;
  }>;

export type MonitoringQueueCandidate = MonitoringCountCandidate &
  Readonly<{
    isPrimary: boolean;
    institutionSlug: string;
    institutionDisplayName: string;
    institutionCategory: string;
    opportunitySlug: string | null;
    opportunityKind: string | null;
    opportunityTruthMode: "NATIVE" | "LEGACY_BACKED" | null;
    opportunityPublicationState: string | null;
    sourceCanonicalUrl: string;
    sourceType: string;
    sourceAuthorityLevel: string;
    sourceLifecycleStatus: string;
    sourceName: string;
  }>;

export async function listMonitoringQueueCandidatesBatch(
  executor: DatabaseExecutor,
  input: Readonly<{
    after: MonitoringCountCursor | null;
    limit: number;
  }>,
): Promise<MonitoringQueueCandidate[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) {
    throw new RangeError("Monitoring queue batch limit must be from 1 to 50");
  }
  const after = input.after;
  const rows = (await executor.raw(sql`
    with candidates as (
      select 'INSTITUTION'::text as "targetType",
        binding.institution_id::text as "targetId",
        binding.source_id::text as "sourceId", binding.role::text as role,
        binding.is_primary as "isPrimary",
        institution.id::text as "institutionId",
        institution.slug::text as "institutionSlug",
        institution.display_name::text as "institutionDisplayName",
        institution.category::text as "institutionCategory",
        institution.operational_state::text as "institutionOperationalState",
        institution.publication_state::text as "institutionPublicationState",
        null::text as "opportunityId", null::text as "opportunitySlug",
        null::text as "opportunityKind", null::text as "opportunityTruthMode",
        null::text as "opportunityPublicationState",
        source.canonical_url::text as "sourceCanonicalUrl",
        source.source_type::text as "sourceType",
        source.authority_level::text as "sourceAuthorityLevel",
        source.lifecycle_status::text as "sourceLifecycleStatus",
        source.source_name::text as "sourceName",
        config.collection_strategy::text as "collectionStrategy",
        config.monitoring_profile::text as "monitoringProfile",
        config.custom_interval_minutes as "customIntervalMinutes",
        config.is_enabled as "monitorEnabled"
      from institution_source_bindings binding
      inner join institutions institution
        on institution.id = binding.institution_id
      inner join sources source on source.id = binding.source_id
      inner join source_monitor_configs config on config.source_id = source.id
      where binding.is_active = true and source.lifecycle_status = 'ACTIVE'
      union all
      select 'OPPORTUNITY'::text, binding.opportunity_id::text,
        binding.source_id::text, binding.role::text, binding.is_primary,
        institution.id::text, institution.slug::text,
        institution.display_name::text, institution.category::text,
        institution.operational_state::text,
        institution.publication_state::text,
        opportunity.id::text, opportunity.slug::text, opportunity.kind::text,
        opportunity.truth_mode::text, opportunity.publication_state::text,
        source.canonical_url::text, source.source_type::text,
        source.authority_level::text, source.lifecycle_status::text,
        source.source_name::text, config.collection_strategy::text,
        config.monitoring_profile::text, config.custom_interval_minutes,
        config.is_enabled
      from opportunity_source_bindings binding
      inner join opportunities opportunity
        on opportunity.id = binding.opportunity_id
      inner join institutions institution
        on institution.id = opportunity.institution_id
      inner join sources source on source.id = binding.source_id
      inner join source_monitor_configs config on config.source_id = source.id
      where binding.is_active = true and source.lifecycle_status = 'ACTIVE'
    )
    select "targetType", "targetId", "sourceId", role, "isPrimary",
      "institutionId", "institutionSlug", "institutionDisplayName",
      "institutionCategory", "institutionOperationalState",
      "institutionPublicationState", "opportunityId", "opportunitySlug",
      "opportunityKind", "opportunityTruthMode",
      "opportunityPublicationState", "sourceCanonicalUrl", "sourceType",
      "sourceAuthorityLevel", "sourceLifecycleStatus", "sourceName",
      "collectionStrategy", "monitoringProfile", "customIntervalMinutes",
      "monitorEnabled"
    from candidates
    where ${
      after === null
        ? sql`true`
        : sql`("targetType", "targetId", "sourceId", role) >
            (${after.targetType}, ${after.targetId}, ${after.sourceId}, ${after.role})`
    }
    order by "targetType", "targetId", "sourceId", role
    limit ${input.limit}
  `)) as unknown as MonitoringQueueCandidate[];
  if (rows.length > input.limit) {
    throw new Error("Monitoring queue candidate batch exceeded its limit");
  }
  return rows;
}

export async function listMonitoringCountCandidatesBatch(
  executor: DatabaseExecutor,
  input: Readonly<{
    after: MonitoringCountCursor | null;
    limit: number;
  }>,
): Promise<MonitoringCountCandidate[]> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) {
    throw new RangeError("Monitoring count batch limit must be from 1 to 50");
  }
  const after = input.after;
  const rows = (await executor.raw(sql`
    with candidates as (
      select 'INSTITUTION'::text as "targetType",
        binding.institution_id::text as "targetId",
        binding.source_id::text as "sourceId", binding.role::text as role,
        institution.id::text as "institutionId",
        institution.operational_state as "institutionOperationalState",
        institution.publication_state as "institutionPublicationState",
        null::text as "opportunityId",
        config.collection_strategy as "collectionStrategy",
        config.monitoring_profile as "monitoringProfile",
        config.custom_interval_minutes as "customIntervalMinutes",
        config.is_enabled as "monitorEnabled"
      from institution_source_bindings binding
      inner join institutions institution
        on institution.id = binding.institution_id
      inner join sources source on source.id = binding.source_id
      inner join source_monitor_configs config on config.source_id = source.id
      where binding.is_active = true and source.lifecycle_status = 'ACTIVE'
      union all
      select 'OPPORTUNITY'::text, binding.opportunity_id::text,
        binding.source_id::text, binding.role::text,
        institution.id::text, institution.operational_state,
        institution.publication_state, opportunity.id::text,
        config.collection_strategy, config.monitoring_profile,
        config.custom_interval_minutes, config.is_enabled
      from opportunity_source_bindings binding
      inner join opportunities opportunity
        on opportunity.id = binding.opportunity_id
      inner join institutions institution
        on institution.id = opportunity.institution_id
      inner join sources source on source.id = binding.source_id
      inner join source_monitor_configs config on config.source_id = source.id
      where binding.is_active = true and source.lifecycle_status = 'ACTIVE'
    )
    select "targetType", "targetId", "sourceId", role, "institutionId",
      "institutionOperationalState", "institutionPublicationState",
      "opportunityId", "collectionStrategy", "monitoringProfile",
      "customIntervalMinutes", "monitorEnabled"
    from candidates
    where ${
      after === null
        ? sql`true`
        : sql`("targetType", "targetId", "sourceId", role) >
            (${after.targetType}, ${after.targetId}, ${after.sourceId}, ${after.role})`
    }
    order by "targetType", "targetId", "sourceId", role
    limit ${input.limit}
  `)) as unknown as MonitoringCountCandidate[];
  return rows;
}

export type MonitoringRelevantTruth = Readonly<{
  targetType: "INSTITUTION" | "OPPORTUNITY";
  targetId: string;
  opportunityId: string;
  institutionId: string;
  businessState: string;
  title: string;
  upcomingAt: Date | null;
}>;

export async function listMonitoringRelevantTruth(
  executor: DatabaseExecutor,
  input: Readonly<{
    opportunityIds: readonly string[];
    institutionIds: readonly string[];
    now: Date;
  }>,
): Promise<MonitoringRelevantTruth[]> {
  const opportunityIds = [...new Set(input.opportunityIds)];
  const institutionIds = [...new Set(input.institutionIds)];
  const targetCount = opportunityIds.length + institutionIds.length;
  if (targetCount === 0) return [];
  if (targetCount > 50) {
    throw new RangeError("Monitoring truth support is limited to 50 targets");
  }

  const opportunityPredicate =
    opportunityIds.length === 0
      ? sql`false`
      : sql`opportunity.id in (${sql.join(
          opportunityIds.map((opportunityId) => sql`${opportunityId}`),
          sql`, `,
        )})`;
  const institutionPredicate =
    institutionIds.length === 0
      ? sql`false`
      : sql`opportunity.institution_id in (${sql.join(
          institutionIds.map((institutionId) => sql`${institutionId}`),
          sql`, `,
        )})`;
  const opportunityTargetPredicate =
    opportunityIds.length === 0
      ? sql`false`
      : sql`truth."opportunityId" in (${sql.join(
          opportunityIds.map((opportunityId) => sql`${opportunityId}`),
          sql`, `,
        )})`;
  const institutionTargetPredicate =
    institutionIds.length === 0
      ? sql`false`
      : sql`truth."institutionId" in (${sql.join(
          institutionIds.map((institutionId) => sql`${institutionId}`),
          sql`, `,
        )})`;

  const rows = (await executor.raw(sql`
    with relevant_truth as (
      select opportunity.id::text as "opportunityId",
        opportunity.institution_id::text as "institutionId",
        version.business_state::text as "businessState",
        version.title::text as title,
        coalesce(version.application_open_at, version.event_start_at) as "upcomingAt"
      from opportunities opportunity
      inner join opportunity_versions version
        on version.opportunity_id = opportunity.id and version.is_current = true
      where opportunity.truth_mode = 'NATIVE'
        and opportunity.publication_state = 'PUBLISHED'
        and (${opportunityPredicate} or ${institutionPredicate})
      union all
      select opportunity.id::text, opportunity.institution_id::text,
        case version.event_status
          when 'SCHEDULED' then 'UPCOMING'
          when 'ACTIVE' then 'OPEN'
          when 'CLOSED' then 'CLOSED'
          when 'COMPLETED' then 'COMPLETED'
          when 'CANCELLED' then 'CANCELLED'
          else 'UNKNOWN'
        end,
        version.display_title::text,
        case
          when coalesce(version.registration_open_date, version.event_start_date) is null
            then null
          else coalesce(version.registration_open_date, version.event_start_date)::timestamp
            at time zone 'Asia/Seoul'
        end
      from opportunities opportunity
      inner join opportunity_admission_event_links link
        on link.opportunity_id = opportunity.id
      inner join admission_event_versions version
        on version.admission_event_id = link.admission_event_id
        and version.is_current = true
      where opportunity.truth_mode = 'LEGACY_BACKED'
        and opportunity.publication_state = 'PUBLISHED'
        and (${opportunityPredicate} or ${institutionPredicate})
    ), ranked_institution_truth as (
      select truth.*,
        row_number() over (
          partition by truth."institutionId"
          order by
            case when truth."businessState" = 'OPEN' then 0 else 1 end,
            case when truth."businessState" <> 'OPEN' then truth."upcomingAt" end
              asc nulls last,
            truth."opportunityId" asc
        ) as truth_rank
      from relevant_truth truth
      where ${institutionTargetPredicate}
        and (
          truth."businessState" = 'OPEN'
          or truth."upcomingAt" >= ${input.now.toISOString()}
        )
    )
    select 'OPPORTUNITY'::text as "targetType",
      truth."opportunityId" as "targetId", truth."opportunityId",
      truth."institutionId", truth."businessState", truth.title,
      truth."upcomingAt"
    from relevant_truth truth
    where ${opportunityTargetPredicate}
    union all
    select 'INSTITUTION'::text, truth."institutionId",
      truth."opportunityId", truth."institutionId", truth."businessState",
      truth.title, truth."upcomingAt"
    from ranked_institution_truth truth
    where truth.truth_rank = 1
    order by "targetType", "targetId"
  `)) as unknown as Array<
    Omit<MonitoringRelevantTruth, "upcomingAt"> & {
      upcomingAt: Date | string | null;
    }
  >;
  if (rows.length > targetCount) {
    throw new Error("Monitoring truth support exceeded its target bound");
  }
  return rows.map((row) => ({
    ...row,
    upcomingAt:
      row.upcomingAt === null || row.upcomingAt instanceof Date
        ? row.upcomingAt
        : new Date(row.upcomingAt),
  }));
}

export async function listLatestSourceObservations(
  executor: DatabaseExecutor,
  sourceIds: readonly string[],
) {
  if (sourceIds.length === 0) return [];
  const rows = (await executor.raw(sql`
    select distinct on (source_id)
      source_id as "sourceId", observed_at as "observedAt", outcome, id
    from source_observations
    where source_id in (${sql.join(
      sourceIds.map((sourceId) => sql`${sourceId}`),
      sql`, `,
    )})
    order by source_id, observed_at desc, id desc
  `)) as unknown as Array<{
    sourceId: string;
    observedAt: Date | string;
    outcome: string;
    id: bigint | string;
  }>;
  return rows.map((row) => ({
    ...row,
    id: typeof row.id === "bigint" ? row.id : BigInt(row.id),
    observedAt:
      row.observedAt instanceof Date
        ? row.observedAt
        : new Date(row.observedAt),
  }));
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
