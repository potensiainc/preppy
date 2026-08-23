import "server-only";

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
  institutionSourceBindingRoleValues,
  opportunitySourceBindingRoleValues,
} from "@/src/db/schema";
import {
  findSourceForUpdate,
  findSourcesForUpdate,
  findSourceSnapshot,
  activateInstitutionSourceBinding,
  activateOpportunitySourceBinding,
  deactivateInstitutionSourceBinding,
  deactivateOpportunitySourceBinding,
  findActiveInstitutionPrimaryBinding,
  findActiveOpportunityPrimaryBinding,
  findInstitutionSourceBindingForUpdate,
  findOpportunitySourceBindingForUpdate,
  insertInstitutionSourceBinding,
  insertOpportunitySourceBinding,
  insertSourceObservation,
  updateSourceLifecycle,
  updateSourceCanonicalUrl,
  findSourceMonitorConfigForUpdate,
  insertReplacementSource,
  insertSourceMonitorConfigCopy,
  listActiveInstitutionBindingsForSourceForUpdate,
  listActiveOpportunityBindingsForSourceForUpdate,
} from "@/src/modules/monitoring/repository.server";
import { findOpportunityForUpdate } from "@/src/modules/admissions/repository.server";
import { findInstitutionForUpdate } from "@/src/modules/institution/repository.server";

const canonicalIdentifierSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);

const adminContextSchema = z
  .object({
    adminUserId: z.uuid(),
    correlationId: z.uuid(),
    occurredAt: z.date().refine((value) => Number.isFinite(value.getTime())),
    reason: canonicalIdentifierSchema.optional(),
  })
  .strict();

const confirmNoChangeInputSchema = z
  .object({
    sourceId: z.uuid(),
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

const markSourceUnavailableInputSchema = z
  .object({
    sourceId: z.uuid(),
    outcome: z.enum(["NOT_FOUND", "ACCESS_ERROR", "PARSE_ERROR", "TIMEOUT"]),
    httpStatus: z.number().int().min(100).max(599).optional(),
    finalUrl: z.url().max(2_048).optional(),
    durationMs: z.number().int().min(0).max(86_400_000).optional(),
    errorCode: canonicalIdentifierSchema.optional(),
    errorMessage: z.string().trim().min(1).max(500).optional(),
    pauseSource: z.boolean().default(false),
  })
  .strict();

const recordSourceObservationInputSchema = z
  .object({
    sourceId: z.uuid(),
    outcome: z.enum([
      "SUCCESS",
      "UNCHANGED",
      "CHANGED",
      "NOT_FOUND",
      "ACCESS_ERROR",
      "PARSE_ERROR",
      "TIMEOUT",
      "OTHER_ERROR",
    ]),
    httpStatus: z.number().int().min(100).max(599).optional(),
    finalUrl: z.url().max(2_048).optional(),
    contentHash: z.string().trim().min(1).max(256).optional(),
    textHash: z.string().trim().min(1).max(256).optional(),
    responseBytes: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    durationMs: z.number().int().min(0).max(86_400_000).optional(),
    errorCode: canonicalIdentifierSchema.optional(),
    errorMessage: z.string().trim().min(1).max(500).optional(),
    snapshotId: z.uuid().optional(),
    etag: z.string().trim().min(1).max(512).optional(),
    lastModified: z.string().trim().min(1).max(512).optional(),
  })
  .strict();

const bindInstitutionSourceInputSchema = z
  .object({
    institutionId: z.uuid(),
    sourceId: z.uuid(),
    role: z.enum(institutionSourceBindingRoleValues),
    isPrimary: z.boolean().default(false),
  })
  .strict();

const unbindInstitutionSourceInputSchema = bindInstitutionSourceInputSchema
  .omit({ isPrimary: true })
  .strict();

const bindOpportunitySourceInputSchema = z
  .object({
    opportunityId: z.uuid(),
    sourceId: z.uuid(),
    role: z.enum(opportunitySourceBindingRoleValues),
    isPrimary: z.boolean().default(false),
  })
  .strict();

const unbindOpportunitySourceInputSchema = bindOpportunitySourceInputSchema
  .omit({ isPrimary: true })
  .strict();

const httpUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  });

const sourceUrlCorrectionInputSchema = z
  .object({
    sourceId: z.uuid(),
    moveMode: z.literal("URL_CORRECTION"),
    newUrl: httpUrlSchema,
    provenanceContinuityConfirmed: z.literal(true),
  })
  .strict();

