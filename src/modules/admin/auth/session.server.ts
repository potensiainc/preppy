import "server-only";

import { z } from "zod";

import {
  openSecureCookieWithMetadata,
  sealSecureCookie,
  secureCookieAttributes,
  type SecureCookieAttributes,
} from "@/src/modules/auth/secure-cookie.server";

export const ADMIN_SESSION_COOKIE_NAME = "preppy_admin_session";
export const ADMIN_SESSION_COOKIE_PURPOSE = "admin-session";
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

const adminSessionSchema = z
  .object({
    version: z.literal(1),
    adminUserId: z.uuid().transform((value) => value.toLowerCase()),
    issuedAt: z.number().int().safe().nonnegative(),
    expiresAt: z.number().int().safe().positive(),
  })
  .strict()
  .refine(
    (session) =>
      session.expiresAt > session.issuedAt &&
      session.expiresAt - session.issuedAt === ADMIN_SESSION_TTL_SECONDS,
    { message: "Admin session timestamps are invalid" },
  );

export type AdminSession = z.output<typeof adminSessionSchema>;

export type AdminSessionCookieDescriptor = {
  name: typeof ADMIN_SESSION_COOKIE_NAME;
  value: string;
  attributes: SecureCookieAttributes;
};

export type ClearAdminSessionCookieDescriptor = {
  name: typeof ADMIN_SESSION_COOKIE_NAME;
  value: "";
  attributes: Omit<SecureCookieAttributes, "maxAge"> & { maxAge: 0 };
};

export function createAdminSessionCookie(
  adminUserId: string,
  options: { secret: string; now?: Date; production?: boolean },
): AdminSessionCookieDescriptor {
  const now = options.now ?? new Date();
  const issuedAt = Math.floor(now.getTime() / 1_000);
  const session = adminSessionSchema.parse({
    version: 1,
    adminUserId,
    issuedAt,
    expiresAt: issuedAt + ADMIN_SESSION_TTL_SECONDS,
  });

  return {
    name: ADMIN_SESSION_COOKIE_NAME,
    value: sealSecureCookie(session, {
      purpose: ADMIN_SESSION_COOKIE_PURPOSE,
      secret: options.secret,
      ttlSeconds: ADMIN_SESSION_TTL_SECONDS,
      now,
      maxPlaintextBytes: 256,
      maxTokenBytes: 768,
    }),
    attributes: secureCookieAttributes({
      maxAgeSeconds: ADMIN_SESSION_TTL_SECONDS,
      production: options.production,
    }),
  };
}

export function readAdminSession(
  cookieValue: string | null | undefined,
  options: { secret: string; now?: Date },
): AdminSession | null {
  const opened = openSecureCookieWithMetadata(cookieValue, {
    purpose: ADMIN_SESSION_COOKIE_PURPOSE,
    secret: options.secret,
    now: options.now,
    maxPlaintextBytes: 256,
    maxTokenBytes: 768,
  });
  if (!opened) return null;

  const parsed = adminSessionSchema.safeParse(opened.payload);
  if (
    !parsed.success ||
    parsed.data.issuedAt !== opened.issuedAt ||
    parsed.data.expiresAt !== opened.expiresAt
  ) {
    return null;
  }
  return parsed.data;
}

export function clearAdminSessionCookie(
  options: { production?: boolean } = {},
): ClearAdminSessionCookieDescriptor {
  return {
    name: ADMIN_SESSION_COOKIE_NAME,
    value: "",
    attributes: {
      ...secureCookieAttributes({
        maxAgeSeconds: ADMIN_SESSION_TTL_SECONDS,
        production: options.production,
      }),
      maxAge: 0,
    },
  };
}
