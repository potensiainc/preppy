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
import { institutionFactTypeValues } from "@/src/db/schema";
import { mapDatabaseError } from "@/src/infrastructure/db/errors";
import type {
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import {
  findCurrentInstitutionFactVersionForUpdate,
  findInstitutionFactForUpdate,
  findInstitutionForUpdate,
  insertInstitutionFact,
  insertInstitutionFactVersion,
  insertInstitutionFactVersionEvidence,
  supersedeCurrentInstitutionFactVersion,
} from "@/src/modules/institution/repository.server";
import {
  compareFactTruth,
  type FactTruth,
} from "@/src/modules/monitoring/policy";
import {
  findActiveInstitutionSourceBindingForUpdate,
  findSourceForUpdate,
  findSourceObservation,
  findSourceSnapshot,
  insertSourceObservation,
} from "@/src/modules/monitoring/repository.server";

const canonicalIdentifierSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
const nullableDateTimeSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .nullable();

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return (
      value.length <= 1_000 &&
      value.every((item) => isJsonValue(item, depth + 1))
    );
  }
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    entries.length <= 1_000 &&
    entries.every(
      ([key, candidate]) =>
        key.length > 0 &&
        key.length <= 200 &&
        isJsonValue(candidate, depth + 1),
    )
  );
}

const factValueSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (value) => isJsonValue(value) && JSON.stringify(value).length <= 100_000,
  );

const verifyInstitutionFactInputSchema = z
  .object({
    institutionId: z.uuid(),
    factType: z.enum(institutionFactTypeValues),
    expectedCurrentVersionId: z.uuid().nullable(),
    proposedState: z
      .object({
        valueJson: factValueSchema,
        displayText: z.string().trim().min(1).max(5_000).nullable(),
        validFrom: nullableDateTimeSchema,
        validUntil: nullableDateTimeSchema,
      })
      .strict()
      .refine(
        (value) =>
          value.validFrom === null ||
          value.validUntil === null ||
          value.validUntil.getTime() >= value.validFrom.getTime(),
        { path: ["validUntil"], message: "Invalid value." },
      ),
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

export type VerifyInstitutionFactInput = z.output<
  typeof verifyInstitutionFactInputSchema
>;

export type InstitutionFactVerificationResult = Readonly<{
  institutionId: string;
  institutionFactId: string;
  factType: (typeof institutionFactTypeValues)[number];
  outcome: "CREATED" | "CHANGED" | "NO_CHANGE";
  previousVersionId: string | null;
  currentVersionId: string;
  evidenceId: string | null;
  verifiedAt: string;
}>;

export type VerifyInstitutionFactPersistence = Readonly<{
  findInstitutionForUpdate: typeof findInstitutionForUpdate;
  findInstitutionFactForUpdate: typeof findInstitutionFactForUpdate;
  insertInstitutionFact: typeof insertInstitutionFact;
  findCurrentInstitutionFactVersionForUpdate: typeof findCurrentInstitutionFactVersionForUpdate;
  supersedeCurrentInstitutionFactVersion: typeof supersedeCurrentInstitutionFactVersion;
  insertInstitutionFactVersion: typeof insertInstitutionFactVersion;
  insertInstitutionFactVersionEvidence: typeof insertInstitutionFactVersionEvidence;
  findSourceForUpdate: typeof findSourceForUpdate;
  findActiveInstitutionSourceBindingForUpdate: typeof findActiveInstitutionSourceBindingForUpdate;
  findSourceObservation: typeof findSourceObservation;
  findSourceSnapshot: typeof findSourceSnapshot;
  insertSourceObservation: typeof insertSourceObservation;
  writeAudit: typeof AuditWriter.write;
}>;

export const defaultVerifyInstitutionFactPersistence: VerifyInstitutionFactPersistence =
  {
    findInstitutionForUpdate,
    findInstitutionFactForUpdate,
    insertInstitutionFact,
    findCurrentInstitutionFactVersionForUpdate,
    supersedeCurrentInstitutionFactVersion,
    insertInstitutionFactVersion,
    insertInstitutionFactVersionEvidence,
    findSourceForUpdate,
    findActiveInstitutionSourceBindingForUpdate,
    findSourceObservation,
    findSourceSnapshot,
    insertSourceObservation,
    writeAudit: AuditWriter.write,
  };

export type VerifyInstitutionFactDependencies = Readonly<{
  transactionManager: TransactionManager;
  persistence?: VerifyInstitutionFactPersistence;
}>;

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, candidate]) => [key, canonicalizeJson(candidate)]),
  );
}

function canonicalTruth(
  input: VerifyInstitutionFactInput["proposedState"],
): FactTruth {
  return {
    valueJson: canonicalizeJson(input.valueJson) as Record<string, unknown>,
    displayText: input.displayText?.trim() ?? null,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
  };
}

function databaseCause(error: unknown): unknown {
  return typeof error === "object" && error !== null && "cause" in error
    ? error.cause
    : error;
}

