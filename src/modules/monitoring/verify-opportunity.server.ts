import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

import { AuditWriter } from "@/src/application/audit-writer.server";
import type { AdminCommandContext } from "@/src/application/context";
import {
  ConflictError,
  NotEligibleError,
  NotFoundError,
  ValidationError,
} from "@/src/application/errors";
import { mapDatabaseError } from "@/src/infrastructure/db/errors";
import type {
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import {
  findAdmissionEventForUpdate,
  findCurrentAdmissionEventVersionForUpdate,
  findEventVersionEvidenceForSource,
  findCurrentNativeVersionForUpdate,
  findOpportunityForUpdate,
  getLegacyAdmissionEventLinkForUpdate,
  insertAdmissionEventVersion,
  insertEventVersionEvidence,
  insertMeaningfulChange,
  supersedeCurrentAdmissionEventVersion,
} from "@/src/modules/admissions/repository.server";
import {
  createOpportunityChangeOutboxDedupeKey,
  publishCanonicalOpportunityChange,
  type CanonicalChangeDependencies,
} from "@/src/modules/monitoring/opportunity-change.server";
import {
  deriveLegacyOpportunitySignal,
  deriveOpportunitySignal,
  type LegacyOpportunityTruth,
  type NativeOpportunityTruth,
} from "@/src/modules/monitoring/policy";
import {
  findActiveOpportunitySourceBindingForUpdate,
  findLegacyOpportunityChangeByEventVersion,
  findNativeOpportunityChangeByDestinationVersion,
  findOpportunityVersionEvidenceForSource,
  findOutboxEventByDedupeKey,
  findSourceForUpdate,
  findSourceObservation,
  findSourceSnapshot,
  insertOpportunityVersion,
  insertOpportunityVersionEvidence,
  insertSourceObservation,
  supersedeCurrentOpportunityVersion,
} from "@/src/modules/monitoring/repository.server";

const canonicalIdentifierSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
const nullableDateTimeSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .nullable();

const proposedNativeStateSchema = z
  .object({
    businessState: z.enum([
      "UPCOMING",
      "OPEN",
      "CLOSED",
      "COMPLETED",
      "CANCELLED",
      "UNKNOWN",
    ]),
    title: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(5_000).nullable(),
    targetAudience: z.string().trim().min(1).max(1_000).nullable(),
    eventStartAt: nullableDateTimeSchema,
    eventEndAt: nullableDateTimeSchema,
    applicationOpenAt: nullableDateTimeSchema,
    applicationCloseAt: nullableDateTimeSchema,
    actionUrl: z.url().max(2_048).nullable(),
    locationText: z.string().trim().min(1).max(1_000).nullable(),
    validFrom: nullableDateTimeSchema,
    validUntil: nullableDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [start, end, path] of [
      [value.eventStartAt, value.eventEndAt, "eventEndAt"],
      [value.applicationOpenAt, value.applicationCloseAt, "applicationCloseAt"],
      [value.validFrom, value.validUntil, "validUntil"],
    ] as const) {
      if (start !== null && end !== null && end.getTime() < start.getTime()) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "Invalid value.",
        });
      }
    }
  });

const verifyNativeOpportunityInputSchema = z
  .object({
    opportunityId: z.uuid(),
    expectedCurrentVersionId: z.uuid().nullable(),
    proposedState: proposedNativeStateSchema,
    sourceId: z.uuid(),
    evidence: z
      .object({
        observationId: z
          .string()
          .regex(/^[1-9]\d{0,18}$/)
          .optional(),
        snapshotId: z.uuid().optional(),
        evidenceRole: z.string().trim().min(1).max(100),
      })
      .strict(),
    materialityOverride: z.enum(["NOTIFIABLE", "NON_NOTIFIABLE"]).optional(),
    overrideReason: canonicalIdentifierSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.expectedCurrentVersionId === null &&
      (value.materialityOverride !== undefined ||
        value.overrideReason !== undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["materialityOverride"],
        message: "Invalid value.",
      });
    }
    if (value.materialityOverride && !value.overrideReason) {
      ctx.addIssue({
        code: "custom",
        path: ["overrideReason"],
        message: "Invalid value.",
      });
    }
    if (!value.materialityOverride && value.overrideReason) {
      ctx.addIssue({
        code: "custom",
        path: ["materialityOverride"],
        message: "Invalid value.",
      });
    }
  });

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function isClockTime(value: string): boolean {
  const [hour, minute, second] = value.split(":").map(Number);
  return hour! < 24 && minute! < 60 && second! < 60;
}