const sourceReplacementInputSchema = z
  .object({
    sourceId: z.uuid(),
    moveMode: z.literal("SOURCE_REPLACEMENT"),
    replacement: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("CREATE"),
          canonicalUrl: httpUrlSchema,
          sourceName: z.string().trim().min(1).max(200),
        })
        .strict(),
      z
        .object({
          kind: z.literal("REUSE"),
          replacementSourceId: z.uuid(),
        })
        .strict(),
    ]),
  })
  .strict();

const sourceMoveInputSchema = z.discriminatedUnion("moveMode", [
  sourceUrlCorrectionInputSchema,
  sourceReplacementInputSchema,
]);

export type ConfirmNoChangeInput = z.output<typeof confirmNoChangeInputSchema>;

export type ConfirmNoChangeResult = Readonly<{
  sourceId: string;
  observationId: string;
  checkedAt: string;
}>;

export type MarkSourceUnavailableInput = z.output<
  typeof markSourceUnavailableInputSchema
>;

export type MarkSourceUnavailableResult = ConfirmNoChangeResult &
  Readonly<{ lifecycleStatus: string }>;

export type RecordSourceObservationInput = z.output<
  typeof recordSourceObservationInputSchema
>;

export type RecordSourceObservationResult = ConfirmNoChangeResult &
  Readonly<{ outcome: string }>;

export type BindInstitutionSourceInput = z.output<
  typeof bindInstitutionSourceInputSchema
>;
export type UnbindInstitutionSourceInput = z.output<
  typeof unbindInstitutionSourceInputSchema
>;
export type BindOpportunitySourceInput = z.output<
  typeof bindOpportunitySourceInputSchema
>;
export type UnbindOpportunitySourceInput = z.output<
  typeof unbindOpportunitySourceInputSchema
>;

export type SourceBindingResult = Readonly<{
  targetType: "INSTITUTION" | "OPPORTUNITY";
  targetId: string;
  sourceId: string;
  role: string;
  state: "ACTIVE" | "INACTIVE";
  created?: boolean;
  reactivated?: boolean;
  changed?: boolean;
}>;

export type SourceUrlCorrectionInput = z.output<
  typeof sourceUrlCorrectionInputSchema
>;
export type SourceReplacementInput = z.output<
  typeof sourceReplacementInputSchema
>;
export type SourceMoveInput = z.output<typeof sourceMoveInputSchema>;

export type SourceMoveResult = Readonly<{
  moveMode: "URL_CORRECTION" | "SOURCE_REPLACEMENT";
  oldSourceId: string;
  newSourceId: string;
  canonicalUrl: string;
  transferredInstitutionBindings: number;
  transferredOpportunityBindings: number;
}>;

export type SourceCommandPersistence = Readonly<{
  findSourceForUpdate: typeof findSourceForUpdate;
  findSourcesForUpdate: typeof findSourcesForUpdate;
  findSourceSnapshot: typeof findSourceSnapshot;
  findInstitutionForUpdate: typeof findInstitutionForUpdate;
  findOpportunityForUpdate: typeof findOpportunityForUpdate;
  findInstitutionSourceBindingForUpdate: typeof findInstitutionSourceBindingForUpdate;
  findActiveInstitutionPrimaryBinding: typeof findActiveInstitutionPrimaryBinding;
  insertInstitutionSourceBinding: typeof insertInstitutionSourceBinding;
  activateInstitutionSourceBinding: typeof activateInstitutionSourceBinding;
  deactivateInstitutionSourceBinding: typeof deactivateInstitutionSourceBinding;
  findOpportunitySourceBindingForUpdate: typeof findOpportunitySourceBindingForUpdate;
  findActiveOpportunityPrimaryBinding: typeof findActiveOpportunityPrimaryBinding;
  insertOpportunitySourceBinding: typeof insertOpportunitySourceBinding;
  activateOpportunitySourceBinding: typeof activateOpportunitySourceBinding;
  deactivateOpportunitySourceBinding: typeof deactivateOpportunitySourceBinding;
  insertSourceObservation: typeof insertSourceObservation;
  updateSourceLifecycle: typeof updateSourceLifecycle;
  updateSourceCanonicalUrl: typeof updateSourceCanonicalUrl;
  findSourceMonitorConfigForUpdate: typeof findSourceMonitorConfigForUpdate;
  insertReplacementSource: typeof insertReplacementSource;
  insertSourceMonitorConfigCopy: typeof insertSourceMonitorConfigCopy;
  listActiveInstitutionBindingsForSourceForUpdate: typeof listActiveInstitutionBindingsForSourceForUpdate;
  listActiveOpportunityBindingsForSourceForUpdate: typeof listActiveOpportunityBindingsForSourceForUpdate;
  writeAudit: typeof AuditWriter.write;
}>;

