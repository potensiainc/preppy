import "server-only";

import { z } from "zod";

import {
  createAdminCommandContext,
  type AdminCommandContext,
} from "@/src/application/context";
import { ValidationError } from "@/src/application/errors";

const canonicalReasonSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);

export type CreateServerAdminCommandContextInput = Readonly<{
  adminUserId: string;
  reason: string;
}>;

export function createServerAdminCommandContext(
  input: CreateServerAdminCommandContextInput,
): AdminCommandContext {
  const parsed = z
    .object({
      adminUserId: z.uuid(),
      reason: canonicalReasonSchema,
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);

  const occurredAt = new Date();
  return createAdminCommandContext({
    adminUserId: parsed.data.adminUserId,
    reason: parsed.data.reason,
    occurredAt,
  });
}