function orderedLegacyMoments(
  startDate: string | null,
  startTime: string | null,
  endDate: string | null,
  endTime: string | null,
): boolean {
  if (startDate === null || endDate === null) return true;
  if (endDate !== startDate) return endDate > startDate;
  return startTime === null || endTime === null || endTime >= startTime;
}

const nullableLegacyDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate)
  .nullable();
const nullableLegacyTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}:\d{2}$/)
  .refine(isClockTime)
  .nullable();

const proposedLegacyStateSchema = z
  .object({
    knowledgeState: z.enum([
      "KNOWN",
      "NOT_ANNOUNCED",
      "NOT_FOUND",
      "SOURCE_ERROR",
      "NOT_APPLICABLE",
    ]),
    eventStatus: z.enum([
      "SCHEDULED",
      "ACTIVE",
      "CLOSED",
      "COMPLETED",
      "CANCELLED",
    ]),
    displayTitle: z.string().trim().min(1).max(500),
    eventStartDate: nullableLegacyDateSchema,
    eventStartTime: nullableLegacyTimeSchema,
    eventEndDate: nullableLegacyDateSchema,
    eventEndTime: nullableLegacyTimeSchema,
    registrationOpenDate: nullableLegacyDateSchema,
    registrationOpenTime: nullableLegacyTimeSchema,
    registrationCloseDate: nullableLegacyDateSchema,
    registrationCloseTime: nullableLegacyTimeSchema,
    timezone: z.string().trim().min(1).max(100),
    venue: z.string().trim().min(1).max(1_000).nullable(),
    actionUrl: z.url().max(2_048).nullable(),
    officialNotes: z.string().trim().min(1).max(5_000).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      !orderedLegacyMoments(
        value.eventStartDate,
        value.eventStartTime,
        value.eventEndDate,
        value.eventEndTime,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["eventEndDate"],
        message: "Invalid value.",
      });
    }
    if (
      !orderedLegacyMoments(
        value.registrationOpenDate,
        value.registrationOpenTime,
        value.registrationCloseDate,
        value.registrationCloseTime,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["registrationCloseDate"],
        message: "Invalid value.",
      });
    }
  });

const verifyLegacyOpportunityInputSchema = z
  .object({
    opportunityId: z.uuid(),
    expectedCurrentVersionId: z.uuid().nullable(),
    proposedState: proposedLegacyStateSchema,
    sourceId: z.uuid(),
    evidence: z
      .object({
        observationId: z
          .string()
          .regex(/^[1-9]\d{0,18}$/)
          .optional(),
        snapshotId: z.uuid().optional(),
        evidenceRole: z.string().trim().min(1).max(100),
      })
      .strict(),
    materialityOverride: z.enum(["NOTIFIABLE", "NON_NOTIFIABLE"]).optional(),
    overrideReason: canonicalIdentifierSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.materialityOverride && !value.overrideReason) {
      ctx.addIssue({
        code: "custom",
        path: ["overrideReason"],
        message: "Invalid value.",
      });
    }
    if (!value.materialityOverride && value.overrideReason) {
      ctx.addIssue({
        code: "custom",
        path: ["materialityOverride"],
        message: "Invalid value.",
      });
    }
  });

const verifyOpportunityInputSchema = z
  .object({
    opportunityId: z.uuid(),
    expectedCurrentVersionId: z.uuid().nullable(),
    proposedState: z.unknown(),
    sourceId: z.uuid(),
    evidence: z.unknown(),
    materialityOverride: z.unknown().optional(),
    overrideReason: z.unknown().optional(),
  })
  .strict();

const adminContextSchema = z
  .object({
    adminUserId: z.uuid(),
    correlationId: z.uuid(),
    occurredAt: z.date().refine((value) => Number.isFinite(value.getTime())),
    reason: canonicalIdentifierSchema.optional(),
  })
  .strict();

export type VerifyOpportunityInput = z.output<
  typeof verifyOpportunityInputSchema
>;
export type VerifyNativeOpportunityInput = z.output<
  typeof verifyNativeOpportunityInputSchema
>;
export type VerifyLegacyOpportunityInput = z.output<
  typeof verifyLegacyOpportunityInputSchema
>;

export type VerificationResult = Readonly<{
  opportunityId: string;
  truthMode: "NATIVE" | "LEGACY_BACKED";
  outcome: "CHANGED" | "NO_CHANGE" | "IDEMPOTENT_REPLAY";
  previousVersionId: string | null;
  currentVersionId: string;
  verifiedAt: string;
  evidenceId: string | null;
  changeType: string | null;
  materiality: "NOTIFIABLE" | "NON_NOTIFIABLE" | null;
  opportunityChangeId: string | null;
  outboxEnqueued: boolean;
}>;

