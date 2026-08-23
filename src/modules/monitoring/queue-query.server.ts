import "server-only";

import { ValidationError } from "@/src/application/errors";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import {
  monitoringQueueFilterSchema,
  type MonitoringQueueFilter,
  type MonitoringQueueRow,
  type MonitoringTruthSummary,
} from "@/src/modules/monitoring/contracts";
import {
  createBindingKey,
  deriveMonitoringSchedule,
} from "@/src/modules/monitoring/policy";
import {
  listCurrentLegacyOpportunityTruth,
  listCurrentNativeOpportunityTruth,
  listInstitutionMonitoringBindings,
  listLatestSourceObservations,
  listOpportunityMonitoringBindings,
} from "@/src/modules/monitoring/repository.server";

export type MonitoringQueueDependencies = Readonly<{
  executor: DatabaseExecutor;
  now: Date;
}>;

type OpportunityTruthProjection = Readonly<{
  opportunityId: string;
  institutionId: string;
  businessState: string;
  title: string;
  upcomingAt: Date | null;
}>;

function parseFilter(rawFilter: unknown): MonitoringQueueFilter {
  const parsed = monitoringQueueFilterSchema.safeParse(rawFilter);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

function legacyBusinessState(eventStatus: string): string {
  switch (eventStatus) {
    case "SCHEDULED":
      return "UPCOMING";
    case "ACTIVE":
      return "OPEN";
    case "CLOSED":
      return "CLOSED";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "UNKNOWN";
  }
}

function seoulDate(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00+09:00`);
}

function opportunityTruthSummary(
  truth: OpportunityTruthProjection | undefined,
): MonitoringTruthSummary {
  return {
    kind: "OPPORTUNITY",
    businessState: truth?.businessState ?? null,
    title: truth?.title ?? null,
    relevantAt: truth?.upcomingAt?.toISOString() ?? null,
  };
}

function includesFilter<T>(
  values: readonly T[] | undefined,
  value: T,
): boolean {
  return values === undefined || values.includes(value);
}

function dueRank(row: MonitoringQueueRow): number {
  return {
    OVERDUE: 0,
    DUE: 1,
    UPCOMING: 2,
    MANUAL: 3,
  }[row.dueState];
}

function priorityRank(row: MonitoringQueueRow): number {
  return {
    P0_ACTIVE: 0,
    P1_UPCOMING: 1,
    P2_WATCH: 2,
    P3_PASSIVE: 3,
  }[row.priority];
}

function compareQueueRows(left: MonitoringQueueRow, right: MonitoringQueueRow) {
  const byDue = dueRank(left) - dueRank(right);
  if (byDue !== 0) return byDue;
  const byPriority = priorityRank(left) - priorityRank(right);
  if (byPriority !== 0) return byPriority;
  if (left.nextDueAt !== right.nextDueAt) {
    if (left.nextDueAt === null) return 1;
    if (right.nextDueAt === null) return -1;
    const byNextDue = left.nextDueAt.localeCompare(right.nextDueAt);
    if (byNextDue !== 0) return byNextDue;
  }
  return left.bindingId.localeCompare(right.bindingId);
}

export async function getMonitoringQueue(
  rawFilter: unknown,
  dependencies: MonitoringQueueDependencies,
): Promise<MonitoringQueueRow[]> {
  const filter = parseFilter(rawFilter);
  const [institutionBindings, opportunityBindings] = await Promise.all([
    listInstitutionMonitoringBindings(dependencies.executor),
    listOpportunityMonitoringBindings(dependencies.executor),
  ]);
  const institutionIds = [
    ...new Set([
      ...institutionBindings.map((row) => row.institutionId),
      ...opportunityBindings.map((row) => row.institutionId),
    ]),
  ];
  const sourceIds = [
    ...new Set([
      ...institutionBindings.map((row) => row.sourceId),
      ...opportunityBindings.map((row) => row.sourceId),
    ]),
  ];
  const [latestObservations, nativeTruthRows, legacyTruthRows] =
    await Promise.all([
      listLatestSourceObservations(dependencies.executor, sourceIds),
      listCurrentNativeOpportunityTruth(dependencies.executor, institutionIds),
      listCurrentLegacyOpportunityTruth(dependencies.executor, institutionIds),
    ]);

  const latestBySource = new Map(
    latestObservations.map((row) => [row.sourceId, row] as const),
  );
  const truths: OpportunityTruthProjection[] = [
    ...nativeTruthRows.map((row) => ({
      opportunityId: row.opportunityId,
      institutionId: row.institutionId,
      businessState: row.businessState,
      title: row.title,
      upcomingAt: row.applicationOpenAt ?? row.eventStartAt,
    })),
    ...legacyTruthRows.map((row) => ({
      opportunityId: row.opportunityId,
      institutionId: row.institutionId,
      businessState: legacyBusinessState(row.eventStatus),
      title: row.title,
      upcomingAt:
        seoulDate(row.registrationOpenDate) ?? seoulDate(row.eventStartDate),
    })),
  ];
  const truthByOpportunity = new Map(
    truths.map((row) => [row.opportunityId, row] as const),
  );
  const truthsByInstitution = new Map<string, OpportunityTruthProjection[]>();
  for (const truth of truths) {
    const rows = truthsByInstitution.get(truth.institutionId) ?? [];
    rows.push(truth);
    truthsByInstitution.set(truth.institutionId, rows);
  }

  const projectSchedule = (input: {
    sourceId: string;
    institutionDormant: boolean;
    collectionStrategy: string;
    monitoringProfile: string;
    monitorEnabled: boolean;
    customIntervalMinutes: number | null;
    relevantTruth: OpportunityTruthProjection | undefined;
  }) => {
    const latest = latestBySource.get(input.sourceId);
    const schedule = deriveMonitoringSchedule({
      now: dependencies.now,
      lastCheckedAt: latest?.observedAt ?? null,
      institutionDormant: input.institutionDormant,
      monitorEnabled: input.monitorEnabled,
      manualOnly:
        input.collectionStrategy === "MANUAL" ||
        input.monitoringProfile === "MANUAL",
      currentBusinessState: input.relevantTruth?.businessState ?? null,
      upcomingAt: input.relevantTruth?.upcomingAt ?? null,
      customIntervalMinutes: input.customIntervalMinutes,
    });
    return { latest, schedule };
  };

  const rows: MonitoringQueueRow[] = [];
  for (const binding of opportunityBindings) {
    const relevantTruth = truthByOpportunity.get(binding.opportunityId);
    const { latest, schedule } = projectSchedule({
      ...binding,
      institutionDormant:
        binding.institutionOperationalState === "CLOSED" ||
        binding.institutionPublicationState === "ARCHIVED",
      relevantTruth,
    });
    rows.push({
      bindingId: createBindingKey({
        targetType: "OPPORTUNITY",
        targetId: binding.targetId,
        sourceId: binding.sourceId,
        role: binding.role,
      }),
      targetType: "OPPORTUNITY",
      targetId: binding.targetId,
      institution: {
        id: binding.institutionId,
        slug: binding.institutionSlug,
        displayName: binding.institutionDisplayName,
        category: binding.institutionCategory,
        operationalState: binding.institutionOperationalState,
        publicationState: binding.institutionPublicationState,
      },
      opportunity: {
        id: binding.opportunityId,
        slug: binding.opportunitySlug,
        kind: binding.opportunityKind,
        truthMode: binding.opportunityTruthMode,
        publicationState: binding.opportunityPublicationState,
      },
      source: {
        id: binding.sourceId,
        canonicalUrl: binding.sourceCanonicalUrl,
        sourceType: binding.sourceType,
        authorityLevel: binding.sourceAuthorityLevel,
        lifecycleStatus: binding.sourceLifecycleStatus,
        sourceName: binding.sourceName,
      },
      role: binding.role,
      isPrimary: binding.isPrimary,
      priority: schedule.priority,
      lastCheckedAt: latest?.observedAt.toISOString() ?? null,
      nextDueAt: schedule.nextDueAt?.toISOString() ?? null,
      dueState: schedule.dueState,
      dueReason: latest ? `${schedule.priority}_CADENCE` : "NEVER_CHECKED",
      currentTruthSummary: opportunityTruthSummary(relevantTruth),
    });
  }

  for (const binding of institutionBindings) {
    const institutionTruths =
      truthsByInstitution.get(binding.institutionId) ?? [];
    const relevantTruth =
      institutionTruths.find((truth) => truth.businessState === "OPEN") ??
      institutionTruths
        .filter(
          (truth) =>
            truth.upcomingAt !== null &&
            truth.upcomingAt.getTime() >= dependencies.now.getTime(),
        )
        .sort(
          (left, right) =>
            left.upcomingAt!.getTime() - right.upcomingAt!.getTime(),
        )[0];
    const { latest, schedule } = projectSchedule({
      ...binding,
      institutionDormant:
        binding.institutionOperationalState === "CLOSED" ||
        binding.institutionPublicationState === "ARCHIVED",
      relevantTruth,
    });
    rows.push({
      bindingId: createBindingKey({
        targetType: "INSTITUTION",
        targetId: binding.targetId,
        sourceId: binding.sourceId,
        role: binding.role,
      }),
      targetType: "INSTITUTION",
      targetId: binding.targetId,
      institution: {
        id: binding.institutionId,
        slug: binding.institutionSlug,
        displayName: binding.institutionDisplayName,
        category: binding.institutionCategory,
        operationalState: binding.institutionOperationalState,
        publicationState: binding.institutionPublicationState,
      },
      opportunity: null,
      source: {
        id: binding.sourceId,
        canonicalUrl: binding.sourceCanonicalUrl,
        sourceType: binding.sourceType,
        authorityLevel: binding.sourceAuthorityLevel,
        lifecycleStatus: binding.sourceLifecycleStatus,
        sourceName: binding.sourceName,
      },
      role: binding.role,
      isPrimary: binding.isPrimary,
      priority: schedule.priority,
      lastCheckedAt: latest?.observedAt.toISOString() ?? null,
      nextDueAt: schedule.nextDueAt?.toISOString() ?? null,
      dueState: schedule.dueState,
      dueReason: latest ? `${schedule.priority}_CADENCE` : "NEVER_CHECKED",
      currentTruthSummary: {
        kind: "INSTITUTION",
        operationalState: binding.institutionOperationalState,
        publicationState: binding.institutionPublicationState,
      },
    });
  }

  return rows
    .filter(
      (row) =>
        includesFilter(filter.dueState, row.dueState) &&
        includesFilter(filter.priority, row.priority) &&
        includesFilter(filter.targetType, row.targetType) &&
        includesFilter(filter.role, row.role) &&
        includesFilter(filter.sourceLifecycle, row.source.lifecycleStatus),
    )
    .sort(compareQueueRows);
}
