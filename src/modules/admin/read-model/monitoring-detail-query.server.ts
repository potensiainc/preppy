import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { NotFoundError } from "@/src/application/errors";
import {
  admissionEventVersions,
  institutions,
  institutionFacts,
  institutionFactTypeValues,
  institutionFactVersions,
  institutionSourceBindings,
  opportunities,
  opportunityAdmissionEventLinks,
  opportunitySourceBindings,
  opportunityVersions,
  sourceMonitorConfigs,
  sourceObservations,
  sources,
  type InstitutionFactType,
} from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { deriveMonitoringSchedule } from "@/src/modules/monitoring/policy";
import { listMonitoringRelevantTruth } from "@/src/modules/monitoring/repository.server";

import {
  parseMonitoringAdminDetailInput,
  type AdminMonitoringQueueRowDTO,
  type AdminMonitoringSourceDTO,
  type MonitoringAdminDetailInput,
} from "./monitoring-query.server";
import { safeAbsoluteHttpUrl } from "./source-query.server";

type AdminMonitoringObservationDTO = Readonly<{
  id: string;
  observedAt: string;
  outcome: string;
  httpStatus: number | null;
  errorCode: string | null;
}>;

type ExactMonitoringBinding = Readonly<{
  targetType: "INSTITUTION" | "OPPORTUNITY";
  targetId: string;
  role: string;
  isPrimary: boolean;
  institutionId: string;
  institutionDisplayName: string;
  institutionCategory: string;
  institutionOperationalState: string;
  institutionPublicationState: string;
  opportunityId: string | null;
  opportunitySlug: string | null;
  opportunityKind: string | null;
  opportunityTruthMode: "NATIVE" | "LEGACY_BACKED" | null;
  opportunityPublicationState: string | null;
  sourceId: string;
  sourceCanonicalUrl: string;
  sourceType: string;
  sourceAuthorityLevel: string;
  sourceLifecycleStatus: string;
  sourceName: string;
  collectionStrategy: string;
  monitoringProfile: string;
  customIntervalMinutes: number | null;
  monitorEnabled: boolean;
}>;

type AdminMonitoringBaseDetailDTO = Readonly<{
  expectedCurrentVersionId: string | null;
  binding: Readonly<{
    targetType: "INSTITUTION" | "OPPORTUNITY";
    targetId: string;
    sourceId: string;
    role: string;
    isPrimary: boolean;
  }>;
  schedule: Readonly<{
    priority: AdminMonitoringQueueRowDTO["priority"];
    dueState: AdminMonitoringQueueRowDTO["dueState"];
    dueReason: string;
    lastCheckedAt: string | null;
    nextDueAt: string | null;
  }>;
  institution: AdminMonitoringQueueRowDTO["institution"];
  source: AdminMonitoringSourceDTO & Readonly<{ safeUrl: string }>;
  latestObservation: AdminMonitoringObservationDTO | null;
}>;

export type AdminMonitoringNativeDetailDTO = AdminMonitoringBaseDetailDTO &
  Readonly<{
    kind: "OPPORTUNITY_NATIVE";
    opportunity: NonNullable<AdminMonitoringQueueRowDTO["opportunity"]> &
      Readonly<{ publicationState: string }>;
    currentTruth: Readonly<{
      versionId: string;
      versionNumber: number;
      businessState: string;
      title: string;
      summary: string | null;
      targetAudience: string | null;
      eventStartAt: string | null;
      eventEndAt: string | null;
      applicationOpenAt: string | null;
      applicationCloseAt: string | null;
      actionUrl: string | null;
      locationText: string | null;
      validFrom: string | null;
      validUntil: string | null;
      verifiedAt: string | null;
    }> | null;
  }>;