export type VerifyOpportunityPersistence = Readonly<{
  findOpportunityForUpdate: typeof findOpportunityForUpdate;
  findCurrentNativeVersionForUpdate: typeof findCurrentNativeVersionForUpdate;
  getLegacyAdmissionEventLinkForUpdate: typeof getLegacyAdmissionEventLinkForUpdate;
  findAdmissionEventForUpdate: typeof findAdmissionEventForUpdate;
  findCurrentAdmissionEventVersionForUpdate: typeof findCurrentAdmissionEventVersionForUpdate;
  findEventVersionEvidenceForSource: typeof findEventVersionEvidenceForSource;
  supersedeCurrentAdmissionEventVersion: typeof supersedeCurrentAdmissionEventVersion;
  insertAdmissionEventVersion: typeof insertAdmissionEventVersion;
  insertEventVersionEvidence: typeof insertEventVersionEvidence;
  insertMeaningfulChange: typeof insertMeaningfulChange;
  findSourceForUpdate: typeof findSourceForUpdate;
  findActiveOpportunitySourceBindingForUpdate: typeof findActiveOpportunitySourceBindingForUpdate;
  findSourceObservation: typeof findSourceObservation;
  findSourceSnapshot: typeof findSourceSnapshot;
  supersedeCurrentOpportunityVersion: typeof supersedeCurrentOpportunityVersion;
  insertOpportunityVersion: typeof insertOpportunityVersion;
  insertOpportunityVersionEvidence: typeof insertOpportunityVersionEvidence;
  insertSourceObservation: typeof insertSourceObservation;
  findNativeOpportunityChangeByDestinationVersion: typeof findNativeOpportunityChangeByDestinationVersion;
  findOpportunityVersionEvidenceForSource: typeof findOpportunityVersionEvidenceForSource;
  findLegacyOpportunityChangeByEventVersion: typeof findLegacyOpportunityChangeByEventVersion;
  findOutboxEventByDedupeKey: typeof findOutboxEventByDedupeKey;
  writeAudit: typeof AuditWriter.write;
  publishCanonicalOpportunityChange: typeof publishCanonicalOpportunityChange;
}>;

export const defaultVerifyOpportunityPersistence: VerifyOpportunityPersistence =
  {
    findOpportunityForUpdate,
    findCurrentNativeVersionForUpdate,
    getLegacyAdmissionEventLinkForUpdate,
    findAdmissionEventForUpdate,
    findCurrentAdmissionEventVersionForUpdate,
    findEventVersionEvidenceForSource,
    supersedeCurrentAdmissionEventVersion,
    insertAdmissionEventVersion,
    insertEventVersionEvidence,
    insertMeaningfulChange,
    findSourceForUpdate,
    findActiveOpportunitySourceBindingForUpdate,
    findSourceObservation,
    findSourceSnapshot,
    supersedeCurrentOpportunityVersion,
    insertOpportunityVersion,
    insertOpportunityVersionEvidence,
    insertSourceObservation,
    findNativeOpportunityChangeByDestinationVersion,
    findOpportunityVersionEvidenceForSource,
    findLegacyOpportunityChangeByEventVersion,
    findOutboxEventByDedupeKey,
    writeAudit: AuditWriter.write,
    publishCanonicalOpportunityChange,
  };

export type VerifyOpportunityDependencies = Readonly<{
  transactionManager: TransactionManager;
  persistence?: VerifyOpportunityPersistence;
  canonicalChangeDependencies?: CanonicalChangeDependencies;
}>;

function currentNativeTruth(
  current: Awaited<ReturnType<typeof findCurrentNativeVersionForUpdate>>,
): NativeOpportunityTruth {
  if (!current) throw new ConflictError();
  return {
    businessState: current.businessState,
    title: current.title,
    summary: current.summary,
    targetAudience: current.targetAudience,
    eventStartAt: current.eventStartAt,
    eventEndAt: current.eventEndAt,
    applicationOpenAt: current.applicationOpenAt,
    applicationCloseAt: current.applicationCloseAt,
    actionUrl: current.actionUrl,
    locationText: current.locationText,
    validFrom: current.validFrom,
    validUntil: current.validUntil,
  };
}

