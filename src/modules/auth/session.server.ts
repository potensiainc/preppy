import "server-only";

import { z } from "zod";

import {
  openSecureCookie,
  sealSecureCookie,
  secureCookieAttributes,
  type SecureCookieAttributes,
} from "@/src/modules/auth/secure-cookie.server";

export const USER_SESSION_COOKIE_NAME = "preppy_user_session";
export const USER_SESSION_TTL_SECONDS = 24 * 60 * 60;
const USER_SESSION_PURPOSE = "user-session";

const userSessionSchema = z
  .object({
    version: z.literal(1),
    userId: z.uuid().transform((value) => value.toLowerCase()),
    issuedAt: z.number().int().safe().nonnegative(),
    expiresAt: z.number().int().safe().positive(),
  })
  .strict()
  .refine(
    (session) =>
      session.expiresAt > session.issuedAt &&
      session.expiresAt - session.issuedAt === USER_SESSION_TTL_SECONDS,
    { message: "Session timestamps are invalid" },
  );

export type UserSession = z.output<typeof userSessionSchema>;

export type UserSessionCookieDescriptor = {
  name: typeof USER_SESSION_COOKIE_NAME;
  value: string;
  attributes: SecureCookieAttributes;
};

export type ClearUserSessionCookieDescriptor = {
  name: typeof USER_SESSION_COOKIE_NAME;
  value: "";
  attributes: Omit<SecureCookieAttributes, "maxAge"> & { maxAge: 0 };
};

export function createUserSessionCookie(
  userId: string,
  options: { secret: string; now?: Date; production?: boolean },
): UserSessionCookieDescriptor {
  const canonicalUserId = z.uuid().parse(userId).toLowerCase();
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1_000);
  const session = userSessionSchema.parse({
    version: 1,
    userId: canonicalUserId,
    issuedAt,
    expiresAt: issuedAt + USER_SESSION_TTL_SECONDS,
  });

  return {
    name: USER_SESSION_COOKIE_NAME,
    value: sealSecureCookie(session, {
      purpose: USER_SESSION_PURPOSE,
      secret: options.secret,
      ttlSeconds: USER_SESSION_TTL_SECONDS,
      now: options.now,
      maxPlaintextBytes: 256,
      maxTokenBytes: 768,
    }),
    attributes: secureCookieAttributes({
      maxAgeSeconds: USER_SESSION_TTL_SECONDS,
      production: options.production,
    }),
  };
}

export function readUserSession(
  cookieValue: string | null | undefined,
  options: { secret: string; now?: Date },
): UserSession | null {
  const parsed = userSessionSchema.safeParse(
    openSecureCookie(cookieValue, {
      purpose: USER_SESSION_PURPOSE,
      secret: options.secret,
      now: options.now,
      maxPlaintextBytes: 256,
      maxTokenBytes: 768,
    }),
  );
  if (!parsed.success) return null;

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1_000);
  return nowSeconds >= parsed.data.expiresAt ? null : parsed.data;
}

export function clearUserSessionCookie(
  options: {
    production?: boolean;
  } = {},
): ClearUserSessionCookieDescriptor {
  return {
    name: USER_SESSION_COOKIE_NAME,
    value: "",
    attributes: {
      ...secureCookieAttributes({
        maxAgeSeconds: USER_SESSION_TTL_SECONDS,
        production: options.production,
      }),
      maxAge: 0,
    },
  };
}
