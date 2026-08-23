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
  })
  .strict();

export const oauthStateCookieAttributes = secureCookieAttributes({
  maxAgeSeconds: OAUTH_STATE_TTL_SECONDS,
});

function hashState(state: string): Buffer {
  return createHash("sha256").update(state, "utf8").digest();
}

export function createOAuthState(options: { secret: string; now?: Date }): {
  state: string;
  cookieValue: string;
} {
  const state = randomBytes(32).toString("base64url");
  return {
    state,
    cookieValue: sealSecureCookie(
      { version: 1, stateHash: hashState(state).toString("base64url") },
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
