import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import {
  openSecureCookie,
  sealSecureCookie,
  secureCookieAttributes,
} from "@/src/modules/auth/secure-cookie.server";

export const OAUTH_STATE_COOKIE_NAME = "preppy_oauth_state";
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const OAUTH_STATE_PURPOSE = "oauth-state";
const oauthStatePayloadSchema = z
  .object({
    version: z.literal(1),
    stateHash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    returnTo: z.literal("/my-preppy/settings").optional(),
  })
  .strict();

export const oauthStateCookieAttributes = secureCookieAttributes({
  maxAgeSeconds: OAUTH_STATE_TTL_SECONDS,
});

function hashState(state: string): Buffer {
  return createHash("sha256").update(state, "utf8").digest();
}

export function createOAuthState(options: {
  secret: string;
  now?: Date;
  returnTo?: "/my-preppy/settings";
}): {
  state: string;
  cookieValue: string;
} {
  const state = randomBytes(32).toString("base64url");
  return {
    state,
    cookieValue: sealSecureCookie(
      {
        version: 1,
        stateHash: hashState(state).toString("base64url"),
        ...(options.returnTo === "/my-preppy/settings"
          ? { returnTo: options.returnTo }
          : {}),
      },
      {
        purpose: OAUTH_STATE_PURPOSE,
        secret: options.secret,
        ttlSeconds: OAUTH_STATE_TTL_SECONDS,
        now: options.now,
        maxPlaintextBytes: 384,
        maxTokenBytes: 768,
      },
    ),
  };
}

export function validateOAuthState(options: {
  browserState: string | null | undefined;
  cookieValue: string | null | undefined;
  secret: string;
  now?: Date;
}): boolean {
  if (
    !options.browserState ||
    !/^[A-Za-z0-9_-]{43}$/.test(options.browserState)
  ) {
    return false;
  }
  const parsed = oauthStatePayloadSchema.safeParse(
    openSecureCookie(options.cookieValue, {
      purpose: OAUTH_STATE_PURPOSE,
      secret: options.secret,
      now: options.now,
      maxPlaintextBytes: 384,
      maxTokenBytes: 768,
    }),
  );
  if (!parsed.success) return false;

  const expected = Buffer.from(parsed.data.stateHash, "base64url");
  const actual = hashState(options.browserState);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Read only a protected return destination; callback must validate state first. */
export function readOAuthReturnTo(
  cookieValue: string | null | undefined,
  options: { secret: string; now?: Date },
): "/my-preppy/settings" | null {
  const parsed = oauthStatePayloadSchema.safeParse(
    openSecureCookie(cookieValue, {
      purpose: OAUTH_STATE_PURPOSE,
      secret: options.secret,
      now: options.now,
      maxPlaintextBytes: 384,
      maxTokenBytes: 768,
    }),
  );
  return parsed.success ? (parsed.data.returnTo ?? null) : null;
}
