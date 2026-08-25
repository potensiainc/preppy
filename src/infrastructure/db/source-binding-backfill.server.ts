import "server-only";

import { sql } from "drizzle-orm";

import {
  institutionSourceBindings,
  opportunitySourceBindings,
  type InstitutionSourceBindingRole,
  type OpportunitySourceBindingRole,
} from "@/src/db/schema";
import {
  mapLegacyInstitutionBindingRole,
  mapNativeOpportunityEvidenceRole,
} from "@/src/infrastructure/db/source-binding-backfill-policy";
import type {
  ReadOnlyDatabaseExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";

export const MIGRATION_SOURCE_BINDING_BACKFILL_CONTEXT = {
  source: "MIGRATION",
  emitProductSignals: false,
} as const;

type BindingTarget = {
  institutionId?: string;
  opportunityId?: string;
  sourceId?: string;
  schoolId?: string;
  cycleId?: string;
  bindingId?: string;
};

export type SourceBindingBackfillIssue = BindingTarget & {
  code: string;
  message: string;
};

export type SourceBindingNotImported = BindingTarget & {
  code: string;
  reason: string;
};

export type InstitutionSourceBindingBackfillAction = {
  institutionId: string;
  sourceId: string;
  role: InstitutionSourceBindingRole;
  isPrimary: boolean;
  isActive: boolean;
  boundAt: Date;
  unboundAt: Date | null;
  create: boolean;
};

export type OpportunitySourceBindingBackfillAction = {
  opportunityId: string;
  sourceId: string;
  role: OpportunitySourceBindingRole;
  isPrimary: boolean;
  isActive: true;
  boundAt: Date;
  unboundAt: null;
  create: boolean;
};

export type SourceBindingBackfillPreflight = {
  context: typeof MIGRATION_SOURCE_BINDING_BACKFILL_CONTEXT;
  legacyBindingCount: number;
  legacyRoleDistribution: Record<string, number>;
  existingCanonical: { institution: number; opportunity: number };
  blockingIssues: SourceBindingBackfillIssue[];
  warnings: SourceBindingBackfillIssue[];
  notImported: SourceBindingNotImported[];
  planned: {
    institution: { insert: number; skip: number };
    opportunity: { insert: number; skip: number };
  };
  productionStateVerified: false;
  institutionActions: InstitutionSourceBindingBackfillAction[];
  opportunityActions: OpportunitySourceBindingBackfillAction[];
};

export type SourceBindingBackfillApplyResult = {
  context: typeof MIGRATION_SOURCE_BINDING_BACKFILL_CONTEXT;
  institution: { inserted: number; skipped: number };
  opportunity: { inserted: number; skipped: number };
  notImported: number;
};

type LegacyBindingRow = {
  bindingId: string;
  sourceId: string;
  resolvedSourceId: string | null;
  sourceType: string | null;
  schoolId: string;
  resolvedSchoolId: string | null;
  institutionId: string | null;
  resolvedInstitutionId: string | null;
  admissionCycleId: string | null;
  resolvedCycleId: string | null;
  cycleSchoolId: string | null;
  sourceRole: string;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type NativeEvidenceRow = {
  opportunityId: string;
  sourceId: string;
  resolvedSourceId: string | null;
  evidenceRole: string;
  createdAt: Date | string;
  sourceObservationId: bigint | null;
  observationSourceId: string | null;
  sourceSnapshotId: string | null;
  snapshotSourceId: string | null;
  isCurrent: boolean;
  verificationState: string;
  verifiedAt: Date | string | null;
};

type LegacyEvidenceRow = {
  opportunityId: string;
  sourceId: string;
  resolvedSourceId: string | null;
  isPrimary: boolean;
  createdAt: Date | string;
  sourceObservationId: bigint | null;
  observationSourceId: string | null;
  snapshotId: string | null;
  snapshotSourceId: string | null;
  isCurrent: boolean;
  verificationStatus: string;
  verifiedAt: Date | string | null;
};

type NativeOpportunityInventoryRow = {
  opportunityId: string;
  evidenceCount: number;
};

type LegacyOpportunityInventoryRow = {
  opportunityId: string;
  bridgeEventId: string | null;
  resolvedEventId: string | null;
  bridgeCycleId: string | null;
  resolvedCycleId: string | null;
  bridgeSchoolId: string | null;
  cycleSchoolId: string | null;
  evidenceCount: number;
};

type ExistingInstitutionBinding = Omit<
  InstitutionSourceBindingBackfillAction,
  "create"
>;
type ExistingOpportunityBinding = Omit<
  OpportunitySourceBindingBackfillAction,
  "create" | "isActive" | "unboundAt"
> & {
  isActive: boolean;
  unboundAt: Date | null;
};

function queryRows<Row>(result: unknown): Row[] {
  return result as Row[];
}

function issue(
  code: string,
  message: string,
  target: BindingTarget = {},
): SourceBindingBackfillIssue {
  return { code, message, ...target };
}

function notImported(
  code: string,
  reason: string,
  target: BindingTarget = {},
): SourceBindingNotImported {
  return { code, reason, ...target };
}

function sameDate(left: Date | null, right: Date | null): boolean {
  return left?.getTime() === right?.getTime();
}

function timestamp(value: Date | string): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("INVALID_SOURCE_BINDING_TIMESTAMP");
  }
  return parsed;
}