function fingerprint(state: NativeOpportunityTruth): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        businessState: state.businessState,
        title: state.title.trim(),
        summary: state.summary?.trim() ?? null,
        targetAudience: state.targetAudience?.trim() ?? null,
        eventStartAt: state.eventStartAt?.toISOString() ?? null,
        eventEndAt: state.eventEndAt?.toISOString() ?? null,
        applicationOpenAt: state.applicationOpenAt?.toISOString() ?? null,
        applicationCloseAt: state.applicationCloseAt?.toISOString() ?? null,
        actionUrl: state.actionUrl?.trim() ?? null,
        locationText: state.locationText?.trim() ?? null,
        validFrom: state.validFrom?.toISOString() ?? null,
        validUntil: state.validUntil?.toISOString() ?? null,
      }),
    )
    .digest("hex");
}

function databaseCause(error: unknown): unknown {
  return typeof error === "object" && error !== null && "cause" in error
    ? error.cause
    : error;
}

async function validateProvenance(
  executor: TransactionExecutor,
  opportunityId: string,
  input: VerifyNativeOpportunityInput | VerifyLegacyOpportunityInput,
  persistence: VerifyOpportunityPersistence,
) {
  const source = await persistence.findSourceForUpdate(
    executor,
    input.sourceId,
  );
  if (!source) throw new NotFoundError();
  if (
    source.lifecycleStatus !== "ACTIVE" ||
    source.authorityLevel === "DISCOVERY_ONLY" ||
    source.sourceType === "THIRD_PARTY_DISCOVERY"
  ) {
    throw new NotEligibleError();
  }
  const binding = await persistence.findActiveOpportunitySourceBindingForUpdate(
    executor,
    {
      opportunityId,
      sourceId: source.id,
    },
  );
  if (!binding) throw new NotEligibleError();
  if (input.evidence.observationId) {
    const observation = await persistence.findSourceObservation(
      executor,
      BigInt(input.evidence.observationId),
    );
    if (!observation) throw new NotFoundError();
    if (observation.sourceId !== source.id) throw new NotEligibleError();
  }
  if (input.evidence.snapshotId) {
    const snapshot = await persistence.findSourceSnapshot(
      executor,
      input.evidence.snapshotId,
    );
    if (!snapshot) throw new NotFoundError();
    if (snapshot.sourceId !== source.id) throw new NotEligibleError();
  }
  return source;
}

