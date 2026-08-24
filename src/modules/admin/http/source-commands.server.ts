import "server-only";

import { z } from "zod";

import type { AdminCommandContext } from "@/src/application/context";
import {
  institutionSourceBindingRoleValues,
  opportunitySourceBindingRoleValues,
} from "@/src/db/schema";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { isCanonicalAdminActionUrl } from "@/src/modules/admin/action-url";
import {
  runAdminCommandRequest,
  type AdminCommandRequestDependencies,
} from "@/src/modules/admin/http/command-handler.server";
import {
  bindInstitutionSource,
  bindOpportunitySource,
  markSourceMoved,
  markSourceUnavailable,
  unbindInstitutionSource,
  unbindOpportunitySource,
  type MarkSourceUnavailableResult,
  type SourceBindingResult,
  type SourceMoveResult,
} from "@/src/modules/monitoring/source-commands.server";

const canonicalIdentifierSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
const sourcePathSchema = z.object({ sourceId: z.uuid() }).strict();
const institutionPathSchema = z.object({ institutionId: z.uuid() }).strict();
const opportunityPathSchema = z.object({ opportunityId: z.uuid() }).strict();

const canonicalHttpUrlSchema = z
  .string()
  .max(2_048)
  .refine(
    (value) =>
      isCanonicalAdminActionUrl(value) && new URL(value).hash.length === 0,
  );

const unavailableOutcomeSchema = z.enum([
  "NOT_FOUND",
  "ACCESS_ERROR",
  "PARSE_ERROR",
  "TIMEOUT",
]);

const unavailableBodySchema = z
  .object({
    outcome: unavailableOutcomeSchema,
    httpStatus: z.number().int().min(100).max(599).optional(),
    finalUrl: canonicalHttpUrlSchema.optional(),
    durationMs: z.number().int().min(0).max(86_400_000).optional(),
    errorCode: canonicalIdentifierSchema.optional(),
    errorMessage: z.string().trim().min(1).max(500).optional(),
    pauseSource: z.boolean().default(false),
  })
  .strict();

const urlCorrectionBodySchema = z
  .object({
    moveMode: z.literal("URL_CORRECTION"),
    newUrl: canonicalHttpUrlSchema,
    provenanceContinuityConfirmed: z.literal(true),
  })
  .strict();

const sourceReplacementBodySchema = z
  .object({
    moveMode: z.literal("SOURCE_REPLACEMENT"),
    replacement: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("CREATE"),
          canonicalUrl: canonicalHttpUrlSchema,
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

const sourceMoveBodySchema = z.discriminatedUnion("moveMode", [
  urlCorrectionBodySchema,
  sourceReplacementBodySchema,
]);

const institutionBindBodySchema = z
  .object({
    sourceId: z.uuid(),
    role: z.enum(institutionSourceBindingRoleValues),
    isPrimary: z.boolean(),
  })
  .strict();

const opportunityBindBodySchema = z
  .object({
    sourceId: z.uuid(),
    role: z.enum(opportunitySourceBindingRoleValues),
    isPrimary: z.boolean(),
  })
  .strict();

const institutionUnbindPathSchema = z
  .object({
    institutionId: z.uuid(),
    sourceId: z.uuid(),
    role: z.enum(institutionSourceBindingRoleValues),
  })
  .strict();

const opportunityUnbindPathSchema = z
  .object({
    opportunityId: z.uuid(),
    sourceId: z.uuid(),
    role: z.enum(opportunitySourceBindingRoleValues),
  })
  .strict();

const emptyBodySchema = z.object({}).strict();

const UNAVAILABLE_REASONS = {
  NOT_FOUND: "SOURCE_NOT_FOUND",
  ACCESS_ERROR: "SOURCE_ACCESS_ERROR",
  PARSE_ERROR: "SOURCE_PARSE_ERROR",
  TIMEOUT: "SOURCE_TIMEOUT",
} as const;

const MOVE_REASONS = {
  URL_CORRECTION: "SOURCE_URL_CORRECTION_CONFIRMED",
  SOURCE_REPLACEMENT: "SOURCE_REPLACEMENT_CONFIRMED",
} as const;

export const ADMIN_SOURCE_BINDING_REASON = "SOURCE_BINDING_UPDATED";

type UnavailableCommand = (
  context: AdminCommandContext,
  input: unknown,
) => Promise<MarkSourceUnavailableResult>;
type MoveCommand = (
  context: AdminCommandContext,
  input: unknown,
) => Promise<SourceMoveResult>;
type BindingCommand = (
  context: AdminCommandContext,
  input: unknown,
) => Promise<SourceBindingResult>;

export type AdminSourceCommandRequestDependencies =
  Partial<AdminCommandRequestDependencies> & {
    markSourceUnavailable?: UnavailableCommand;
    markSourceMoved?: MoveCommand;
    bindInstitutionSource?: BindingCommand;
    unbindInstitutionSource?: BindingCommand;
    bindOpportunitySource?: BindingCommand;
    unbindOpportunitySource?: BindingCommand;
  };

function sourceCommandDependencies() {
  return { transactionManager: getRuntimeDatabase().transactionManager };
}

const defaultMarkSourceUnavailable: UnavailableCommand = (context, input) =>
  markSourceUnavailable(context, input, sourceCommandDependencies());
const defaultMarkSourceMoved: MoveCommand = (context, input) =>
  markSourceMoved(context, input, sourceCommandDependencies());
const defaultBindInstitutionSource: BindingCommand = (context, input) =>
  bindInstitutionSource(context, input, sourceCommandDependencies());
const defaultUnbindInstitutionSource: BindingCommand = (context, input) =>
  unbindInstitutionSource(context, input, sourceCommandDependencies());
const defaultBindOpportunitySource: BindingCommand = (context, input) =>
  bindOpportunitySource(context, input, sourceCommandDependencies());
const defaultUnbindOpportunitySource: BindingCommand = (context, input) =>
  unbindOpportunitySource(context, input, sourceCommandDependencies());

function withoutCommands(dependencies: AdminSourceCommandRequestDependencies) {
  return {
    ...(dependencies.requireCurrentAdmin === undefined
      ? {}
      : { requireCurrentAdmin: dependencies.requireCurrentAdmin }),
    ...(dependencies.getAppBaseUrl === undefined
      ? {}
      : { getAppBaseUrl: dependencies.getAppBaseUrl }),
    ...(dependencies.createContext === undefined
      ? {}
      : { createContext: dependencies.createContext }),
    ...(dependencies.createErrorCorrelationId === undefined
      ? {}
      : { createErrorCorrelationId: dependencies.createErrorCorrelationId }),
  };
}

export function handleAdminMarkSourceUnavailableRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminSourceCommandRequestDependencies = {},
): Promise<Response> {
  const command =
    dependencies.markSourceUnavailable ?? defaultMarkSourceUnavailable;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: sourcePathSchema,
    bodySchema: unavailableBodySchema,
    reason: ({ body }) => UNAVAILABLE_REASONS[body.outcome],
    dependencies: withoutCommands(dependencies),
    execute: ({ context, path, body }) =>
      command(context, { sourceId: path.sourceId, ...body }),
  });
}

