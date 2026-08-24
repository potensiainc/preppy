import "server-only";

import { z } from "zod";

import type { AdminCommandContext } from "@/src/application/context";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import type { ConfirmNoChangeResult } from "@/src/modules/monitoring/source-commands.server";
import { confirmNoChange } from "@/src/modules/monitoring/source-commands.server";
import {
  runAdminCommandRequest,
  type AdminCommandRequestDependencies,
} from "@/src/modules/admin/http/command-handler.server";

const noChangePathSchema = z.object({ sourceId: z.uuid() }).strict();
const noChangeBodySchema = z
  .object({
    note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const ADMIN_CONFIRM_NO_CHANGE_REASON = "ADMIN_CONFIRM_NO_CHANGE";

type ConfirmNoChangeCommand = (
  context: AdminCommandContext,
  input: { sourceId: string; note?: string },
) => Promise<ConfirmNoChangeResult>;

export type AdminNoChangeRequestDependencies =
  Partial<AdminCommandRequestDependencies> & {
    confirmNoChange?: ConfirmNoChangeCommand;
  };

function defaultConfirmNoChange(
  context: AdminCommandContext,
  input: { sourceId: string; note?: string },
): Promise<ConfirmNoChangeResult> {
  return confirmNoChange(context, input, {
    transactionManager: getRuntimeDatabase().transactionManager,
  });
}

export function handleAdminNoChangeRequest(
  request: Request,
  rawPath: unknown,
  dependencies: AdminNoChangeRequestDependencies = {},
): Promise<Response> {
  const { confirmNoChange: command = defaultConfirmNoChange, ...pipeline } =
    dependencies;

  return runAdminCommandRequest({
    request,
    rawPath,
    pathSchema: noChangePathSchema,
    bodySchema: noChangeBodySchema,
    reason: ADMIN_CONFIRM_NO_CHANGE_REASON,
    dependencies: pipeline,
    execute: ({ context, path, body }) =>
      command(context, {
        sourceId: path.sourceId,
        ...(body.note === undefined ? {} : { note: body.note }),
      }),
  });
}