export const defaultSourceCommandPersistence: SourceCommandPersistence = {
  findSourceForUpdate,
  findSourcesForUpdate,
  findSourceSnapshot,
  findInstitutionForUpdate,
  findOpportunityForUpdate,
  findInstitutionSourceBindingForUpdate,
  findActiveInstitutionPrimaryBinding,
  insertInstitutionSourceBinding,
  activateInstitutionSourceBinding,
  deactivateInstitutionSourceBinding,
  findOpportunitySourceBindingForUpdate,
  findActiveOpportunityPrimaryBinding,
  insertOpportunitySourceBinding,
  activateOpportunitySourceBinding,
  deactivateOpportunitySourceBinding,
  insertSourceObservation,
  updateSourceLifecycle,
  updateSourceCanonicalUrl,
  findSourceMonitorConfigForUpdate,
  insertReplacementSource,
  insertSourceMonitorConfigCopy,
  listActiveInstitutionBindingsForSourceForUpdate,
  listActiveOpportunityBindingsForSourceForUpdate,
  writeAudit: AuditWriter.write,
};

export type SourceCommandDependencies = Readonly<{
  transactionManager: TransactionManager;
  persistence?: SourceCommandPersistence;
}>;

function parseContext(ctx: AdminCommandContext): AdminCommandContext {
  const parsed = adminContextSchema.safeParse(ctx);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

function parseConfirmNoChangeInput(rawInput: unknown): ConfirmNoChangeInput {
  const parsed = confirmNoChangeInputSchema.safeParse(rawInput);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

function databaseCause(error: unknown): unknown {
  return typeof error === "object" && error !== null && "cause" in error
    ? error.cause
    : error;
}

export async function confirmNoChangeInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: ConfirmNoChangeInput,
  persistence: SourceCommandPersistence = defaultSourceCommandPersistence,
): Promise<ConfirmNoChangeResult> {
  const source = await persistence.findSourceForUpdate(
    executor,
    input.sourceId,
  );
  if (!source) throw new NotFoundError();
  if (source.lifecycleStatus === "RETIRED") throw new NotEligibleError();

  const observation = await persistence.insertSourceObservation(executor, {
    sourceId: source.id,
    observedAt: ctx.occurredAt,
    outcome: "UNCHANGED",
  });
  const observationId = observation.id.toString();
  await persistence.writeAudit(
    {
      adminUserId: ctx.adminUserId,
      actionType: "WP10B_CONFIRM_NO_CHANGE",
      entityType: "SOURCE",
      entityId: source.id,
      correlationId: ctx.correlationId,
      occurredAt: ctx.occurredAt,
      metadata: {
        sourceId: source.id,
        observationId,
        outcomeCode: "UNCHANGED",
      },
    },
    executor,
  );

  return {
    sourceId: source.id,
    observationId,
    checkedAt: ctx.occurredAt.toISOString(),
  };
}

export async function confirmNoChange(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: SourceCommandDependencies,
): Promise<ConfirmNoChangeResult> {
  const parsedContext = parseContext(ctx);
  const input = parseConfirmNoChangeInput(rawInput);

  try {
    return await dependencies.transactionManager.run((executor) =>
      confirmNoChangeInTransaction(
        executor,
        parsedContext,
        input,
        dependencies.persistence,
      ),
    );
  } catch (error) {
    throw mapDatabaseError(databaseCause(error));
  }
}

function parseMarkSourceUnavailableInput(
  rawInput: unknown,
): MarkSourceUnavailableInput {
  const parsed = markSourceUnavailableInputSchema.safeParse(rawInput);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

export async function markSourceUnavailableInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: MarkSourceUnavailableInput,
  persistence: SourceCommandPersistence = defaultSourceCommandPersistence,
): Promise<MarkSourceUnavailableResult> {
  if (!ctx.reason) throw ValidationError.invalidRequest();
  const source = await persistence.findSourceForUpdate(
    executor,
    input.sourceId,
  );
  if (!source) throw new NotFoundError();
  if (source.lifecycleStatus === "RETIRED") throw new NotEligibleError();

  const observation = await persistence.insertSourceObservation(executor, {
    sourceId: source.id,
    observedAt: ctx.occurredAt,
    outcome: input.outcome,
    ...(input.httpStatus === undefined ? {} : { httpStatus: input.httpStatus }),
    ...(input.finalUrl === undefined ? {} : { finalUrl: input.finalUrl }),
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    ...(input.errorMessage === undefined
      ? {}
      : { errorMessage: input.errorMessage }),
  });
  const lifecycleStatus = input.pauseSource ? "PAUSED" : source.lifecycleStatus;
  if (input.pauseSource && source.lifecycleStatus !== "PAUSED") {
    const updated = await persistence.updateSourceLifecycle(executor, {
      sourceId: source.id,
      lifecycleStatus: "PAUSED",
      updatedAt: ctx.occurredAt,
    });
    if (!updated) throw new NotFoundError();
  }
  const observationId = observation.id.toString();
  await persistence.writeAudit(
    {
      adminUserId: ctx.adminUserId,
      actionType: "WP10B_MARK_SOURCE_UNAVAILABLE",
      entityType: "SOURCE",
      entityId: source.id,
      correlationId: ctx.correlationId,
      reason: ctx.reason,
      occurredAt: ctx.occurredAt,
      metadata: {
        sourceId: source.id,
        observationId,
        outcomeCode: input.outcome,
      },
    },
    executor,
  );

  return {
    sourceId: source.id,
    observationId,
    checkedAt: ctx.occurredAt.toISOString(),
    lifecycleStatus,
  };
}

export async function markSourceUnavailable(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: SourceCommandDependencies,
): Promise<MarkSourceUnavailableResult> {
  const parsedContext = parseContext(ctx);
  const input = parseMarkSourceUnavailableInput(rawInput);

  try {
    return await dependencies.transactionManager.run((executor) =>
      markSourceUnavailableInTransaction(
        executor,
        parsedContext,
        input,
        dependencies.persistence,
      ),
    );
  } catch (error) {
    throw mapDatabaseError(databaseCause(error));
  }
}

function parseRecordSourceObservationInput(
  rawInput: unknown,
): RecordSourceObservationInput {
  const parsed = recordSourceObservationInputSchema.safeParse(rawInput);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

export async function recordSourceObservationInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: RecordSourceObservationInput,
  persistence: SourceCommandPersistence = defaultSourceCommandPersistence,
): Promise<RecordSourceObservationResult> {
  const source = await persistence.findSourceForUpdate(
    executor,
    input.sourceId,
  );
  if (!source) throw new NotFoundError();
  if (source.lifecycleStatus === "RETIRED") throw new NotEligibleError();
  if (input.snapshotId) {
    const snapshot = await persistence.findSourceSnapshot(
      executor,
      input.snapshotId,
    );
    if (!snapshot) throw new NotFoundError();
    if (snapshot.sourceId !== source.id) throw new NotEligibleError();
  }

  const observation = await persistence.insertSourceObservation(executor, {
    sourceId: source.id,
    observedAt: ctx.occurredAt,
    outcome: input.outcome,
    ...(input.httpStatus === undefined ? {} : { httpStatus: input.httpStatus }),
    ...(input.finalUrl === undefined ? {} : { finalUrl: input.finalUrl }),
    ...(input.contentHash === undefined
      ? {}
      : { contentHash: input.contentHash }),
    ...(input.textHash === undefined ? {} : { textHash: input.textHash }),
    ...(input.responseBytes === undefined
      ? {}
      : { responseBytes: BigInt(input.responseBytes) }),
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
    ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    ...(input.errorMessage === undefined
      ? {}
      : { errorMessage: input.errorMessage }),
    ...(input.snapshotId === undefined ? {} : { snapshotId: input.snapshotId }),
    ...(input.etag === undefined ? {} : { etag: input.etag }),
    ...(input.lastModified === undefined
      ? {}
      : { lastModified: input.lastModified }),
  });
  const observationId = observation.id.toString();
  await persistence.writeAudit(
    {
      adminUserId: ctx.adminUserId,
      actionType: "WP10B_RECORD_SOURCE_OBSERVATION",
      entityType: "SOURCE",
      entityId: source.id,
      correlationId: ctx.correlationId,
      ...(ctx.reason === undefined ? {} : { reason: ctx.reason }),
      occurredAt: ctx.occurredAt,
      metadata: {
        sourceId: source.id,
        observationId,
        outcomeCode: input.outcome,
      },
    },
    executor,
  );

  return {
    sourceId: source.id,
    observationId,
    checkedAt: ctx.occurredAt.toISOString(),
    outcome: input.outcome,
  };
}

export async function recordSourceObservation(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: SourceCommandDependencies,
): Promise<RecordSourceObservationResult> {
  const parsedContext = parseContext(ctx);
  const input = parseRecordSourceObservationInput(rawInput);

  try {
    return await dependencies.transactionManager.run((executor) =>
      recordSourceObservationInTransaction(
        executor,
        parsedContext,
        input,
        dependencies.persistence,
      ),
    );
  } catch (error) {
    throw mapDatabaseError(databaseCause(error));
  }
}

async function writeBindingAudit(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: {
    actionType: string;
    entityType: string;
    targetId: string;
    sourceId: string;
    outcomeCode: string;
  },
  persistence: SourceCommandPersistence,
) {
  await persistence.writeAudit(
    {
      adminUserId: ctx.adminUserId,
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.targetId,
      correlationId: ctx.correlationId,
      ...(ctx.reason === undefined ? {} : { reason: ctx.reason }),
      occurredAt: ctx.occurredAt,
      metadata: { sourceId: input.sourceId, outcomeCode: input.outcomeCode },
    },
    executor,
  );
}

export async function bindInstitutionSourceInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: BindInstitutionSourceInput,
  persistence: SourceCommandPersistence = defaultSourceCommandPersistence,
): Promise<SourceBindingResult> {
  const institution = await persistence.findInstitutionForUpdate(
    executor,
    input.institutionId,
  );
  if (!institution) throw new NotFoundError();
  const source = await persistence.findSourceForUpdate(
    executor,
    input.sourceId,
  );
  if (!source) throw new NotFoundError();
  if (source.lifecycleStatus !== "ACTIVE") throw new NotEligibleError();

  const existing = await persistence.findInstitutionSourceBindingForUpdate(
    executor,
    input,
  );
  if (existing?.isActive) {
    if (existing.isPrimary !== input.isPrimary) throw new ConflictError();
    return {
      targetType: "INSTITUTION",
      targetId: institution.id,
      sourceId: source.id,
      role: input.role,
      state: "ACTIVE",
      created: false,
      reactivated: false,
    };
  }
  if (input.isPrimary) {
    const primary = await persistence.findActiveInstitutionPrimaryBinding(
      executor,
      input,
    );
    if (primary && primary.sourceId !== source.id) throw new ConflictError();
  }

  if (existing) {
    const activated = await persistence.activateInstitutionSourceBinding(
      executor,
      { ...input, boundAt: ctx.occurredAt },
    );
    if (!activated) throw new ConflictError();
    await writeBindingAudit(
      executor,
      ctx,
      {
        actionType: "WP10B_BIND_INSTITUTION_SOURCE",
        entityType: "INSTITUTION_SOURCE_BINDING",
        targetId: institution.id,
        sourceId: source.id,
        outcomeCode: "REACTIVATED",
      },
      persistence,
    );
    return {
      targetType: "INSTITUTION",
      targetId: institution.id,
      sourceId: source.id,
      role: input.role,
      state: "ACTIVE",
      created: false,
      reactivated: true,
    };
  }

  await persistence.insertInstitutionSourceBinding(executor, {
    ...input,
    boundAt: ctx.occurredAt,
  });
  await writeBindingAudit(
    executor,
    ctx,
    {
      actionType: "WP10B_BIND_INSTITUTION_SOURCE",
      entityType: "INSTITUTION_SOURCE_BINDING",
      targetId: institution.id,
      sourceId: source.id,
      outcomeCode: "CREATED",
    },
    persistence,
  );
  return {
    targetType: "INSTITUTION",
    targetId: institution.id,
    sourceId: source.id,
    role: input.role,
    state: "ACTIVE",
    created: true,
    reactivated: false,
  };
}