async function validateProvenance(
  executor: TransactionExecutor,
  input: VerifyInstitutionFactInput,
  persistence: VerifyInstitutionFactPersistence,
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
  const binding = await persistence.findActiveInstitutionSourceBindingForUpdate(
    executor,
    { institutionId: input.institutionId, sourceId: source.id },
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

export async function verifyInstitutionFactInTransaction(
  executor: TransactionExecutor,
  ctx: AdminCommandContext,
  input: VerifyInstitutionFactInput,
  persistence: VerifyInstitutionFactPersistence = defaultVerifyInstitutionFactPersistence,
): Promise<InstitutionFactVerificationResult> {
  const institution = await persistence.findInstitutionForUpdate(
    executor,
    input.institutionId,
  );
  if (!institution) throw new NotFoundError();
  const source = await validateProvenance(executor, input, persistence);

  let fact = await persistence.findInstitutionFactForUpdate(executor, {
    institutionId: institution.id,
    factType: input.factType,
  });
  if (!fact) {
    if (input.expectedCurrentVersionId !== null) throw new ConflictError();
    fact = await persistence.insertInstitutionFact(executor, {
      institutionId: institution.id,
      factType: input.factType,
      createdAt: ctx.occurredAt,
    });
  }
  const current = await persistence.findCurrentInstitutionFactVersionForUpdate(
    executor,
    fact.id,
  );
  if ((current?.id ?? null) !== input.expectedCurrentVersionId) {
    throw new ConflictError();
  }

  const proposed = canonicalTruth(input.proposedState);
  if (current) {
    const existing: FactTruth = {
      valueJson: current.valueJson,
      displayText: current.displayText,
      validFrom: current.validFrom,
      validUntil: current.validUntil,
    };
    if (!compareFactTruth(existing, proposed)) {
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
          actionType: "WP10B_VERIFY_INSTITUTION_FACT_NO_CHANGE",
          entityType: "INSTITUTION",
          entityId: institution.id,
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
        institutionId: institution.id,
        institutionFactId: fact.id,
        factType: fact.factType,
        outcome: "NO_CHANGE",
        previousVersionId: current.id,
        currentVersionId: current.id,
        evidenceId: null,
        verifiedAt: ctx.occurredAt.toISOString(),
      };
    }
    const superseded = await persistence.supersedeCurrentInstitutionFactVersion(
      executor,
      { institutionFactId: fact.id, versionId: current.id },
    );
    if (!superseded) throw new ConflictError();
  }

  const version = await persistence.insertInstitutionFactVersion(executor, {
    institutionFactId: fact.id,
    versionNumber: (current?.versionNumber ?? 0) + 1,
    supersedesVersionId: current?.id ?? null,
    verificationState: "VERIFIED",
    isCurrent: true,
    valueJson: proposed.valueJson as Record<string, unknown>,
    displayText: proposed.displayText,
    verifiedAt: ctx.occurredAt,
    verifiedByAdminId: ctx.adminUserId,
    validFrom: proposed.validFrom,
    validUntil: proposed.validUntil,
    createdAt: ctx.occurredAt,
  });
  const evidence = await persistence.insertInstitutionFactVersionEvidence(
    executor,
    {
      institutionFactVersionId: version.id,
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
  const outcome = current ? "CHANGED" : "CREATED";
  await persistence.writeAudit(
    {
      adminUserId: ctx.adminUserId,
      actionType: `WP10B_VERIFY_INSTITUTION_FACT_${outcome}`,
      entityType: "INSTITUTION",
      entityId: institution.id,
      correlationId: ctx.correlationId,
      ...(ctx.reason === undefined ? {} : { reason: ctx.reason }),
      occurredAt: ctx.occurredAt,
      metadata: {
        sourceId: source.id,
        targetId: fact.id,
        versionId: version.id,
        outcomeCode: outcome,
      },
    },
    executor,
  );
  return {
    institutionId: institution.id,
    institutionFactId: fact.id,
    factType: fact.factType,
    outcome,
    previousVersionId: current?.id ?? null,
    currentVersionId: version.id,
    evidenceId: evidence.id,
    verifiedAt: ctx.occurredAt.toISOString(),
  };
}

export async function verifyInstitutionFact(
  ctx: AdminCommandContext,
  rawInput: unknown,
  dependencies: VerifyInstitutionFactDependencies,
): Promise<InstitutionFactVerificationResult> {
  const parsedContext = adminContextSchema.safeParse(ctx);
  if (!parsedContext.success) {
    throw ValidationError.fromZodError(parsedContext.error);
  }
  const parsedInput = verifyInstitutionFactInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw ValidationError.fromZodError(parsedInput.error);
  }
  try {
    return await dependencies.transactionManager.run((executor) =>
      verifyInstitutionFactInTransaction(
        executor,
        parsedContext.data,
        parsedInput.data,
        dependencies.persistence,
      ),
    );
  } catch (error) {
    throw mapDatabaseError(databaseCause(error));
  }
}
