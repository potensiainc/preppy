import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";

import {
  openSecureCookie,
  sealSecureCookie,
  secureCookieAttributes,
  type SecureCookieAttributes,
} from "@/src/modules/auth/secure-cookie.server";

export const ADMIN_OIDC_STATE_COOKIE_NAME = "preppy_admin_oidc_state";
export const ADMIN_OIDC_NONCE_COOKIE_NAME = "preppy_admin_oidc_nonce";
export const ADMIN_OIDC_PKCE_COOKIE_NAME = "preppy_admin_oidc_pkce";
export const ADMIN_OIDC_STATE_COOKIE_PURPOSE = "admin-oidc-state";
export const ADMIN_OIDC_NONCE_COOKIE_PURPOSE = "admin-oidc-nonce";
export const ADMIN_OIDC_PKCE_COOKIE_PURPOSE = "admin-oidc-pkce";
export const ADMIN_OIDC_FLOW_TTL_SECONDS = 10 * 60;

const randomCapability = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const flowBinding = {
  version: z.literal(1),
  flowId: randomCapability,
  flowStartedAt: z.number().int().safe().nonnegative(),
};
const adminOidcStatePayloadSchema = z
  .object({ ...flowBinding, state: randomCapability })
  .strict();
const adminOidcNoncePayloadSchema = z
  .object({ ...flowBinding, nonce: randomCapability })
  .strict();
const adminOidcPkcePayloadSchema = z
  .object({
    ...flowBinding,
    codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  })
  .strict();

export type AdminOidcStatePayload = z.output<
  typeof adminOidcStatePayloadSchema
>;
export type AdminOidcNoncePayload = z.output<
  typeof adminOidcNoncePayloadSchema
>;
export type AdminOidcPkcePayload = z.output<typeof adminOidcPkcePayloadSchema>;

type FlowCookieAttributes = SecureCookieAttributes<"/admin/auth">;

export type AdminOidcFlowCookieDescriptor = {
  name:
    | typeof ADMIN_OIDC_STATE_COOKIE_NAME
    | typeof ADMIN_OIDC_NONCE_COOKIE_NAME
    | typeof ADMIN_OIDC_PKCE_COOKIE_NAME;
  value: string;
  attributes: FlowCookieAttributes;
};

export type ClearAdminOidcFlowCookieDescriptor = Omit<
  AdminOidcFlowCookieDescriptor,
  "value" | "attributes"
> & {
  value: "";
  attributes: Omit<FlowCookieAttributes, "maxAge"> & { maxAge: 0 };
};

type FlowCookieOptions = {
  secret: string;
  now?: Date;
  production?: boolean;
};

type ReadFlowCookieOptions = Pick<FlowCookieOptions, "secret" | "now">;

function attributes(options: { production?: boolean }): FlowCookieAttributes {
  return secureCookieAttributes({
    maxAgeSeconds: ADMIN_OIDC_FLOW_TTL_SECONDS,
    production: options.production,
    path: "/admin/auth",
  });
}

function sealFlowCookie(
  payload: AdminOidcStatePayload | AdminOidcNoncePayload | AdminOidcPkcePayload,
  purpose: string,
  options: FlowCookieOptions,
): string {
  return sealSecureCookie(payload, {
    purpose,
    secret: options.secret,
    ttlSeconds: ADMIN_OIDC_FLOW_TTL_SECONDS,
    now: options.now,
    maxPlaintextBytes: 512,
    maxTokenBytes: 1_024,
  });
}

export function createAdminOidcStateCookie(
  payload: AdminOidcStatePayload,
  options: FlowCookieOptions,
): AdminOidcFlowCookieDescriptor {
  const parsed = adminOidcStatePayloadSchema.parse(payload);
  return {
    name: ADMIN_OIDC_STATE_COOKIE_NAME,
    value: sealFlowCookie(parsed, ADMIN_OIDC_STATE_COOKIE_PURPOSE, options),
    attributes: attributes(options),
  };
}

export function createAdminOidcNonceCookie(
  payload: AdminOidcNoncePayload,
  options: FlowCookieOptions,
): AdminOidcFlowCookieDescriptor {
  const parsed = adminOidcNoncePayloadSchema.parse(payload);
  return {
    name: ADMIN_OIDC_NONCE_COOKIE_NAME,
    value: sealFlowCookie(parsed, ADMIN_OIDC_NONCE_COOKIE_PURPOSE, options),
    attributes: attributes(options),
  };
}

