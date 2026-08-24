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
  type MonitoringDueState,
} from "@/src/modules/monitoring/policy";
import {
  listCurrentLegacyOpportunityTruth,
  listCurrentNativeOpportunityTruth,
  listInstitutionMonitoringBindings,
  listLatestSourceObservations,
  listMonitoringCountCandidatesBatch,
  listMonitoringQueueCandidatesBatch,
  listMonitoringRelevantTruth,
  listOpportunityMonitoringBindings,
  type MonitoringCountCandidate,
  type MonitoringCountCursor,
  type MonitoringQueueCandidate,
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

type OpportunityTruthContext = Readonly<{
  byOpportunity: ReadonlyMap<string, OpportunityTruthProjection>;
  byInstitution: ReadonlyMap<string, readonly OpportunityTruthProjection[]>;
}>;

type MonitoringScheduleProjectionInput = Readonly<{
  sourceId: string;
  institutionOperationalState: string;
  institutionPublicationState: string;
  collectionStrategy: string;
  monitoringProfile: string;
  monitorEnabled: boolean;
  customIntervalMinutes: number | null;
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

function buildOpportunityTruthContext(
  nativeTruthRows: Awaited<
    ReturnType<typeof listCurrentNativeOpportunityTruth>
  >,
  legacyTruthRows: Awaited<
    ReturnType<typeof listCurrentLegacyOpportunityTruth>
  >,
): OpportunityTruthContext {
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
  const byOpportunity = new Map(
    truths.map((row) => [row.opportunityId, row] as const),
  );
  const byInstitution = new Map<string, OpportunityTruthProjection[]>();
  for (const truth of truths) {
    const rows = byInstitution.get(truth.institutionId) ?? [];
    rows.push(truth);
    byInstitution.set(truth.institutionId, rows);
  }
  return { byOpportunity, byInstitution };
}

function selectInstitutionTruth(
  context: OpportunityTruthContext,
  institutionId: string,
  now: Date,
): OpportunityTruthProjection | undefined {
  const truths = context.byInstitution.get(institutionId) ?? [];
  return truths
    .filter(
      (truth) =>
        truth.businessState === "OPEN" ||
        (truth.upcomingAt !== null &&
          truth.upcomingAt.getTime() >= now.getTime()),
    )
    .sort((left, right) => {
      const leftOpen = left.businessState === "OPEN";
      const rightOpen = right.businessState === "OPEN";
      if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
      if (!leftOpen && !rightOpen) {
        const byUpcoming =
          left.upcomingAt!.getTime() - right.upcomingAt!.getTime();
        if (byUpcoming !== 0) return byUpcoming;
      }
      return left.opportunityId.localeCompare(right.opportunityId);
    })[0];
}

function projectMonitoringSchedule(
  input: MonitoringScheduleProjectionInput,
  relevantTruth: OpportunityTruthProjection | undefined,
  lastCheckedAt: Date | null,
  now: Date,
) {
  return deriveMonitoringSchedule({
    now,
    lastCheckedAt,
    institutionDormant:
      input.institutionOperationalState === "CLOSED" ||
      input.institutionPublicationState === "ARCHIVED",
    monitorEnabled: input.monitorEnabled,
    manualOnly:
      input.collectionStrategy === "MANUAL" ||
      input.monitoringProfile === "MANUAL",
    currentBusinessState: relevantTruth?.businessState ?? null,
    upcomingAt: relevantTruth?.upcomingAt ?? null,
    customIntervalMinutes: input.customIntervalMinutes,
  });
}

function includesFilter<T>(
  values: readonly T[] | undefined,
  value: T,
): boolean {
  return values === undefined || values.includes(value);
}

function dueRank(value: MonitoringQueueRow["dueState"]): number {
  return {
    OVERDUE: 0,
    DUE: 1,
    UPCOMING: 2,
    MANUAL: 3,
  }[value];
}

function priorityRank(value: MonitoringQueueRow["priority"]): number {
  return {
    P0_ACTIVE: 0,
    P1_UPCOMING: 1,
    P2_WATCH: 2,
    P3_PASSIVE: 3,
  }[value];
}

export type MonitoringQueueSortCursor = Readonly<{
  dueState: MonitoringQueueRow["dueState"];
  priority: MonitoringQueueRow["priority"];
  nextDueAt: string | null;
  bindingId: string;
}>;

function queueSortKey(row: MonitoringQueueRow): MonitoringQueueSortCursor {
  return {
    dueState: row.dueState,
    priority: row.priority,
    nextDueAt: row.nextDueAt,
    bindingId: row.bindingId,
  };
}

function compareQueueSortKeys(
  left: MonitoringQueueSortCursor,
  right: MonitoringQueueSortCursor,
): number {
  const byDue = dueRank(left.dueState) - dueRank(right.dueState);
  if (byDue !== 0) return byDue;
  const byPriority = priorityRank(left.priority) - priorityRank(right.priority);
  if (byPriority !== 0) return byPriority;
  if (left.nextDueAt !== right.nextDueAt) {
    if (left.nextDueAt === null) return 1;
    if (right.nextDueAt === null) return -1;
    const byNextDue = left.nextDueAt.localeCompare(right.nextDueAt);
    if (byNextDue !== 0) return byNextDue;
  }
  return left.bindingId.localeCompare(right.bindingId);
}

export function compareMonitoringQueueRows(
  left: MonitoringQueueRow,
  right: MonitoringQueueRow,
): number {
  return compareQueueSortKeys(queueSortKey(left), queueSortKey(right));
}

const MONITORING_COUNT_BATCH_SIZE = 50;

async function projectMonitoringDueStateBatch(
  candidates: readonly MonitoringCountCandidate[],
  dependencies: MonitoringQueueDependencies,
): Promise<MonitoringDueState[]> {
  const opportunityIds = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.targetType === "OPPORTUNITY" &&
        candidate.opportunityId !== null
          ? [candidate.opportunityId]
          : [],
      ),
    ),
  ];
  const institutionIds = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.targetType === "INSTITUTION" ? [candidate.institutionId] : [],
      ),
    ),
  ];
  const sourceIds = [
    ...new Set(candidates.map((candidate) => candidate.sourceId)),
  ];
  const [latestObservations, relevantTruthRows] = await Promise.all([
    listLatestSourceObservations(dependencies.executor, sourceIds),
    listMonitoringRelevantTruth(dependencies.executor, {
      opportunityIds,
      institutionIds,
      now: dependencies.now,
    }),
  ]);
  const latestBySource = new Map(
    latestObservations.map((row) => [row.sourceId, row.observedAt] as const),
  );
  const truthByTarget = new Map(
    relevantTruthRows.map(
      (row) => [`${row.targetType}:${row.targetId}`, row] as const,
    ),
  );
  return candidates.map((candidate) => {
    const relevantTruth = truthByTarget.get(
      `${candidate.targetType}:${candidate.targetId}`,
    );
    return projectMonitoringSchedule(
      candidate,
      relevantTruth,
      latestBySource.get(candidate.sourceId) ?? null,
      dependencies.now,
    ).dueState;
  });
}

