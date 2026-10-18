import { z } from "zod";

// Notification delivery is independent of the public significance of a change.
export const correctionReasons = [
  "CORRECTION_DATES_NO_NOTIFY",
  "CORRECTION_STATUS_NO_NOTIFY",
  "CORRECTION_SOURCE_NO_NOTIFY",
  "CORRECTION_CONTENT_NO_NOTIFY",
] as const;

export const adminCorrectionSchema = z
  .object({
    mode: z.literal("ADMIN_CORRECTION_NO_NOTIFY"),
    reason: z.enum(correctionReasons),
  })
  .strict();

export type AdminCorrection = z.infer<typeof adminCorrectionSchema>;