export async function unbindInstitutionSourceInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: UnbindInstitutionSourceInput,
  persistence: SourceCommandPersistence = defaultSourceCommandPersistence,
): Promise<SourceBindingResult> {
  const institution = await persistence.findInstitutionForUpdate(
    executor,
    input.institutionId,
  );
  if (!institution) throw new NotFoundError();
  const existing = await persistence.findInstitutionSourceBindingForUpdate(
    executor,
    input,
  );
  if (!existing) throw new NotFoundError();
  if (!existing.isActive) {
    return {
      targetType: "INSTITUTION",
      targetId: institution.id,
      sourceId: input.sourceId,
      role: input.role,
      state: "INACTIVE",
      changed: false,
    };
  }
  const deactivated = await persistence.deactivateInstitutionSourceBinding(
    executor,
    { ...input, unboundAt: ctx.occurredAt },
  );
  if (!deactivated) throw new ConflictError();
  await writeBindingAudit(
    executor,
    ctx,
    {
      actionType: "WP10B_UNBIND_INSTITUTION_SOURCE",
      entityType: "INSTITUTION_SOURCE_BINDING",
      targetId: institution.id,
      sourceId: input.sourceId,
      outcomeCode: "DEACTIVATED",
    },
    persistence,
  );
  return {
    targetType: "INSTITUTION",
    targetId: institution.id,
    sourceId: input.sourceId,
    role: input.role,
    state: "INACTIVE",
    changed: true,
  };
}