export async function* iterateMonitoringDueStateBatches(
  dependencies: MonitoringQueueDependencies,
): AsyncGenerator<readonly MonitoringDueState[]> {
  let after: MonitoringCountCursor | null = null;
  while (true) {
    const candidates = await listMonitoringCountCandidatesBatch(
      dependencies.executor,
      { after, limit: MONITORING_COUNT_BATCH_SIZE },
    );
    if (candidates.length === 0) return;
    yield await projectMonitoringDueStateBatch(candidates, dependencies);
    const last = candidates.at(-1)!;
    after = {
      targetType: last.targetType,
      targetId: last.targetId,
      sourceId: last.sourceId,
      role: last.role,
    };
    if (candidates.length < MONITORING_COUNT_BATCH_SIZE) return;
  }
}

export async function countMonitoringDueStates(
  dependencies: MonitoringQueueDependencies,
): Promise<Readonly<{ due: number; overdue: number }>> {
  let due = 0;
  let overdue = 0;
  for await (const states of iterateMonitoringDueStateBatches(dependencies)) {
    for (const state of states) {
      if (state === "DUE") due += 1;
      if (state === "OVERDUE") overdue += 1;
    }
  }
  return { due, overdue };
}

export const MONITORING_QUEUE_BATCH_SIZE = 50;
export const MONITORING_QUEUE_MAX_PAGE_SIZE = 50;

