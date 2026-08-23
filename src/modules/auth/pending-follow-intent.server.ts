import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";

import { isSafeRedirectPath } from "@/src/modules/auth/safe-redirect";
import {
  openSecureCookie,
  sealSecureCookie,
  secureCookieAttributes,
} from "@/src/modules/auth/secure-cookie.server";

export const PENDING_FOLLOW_INTENT_COOKIE_NAME = "preppy_follow_intent";
export const PENDING_FOLLOW_INTENT_TTL_SECONDS = 60 * 60;
const FOLLOW_INTENT_PURPOSE = "pending-follow-intent";
const MAX_FOLLOW_INTENT_COOKIE_BYTES = 1_023;

const canonicalUuid = z.uuid().transform((value) => value.toLowerCase());
const safeReturnPath = z
  .string()
  .max(256)
  .refine(isSafeRedirectPath, "Return path is not an allowlisted PREPPY route");

const pendingFollowInputSchema = z
  .object({
    institutionId: canonicalUuid,
    context: z.enum(["INSTITUTION", "ARTICLE", "OPPORTUNITY"]),
    articleId: canonicalUuid.optional(),
    opportunityId: canonicalUuid.optional(),
    returnPath: safeReturnPath,
  })
  .strict();

const pendingFollowIntentSchema = pendingFollowInputSchema
  .extend({
    version: z.literal(1),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
    issuedAt: z.number().int().safe().nonnegative(),
    expiresAt: z.number().int().safe().positive(),
  })
  .strict()
  .refine((intent) => intent.expiresAt > intent.issuedAt, {
    message: "Intent expiry must be after issue time",
  });

export type PendingFollowIntentInput = z.input<typeof pendingFollowInputSchema>;
export type PendingFollowIntent = z.output<typeof pendingFollowIntentSchema>;

export const pendingFollowIntentCookieAttributes = secureCookieAttributes({
  maxAgeSeconds: PENDING_FOLLOW_INTENT_TTL_SECONDS,
});

export function createPendingFollowIntent(
  input: PendingFollowIntentInput,
  options: { secret: string; now?: Date },
): string {
  const parsed = pendingFollowInputSchema.parse(input);
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1_000);
  const intent = pendingFollowIntentSchema.parse({
    version: 1,
    ...parsed,
    nonce: randomBytes(24).toString("base64url"),
    issuedAt,
    expiresAt: issuedAt + PENDING_FOLLOW_INTENT_TTL_SECONDS,
  });
  return sealSecureCookie(intent, {
    purpose: FOLLOW_INTENT_PURPOSE,
    secret: options.secret,
    ttlSeconds: PENDING_FOLLOW_INTENT_TTL_SECONDS,
    now: options.now,
    maxPlaintextBytes: 700,
    maxTokenBytes: MAX_FOLLOW_INTENT_COOKIE_BYTES,
  });
}

export function readPendingFollowIntent(
  cookieValue: string | null | undefined,
  options: { secret: string; now?: Date },
): PendingFollowIntent | null {
  const parsed = pendingFollowIntentSchema.safeParse(
    openSecureCookie(cookieValue, {
      purpose: FOLLOW_INTENT_PURPOSE,
      secret: options.secret,
      now: options.now,
      maxPlaintextBytes: 700,
      maxTokenBytes: MAX_FOLLOW_INTENT_COOKIE_BYTES,
    }),
  );
  if (!parsed.success) return null;

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1_000);
  return nowSeconds >= parsed.data.expiresAt ? null : parsed.data;
}