export async function bindOpportunitySourceInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: BindOpportunitySourceInput,
  persistence: SourceCommandPersistence = defaultSourceCommandPersistence,
): Promise<SourceBindingResult> {
  const opportunity = await persistence.findOpportunityForUpdate(
    executor,
    input.opportunityId,
  );
  if (!opportunity) throw new NotFoundError();
  const source = await persistence.findSourceForUpdate(
    executor,
    input.sourceId,
  );
  if (!source) throw new NotFoundError();
  if (source.lifecycleStatus !== "ACTIVE") throw new NotEligibleError();
  const existing = await persistence.findOpportunitySourceBindingForUpdate(
    executor,
    input,
  );
  if (existing?.isActive) {
    if (existing.isPrimary !== input.isPrimary) throw new ConflictError();
    return {
      targetType: "OPPORTUNITY",
      targetId: opportunity.id,
      sourceId: source.id,
      role: input.role,
      state: "ACTIVE",
      created: false,
      reactivated: false,
    };
  }
  if (input.isPrimary) {
    const primary = await persistence.findActiveOpportunityPrimaryBinding(
      executor,
      input,
    );
    if (primary && primary.sourceId !== source.id) throw new ConflictError();
  }
  if (existing) {
    const activated = await persistence.activateOpportunitySourceBinding(
      executor,
      { ...input, boundAt: ctx.occurredAt },
    );
    if (!activated) throw new ConflictError();
    await writeBindingAudit(
      executor,
      ctx,
      {
        actionType: "WP10B_BIND_OPPORTUNITY_SOURCE",
        entityType: "OPPORTUNITY_SOURCE_BINDING",
        targetId: opportunity.id,
        sourceId: source.id,
        outcomeCode: "REACTIVATED",
      },
      persistence,
    );
    return {
      targetType: "OPPORTUNITY",
      targetId: opportunity.id,
      sourceId: source.id,
      role: input.role,
      state: "ACTIVE",
      created: false,
      reactivated: true,
    };
  }
  await persistence.insertOpportunitySourceBinding(executor, {
    ...input,
    boundAt: ctx.occurredAt,
  });
  await writeBindingAudit(
    executor,
    ctx,
    {
      actionType: "WP10B_BIND_OPPORTUNITY_SOURCE",
      entityType: "OPPORTUNITY_SOURCE_BINDING",
      targetId: opportunity.id,
      sourceId: source.id,
      outcomeCode: "CREATED",
    },
    persistence,
  );
  return {
    targetType: "OPPORTUNITY",
    targetId: opportunity.id,
    sourceId: source.id,
    role: input.role,
    state: "ACTIVE",
    created: true,
    reactivated: false,
  };
}

