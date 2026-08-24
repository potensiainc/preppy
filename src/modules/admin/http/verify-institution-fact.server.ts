import "server-only";

import { z } from "zod";

import type { AdminCommandContext } from "@/src/application/context";
import { institutionFactTypeValues } from "@/src/db/schema";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import {
  verifyInstitutionFact,
  type InstitutionFactVerificationResult,
} from "@/src/modules/monitoring/verify-institution-fact.server";
import {
  runAdminCommandRequest,
  type AdminCommandRequestDependencies,
} from "@/src/modules/admin/http/command-handler.server";

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
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
      ([key, item]) =>
        key.length > 0 && key.length <= 200 && isJsonValue(item, depth + 1),
    )
  );
}

const factValueSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (value) => isJsonValue(value) && JSON.stringify(value).length <= 60_000,
  );
const nullableDateTime = z.iso.datetime({ offset: true }).nullable();
const factPathSchema = z
  .object({
    institutionId: z.uuid(),
    factType: z.enum(institutionFactTypeValues),
  })
  .strict();
const factBodySchema = z
  .object({
    expectedCurrentVersionId: z.uuid().nullable(),
    proposedState: z
      .object({
        valueJson: factValueSchema,
        displayText: z.string().trim().min(1).max(5_000).nullable(),
        validFrom: nullableDateTime,
        validUntil: nullableDateTime,
      })
      .strict()
      .refine(
        (value) =>
          value.validFrom === null ||
          value.validUntil === null ||
          Date.parse(value.validFrom) <= Date.parse(value.validUntil),
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

export const ADMIN_VERIFY_INSTITUTION_FACT_REASON =
  "ADMIN_VERIFY_INSTITUTION_FACT";

type VerifyInstitutionFactCommand = (
  context: AdminCommandContext,
  input: unknown,
) => Promise<InstitutionFactVerificationResult>;

export type AdminVerifyInstitutionFactRequestDependencies =
  Partial<AdminCommandRequestDependencies> & {
    verifyInstitutionFact?: VerifyInstitutionFactCommand;
  };

function defaultCommand(
  context: AdminCommandContext,
  input: unknown,
): Promise<InstitutionFactVerificationResult> {
  return verifyInstitutionFact(context, input, {
    transactionManager: getRuntimeDatabase().transactionManager,
  });
}

export function handleAdminVerifyInstitutionFactRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminVerifyInstitutionFactRequestDependencies = {},
): Promise<Response> {
  const { verifyInstitutionFact: command = defaultCommand, ...pipeline } =
    dependencies;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: factPathSchema,
    bodySchema: factBodySchema,
    reason: ADMIN_VERIFY_INSTITUTION_FACT_REASON,
    dependencies: pipeline,
    execute: ({ context, path, body }) =>
      command(context, {
        institutionId: path.institutionId,
        factType: path.factType,
        ...body,
      }),
  });
}