function earlier(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

function later(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

function institutionKey(
  binding: Pick<
    InstitutionSourceBindingBackfillAction,
    "institutionId" | "sourceId" | "role"
  >,
): string {
  return `${binding.institutionId}:${binding.sourceId}:${binding.role}`;
}

function opportunityKey(
  binding: Pick<
    OpportunitySourceBindingBackfillAction,
    "opportunityId" | "sourceId" | "role"
  >,
): string {
  return `${binding.opportunityId}:${binding.sourceId}:${binding.role}`;
}

function exactInstitutionBinding(
  candidate: InstitutionSourceBindingBackfillAction,
  existing: ExistingInstitutionBinding,
): boolean {
  return (
    candidate.isPrimary === existing.isPrimary &&
    candidate.isActive === existing.isActive &&
    sameDate(candidate.boundAt, existing.boundAt) &&
    sameDate(candidate.unboundAt, existing.unboundAt)
  );
}

function exactOpportunityBinding(
  candidate: OpportunitySourceBindingBackfillAction,
  existing: ExistingOpportunityBinding,
): boolean {
  return (
    candidate.isPrimary === existing.isPrimary &&
    candidate.isActive === existing.isActive &&
    sameDate(candidate.boundAt, existing.boundAt) &&
    sameDate(candidate.unboundAt, existing.unboundAt)
  );
}

async function loadLegacyBindings(
  executor: ReadOnlyDatabaseExecutor,
): Promise<LegacyBindingRow[]> {
  return queryRows<LegacyBindingRow>(
    await executor.raw(sql`
      select
        binding.id as "bindingId",
        binding.source_id as "sourceId",
        source.id as "resolvedSourceId",
        source.source_type as "sourceType",
        binding.school_id as "schoolId",
        school.id as "resolvedSchoolId",
        bridge.institution_id as "institutionId",
        institution.id as "resolvedInstitutionId",
        binding.admission_cycle_id as "admissionCycleId",
        cycle.id as "resolvedCycleId",
        cycle.school_id as "cycleSchoolId",
        binding.source_role as "sourceRole",
        binding.is_active as "isActive",
        binding.created_at as "createdAt",
        binding.updated_at as "updatedAt"
      from source_bindings binding
      left join sources source on source.id = binding.source_id
      left join schools school on school.id = binding.school_id
      left join institution_school_links bridge
        on bridge.school_id = binding.school_id
      left join institutions institution
        on institution.id = bridge.institution_id
      left join admission_cycles cycle
        on cycle.id = binding.admission_cycle_id
      order by binding.id
    `),
  );
}

async function loadNativeEvidence(
  executor: ReadOnlyDatabaseExecutor,
): Promise<NativeEvidenceRow[]> {
  return queryRows<NativeEvidenceRow>(
    await executor.raw(sql`
      select
        opportunity.id as "opportunityId",
        evidence.source_id as "sourceId",
        source.id as "resolvedSourceId",
        evidence.evidence_role as "evidenceRole",
        evidence.created_at as "createdAt",
        evidence.source_observation_id as "sourceObservationId",
        observation.source_id as "observationSourceId",
        evidence.source_snapshot_id as "sourceSnapshotId",
        snapshot.source_id as "snapshotSourceId",
        version.is_current as "isCurrent",
        version.verification_state as "verificationState",
        version.verified_at as "verifiedAt"
      from opportunities opportunity
      join opportunity_versions version
        on version.opportunity_id = opportunity.id
      join opportunity_version_evidence evidence
        on evidence.opportunity_version_id = version.id
      left join sources source on source.id = evidence.source_id
      left join source_observations observation
        on observation.id = evidence.source_observation_id
      left join source_snapshots snapshot
        on snapshot.id = evidence.source_snapshot_id
      where opportunity.truth_mode = 'NATIVE'
        and version.truth_mode = 'NATIVE'
      order by opportunity.id, evidence.source_id, evidence.created_at,
        evidence.id
    `),
  );
}

async function loadLegacyEvidence(
  executor: ReadOnlyDatabaseExecutor,
): Promise<LegacyEvidenceRow[]> {
  return queryRows<LegacyEvidenceRow>(
    await executor.raw(sql`
      select
        opportunity.id as "opportunityId",
        evidence.source_id as "sourceId",
        source.id as "resolvedSourceId",
        evidence.is_primary as "isPrimary",
        evidence.created_at as "createdAt",
        evidence.source_observation_id as "sourceObservationId",
        observation.source_id as "observationSourceId",
        evidence.snapshot_id as "snapshotId",
        snapshot.source_id as "snapshotSourceId",
        version.is_current as "isCurrent",
        version.verification_status as "verificationStatus",
        version.verified_at as "verifiedAt"
      from opportunities opportunity
      join opportunity_admission_event_links bridge
        on bridge.opportunity_id = opportunity.id
      join admission_events event
        on event.id = bridge.admission_event_id
      join admission_event_versions version
        on version.admission_event_id = event.id
      join event_version_evidence evidence
        on evidence.event_version_id = version.id
      left join sources source on source.id = evidence.source_id
      left join source_observations observation
        on observation.id = evidence.source_observation_id
      left join source_snapshots snapshot
        on snapshot.id = evidence.snapshot_id
      where opportunity.truth_mode = 'LEGACY_BACKED'
        and bridge.truth_mode = 'LEGACY_BACKED'
      order by opportunity.id, evidence.source_id, evidence.created_at,
        evidence.id
    `),
  );
}

async function loadNativeOpportunityInventory(
  executor: ReadOnlyDatabaseExecutor,
): Promise<NativeOpportunityInventoryRow[]> {
  return queryRows<NativeOpportunityInventoryRow>(
    await executor.raw(sql`
      select
        opportunity.id as "opportunityId",
        count(evidence.id)::int as "evidenceCount"
      from opportunities opportunity
      left join opportunity_versions version
        on version.opportunity_id = opportunity.id
      left join opportunity_version_evidence evidence
        on evidence.opportunity_version_id = version.id
      where opportunity.truth_mode = 'NATIVE'
      group by opportunity.id
      order by opportunity.id
    `),
  );
}

async function loadLegacyOpportunityInventory(
  executor: ReadOnlyDatabaseExecutor,
): Promise<LegacyOpportunityInventoryRow[]> {
  return queryRows<LegacyOpportunityInventoryRow>(
    await executor.raw(sql`
      select
        opportunity.id as "opportunityId",
        bridge.admission_event_id as "bridgeEventId",
        event.id as "resolvedEventId",
        bridge.admission_cycle_id as "bridgeCycleId",
        cycle.id as "resolvedCycleId",
        bridge.school_id as "bridgeSchoolId",
        cycle.school_id as "cycleSchoolId",
        count(evidence.id)::int as "evidenceCount"
      from opportunities opportunity
      left join opportunity_admission_event_links bridge
        on bridge.opportunity_id = opportunity.id
      left join admission_events event
        on event.id = bridge.admission_event_id
      left join admission_cycles cycle
        on cycle.id = bridge.admission_cycle_id
      left join admission_event_versions version
        on version.admission_event_id = event.id
      left join event_version_evidence evidence
        on evidence.event_version_id = version.id
      where opportunity.truth_mode = 'LEGACY_BACKED'
      group by opportunity.id, bridge.admission_event_id, event.id,
        bridge.admission_cycle_id, cycle.id, bridge.school_id, cycle.school_id
      order by opportunity.id
    `),
  );
}

async function loadExistingInstitutionBindings(
  executor: ReadOnlyDatabaseExecutor,
): Promise<ExistingInstitutionBinding[]> {
  const rows = queryRows<
    Omit<ExistingInstitutionBinding, "boundAt" | "unboundAt"> & {
      boundAt: Date | string;
      unboundAt: Date | string | null;
    }
  >(
    await executor.raw(sql`
      select
        institution_id as "institutionId",
        source_id as "sourceId",
        role,
        is_primary as "isPrimary",
        is_active as "isActive",
        bound_at as "boundAt",
        unbound_at as "unboundAt"
      from institution_source_bindings
      order by institution_id, source_id, role
    `),
  );
  return rows.map((row) => ({
    ...row,
    boundAt: timestamp(row.boundAt),
    unboundAt: row.unboundAt === null ? null : timestamp(row.unboundAt),
  }));
}

async function loadExistingOpportunityBindings(
  executor: ReadOnlyDatabaseExecutor,
): Promise<ExistingOpportunityBinding[]> {
  const rows = queryRows<
    Omit<ExistingOpportunityBinding, "boundAt" | "unboundAt"> & {
      boundAt: Date | string;
      unboundAt: Date | string | null;
    }
  >(
    await executor.raw(sql`
      select
        opportunity_id as "opportunityId",
        source_id as "sourceId",
        role,
        is_primary as "isPrimary",
        is_active as "isActive",
        bound_at as "boundAt",
        unbound_at as "unboundAt"
      from opportunity_source_bindings
      order by opportunity_id, source_id, role
    `),
  );
  return rows.map((row) => ({
    ...row,
    boundAt: timestamp(row.boundAt),
    unboundAt: row.unboundAt === null ? null : timestamp(row.unboundAt),
  }));
}

function addInstitutionCandidate(
  candidates: Map<string, InstitutionSourceBindingBackfillAction>,
  candidate: InstitutionSourceBindingBackfillAction,
  blockingIssues: SourceBindingBackfillIssue[],
): void {
  const key = institutionKey(candidate);
  const previous = candidates.get(key);
  if (!previous) {
    candidates.set(key, candidate);
    return;
  }
  if (
    previous.isPrimary !== candidate.isPrimary ||
    previous.isActive !== candidate.isActive
  ) {
    blockingIssues.push(
      issue(
        "CONFLICTING_LEGACY_BINDING_CANDIDATES",
        "Legacy rows disagree on canonical primary or lifecycle state.",
        {
          institutionId: candidate.institutionId,
          sourceId: candidate.sourceId,
        },
      ),
    );
    candidates.delete(key);
    return;
  }
  previous.boundAt = earlier(previous.boundAt, candidate.boundAt);
  if (previous.unboundAt && candidate.unboundAt) {
    previous.unboundAt = later(previous.unboundAt, candidate.unboundAt);
  }
}

function addOpportunityCandidate(
  candidates: Map<string, OpportunitySourceBindingBackfillAction>,
  candidate: OpportunitySourceBindingBackfillAction,
  blockingIssues: SourceBindingBackfillIssue[],
): void {
  const key = opportunityKey(candidate);
  const previous = candidates.get(key);
  if (!previous) {
    candidates.set(key, candidate);
    return;
  }
  if (previous.isPrimary !== candidate.isPrimary) {
    blockingIssues.push(
      issue(
        "CONFLICTING_OPPORTUNITY_EVIDENCE_CANDIDATES",
        "Evidence rows disagree on canonical primary state.",
        {
          opportunityId: candidate.opportunityId,
          sourceId: candidate.sourceId,
        },
      ),
    );
    candidates.delete(key);
    return;
  }
  previous.boundAt = earlier(previous.boundAt, candidate.boundAt);
}

function validatePrimaryCardinality(
  institutionCandidates: InstitutionSourceBindingBackfillAction[],
  opportunityCandidates: OpportunitySourceBindingBackfillAction[],
  existingInstitution: ExistingInstitutionBinding[],
  existingOpportunity: ExistingOpportunityBinding[],
  blockingIssues: SourceBindingBackfillIssue[],
): void {
  const institutionPrimaries = new Map<string, Set<string>>();
  for (const binding of [...existingInstitution, ...institutionCandidates]) {
    if (
      binding.role !== "OFFICIAL_MAIN" ||
      !binding.isPrimary ||
      !binding.isActive
    ) {
      continue;
    }
    const keys = institutionPrimaries.get(binding.institutionId) ?? new Set();
    keys.add(institutionKey(binding));
    institutionPrimaries.set(binding.institutionId, keys);
  }
  for (const [institutionId, keys] of institutionPrimaries) {
    if (keys.size > 1) {
      blockingIssues.push(
        issue(
          "MULTIPLE_ACTIVE_PRIMARY_OFFICIAL_MAIN",
          "Institution has multiple active primary OFFICIAL_MAIN candidates.",
          { institutionId },
        ),
      );
    }
  }

  const opportunityPrimaries = new Map<string, Set<string>>();
  for (const binding of [...existingOpportunity, ...opportunityCandidates]) {
    if (!binding.isPrimary || !binding.isActive) continue;
    const cardinalityKey = `${binding.opportunityId}:${binding.role}`;
    const keys = opportunityPrimaries.get(cardinalityKey) ?? new Set();
    keys.add(opportunityKey(binding));
    opportunityPrimaries.set(cardinalityKey, keys);
  }
  for (const [cardinalityKey, keys] of opportunityPrimaries) {
    if (keys.size <= 1) continue;
    const [opportunityId] = cardinalityKey.split(":");
    blockingIssues.push(
      issue(
        "MULTIPLE_ACTIVE_PRIMARY_OPPORTUNITY_ROLE",
        "Opportunity has multiple active primary candidates for one role.",
        { opportunityId },
      ),
    );
  }
}

export async function preflightSourceBindingBackfill(
  executor: ReadOnlyDatabaseExecutor,
): Promise<SourceBindingBackfillPreflight> {
  const [
    legacyBindings,
    nativeEvidence,
    legacyEvidence,
    nativeOpportunityInventory,
    legacyOpportunityInventory,
    existingInstitution,
    existingOpportunity,
  ] = await Promise.all([
    loadLegacyBindings(executor),
    loadNativeEvidence(executor),
    loadLegacyEvidence(executor),
    loadNativeOpportunityInventory(executor),
    loadLegacyOpportunityInventory(executor),
    loadExistingInstitutionBindings(executor),
    loadExistingOpportunityBindings(executor),
  ]);

  const blockingIssues: SourceBindingBackfillIssue[] = [];
  const warnings: SourceBindingBackfillIssue[] = [];
  const notImportedRows: SourceBindingNotImported[] = [];
  const legacyRoleDistribution: Record<string, number> = {};
  const institutionCandidates = new Map<
    string,
    InstitutionSourceBindingBackfillAction
  >();
  const opportunityCandidates = new Map<
    string,
    OpportunitySourceBindingBackfillAction
  >();

  for (const binding of legacyBindings) {
    legacyRoleDistribution[binding.sourceRole] =
      (legacyRoleDistribution[binding.sourceRole] ?? 0) + 1;
    const target = {
      bindingId: binding.bindingId,
      sourceId: binding.sourceId,
      schoolId: binding.schoolId,
      cycleId: binding.admissionCycleId ?? undefined,
    };
    if (!binding.resolvedSourceId) {
      blockingIssues.push(
        issue(
          "ORPHAN_SOURCE",
          "Legacy binding Source cannot be resolved.",
          target,
        ),
      );
      continue;
    }
    if (!binding.resolvedSchoolId) {
      blockingIssues.push(
        issue(
          "ORPHAN_SCHOOL",
          "Legacy binding School cannot be resolved.",
          target,
        ),
      );
      continue;
    }
    if (binding.admissionCycleId && !binding.resolvedCycleId) {
      blockingIssues.push(
        issue(
          "ORPHAN_CYCLE",
          "Legacy binding Cycle cannot be resolved.",
          target,
        ),
      );
      continue;
    }
    if (
      binding.admissionCycleId &&
      binding.cycleSchoolId !== binding.schoolId
    ) {
      blockingIssues.push(
        issue(
          "CYCLE_SCHOOL_MISMATCH",
          "Legacy binding Cycle belongs to another School.",
          target,
        ),
      );
      continue;
    }
    if (!binding.institutionId) {
      blockingIssues.push(
        issue(
          "SCHOOL_MISSING_INSTITUTION_BRIDGE",
          "Legacy binding School has no canonical Institution bridge.",
          target,
        ),
      );
      continue;
    }
    if (!binding.resolvedInstitutionId) {
      blockingIssues.push(
        issue(
          "ORPHAN_INSTITUTION_BRIDGE",
          "Institution bridge target cannot be resolved.",
          { ...target, institutionId: binding.institutionId },
        ),
      );
      continue;
    }
    if (binding.admissionCycleId) {
      notImportedRows.push(
        notImported(
          "AMBIGUOUS_OPPORTUNITY_SCOPE",
          "Cycle scope cannot be expanded to every Opportunity.",
          { ...target, institutionId: binding.institutionId },
        ),
      );
    }

    let mapping;
    try {
      mapping = mapLegacyInstitutionBindingRole(
        binding.sourceRole,
        binding.sourceType ?? "",
      );
    } catch {
      blockingIssues.push(
        issue(
          "UNKNOWN_REQUIRED_ROLE_MAPPING",
          "Legacy binding role has no reviewed canonical mapping.",
          { ...target, institutionId: binding.institutionId },
        ),
      );
      continue;
    }
    if ("notImportedReason" in mapping) {
      notImportedRows.push(
        notImported("UNSAFE_LEGACY_ROLE", mapping.notImportedReason, {
          ...target,
          institutionId: binding.institutionId,
        }),
      );
      continue;
    }
    addInstitutionCandidate(
      institutionCandidates,
      {
        institutionId: binding.institutionId,
        sourceId: binding.sourceId,
        role: mapping.role,
        isPrimary: mapping.isPrimary,
        isActive: binding.isActive,
        boundAt: timestamp(binding.createdAt),
        unboundAt: binding.isActive ? null : timestamp(binding.updatedAt),
        create: true,
      },
      blockingIssues,
    );
  }

  for (const inventory of nativeOpportunityInventory) {
    if (inventory.evidenceCount === 0) {
      notImportedRows.push(
        notImported(
          "NO_NATIVE_OPPORTUNITY_EVIDENCE",
          "Native Opportunity has no Evidence eligible for binding review.",
          { opportunityId: inventory.opportunityId },
        ),
      );
    }
  }

  for (const inventory of legacyOpportunityInventory) {
    const target = { opportunityId: inventory.opportunityId };
    if (!inventory.bridgeEventId) {
      notImportedRows.push(
        notImported(
          "MISSING_EXPLICIT_OPPORTUNITY_EVENT_BRIDGE",
          "Legacy-backed Opportunity has no explicit AdmissionEvent bridge.",
          target,
        ),
      );
      continue;
    }
    if (!inventory.resolvedEventId) {
      blockingIssues.push(
        issue(
          "ORPHAN_ADMISSION_EVENT",
          "Opportunity bridge AdmissionEvent cannot be resolved.",
          target,
        ),
      );
      continue;
    }
    if (inventory.bridgeCycleId && !inventory.resolvedCycleId) {
      blockingIssues.push(
        issue("ORPHAN_CYCLE", "Opportunity bridge Cycle cannot be resolved.", {
          ...target,
          cycleId: inventory.bridgeCycleId,
        }),
      );
      continue;
    }
    if (
      inventory.bridgeCycleId &&
      inventory.bridgeSchoolId !== inventory.cycleSchoolId
    ) {
      blockingIssues.push(
        issue(
          "CYCLE_SCHOOL_MISMATCH",
          "Opportunity bridge Cycle belongs to another School.",
          { ...target, cycleId: inventory.bridgeCycleId },
        ),
      );
      continue;
    }
    if (inventory.evidenceCount === 0) {
      notImportedRows.push(
        notImported(
          "NO_LEGACY_EVENT_EVIDENCE",
          "Explicit AdmissionEvent bridge has no Evidence to import.",
          target,
        ),
      );
    }
  }

  for (const evidence of nativeEvidence) {
    const target = {
      opportunityId: evidence.opportunityId,
      sourceId: evidence.sourceId,
    };
    if (!evidence.resolvedSourceId) {
      blockingIssues.push(
        issue(
          "ORPHAN_SOURCE",
          "Native Evidence Source cannot be resolved.",
          target,
        ),
      );
      continue;
    }
    if (
      (evidence.sourceObservationId &&
        evidence.observationSourceId !== evidence.sourceId) ||
      (evidence.sourceSnapshotId &&
        evidence.snapshotSourceId !== evidence.sourceId)
    ) {
      blockingIssues.push(
        issue(
          "EVIDENCE_SOURCE_MISMATCH",
          "Native Evidence references Observation or Snapshot from another Source.",
          target,
        ),
      );
      continue;
    }
    if (
      !evidence.isCurrent ||
      evidence.verificationState !== "VERIFIED" ||
      evidence.verifiedAt === null
    ) {
      notImportedRows.push(
        notImported(
          "INELIGIBLE_OPPORTUNITY_EVIDENCE",
          "Native Evidence is not attached to a current VERIFIED Version.",
          target,
        ),
      );
      continue;
    }
    const mapping = mapNativeOpportunityEvidenceRole(evidence.evidenceRole);
    if ("notImportedReason" in mapping) {
      notImportedRows.push(
        notImported(
          "UNMAPPED_OPPORTUNITY_EVIDENCE_ROLE",
          mapping.notImportedReason,
          target,
        ),
      );
      continue;
    }
    addOpportunityCandidate(
      opportunityCandidates,
      {
        opportunityId: evidence.opportunityId,
        sourceId: evidence.sourceId,
        role: mapping.role,
        isPrimary: mapping.isPrimary,
        isActive: true,
        boundAt: timestamp(evidence.createdAt),
        unboundAt: null,
        create: true,
      },
      blockingIssues,
    );
  }

  for (const evidence of legacyEvidence) {
    const target = {
      opportunityId: evidence.opportunityId,
      sourceId: evidence.sourceId,
    };
    if (!evidence.resolvedSourceId) {
      blockingIssues.push(
        issue(
          "ORPHAN_SOURCE",
          "Legacy Evidence Source cannot be resolved.",
          target,
        ),
      );
      continue;
    }
    if (
      (evidence.sourceObservationId &&
        evidence.observationSourceId !== evidence.sourceId) ||
      (evidence.snapshotId && evidence.snapshotSourceId !== evidence.sourceId)
    ) {
      blockingIssues.push(
        issue(
          "EVIDENCE_SOURCE_MISMATCH",
          "Legacy Evidence references Observation or Snapshot from another Source.",
          target,
        ),
      );
      continue;
    }
    if (
      !evidence.isCurrent ||
      evidence.verificationStatus !== "VERIFIED" ||
      evidence.verifiedAt === null
    ) {
      notImportedRows.push(
        notImported(
          "INELIGIBLE_OPPORTUNITY_EVIDENCE",
          "Legacy Evidence is not attached to a current VERIFIED EventVersion.",
          target,
        ),
      );
      continue;
    }
    addOpportunityCandidate(
      opportunityCandidates,
      {
        opportunityId: evidence.opportunityId,
        sourceId: evidence.sourceId,
        role: evidence.isPrimary ? "PRIMARY_NOTICE" : "SUPPORTING",
        isPrimary: evidence.isPrimary,
        isActive: true,
        boundAt: timestamp(evidence.createdAt),
        unboundAt: null,
        create: true,
      },
      blockingIssues,
    );
  }

  const institutionCandidateRows = [...institutionCandidates.values()];
  const opportunityCandidateRows = [...opportunityCandidates.values()];
  validatePrimaryCardinality(
    institutionCandidateRows,
    opportunityCandidateRows,
    existingInstitution,
    existingOpportunity,
    blockingIssues,
  );

  const existingInstitutionByKey = new Map(
    existingInstitution.map((binding) => [institutionKey(binding), binding]),
  );
  for (const candidate of institutionCandidateRows) {
    const existing = existingInstitutionByKey.get(institutionKey(candidate));
    if (!existing) continue;
    if (exactInstitutionBinding(candidate, existing)) {
      candidate.create = false;
      continue;
    }
    blockingIssues.push(
      issue(
        "CONFLICTING_EXISTING_CANONICAL_BINDING",
        "Existing Institution binding differs in primary, lifecycle, or time state.",
        {
          institutionId: candidate.institutionId,
          sourceId: candidate.sourceId,
        },
      ),
    );
  }

  const existingOpportunityByKey = new Map(
    existingOpportunity.map((binding) => [opportunityKey(binding), binding]),
  );
  for (const candidate of opportunityCandidateRows) {
    const existing = existingOpportunityByKey.get(opportunityKey(candidate));
    if (!existing) continue;
    if (exactOpportunityBinding(candidate, existing)) {
      candidate.create = false;
      continue;
    }
    blockingIssues.push(
      issue(
        "CONFLICTING_EXISTING_CANONICAL_BINDING",
        "Existing Opportunity binding differs in primary, lifecycle, or time state.",
        {
          opportunityId: candidate.opportunityId,
          sourceId: candidate.sourceId,
        },
      ),
    );
  }

  return {
    context: MIGRATION_SOURCE_BINDING_BACKFILL_CONTEXT,
    legacyBindingCount: legacyBindings.length,
    legacyRoleDistribution,
    existingCanonical: {
      institution: existingInstitution.length,
      opportunity: existingOpportunity.length,
    },
    blockingIssues,
    warnings,
    notImported: notImportedRows,
    planned: {
      institution: {
        insert: institutionCandidateRows.filter((row) => row.create).length,
        skip: institutionCandidateRows.filter((row) => !row.create).length,
      },
      opportunity: {
        insert: opportunityCandidateRows.filter((row) => row.create).length,
        skip: opportunityCandidateRows.filter((row) => !row.create).length,
      },
    },
    productionStateVerified: false,
    institutionActions: institutionCandidateRows,
    opportunityActions: opportunityCandidateRows,
  };
}

export async function applySourceBindingBackfill({
  transactionManager,
}: {
  transactionManager: TransactionManager;
}): Promise<SourceBindingBackfillApplyResult> {
  return transactionManager.run(async (executor) => {
    await executor.raw(
      sql`select pg_advisory_xact_lock(hashtext('preppy-source-binding-backfill'))`,
    );
    const report = await preflightSourceBindingBackfill(executor);
    if (report.blockingIssues.length > 0) {
      throw new Error(
        "Source binding backfill preflight failed; no rows were written.",
      );
    }

    const institutionRows = report.institutionActions.filter(
      (action) => action.create,
    );
    if (institutionRows.length > 0) {
      await executor.drizzle.insert(institutionSourceBindings).values(
        institutionRows.map((action) => ({
          institutionId: action.institutionId,
          sourceId: action.sourceId,
          role: action.role,
          isPrimary: action.isPrimary,
          isActive: action.isActive,
          boundAt: action.boundAt,
          unboundAt: action.unboundAt,
        })),
      );
    }

    const opportunityRows = report.opportunityActions.filter(
      (action) => action.create,
    );
    if (opportunityRows.length > 0) {
      await executor.drizzle.insert(opportunitySourceBindings).values(
        opportunityRows.map((action) => ({
          opportunityId: action.opportunityId,
          sourceId: action.sourceId,
          role: action.role,
          isPrimary: action.isPrimary,
          isActive: action.isActive,
          boundAt: action.boundAt,
          unboundAt: action.unboundAt,
        })),
      );
    }

    return {
      context: MIGRATION_SOURCE_BINDING_BACKFILL_CONTEXT,
      institution: {
        inserted: institutionRows.length,
        skipped: report.planned.institution.skip,
      },
      opportunity: {
        inserted: opportunityRows.length,
        skipped: report.planned.opportunity.skip,
      },
      notImported: report.notImported.length,
    };
  });
}