export async function unbindOpportunitySourceInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: UnbindOpportunitySourceInput,
  persistence: SourceCommandPersistence = defaultSourceCommandPersistence,
): Promise<SourceBindingResult> {
  const opportunity = await persistence.findOpportunityForUpdate(
    executor,
    input.opportunityId,
  );
  if (!opportunity) throw new NotFoundError();
  const existing = await persistence.findOpportunitySourceBindingForUpdate(
    executor,
    input,
  );
  if (!existing) throw new NotFoundError();
  if (!existing.isActive) {
    return {
      targetType: "OPPORTUNITY",
      targetId: opportunity.id,
      sourceId: input.sourceId,
      role: input.role,
      state: "INACTIVE",
      changed: false,
    };
  }
  const deactivated = await persistence.deactivateOpportunitySourceBinding(
    executor,
    { ...input, unboundAt: ctx.occurredAt },
  );
  if (!deactivated) throw new ConflictError();
  await writeBindingAudit(
    executor,
    ctx,
    {
      actionType: "WP10B_UNBIND_OPPORTUNITY_SOURCE",
      entityType: "OPPORTUNITY_SOURCE_BINDING",
      targetId: opportunity.id,
      sourceId: input.sourceId,
      outcomeCode: "DEACTIVATED",
    },
    persistence,
  );
  return {
    targetType: "OPPORTUNITY",
    targetId: opportunity.id,
    sourceId: input.sourceId,
    role: input.role,
    state: "INACTIVE",
    changed: true,
  };
}