export function createAdminOidcPkceCookie(
  payload: AdminOidcPkcePayload,
  options: FlowCookieOptions,
): AdminOidcFlowCookieDescriptor {
  const parsed = adminOidcPkcePayloadSchema.parse(payload);
  return {
    name: ADMIN_OIDC_PKCE_COOKIE_NAME,
    value: sealFlowCookie(parsed, ADMIN_OIDC_PKCE_COOKIE_PURPOSE, options),
    attributes: attributes(options),
  };
}

export function createAdminOidcFlowCookies(options: FlowCookieOptions): {
  flowId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  cookies: {
    state: AdminOidcFlowCookieDescriptor;
    nonce: AdminOidcFlowCookieDescriptor;
    pkce: AdminOidcFlowCookieDescriptor;
  };
} {
  const flowStartedAt = Math.floor(
    (options.now ?? new Date()).getTime() / 1_000,
  );
  const flowId = randomBytes(32).toString("base64url");
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const binding = { version: 1 as const, flowId, flowStartedAt };

  return {
    flowId,
    state,
    nonce,
    codeVerifier,
    cookies: {
      state: createAdminOidcStateCookie({ ...binding, state }, options),
      nonce: createAdminOidcNonceCookie({ ...binding, nonce }, options),
      pkce: createAdminOidcPkceCookie({ ...binding, codeVerifier }, options),
    },
  };
}

export function readAdminOidcStateCookie(
  cookieValue: string | null | undefined,
  options: ReadFlowCookieOptions,
): AdminOidcStatePayload | null {
  const parsed = adminOidcStatePayloadSchema.safeParse(
    openSecureCookie(cookieValue, {
      purpose: ADMIN_OIDC_STATE_COOKIE_PURPOSE,
      secret: options.secret,
      now: options.now,
      maxPlaintextBytes: 512,
      maxTokenBytes: 1_024,
    }),
  );
  return parsed.success ? parsed.data : null;
}

export function readAdminOidcNonceCookie(
  cookieValue: string | null | undefined,
  options: ReadFlowCookieOptions,
): AdminOidcNoncePayload | null {
  const parsed = adminOidcNoncePayloadSchema.safeParse(
    openSecureCookie(cookieValue, {
      purpose: ADMIN_OIDC_NONCE_COOKIE_PURPOSE,
      secret: options.secret,
      now: options.now,
      maxPlaintextBytes: 512,
      maxTokenBytes: 1_024,
    }),
  );
  return parsed.success ? parsed.data : null;
}

export function readAdminOidcPkceCookie(
  cookieValue: string | null | undefined,
  options: ReadFlowCookieOptions,
): AdminOidcPkcePayload | null {
  const parsed = adminOidcPkcePayloadSchema.safeParse(
    openSecureCookie(cookieValue, {
      purpose: ADMIN_OIDC_PKCE_COOKIE_PURPOSE,
      secret: options.secret,
      now: options.now,
      maxPlaintextBytes: 512,
      maxTokenBytes: 1_024,
    }),
  );
  return parsed.success ? parsed.data : null;
}

function clearFlowCookie(
  name: ClearAdminOidcFlowCookieDescriptor["name"],
  options: { production?: boolean },
): ClearAdminOidcFlowCookieDescriptor {
  return {
    name,
    value: "",
    attributes: { ...attributes(options), maxAge: 0 },
  };
}

export function clearAdminOidcStateCookie(
  options: { production?: boolean } = {},
): ClearAdminOidcFlowCookieDescriptor {
  return clearFlowCookie(ADMIN_OIDC_STATE_COOKIE_NAME, options);
}

export function clearAdminOidcNonceCookie(
  options: { production?: boolean } = {},
): ClearAdminOidcFlowCookieDescriptor {
  return clearFlowCookie(ADMIN_OIDC_NONCE_COOKIE_NAME, options);
}

export function clearAdminOidcPkceCookie(
  options: { production?: boolean } = {},
): ClearAdminOidcFlowCookieDescriptor {
  return clearFlowCookie(ADMIN_OIDC_PKCE_COOKIE_NAME, options);
}

export function clearAdminOidcFlowCookies(
  options: { production?: boolean } = {},
): readonly ClearAdminOidcFlowCookieDescriptor[] {
  return [
    clearAdminOidcStateCookie(options),
    clearAdminOidcNonceCookie(options),
    clearAdminOidcPkceCookie(options),
  ];
}