export type AdminMonitoringLegacyDetailDTO = AdminMonitoringBaseDetailDTO &
  Readonly<{
    kind: "OPPORTUNITY_LEGACY";
    opportunity: NonNullable<AdminMonitoringQueueRowDTO["opportunity"]> &
      Readonly<{ publicationState: string }>;
    currentTruth: Readonly<{
      versionId: string;
      versionNumber: number;
      verificationStatus: string;
      knowledgeState: string;
      eventStatus: string;
      displayTitle: string;
      eventStartDate: string | null;
      eventStartTime: string | null;
      eventEndDate: string | null;
      eventEndTime: string | null;
      registrationOpenDate: string | null;
      registrationOpenTime: string | null;
      registrationCloseDate: string | null;
      registrationCloseTime: string | null;
      timezone: string;
      venue: string | null;
      actionUrl: string | null;
      verifiedAt: string | null;
    }> | null;
  }>;

export type AdminMonitoringFactDTO = Readonly<{
  factType: InstitutionFactType;
  expectedCurrentVersionId: string | null;
  current: Readonly<{
    versionId: string;
    versionNumber: number;
    displayText: string | null;
    verifiedAt: string | null;
    validFrom: string | null;
    validUntil: string | null;
  }> | null;
}>;

export type AdminMonitoringInstitutionDetailDTO = AdminMonitoringBaseDetailDTO &
  Readonly<{
    kind: "INSTITUTION";
    currentTruth: Readonly<{
      operationalState: string;
      publicationState: string;
    }>;
    facts: readonly AdminMonitoringFactDTO[];
  }>;

export type AdminMonitoringDetailDTO =
  | AdminMonitoringNativeDetailDTO
  | AdminMonitoringLegacyDetailDTO
  | AdminMonitoringInstitutionDetailDTO;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function enforceExactBindingBound(
  rows: readonly ExactMonitoringBinding[],
): ExactMonitoringBinding | null {
  if (rows.length > 1) {
    throw new Error(
      "Monitoring detail binding lookup exceeded its exact bound",
    );
  }
  return rows[0] ?? null;
}

async function loadExactMonitoringBinding(
  executor: DatabaseExecutor,
  input: MonitoringAdminDetailInput,
): Promise<ExactMonitoringBinding | null> {
  if (input.targetType === "INSTITUTION") {
    const rows = await executor.drizzle
      .select({
        targetId: institutionSourceBindings.institutionId,
        role: institutionSourceBindings.role,
        isPrimary: institutionSourceBindings.isPrimary,
        institutionId: institutions.id,
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
          eq(institutionSourceBindings.institutionId, input.targetId),
          eq(institutionSourceBindings.sourceId, input.sourceId),
          eq(institutionSourceBindings.role, input.role),
          eq(institutionSourceBindings.isActive, true),
          eq(sources.lifecycleStatus, "ACTIVE"),
        ),
      )
      .limit(2);
    return enforceExactBindingBound(
      rows.map((row) => ({
        ...row,
        targetType: "INSTITUTION" as const,
        opportunityId: null,
        opportunitySlug: null,
        opportunityKind: null,
        opportunityTruthMode: null,
        opportunityPublicationState: null,
      })),
    );
  }

  const rows = await executor.drizzle
    .select({
      targetId: opportunitySourceBindings.opportunityId,
      role: opportunitySourceBindings.role,
      isPrimary: opportunitySourceBindings.isPrimary,
      institutionId: institutions.id,
      institutionDisplayName: institutions.displayName,
      institutionCategory: institutions.category,
      institutionOperationalState: institutions.operationalState,
      institutionPublicationState: institutions.publicationState,
      opportunityId: opportunities.id,
      opportunitySlug: opportunities.slug,
      opportunityKind: opportunities.kind,
      opportunityTruthMode: opportunities.truthMode,
      opportunityPublicationState: opportunities.publicationState,
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
        eq(opportunitySourceBindings.opportunityId, input.targetId),
        eq(opportunitySourceBindings.sourceId, input.sourceId),
        eq(opportunitySourceBindings.role, input.role),
        eq(opportunitySourceBindings.isActive, true),
        eq(sources.lifecycleStatus, "ACTIVE"),
      ),
    )
    .limit(2);
  return enforceExactBindingBound(
    rows.map((row) => ({
      ...row,
      targetType: "OPPORTUNITY" as const,
    })),
  );
}