async function runBindingCommand<TInput, TResult>(
  ctx: AdminCommandContext,
  rawInput: unknown,
  schema: z.ZodType<TInput>,
  dependencies: SourceCommandDependencies,
  operation: (
    executor: TransactionExecutor,
    parsedContext: AdminCommandContext,
    input: TInput,
    persistence?: SourceCommandPersistence,
  ) => Promise<TResult>,
): Promise<TResult> {
  const parsedContext = parseContext(ctx);
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  try {
    return await dependencies.transactionManager.run((executor) =>
      operation(executor, parsedContext, parsed.data, dependencies.persistence),
    );
  } catch (error) {
    throw mapDatabaseError(databaseCause(error));
  }
}

export function bindInstitutionSource(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: SourceCommandDependencies,
) {
  return runBindingCommand(
    ctx,
    rawInput,
    bindInstitutionSourceInputSchema,
    dependencies,
    bindInstitutionSourceInTransaction,
  );
}

export function unbindInstitutionSource(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: SourceCommandDependencies,
) {
  return runBindingCommand(
    ctx,
    rawInput,
    unbindInstitutionSourceInputSchema,
    dependencies,
    unbindInstitutionSourceInTransaction,
  );
}

export function bindOpportunitySource(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: SourceCommandDependencies,
) {
  return runBindingCommand(
    ctx,
    rawInput,
    bindOpportunitySourceInputSchema,
    dependencies,
    bindOpportunitySourceInTransaction,
  );
}

export function unbindOpportunitySource(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: SourceCommandDependencies,
) {
  return runBindingCommand(
    ctx,
    rawInput,
    unbindOpportunitySourceInputSchema,
    dependencies,
    unbindOpportunitySourceInTransaction,
  );
}

function normalizeCanonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

export async function correctSourceUrlInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: SourceUrlCorrectionInput,
  persistence: SourceCommandPersistence = defaultSourceCommandPersistence,
): Promise<SourceMoveResult> {
  if (!ctx.reason) throw ValidationError.invalidRequest();
  const source = await persistence.findSourceForUpdate(
    executor,
    input.sourceId,
  );
  if (!source) throw new NotFoundError();
  if (source.lifecycleStatus === "RETIRED") throw new NotEligibleError();
  const canonicalUrl = normalizeCanonicalUrl(input.newUrl);
  if (canonicalUrl === source.canonicalUrl) throw new ConflictError();
  const updated = await persistence.updateSourceCanonicalUrl(executor, {
    sourceId: source.id,
    canonicalUrl,
    updatedAt: ctx.occurredAt,
  });
  if (!updated) throw new NotFoundError();
  await persistence.writeAudit(
    {
      adminUserId: ctx.adminUserId,
      actionType: "WP10B_SOURCE_URL_CORRECTED",
      entityType: "SOURCE",
      entityId: source.id,
      correlationId: ctx.correlationId,
      reason: ctx.reason,
      occurredAt: ctx.occurredAt,
      metadata: {
        sourceId: source.id,
        outcomeCode: "URL_CORRECTED",
        moveMode: input.moveMode,
      },
    },
    executor,
  );
  return {
    moveMode: input.moveMode,
    oldSourceId: source.id,
    newSourceId: source.id,
    canonicalUrl,
    transferredInstitutionBindings: 0,
    transferredOpportunityBindings: 0,
  };
}

export async function markSourceMoved(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: SourceCommandDependencies,
): Promise<SourceMoveResult> {
  const parsedContext = parseContext(ctx);
  const parsed = sourceMoveInputSchema.safeParse(rawInput);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  try {
    return await dependencies.transactionManager.run((executor) =>
      parsed.data.moveMode === "URL_CORRECTION"
        ? correctSourceUrlInTransaction(
            executor,
            parsedContext,
            parsed.data,
            dependencies.persistence,
          )
        : replaceSourceInTransaction(
            executor,
            parsedContext,
            parsed.data,
            dependencies.persistence,
          ),
    );
  } catch (error) {
    throw mapDatabaseError(databaseCause(error));
  }
}