export async function verifyNativeOpportunityInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: VerifyNativeOpportunityInput,
  persistence: VerifyOpportunityPersistence = defaultVerifyOpportunityPersistence,
  canonicalChangeDependencies?: CanonicalChangeDependencies,
): Promise<VerificationResult> {
  const opportunity = await persistence.findOpportunityForUpdate(
    executor,
    input.opportunityId,
  );
  if (!opportunity) throw new NotFoundError();
  if (opportunity.truthMode !== "NATIVE") throw new NotEligibleError();
  const current = await persistence.findCurrentNativeVersionForUpdate(
    executor,
    opportunity.id,
  );
  const source = await validateProvenance(
    executor,
    opportunity.id,
    input,
    persistence,
  );
  const candidate = input.proposedState;
  const candidateFingerprint = fingerprint(candidate);

  if (!current) {
    if (input.expectedCurrentVersionId !== null) throw new ConflictError();
    const initial = await persistence.insertOpportunityVersion(executor, {
      opportunityId: opportunity.id,
      truthMode: "NATIVE",
      versionNumber: 1,
      supersedesVersionId: null,
      verificationState: "VERIFIED",
      businessState: candidate.businessState,
      isCurrent: true,
      title: candidate.title,
      summary: candidate.summary,
      targetAudience: candidate.targetAudience,
      eventStartAt: candidate.eventStartAt,
      eventEndAt: candidate.eventEndAt,
      applicationOpenAt: candidate.applicationOpenAt,
      applicationCloseAt: candidate.applicationCloseAt,
      actionUrl: candidate.actionUrl,
      locationText: candidate.locationText,
      verifiedAt: ctx.occurredAt,
      verifiedByAdminId: ctx.adminUserId,
      validFrom: candidate.validFrom,
      validUntil: candidate.validUntil,
      contentFingerprint: candidateFingerprint,
      createdAt: ctx.occurredAt,
    });
    const evidence = await persistence.insertOpportunityVersionEvidence(
      executor,
      {
        opportunityVersionId: initial.id,
        sourceId: source.id,
        ...(input.evidence.observationId
          ? { sourceObservationId: BigInt(input.evidence.observationId) }
          : {}),
        ...(input.evidence.snapshotId
          ? { sourceSnapshotId: input.evidence.snapshotId }
          : {}),
        evidenceRole: input.evidence.evidenceRole,
        createdAt: ctx.occurredAt,
      },
    );
    if (opportunity.publicationState === "PUBLISHED") {
      const canonical = await persistence.publishCanonicalOpportunityChange(
        executor,
        ctx,
        {
          opportunityId: opportunity.id,
          sourceId: source.id,
          truthMode: "NATIVE",
          fromVersionId: null,
          toVersionId: initial.id,
          changeType: "NEW_OPPORTUNITY",
          materiality: "NOTIFIABLE",
          summary: "NEW_OPPORTUNITY: initial verified truth",
          changedFields: ["INITIAL_TRUTH"],
          customerSignalEligible: true,
          ...(input.overrideReason
            ? { auditReason: input.overrideReason }
            : {}),
        },
        canonicalChangeDependencies,
      );
      return {
        opportunityId: opportunity.id,
        truthMode: "NATIVE",
        outcome: "CHANGED",
        previousVersionId: null,
        currentVersionId: initial.id,
        verifiedAt: ctx.occurredAt.toISOString(),
        evidenceId: evidence.id,
        changeType: canonical.change.changeType,
        materiality: canonical.change.materiality,
        opportunityChangeId: canonical.change.id,
        outboxEnqueued: canonical.outboxEnqueued,
      };
    }
    await persistence.writeAudit(
      {
        adminUserId: ctx.adminUserId,
        actionType: "WP10B_VERIFY_NATIVE_INITIAL_DRAFT",
        entityType: "OPPORTUNITY",
        entityId: opportunity.id,
        correlationId: ctx.correlationId,
        ...(ctx.reason === undefined ? {} : { reason: ctx.reason }),
        occurredAt: ctx.occurredAt,
        metadata: {
          sourceId: source.id,
          versionId: initial.id,
          outcomeCode: "INITIAL_VERIFIED",
        },
      },
      executor,
    );
    return {
      opportunityId: opportunity.id,
      truthMode: "NATIVE",
      outcome: "CHANGED",
      previousVersionId: null,
      currentVersionId: initial.id,
      verifiedAt: ctx.occurredAt.toISOString(),
      evidenceId: evidence.id,
      changeType: null,
      materiality: null,
      opportunityChangeId: null,
      outboxEnqueued: false,
    };
  }

  if (input.expectedCurrentVersionId !== current.id) {
    if (
      current.supersedesVersionId === input.expectedCurrentVersionId &&
      current.contentFingerprint === candidateFingerprint
    ) {
      const committedEvidence =
        await persistence.findOpportunityVersionEvidenceForSource(executor, {
          opportunityVersionId: current.id,
          sourceId: source.id,
        });
      if (!committedEvidence) throw new ConflictError();
      const existingChange =
        await persistence.findNativeOpportunityChangeByDestinationVersion(
          executor,
          { opportunityId: opportunity.id, versionId: current.id },
        );
      const existingOutbox = existingChange
        ? await persistence.findOutboxEventByDedupeKey(
            executor,
            createOpportunityChangeOutboxDedupeKey(existingChange.id),
          )
        : null;
      return {
        opportunityId: opportunity.id,
        truthMode: "NATIVE",
        outcome: "IDEMPOTENT_REPLAY",
        previousVersionId: current.supersedesVersionId,
        currentVersionId: current.id,
        verifiedAt: current.verifiedAt!.toISOString(),
        evidenceId: null,
        changeType: existingChange?.changeType ?? null,
        materiality: existingChange?.materiality ?? null,
        opportunityChangeId: existingChange?.id ?? null,
        outboxEnqueued: existingOutbox !== null,
      };
    }
    throw new ConflictError();
  }

  const signal = deriveOpportunitySignal(
    currentNativeTruth(current),
    candidate,
  );
  if (!signal) {
    const observation = await persistence.insertSourceObservation(executor, {
      sourceId: source.id,
      observedAt: ctx.occurredAt,
      outcome: "UNCHANGED",
      ...(input.evidence.snapshotId
        ? { snapshotId: input.evidence.snapshotId }
        : {}),
    });
    await persistence.writeAudit(
      {
        adminUserId: ctx.adminUserId,
        actionType: "WP10B_VERIFY_NATIVE_NO_CHANGE",
        entityType: "OPPORTUNITY",
        entityId: opportunity.id,
        correlationId: ctx.correlationId,
        ...(ctx.reason === undefined ? {} : { reason: ctx.reason }),
        occurredAt: ctx.occurredAt,
        metadata: {
          sourceId: source.id,
          observationId: observation.id.toString(),
          versionId: current.id,
          outcomeCode: "UNCHANGED",
        },
      },
      executor,
    );
    return {
      opportunityId: opportunity.id,
      truthMode: "NATIVE",
      outcome: "NO_CHANGE",
      previousVersionId: current.id,
      currentVersionId: current.id,
      verifiedAt: ctx.occurredAt.toISOString(),
      evidenceId: null,
      changeType: null,
      materiality: null,
      opportunityChangeId: null,
      outboxEnqueued: false,
    };
  }

  const superseded = await persistence.supersedeCurrentOpportunityVersion(
    executor,
    { versionId: current.id, opportunityId: opportunity.id },
  );
  if (!superseded) throw new ConflictError();
  const next = await persistence.insertOpportunityVersion(executor, {
    opportunityId: opportunity.id,
    truthMode: "NATIVE",
    versionNumber: current.versionNumber + 1,
    supersedesVersionId: current.id,
    verificationState: "VERIFIED",
    businessState: candidate.businessState,
    isCurrent: true,
    title: candidate.title,
    summary: candidate.summary,
    targetAudience: candidate.targetAudience,
    eventStartAt: candidate.eventStartAt,
    eventEndAt: candidate.eventEndAt,
    applicationOpenAt: candidate.applicationOpenAt,
    applicationCloseAt: candidate.applicationCloseAt,
    actionUrl: candidate.actionUrl,
    locationText: candidate.locationText,
    verifiedAt: ctx.occurredAt,
    verifiedByAdminId: ctx.adminUserId,
    validFrom: candidate.validFrom,
    validUntil: candidate.validUntil,
    contentFingerprint: candidateFingerprint,
    createdAt: ctx.occurredAt,
  });
  const evidence = await persistence.insertOpportunityVersionEvidence(
    executor,
    {
      opportunityVersionId: next.id,
      sourceId: source.id,
      ...(input.evidence.observationId
        ? { sourceObservationId: BigInt(input.evidence.observationId) }
        : {}),
      ...(input.evidence.snapshotId
        ? { sourceSnapshotId: input.evidence.snapshotId }
        : {}),
      evidenceRole: input.evidence.evidenceRole,
      createdAt: ctx.occurredAt,
    },
  );
  const materiality = input.materialityOverride ?? signal.materiality;
  const canonical = await persistence.publishCanonicalOpportunityChange(
    executor,
    ctx,
    {
      opportunityId: opportunity.id,
      sourceId: source.id,
      truthMode: "NATIVE",
      fromVersionId: current.id,
      toVersionId: next.id,
      changeType: signal.changeType,
      materiality,
      summary: `${signal.changeType}: ${signal.changedFields.join(", ")}`,
      changedFields: signal.changedFields,
      customerSignalEligible: opportunity.publicationState === "PUBLISHED",
      ...(input.overrideReason ? { auditReason: input.overrideReason } : {}),
    },
    canonicalChangeDependencies,
  );
  return {
    opportunityId: opportunity.id,
    truthMode: "NATIVE",
    outcome: "CHANGED",
    previousVersionId: current.id,
    currentVersionId: next.id,
    verifiedAt: ctx.occurredAt.toISOString(),
    evidenceId: evidence.id,
    changeType: canonical.change.changeType,
    materiality: canonical.change.materiality,
    opportunityChangeId: canonical.change.id,
    outboxEnqueued: canonical.outboxEnqueued,
  };
}

