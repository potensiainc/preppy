import { z } from "zod";

const safeCode = z.string().regex(/^[A-Z][A-Z0-9._:-]{0,127}$/);
const safeEntityId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

const operationalLogSchema = z
  .object({
    correlationId: z.uuid().nullable().optional(),
    eventType: safeCode,
    entityType: safeCode.nullable().optional(),
    entityId: safeEntityId.nullable().optional(),
    status: safeCode.nullable().optional(),
    errorCode: safeCode.nullable().optional(),
    durationMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
    attemptCount: z.number().int().min(0).max(10_000).nullable().optional(),
    workerId: safeEntityId.nullable().optional(),
  })
  .strict();

export type OperationalLog = z.output<typeof operationalLogSchema>;

export function buildOperationalLog(value: unknown): OperationalLog {
  const parsed = operationalLogSchema.safeParse(value);
  if (!parsed.success) throw new Error("Invalid operational log input.");
  return parsed.data;
}