async function projectMonitoringQueueBatch(
  candidates: readonly MonitoringQueueCandidate[],
  dependencies: MonitoringQueueDependencies,
): Promise<MonitoringQueueRow[]> {
  if (candidates.length > MONITORING_QUEUE_BATCH_SIZE) {
    throw new Error("Monitoring queue projection exceeded its batch bound");
  }
  const opportunityIds = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.targetType === "OPPORTUNITY" &&
        candidate.opportunityId !== null
          ? [candidate.opportunityId]
          : [],
      ),
    ),
  ];
  const institutionIds = [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate.targetType === "INSTITUTION" ? [candidate.institutionId] : [],
      ),
    ),
  ];
  const sourceIds = [
    ...new Set(candidates.map((candidate) => candidate.sourceId)),
  ];
  if (
    opportunityIds.length + institutionIds.length >
      MONITORING_QUEUE_BATCH_SIZE ||
    sourceIds.length > MONITORING_QUEUE_BATCH_SIZE
  ) {
    throw new Error("Monitoring queue support lookup exceeded its batch bound");
  }
  const [latestObservations, relevantTruthRows] = await Promise.all([
    listLatestSourceObservations(dependencies.executor, sourceIds),
    listMonitoringRelevantTruth(dependencies.executor, {
      opportunityIds,
      institutionIds,
      now: dependencies.now,
    }),
  ]);
  if (
    latestObservations.length > sourceIds.length ||
    relevantTruthRows.length > opportunityIds.length + institutionIds.length
  ) {
    throw new Error("Monitoring queue support rows exceeded their batch bound");
  }
  const latestBySource = new Map(
    latestObservations.map((row) => [row.sourceId, row.observedAt] as const),
  );
  const truthByTarget = new Map(
    relevantTruthRows.map(
      (row) => [`${row.targetType}:${row.targetId}`, row] as const,
    ),
  );

  return candidates.map((candidate) => {
    const relevantTruth = truthByTarget.get(
      `${candidate.targetType}:${candidate.targetId}`,
    );
    const lastCheckedAt = latestBySource.get(candidate.sourceId) ?? null;
    const schedule = projectMonitoringSchedule(
      candidate,
      relevantTruth,
      lastCheckedAt,
      dependencies.now,
    );
    const common = {
      bindingId: createBindingKey({
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        sourceId: candidate.sourceId,
        role: candidate.role,
      }),
      targetType: candidate.targetType,
      targetId: candidate.targetId,
      institution: {
        id: candidate.institutionId,
        slug: candidate.institutionSlug,
        displayName: candidate.institutionDisplayName,
        category: candidate.institutionCategory,
        operationalState: candidate.institutionOperationalState,
        publicationState: candidate.institutionPublicationState,
      },
      source: {
        id: candidate.sourceId,
        canonicalUrl: candidate.sourceCanonicalUrl,
        sourceType: candidate.sourceType,
        authorityLevel: candidate.sourceAuthorityLevel,
        lifecycleStatus: candidate.sourceLifecycleStatus,
        sourceName: candidate.sourceName,
      },
      role: candidate.role,
      isPrimary: candidate.isPrimary,
      priority: schedule.priority,
      lastCheckedAt: lastCheckedAt?.toISOString() ?? null,
      nextDueAt: schedule.nextDueAt?.toISOString() ?? null,
      dueState: schedule.dueState,
      dueReason: lastCheckedAt
        ? `${schedule.priority}_CADENCE`
        : "NEVER_CHECKED",
    } as const;

    if (candidate.targetType === "INSTITUTION") {
      return {
        ...common,
        targetType: "INSTITUTION",
        opportunity: null,
        currentTruthSummary: {
          kind: "INSTITUTION",
          operationalState: candidate.institutionOperationalState,
          publicationState: candidate.institutionPublicationState,
        },
      } satisfies MonitoringQueueRow;
    }
    if (
      candidate.opportunityId === null ||
      candidate.opportunitySlug === null ||
      candidate.opportunityKind === null ||
      candidate.opportunityTruthMode === null ||
      candidate.opportunityPublicationState === null
    ) {
      throw new Error("Opportunity Monitoring candidate is incomplete");
    }
    return {
      ...common,
      targetType: "OPPORTUNITY",
      opportunity: {
        id: candidate.opportunityId,
        slug: candidate.opportunitySlug,
        kind: candidate.opportunityKind,
        truthMode: candidate.opportunityTruthMode,
        publicationState: candidate.opportunityPublicationState,
      },
      currentTruthSummary: opportunityTruthSummary(relevantTruth),
    } satisfies MonitoringQueueRow;
  });
}