function currentLegacyTruth(
  current: Awaited<
    ReturnType<typeof findCurrentAdmissionEventVersionForUpdate>
  >,
): LegacyOpportunityTruth {
  if (!current) throw new ConflictError();
  return {
    knowledgeState:
      current.knowledgeState as LegacyOpportunityTruth["knowledgeState"],
    eventStatus: current.eventStatus as LegacyOpportunityTruth["eventStatus"],
    displayTitle: current.displayTitle,
    eventStartDate: current.eventStartDate,
    eventStartTime: current.eventStartTime,
    eventEndDate: current.eventEndDate,
    eventEndTime: current.eventEndTime,
    registrationOpenDate: current.registrationOpenDate,
    registrationOpenTime: current.registrationOpenTime,
    registrationCloseDate: current.registrationCloseDate,
    registrationCloseTime: current.registrationCloseTime,
    timezone: current.timezone,
    venue: current.venue,
    actionUrl: current.actionUrl,
    officialNotes: current.officialNotes,
  };
}

export async function verifyLegacyBackedOpportunityInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: VerifyLegacyOpportunityInput,
  persistence: VerifyOpportunityPersistence = defaultVerifyOpportunityPersistence,
  canonicalChangeDependencies?: CanonicalChangeDependencies,
): Promise<VerificationResult> {
  const opportunity = await persistence.findOpportunityForUpdate(
    executor,
    input.opportunityId,
  );
  if (!opportunity) throw new NotFoundError();
  if (opportunity.truthMode !== "LEGACY_BACKED") throw new NotEligibleError();
  const link = await persistence.getLegacyAdmissionEventLinkForUpdate(
    executor,
    opportunity.id,
  );
  if (!link || link.institutionId !== opportunity.institutionId) {
    throw new NotEligibleError();
  }
  const event = await persistence.findAdmissionEventForUpdate(
    executor,
    link.admissionEventId,
  );
  if (!event || event.admissionCycleId !== link.admissionCycleId) {
    throw new NotEligibleError();
  }
  const current = await persistence.findCurrentAdmissionEventVersionForUpdate(
    executor,
    event.id,
  );
  if (!current) throw new ConflictError();
  const source = await validateProvenance(
    executor,
    opportunity.id,
    input,
    persistence,
  );
  if (input.expectedCurrentVersionId !== current.id) {
    const isExactCommittedSuccessor =
      current.supersedesVersionId === input.expectedCurrentVersionId &&
      deriveLegacyOpportunitySignal(
        currentLegacyTruth(current),
        input.proposedState,
      ) === null;
    if (!isExactCommittedSuccessor) throw new ConflictError();
    const committedEvidence =
      await persistence.findEventVersionEvidenceForSource(executor, {
        eventVersionId: current.id,
        sourceId: source.id,
      });
    if (!committedEvidence) throw new ConflictError();
    const existingChange =
      await persistence.findLegacyOpportunityChangeByEventVersion(executor, {
        opportunityId: opportunity.id,
        admissionEventId: event.id,
        eventVersionId: current.id,
      });
    if (!existingChange) throw new ConflictError();
    const existingOutbox = await persistence.findOutboxEventByDedupeKey(
      executor,
      createOpportunityChangeOutboxDedupeKey(existingChange.id),
    );
    return {
      opportunityId: opportunity.id,
      truthMode: "LEGACY_BACKED",
      outcome: "IDEMPOTENT_REPLAY",
      previousVersionId: current.supersedesVersionId,
      currentVersionId: current.id,
      verifiedAt: current.verifiedAt!.toISOString(),
      evidenceId: null,
      changeType: existingChange.changeType,
      materiality: existingChange.materiality,
      opportunityChangeId: existingChange.id,
      outboxEnqueued: existingOutbox !== null,
    };
  }
  const signal = deriveLegacyOpportunitySignal(
    currentLegacyTruth(current),
    input.proposedState,
  );
  if (!signal) {
    const observation = await persistence.insertSourceObservation(executor, {
      sourceId: source.id,
      observedAt: ctx.occurredAt,
      outcome: "UNCHANGED",
      ...(input.evidence.snapshotId
        ? { snapshotId: input.evidence.snapshotId }
        : {}),
    });
    await persistence.writeAudit(
      {
        adminUserId: ctx.adminUserId,
        actionType: "WP10B_VERIFY_LEGACY_NO_CHANGE",
        entityType: "OPPORTUNITY",
        entityId: opportunity.id,
        correlationId: ctx.correlationId,
        ...(ctx.reason === undefined ? {} : { reason: ctx.reason }),
        occurredAt: ctx.occurredAt,
        metadata: {
          sourceId: source.id,
          observationId: observation.id.toString(),
          versionId: current.id,
          outcomeCode: "UNCHANGED",
        },
      },
      executor,
    );
    return {
      opportunityId: opportunity.id,
      truthMode: "LEGACY_BACKED",
      outcome: "NO_CHANGE",
      previousVersionId: current.id,
      currentVersionId: current.id,
      verifiedAt: ctx.occurredAt.toISOString(),
      evidenceId: null,
      changeType: null,
      materiality: null,
      opportunityChangeId: null,
      outboxEnqueued: false,
    };
  }

  const superseded = await persistence.supersedeCurrentAdmissionEventVersion(
    executor,
    { eventId: event.id, versionId: current.id },
  );
  if (!superseded) throw new ConflictError();
  const next = await persistence.insertAdmissionEventVersion(executor, {
    admissionEventId: event.id,
    versionNo: current.versionNo + 1,
    supersedesVersionId: current.id,
    isCurrent: true,
    verificationStatus: "VERIFIED",
    knowledgeState: input.proposedState.knowledgeState,
    eventStatus: input.proposedState.eventStatus,
    displayTitle: input.proposedState.displayTitle,
    eventStartDate: input.proposedState.eventStartDate,
    eventStartTime: input.proposedState.eventStartTime,
    eventEndDate: input.proposedState.eventEndDate,
    eventEndTime: input.proposedState.eventEndTime,
    registrationOpenDate: input.proposedState.registrationOpenDate,
    registrationOpenTime: input.proposedState.registrationOpenTime,
    registrationCloseDate: input.proposedState.registrationCloseDate,
    registrationCloseTime: input.proposedState.registrationCloseTime,
    timezone: input.proposedState.timezone,
    venue: input.proposedState.venue,
    actionUrl: input.proposedState.actionUrl,
    officialNotes: input.proposedState.officialNotes,
    verifiedAt: ctx.occurredAt,
    verifiedByAdminId: ctx.adminUserId,
    createdAt: ctx.occurredAt,
  });
  const evidence = await persistence.insertEventVersionEvidence(executor, {
    eventVersionId: next.id,
    sourceId: source.id,
    ...(input.evidence.observationId
      ? { sourceObservationId: BigInt(input.evidence.observationId) }
      : {}),
    ...(input.evidence.snapshotId
      ? { snapshotId: input.evidence.snapshotId }
      : {}),
    isPrimary: input.evidence.evidenceRole === "PRIMARY",
    createdAt: ctx.occurredAt,
  });
  const materiality = input.materialityOverride ?? signal.materiality;
  const meaningful = await persistence.insertMeaningfulChange(executor, {
    admissionCycleId: link.admissionCycleId,
    admissionEventId: event.id,
    changeType: signal.legacyChangeType,
    significance: materiality === "NOTIFIABLE" ? "HIGH" : "LOW",
    reviewStatus: "PUBLISHED",
    alertCandidate: false,
    publicSummary: `${signal.changeType}: ${signal.changedFields.join(", ")}`,
    afterData: { wp10bEventVersionId: next.id },
    reviewedAt: ctx.occurredAt,
    reviewedByAdminId: ctx.adminUserId,
    publishedAt: ctx.occurredAt,
    createdAt: ctx.occurredAt,
    updatedAt: ctx.occurredAt,
  });
  const canonical = await persistence.publishCanonicalOpportunityChange(
    executor,
    ctx,
    {
      opportunityId: opportunity.id,
      sourceId: source.id,
      truthMode: "LEGACY_BACKED",
      meaningfulChangeId: meaningful.id,
      admissionEventId: event.id,
      changeType: signal.changeType,
      materiality,
      summary: `${signal.changeType}: ${signal.changedFields.join(", ")}`,
      changedFields: signal.changedFields,
      customerSignalEligible: opportunity.publicationState === "PUBLISHED",
      ...(input.overrideReason ? { auditReason: input.overrideReason } : {}),
    },
    canonicalChangeDependencies,
  );
  return {
    opportunityId: opportunity.id,
    truthMode: "LEGACY_BACKED",
    outcome: "CHANGED",
    previousVersionId: current.id,
    currentVersionId: next.id,
    verifiedAt: ctx.occurredAt.toISOString(),
    evidenceId: evidence.id,
    changeType: canonical.change.changeType,
    materiality: canonical.change.materiality,
    opportunityChangeId: canonical.change.id,
    outboxEnqueued: canonical.outboxEnqueued,
  };
}

