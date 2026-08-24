import "server-only";

import { z } from "zod";

import { NoopAnalyticsTracker } from "@/src/analytics/tracker";
import type { AdminCommandContext } from "@/src/application/context";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { getAdminLogoutConfig } from "@/src/modules/admin/auth/config.server";
import {
  runAdminCommandRequest,
  type AdminCommandRequestDependencies,
} from "@/src/modules/admin/http/command-handler.server";
import { reconcileUnknownResendAttempt } from "@/src/modules/notification/reconcile-resend.server";
import { getResendSendConfig } from "@/src/modules/notification/resend-config.server";
import { ResendEmailSender } from "@/src/modules/notification/resend-email-sender.server";
import {
  cancelAdminOutboxEvent,
  retryAdminOutboxEvent,
} from "@/src/modules/outbox/admin-commands.server";

const outboxPathSchema = z.object({ eventId: z.uuid() }).strict();
const deliveryPathSchema = z.object({ deliveryId: z.uuid() }).strict();
const outboxStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
  "CANCELLED",
  "DEAD_LETTER",
]);
const outboxBodySchema = z
  .object({
    expectedStatus: outboxStatusSchema,
    expectedAttemptCount: z.number().int().min(0).max(2_147_483_647),
  })
  .strict();
const reconcileBodySchema = z.object({ expectedAttemptId: z.uuid() }).strict();

type OutboxCommand = (
  context: AdminCommandContext,
  input: {
    eventId: string;
    expectedStatus: z.output<typeof outboxStatusSchema>;
    expectedAttemptCount: number;
  },
) => Promise<unknown>;
type ReconcileCommand = (
  context: AdminCommandContext,
  input: { deliveryId: string; expectedAttemptId: string },
) => Promise<unknown>;

export type AdminOutboxOperationsRequestDependencies =
  Partial<AdminCommandRequestDependencies> & {
    retryOutbox?: OutboxCommand;
    cancelOutbox?: OutboxCommand;
    reconcileResend?: ReconcileCommand;
  };

function defaultRetry(
  context: AdminCommandContext,
  input: Parameters<OutboxCommand>[1],
) {
  return retryAdminOutboxEvent(context, input, {
    transactionManager: getRuntimeDatabase().transactionManager,
  });
}

function defaultCancel(
  context: AdminCommandContext,
  input: Parameters<OutboxCommand>[1],
) {
  return cancelAdminOutboxEvent(context, input, {
    transactionManager: getRuntimeDatabase().transactionManager,
  });
}

function defaultReconcile(
  context: AdminCommandContext,
  input: Parameters<ReconcileCommand>[1],
) {
  return reconcileUnknownResendAttempt(context, input, {
    transactionManager: getRuntimeDatabase().transactionManager,
    sender: new ResendEmailSender(getResendSendConfig()),
    tracker: new NoopAnalyticsTracker(),
    appBaseUrl: getAdminLogoutConfig().APP_BASE_URL,
  });
}

export function handleAdminRetryOutboxRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminOutboxOperationsRequestDependencies = {},
) {
  const { retryOutbox: command = defaultRetry, ...pipeline } = dependencies;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: outboxPathSchema,
    bodySchema: outboxBodySchema,
    reason: "ADMIN_RETRY_OUTBOX",
    dependencies: pipeline,
    execute: ({ context, path, body }) =>
      command(context, { eventId: path.eventId, ...body }),
  });
}

export function handleAdminCancelOutboxRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminOutboxOperationsRequestDependencies = {},
) {
  const { cancelOutbox: command = defaultCancel, ...pipeline } = dependencies;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: outboxPathSchema,
    bodySchema: outboxBodySchema,
    reason: "ADMIN_CANCEL_OUTBOX",
    dependencies: pipeline,
    execute: ({ context, path, body }) =>
      command(context, { eventId: path.eventId, ...body }),
  });
}

export function handleAdminReconcileResendRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminOutboxOperationsRequestDependencies = {},
) {
  const { reconcileResend: command = defaultReconcile, ...pipeline } =
    dependencies;
  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: deliveryPathSchema,
    bodySchema: reconcileBodySchema,
    reason: "ADMIN_RECONCILE_RESEND",
    dependencies: pipeline,
    execute: ({ context, path, body }) =>
      command(context, { deliveryId: path.deliveryId, ...body }),
  });
}
