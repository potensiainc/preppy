import "server-only";

import { z } from "zod";

import type { AdminCommandContext } from "@/src/application/context";
import { isCanonicalAdminActionUrl } from "@/src/modules/admin/action-url";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import {
  verifyOpportunity,
  type VerificationResult,
} from "@/src/modules/monitoring/verify-opportunity.server";
import {
  runAdminCommandRequest,
  type AdminCommandRequestDependencies,
} from "@/src/modules/admin/http/command-handler.server";

const nullableDateTime = z.iso.datetime({ offset: true }).nullable();
const nullableAbsoluteHttpUrl = z
  .string()
  .max(2_048)
  .refine(isCanonicalAdminActionUrl)
  .nullable();

const nativeCandidateSchema = z
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
    eventStartAt: nullableDateTime,
    eventEndAt: nullableDateTime,
    applicationOpenAt: nullableDateTime,
    applicationCloseAt: nullableDateTime,
    actionUrl: nullableAbsoluteHttpUrl,
    locationText: z.string().trim().min(1).max(1_000).nullable(),
    validFrom: nullableDateTime,
    validUntil: nullableDateTime,
  })
  .strict()
  .superRefine((value, context) => {
    for (const [start, end, path] of [
      [value.eventStartAt, value.eventEndAt, "eventEndAt"],
      [value.applicationOpenAt, value.applicationCloseAt, "applicationCloseAt"],
      [value.validFrom, value.validUntil, "validUntil"],
    ] as const) {
      if (
        start !== null &&
        end !== null &&
        Date.parse(end) < Date.parse(start)
      ) {
        context.addIssue({
          code: "custom",
          path: [path],
          message: "Invalid value.",
        });
      }
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

const legacyDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate)
  .nullable();
const legacyTime = z
  .string()
  .regex(/^\d{2}:\d{2}:\d{2}$/)
  .refine(isClockTime)
  .nullable();

function orderedLegacyMoments(
  startDate: string | null,
  startTime: string | null,
  endDate: string | null,
  endTime: string | null,
): boolean {
  if (startDate === null || endDate === null) return true;
  if (startDate !== endDate) return startDate < endDate;
  return startTime === null || endTime === null || startTime <= endTime;
}

const legacyCandidateSchema = z
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
    eventStartDate: legacyDate,
    eventStartTime: legacyTime,
    eventEndDate: legacyDate,
    eventEndTime: legacyTime,
    registrationOpenDate: legacyDate,
    registrationOpenTime: legacyTime,
    registrationCloseDate: legacyDate,
    registrationCloseTime: legacyTime,
    timezone: z.string().trim().min(1).max(100),
    venue: z.string().trim().min(1).max(1_000).nullable(),
    actionUrl: nullableAbsoluteHttpUrl,
    officialNotes: z.string().trim().min(1).max(5_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      !orderedLegacyMoments(
        value.eventStartDate,
        value.eventStartTime,
        value.eventEndDate,
        value.eventEndTime,
      )
    ) {
      context.addIssue({
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
      context.addIssue({
        code: "custom",
        path: ["registrationCloseDate"],
        message: "Invalid value.",
      });
    }
  });

const opportunityPathSchema = z.object({ opportunityId: z.uuid() }).strict();
const evidenceSchema = z
  .object({
    observationId: z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .optional(),
    snapshotId: z.uuid().optional(),
    evidenceRole: z.string().trim().min(1).max(100),
  })
  .strict();

const opportunityBodySchema = z
  .object({
    expectedCurrentVersionId: z.uuid().nullable(),
    proposedState: z.union([nativeCandidateSchema, legacyCandidateSchema]),
    sourceId: z.uuid(),
    evidence: evidenceSchema,
    materialityOverride: z.enum(["NOTIFIABLE", "NON_NOTIFIABLE"]).optional(),
    overrideReason: z
      .enum([
        "MATERIALITY_USER_IMPACT_CONFIRMED",
        "MATERIALITY_NON_USER_FACING_CONFIRMED",
      ])
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const validPair =
      (value.materialityOverride === undefined &&
        value.overrideReason === undefined) ||
      (value.materialityOverride === "NOTIFIABLE" &&
        value.overrideReason === "MATERIALITY_USER_IMPACT_CONFIRMED") ||
      (value.materialityOverride === "NON_NOTIFIABLE" &&
        value.overrideReason === "MATERIALITY_NON_USER_FACING_CONFIRMED");
    if (!validPair) {
      context.addIssue({
        code: "custom",
        path: ["overrideReason"],
        message: "Invalid value.",
      });
    }
    if (
      value.expectedCurrentVersionId === null &&
      (value.materialityOverride !== undefined ||
        value.overrideReason !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["materialityOverride"],
        message: "Invalid value.",
      });
    }
  });

export const ADMIN_VERIFY_OPPORTUNITY_REASON = "ADMIN_VERIFY_OPPORTUNITY";

type VerifyOpportunityCommand = (
  context: AdminCommandContext,
  input: unknown,
) => Promise<VerificationResult>;

export type AdminVerifyOpportunityRequestDependencies =
  Partial<AdminCommandRequestDependencies> & {
    verifyOpportunity?: VerifyOpportunityCommand;
  };

function defaultCommand(
  context: AdminCommandContext,
  input: unknown,
): Promise<VerificationResult> {
  return verifyOpportunity(context, input, {
    transactionManager: getRuntimeDatabase().transactionManager,
  });
}

export function handleAdminVerifyOpportunityRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminVerifyOpportunityRequestDependencies = {},
): Promise<Response> {
  const { verifyOpportunity: command = defaultCommand, ...pipeline } =
    dependencies;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: opportunityPathSchema,
    bodySchema: opportunityBodySchema,
    reason: ADMIN_VERIFY_OPPORTUNITY_REASON,
    dependencies: pipeline,
    execute: ({ context, path, body }) =>
      command(context, { opportunityId: path.opportunityId, ...body }),
  });
}