export async function verifyOpportunity(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: VerifyOpportunityDependencies,
): Promise<VerificationResult> {
  const parsedContext = adminContextSchema.safeParse(ctx);
  if (!parsedContext.success) {
    throw ValidationError.fromZodError(parsedContext.error);
  }
  const parsedInput = verifyOpportunityInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw ValidationError.fromZodError(parsedInput.error);
  }
  try {
    return await dependencies.transactionManager.run(async (executor) => {
      const persistence =
        dependencies.persistence ?? defaultVerifyOpportunityPersistence;
      const opportunity = await persistence.findOpportunityForUpdate(
        executor,
        parsedInput.data.opportunityId,
      );
      if (!opportunity) throw new NotFoundError();
      if (opportunity.truthMode === "NATIVE") {
        const nativeInput = verifyNativeOpportunityInputSchema.safeParse(
          parsedInput.data,
        );
        if (!nativeInput.success) {
          throw ValidationError.fromZodError(nativeInput.error);
        }
        return verifyNativeOpportunityInTransaction(
          executor,
          parsedContext.data,
          nativeInput.data,
          persistence,
          dependencies.canonicalChangeDependencies,
        );
      }
      const legacyInput = verifyLegacyOpportunityInputSchema.safeParse(
        parsedInput.data,
      );
      if (!legacyInput.success) {
        throw ValidationError.fromZodError(legacyInput.error);
      }
      return verifyLegacyBackedOpportunityInTransaction(
        executor,
        parsedContext.data,
        legacyInput.data,
        persistence,
        dependencies.canonicalChangeDependencies,
      );
    });
  } catch (error) {
    throw mapDatabaseError(databaseCause(error));
  }
}