export async function* iterateMonitoringQueueBatches(
  dependencies: MonitoringQueueDependencies,
): AsyncGenerator<readonly MonitoringQueueRow[]> {
  let after: MonitoringCountCursor | null = null;
  while (true) {
    const candidates = await listMonitoringQueueCandidatesBatch(
      dependencies.executor,
      { after, limit: MONITORING_QUEUE_BATCH_SIZE },
    );
    if (candidates.length === 0) return;
    yield await projectMonitoringQueueBatch(candidates, dependencies);
    const last = candidates.at(-1)!;
    after = {
      targetType: last.targetType,
      targetId: last.targetId,
      sourceId: last.sourceId,
      role: last.role,
    };
    if (candidates.length < MONITORING_QUEUE_BATCH_SIZE) return;
  }
}

export type MonitoringQueuePage = Readonly<{
  items: readonly MonitoringQueueRow[];
  hasNext: boolean;
  nextSortCursor: MonitoringQueueSortCursor | null;
}>;

function insertIntoBoundedTopQueue(
  top: MonitoringQueueRow[],
  row: MonitoringQueueRow,
  limit: number,
): void {
  if (
    top.length === limit &&
    compareMonitoringQueueRows(row, top[top.length - 1]!) >= 0
  ) {
    return;
  }
  let low = 0;
  let high = top.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareMonitoringQueueRows(row, top[middle]!) < 0) high = middle;
    else low = middle + 1;
  }
  if (top.length < limit) {
    top.splice(low, 0, row);
    return;
  }
  for (let index = top.length - 1; index > low; index -= 1) {
    top[index] = top[index - 1]!;
  }
  top[low] = row;
}

export async function getMonitoringQueuePage(
  rawFilter: unknown,
  page: Readonly<{
    pageSize: number;
    after: MonitoringQueueSortCursor | null;
  }>,
  dependencies: MonitoringQueueDependencies,
): Promise<MonitoringQueuePage> {
  const filter = parseFilter(rawFilter);
  if (
    !Number.isInteger(page.pageSize) ||
    page.pageSize < 1 ||
    page.pageSize > MONITORING_QUEUE_MAX_PAGE_SIZE
  ) {
    throw new RangeError("Monitoring queue page size must be from 1 to 50");
  }
  const boundedRows: MonitoringQueueRow[] = [];
  const topLimit = page.pageSize + 1;
  for await (const batch of iterateMonitoringQueueBatches(dependencies)) {
    for (const row of batch) {
      if (
        !includesFilter(filter.dueState, row.dueState) ||
        !includesFilter(filter.priority, row.priority) ||
        !includesFilter(filter.targetType, row.targetType) ||
        !includesFilter(filter.role, row.role) ||
        !includesFilter(filter.sourceLifecycle, row.source.lifecycleStatus) ||
        (page.after !== null &&
          compareQueueSortKeys(queueSortKey(row), page.after) <= 0)
      ) {
        continue;
      }
      insertIntoBoundedTopQueue(boundedRows, row, topLimit);
    }
  }
  const hasNext = boundedRows.length > page.pageSize;
  const items = boundedRows.slice(0, page.pageSize);
  return {
    items,
    hasNext,
    nextSortCursor:
      hasNext && items.length > 0 ? queueSortKey(items.at(-1)!) : null,
  };
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
  const truthContext = buildOpportunityTruthContext(
    nativeTruthRows,
    legacyTruthRows,
  );

  const rows: MonitoringQueueRow[] = [];
  for (const binding of opportunityBindings) {
    const relevantTruth = truthContext.byOpportunity.get(binding.opportunityId);
    const latest = latestBySource.get(binding.sourceId);
    const schedule = projectMonitoringSchedule(
      binding,
      relevantTruth,
      latest?.observedAt ?? null,
      dependencies.now,
    );
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
    const relevantTruth = selectInstitutionTruth(
      truthContext,
      binding.institutionId,
      dependencies.now,
    );
    const latest = latestBySource.get(binding.sourceId);
    const schedule = projectMonitoringSchedule(
      binding,
      relevantTruth,
      latest?.observedAt ?? null,
      dependencies.now,
    );
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
    .sort(compareMonitoringQueueRows);
}