export function handleAdminMoveSourceRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminSourceCommandRequestDependencies = {},
): Promise<Response> {
  const command = dependencies.markSourceMoved ?? defaultMarkSourceMoved;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: sourcePathSchema,
    bodySchema: sourceMoveBodySchema,
    reason: ({ body }) => MOVE_REASONS[body.moveMode],
    dependencies: withoutCommands(dependencies),
    execute: ({ context, path, body }) =>
      command(context, { sourceId: path.sourceId, ...body }),
  });
}

export function handleAdminBindInstitutionSourceRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminSourceCommandRequestDependencies = {},
): Promise<Response> {
  const command =
    dependencies.bindInstitutionSource ?? defaultBindInstitutionSource;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: institutionPathSchema,
    bodySchema: institutionBindBodySchema,
    reason: ADMIN_SOURCE_BINDING_REASON,
    dependencies: withoutCommands(dependencies),
    execute: ({ context, path, body }) =>
      command(context, { institutionId: path.institutionId, ...body }),
  });
}

export function handleAdminUnbindInstitutionSourceRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminSourceCommandRequestDependencies = {},
): Promise<Response> {
  const command =
    dependencies.unbindInstitutionSource ?? defaultUnbindInstitutionSource;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: institutionUnbindPathSchema,
    bodySchema: emptyBodySchema,
    reason: ADMIN_SOURCE_BINDING_REASON,
    dependencies: withoutCommands(dependencies),
    execute: ({ context, path }) => command(context, path),
  });
}

export function handleAdminBindOpportunitySourceRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminSourceCommandRequestDependencies = {},
): Promise<Response> {
  const command =
    dependencies.bindOpportunitySource ?? defaultBindOpportunitySource;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: opportunityPathSchema,
    bodySchema: opportunityBindBodySchema,
    reason: ADMIN_SOURCE_BINDING_REASON,
    dependencies: withoutCommands(dependencies),
    execute: ({ context, path, body }) =>
      command(context, { opportunityId: path.opportunityId, ...body }),
  });
}

export function handleAdminUnbindOpportunitySourceRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminSourceCommandRequestDependencies = {},
): Promise<Response> {
  const command =
    dependencies.unbindOpportunitySource ?? defaultUnbindOpportunitySource;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: opportunityUnbindPathSchema,
    bodySchema: emptyBodySchema,
    reason: ADMIN_SOURCE_BINDING_REASON,
    dependencies: withoutCommands(dependencies),
    execute: ({ context, path }) => command(context, path),
  });
}