async function loadLatestObservation(
  executor: DatabaseExecutor,
  sourceId: string,
): Promise<AdminMonitoringObservationDTO | null> {
  const rows = await executor.drizzle
    .select({
      id: sourceObservations.id,
      observedAt: sourceObservations.observedAt,
      outcome: sourceObservations.outcome,
      httpStatus: sourceObservations.httpStatus,
      errorCode: sourceObservations.errorCode,
    })
    .from(sourceObservations)
    .where(eq(sourceObservations.sourceId, sourceId))
    .orderBy(desc(sourceObservations.observedAt), desc(sourceObservations.id))
    .limit(1);
  const row = rows[0];
  return row
    ? {
        id: row.id.toString(),
        observedAt: iso(row.observedAt)!,
        outcome: row.outcome,
        httpStatus: row.httpStatus,
        errorCode: row.errorCode,
      }
    : null;
}

async function loadNativeCurrent(
  executor: DatabaseExecutor,
  opportunityId: string,
): Promise<AdminMonitoringNativeDetailDTO["currentTruth"]> {
  const rows = await executor.drizzle
    .select({
      versionId: opportunityVersions.id,
      versionNumber: opportunityVersions.versionNumber,
      businessState: opportunityVersions.businessState,
      title: opportunityVersions.title,
      summary: opportunityVersions.summary,
      targetAudience: opportunityVersions.targetAudience,
      eventStartAt: opportunityVersions.eventStartAt,
      eventEndAt: opportunityVersions.eventEndAt,
      applicationOpenAt: opportunityVersions.applicationOpenAt,
      applicationCloseAt: opportunityVersions.applicationCloseAt,
      actionUrl: opportunityVersions.actionUrl,
      locationText: opportunityVersions.locationText,
      validFrom: opportunityVersions.validFrom,
      validUntil: opportunityVersions.validUntil,
      verifiedAt: opportunityVersions.verifiedAt,
    })
    .from(opportunityVersions)
    .where(
      and(
        eq(opportunityVersions.opportunityId, opportunityId),
        eq(opportunityVersions.isCurrent, true),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row
    ? {
        ...row,
        eventStartAt: iso(row.eventStartAt),
        eventEndAt: iso(row.eventEndAt),
        applicationOpenAt: iso(row.applicationOpenAt),
        applicationCloseAt: iso(row.applicationCloseAt),
        actionUrl:
          row.actionUrl === null ? null : safeAbsoluteHttpUrl(row.actionUrl),
        validFrom: iso(row.validFrom),
        validUntil: iso(row.validUntil),
        verifiedAt: iso(row.verifiedAt),
      }
    : null;
}

async function loadLegacyCurrent(
  executor: DatabaseExecutor,
  opportunityId: string,
): Promise<AdminMonitoringLegacyDetailDTO["currentTruth"]> {
  const rows = await executor.drizzle
    .select({
      versionId: admissionEventVersions.id,
      versionNumber: admissionEventVersions.versionNo,
      verificationStatus: admissionEventVersions.verificationStatus,
      knowledgeState: admissionEventVersions.knowledgeState,
      eventStatus: admissionEventVersions.eventStatus,
      displayTitle: admissionEventVersions.displayTitle,
      eventStartDate: admissionEventVersions.eventStartDate,
      eventStartTime: admissionEventVersions.eventStartTime,
      eventEndDate: admissionEventVersions.eventEndDate,
      eventEndTime: admissionEventVersions.eventEndTime,
      registrationOpenDate: admissionEventVersions.registrationOpenDate,
      registrationOpenTime: admissionEventVersions.registrationOpenTime,
      registrationCloseDate: admissionEventVersions.registrationCloseDate,
      registrationCloseTime: admissionEventVersions.registrationCloseTime,
      timezone: admissionEventVersions.timezone,
      venue: admissionEventVersions.venue,
      actionUrl: admissionEventVersions.actionUrl,
      verifiedAt: admissionEventVersions.verifiedAt,
    })
    .from(opportunityAdmissionEventLinks)
    .innerJoin(
      admissionEventVersions,
      eq(
        admissionEventVersions.admissionEventId,
        opportunityAdmissionEventLinks.admissionEventId,
      ),
    )
    .where(
      and(
        eq(opportunityAdmissionEventLinks.opportunityId, opportunityId),
        eq(admissionEventVersions.isCurrent, true),
      ),
    )
    .limit(1);
  const row = rows[0];
  return row
    ? {
        ...row,
        eventStartDate: row.eventStartDate,
        eventEndDate: row.eventEndDate,
        registrationOpenDate: row.registrationOpenDate,
        registrationCloseDate: row.registrationCloseDate,
        actionUrl:
          row.actionUrl === null ? null : safeAbsoluteHttpUrl(row.actionUrl),
        verifiedAt: iso(row.verifiedAt),
      }
    : null;
}

async function loadInstitutionFacts(
  executor: DatabaseExecutor,
  institutionId: string,
): Promise<readonly AdminMonitoringFactDTO[]> {
  const rows = await executor.drizzle
    .select({
      factType: institutionFacts.factType,
      versionId: institutionFactVersions.id,
      versionNumber: institutionFactVersions.versionNumber,
      displayText: institutionFactVersions.displayText,
      verifiedAt: institutionFactVersions.verifiedAt,
      validFrom: institutionFactVersions.validFrom,
      validUntil: institutionFactVersions.validUntil,
    })
    .from(institutionFacts)
    .leftJoin(
      institutionFactVersions,
      and(
        eq(institutionFactVersions.institutionFactId, institutionFacts.id),
        eq(institutionFactVersions.isCurrent, true),
      ),
    )
    .where(eq(institutionFacts.institutionId, institutionId))
    .limit(8);
  if (rows.length > institutionFactTypeValues.length) {
    throw new Error("Monitoring detail Fact projection exceeded its bound");
  }
  const byType = new Map(rows.map((row) => [row.factType, row] as const));
  return institutionFactTypeValues.map((factType) => {
    const row = byType.get(factType);
    const current =
      row?.versionId === null || row?.versionId === undefined
        ? null
        : {
            versionId: row.versionId,
            versionNumber: row.versionNumber!,
            displayText: row.displayText,
            verifiedAt: iso(row.verifiedAt),
            validFrom: iso(row.validFrom),
            validUntil: iso(row.validUntil),
          };
    return {
      factType,
      expectedCurrentVersionId: current?.versionId ?? null,
      current,
    };
  });
}

function baseDetail(
  binding: ExactMonitoringBinding,
  schedule: AdminMonitoringBaseDetailDTO["schedule"],
  sourceSafeUrl: string,
  latestObservation: AdminMonitoringObservationDTO | null,
): Omit<AdminMonitoringBaseDetailDTO, "expectedCurrentVersionId"> {
  return {
    binding: {
      targetType: binding.targetType,
      targetId: binding.targetId,
      sourceId: binding.sourceId,
      role: binding.role,
      isPrimary: binding.isPrimary,
    },
    schedule,
    institution: {
      id: binding.institutionId,
      displayName: binding.institutionDisplayName,
      category: binding.institutionCategory,
    },
    source: {
      id: binding.sourceId,
      sourceName: binding.sourceName,
      canonicalUrl: binding.sourceCanonicalUrl,
      safeUrl: sourceSafeUrl,
      sourceType: binding.sourceType,
      authorityLevel: binding.sourceAuthorityLevel,
      lifecycleStatus: binding.sourceLifecycleStatus,
    },
    latestObservation,
  };
}

export async function getAdminMonitoringDetail(
  executor: DatabaseExecutor,
  rawInput: unknown,
  options: Readonly<{ now: Date }>,
): Promise<AdminMonitoringDetailDTO> {
  const input: MonitoringAdminDetailInput =
    parseMonitoringAdminDetailInput(rawInput);
  const binding = await loadExactMonitoringBinding(executor, input);
  if (!binding) throw new NotFoundError();
  const sourceSafeUrl = safeAbsoluteHttpUrl(binding.sourceCanonicalUrl);
  if (sourceSafeUrl === null) throw new NotFoundError();
  const [latestObservation, relevantTruthRows] = await Promise.all([
    loadLatestObservation(executor, input.sourceId),
    listMonitoringRelevantTruth(executor, {
      opportunityIds:
        input.targetType === "OPPORTUNITY" ? [input.targetId] : [],
      institutionIds:
        input.targetType === "INSTITUTION" ? [input.targetId] : [],
      now: options.now,
    }),
  ]);
  const relevantTruth = relevantTruthRows.find(
    (row) =>
      row.targetType === input.targetType && row.targetId === input.targetId,
  );
  const projectedSchedule = deriveMonitoringSchedule({
    now: options.now,
    lastCheckedAt:
      latestObservation === null
        ? null
        : new Date(latestObservation.observedAt),
    institutionDormant:
      binding.institutionOperationalState === "CLOSED" ||
      binding.institutionPublicationState === "ARCHIVED",
    monitorEnabled: binding.monitorEnabled,
    manualOnly:
      binding.collectionStrategy === "MANUAL" ||
      binding.monitoringProfile === "MANUAL",
    currentBusinessState: relevantTruth?.businessState ?? null,
    upcomingAt: relevantTruth?.upcomingAt ?? null,
    customIntervalMinutes: binding.customIntervalMinutes,
  });
  const schedule: AdminMonitoringBaseDetailDTO["schedule"] = {
    priority: projectedSchedule.priority,
    dueState: projectedSchedule.dueState,
    dueReason:
      latestObservation === null
        ? "NEVER_CHECKED"
        : `${projectedSchedule.priority}_CADENCE`,
    lastCheckedAt: latestObservation?.observedAt ?? null,
    nextDueAt: projectedSchedule.nextDueAt?.toISOString() ?? null,
  };
  const base = baseDetail(binding, schedule, sourceSafeUrl, latestObservation);

  if (input.targetType === "INSTITUTION") {
    return {
      ...base,
      kind: "INSTITUTION",
      expectedCurrentVersionId: null,
      currentTruth: {
        operationalState: binding.institutionOperationalState,
        publicationState: binding.institutionPublicationState,
      },
      facts: await loadInstitutionFacts(executor, input.targetId),
    };
  }

  if (
    binding.opportunityId === null ||
    binding.opportunitySlug === null ||
    binding.opportunityKind === null ||
    binding.opportunityTruthMode === null ||
    binding.opportunityPublicationState === null
  ) {
    throw new NotFoundError();
  }
  const opportunity = {
    id: binding.opportunityId,
    slug: binding.opportunitySlug,
    kind: binding.opportunityKind,
    truthMode: binding.opportunityTruthMode,
    publicationState: binding.opportunityPublicationState,
  };
  if (opportunity.truthMode === "NATIVE") {
    const currentTruth = await loadNativeCurrent(executor, input.targetId);
    return {
      ...base,
      kind: "OPPORTUNITY_NATIVE",
      expectedCurrentVersionId: currentTruth?.versionId ?? null,
      opportunity,
      currentTruth,
    };
  }
  const currentTruth = await loadLegacyCurrent(executor, input.targetId);
  return {
    ...base,
    kind: "OPPORTUNITY_LEGACY",
    expectedCurrentVersionId: currentTruth?.versionId ?? null,
    opportunity,
    currentTruth,
  };
}