export async function replaceSourceInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: SourceReplacementInput,
  persistence: SourceCommandPersistence = defaultSourceCommandPersistence,
): Promise<SourceMoveResult> {
  if (!ctx.reason) throw ValidationError.invalidRequest();

  let oldSource;
  let replacementSource;
  if (input.replacement.kind === "REUSE") {
    const replacementSourceId = input.replacement.replacementSourceId;
    if (replacementSourceId === input.sourceId) {
      throw new ConflictError();
    }
    const locked = await persistence.findSourcesForUpdate(executor, [
      input.sourceId,
      replacementSourceId,
    ]);
    oldSource = locked.find((source) => source.id === input.sourceId);
    replacementSource = locked.find(
      (source) => source.id === replacementSourceId,
    );
    if (!oldSource || !replacementSource) throw new NotFoundError();
    if (replacementSource.lifecycleStatus !== "ACTIVE") {
      throw new NotEligibleError();
    }
    if (
      replacementSource.sourceType !== oldSource.sourceType ||
      replacementSource.authorityLevel !== oldSource.authorityLevel
    ) {
      throw new ConflictError();
    }
    const replacementConfig =
      await persistence.findSourceMonitorConfigForUpdate(
        executor,
        replacementSource.id,
      );
    if (!replacementConfig) throw new NotEligibleError();
  } else {
    oldSource = await persistence.findSourceForUpdate(executor, input.sourceId);
    if (!oldSource) throw new NotFoundError();
  }
  if (oldSource.lifecycleStatus === "RETIRED") throw new NotEligibleError();

  const oldConfig = await persistence.findSourceMonitorConfigForUpdate(
    executor,
    oldSource.id,
  );
  if (!oldConfig) throw new NotEligibleError();
  const institutionBindings =
    await persistence.listActiveInstitutionBindingsForSourceForUpdate(
      executor,
      oldSource.id,
    );
  const opportunityBindings =
    await persistence.listActiveOpportunityBindingsForSourceForUpdate(
      executor,
      oldSource.id,
    );

  if (input.replacement.kind === "CREATE") {
    replacementSource = await persistence.insertReplacementSource(executor, {
      canonicalUrl: normalizeCanonicalUrl(input.replacement.canonicalUrl),
      sourceType: oldSource.sourceType,
      authorityLevel: oldSource.authorityLevel,
      sourceName: input.replacement.sourceName,
      requiresJs: oldSource.requiresJs,
      contentTypeHint: oldSource.contentTypeHint,
      occurredAt: ctx.occurredAt,
    });
    await persistence.insertSourceMonitorConfigCopy(executor, {
      sourceId: replacementSource.id,
      collectionStrategy: oldConfig.collectionStrategy,
      monitoringProfile: oldConfig.monitoringProfile,
      customIntervalMinutes: oldConfig.customIntervalMinutes,
      seasonalEnabled: oldConfig.seasonalEnabled,
      browserRequired: oldConfig.browserRequired,
      maxAttempts: oldConfig.maxAttempts,
      isEnabled: oldConfig.isEnabled,
      occurredAt: ctx.occurredAt,
    });
  }
  if (!replacementSource) throw new NotFoundError();

  for (const binding of institutionBindings) {
    const deactivated = await persistence.deactivateInstitutionSourceBinding(
      executor,
      {
        institutionId: binding.institutionId,
        sourceId: oldSource.id,
        role: binding.role,
        unboundAt: ctx.occurredAt,
      },
    );
    if (!deactivated) throw new ConflictError();
    await bindInstitutionSourceInTransaction(
      executor,
      ctx,
      {
        institutionId: binding.institutionId,
        sourceId: replacementSource.id,
        role: binding.role,
        isPrimary: binding.isPrimary,
      },
      persistence,
    );
  }
  for (const binding of opportunityBindings) {
    const deactivated = await persistence.deactivateOpportunitySourceBinding(
      executor,
      {
        opportunityId: binding.opportunityId,
        sourceId: oldSource.id,
        role: binding.role,
        unboundAt: ctx.occurredAt,
      },
    );
    if (!deactivated) throw new ConflictError();
    await bindOpportunitySourceInTransaction(
      executor,
      ctx,
      {
        opportunityId: binding.opportunityId,
        sourceId: replacementSource.id,
        role: binding.role,
        isPrimary: binding.isPrimary,
      },
      persistence,
    );
  }
  const retired = await persistence.updateSourceLifecycle(executor, {
    sourceId: oldSource.id,
    lifecycleStatus: "RETIRED",
    updatedAt: ctx.occurredAt,
  });
  if (!retired) throw new NotFoundError();
  await persistence.writeAudit(
    {
      adminUserId: ctx.adminUserId,
      actionType: "WP10B_SOURCE_REPLACED",
      entityType: "SOURCE",
      entityId: oldSource.id,
      correlationId: ctx.correlationId,
      reason: ctx.reason,
      occurredAt: ctx.occurredAt,
      metadata: {
        sourceId: oldSource.id,
        targetId: replacementSource.id,
        outcomeCode: "SOURCE_REPLACED",
        moveMode: input.moveMode,
      },
    },
    executor,
  );

  return {
    moveMode: input.moveMode,
    oldSourceId: oldSource.id,
    newSourceId: replacementSource.id,
    canonicalUrl: replacementSource.canonicalUrl,
    transferredInstitutionBindings: institutionBindings.length,
    transferredOpportunityBindings: opportunityBindings.length,
  };
}
