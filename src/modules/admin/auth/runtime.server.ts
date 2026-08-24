import "server-only";

import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import {
  getAdminAuthConfig,
  getAdminLogoutConfig,
  type AdminAuthConfig,
} from "./config.server";
import type { AdminOidcFlowCookieDescriptor } from "./flow-cookie.server";
import { createAdminOidcFlowCookies } from "./flow-cookie.server";
import {
  verifyAdminIdToken,
  type VerifiedAdminIdTokenClaims,
} from "./id-token.server";
import { createTrustedJwksLoader } from "./jwks.server";
import {
  createAuthorizationCodeTokenRequest,
  fetchOidcDiscovery,
  fetchSecurityJson,
  type OidcDiscoveryMetadata,
} from "./oidc-client.server";
import { adminLoginRateLimiter } from "./rate-limit.server";
import {
  adminFlowReplayStore,
  type AdminFlowReplayStore,
} from "./replay.server";
import {
  requireActiveAdminByExternalSubject,
  type AdminPrincipal,
} from "./repository.server";
import {
  createAdminSessionCookie,
  type AdminSessionCookieDescriptor,
} from "./session.server";
import type { RateLimiter } from "@/src/modules/auth/rate-limit.server";

export type AdminAuthRuntime = Readonly<{
  config: AdminAuthConfig;
  production: boolean;
  now(): Date;
  rateLimiter: RateLimiter;
  replayStore: AdminFlowReplayStore;
  createFlowCookies(now: Date): AdminFlowCookies;
  loadDiscovery(): Promise<OidcDiscoveryMetadata>;
  exchangeAuthorizationCode(input: {
    discovery: OidcDiscoveryMetadata;
    code: string;
    codeVerifier: string;
  }): Promise<unknown>;
  verifyIdToken(input: {
    discovery: OidcDiscoveryMetadata;
    idToken: string;
    expectedNonce: string;
    flowStartedAt: number;
    now: number;
  }): Promise<VerifiedAdminIdTokenClaims>;
  requireActiveAdmin(externalAuthSubject: string): Promise<AdminPrincipal>;
  createSessionCookie(
    adminUserId: string,
    now: Date,
  ): AdminSessionCookieDescriptor;
}>;

export type AdminLogoutRuntime = Readonly<{
  appBaseUrl: string;
  production: boolean;
}>;

export type AdminFlowCookies = Readonly<{
  flowId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  cookies: {
    state: AdminOidcFlowCookieDescriptor;
    nonce: AdminOidcFlowCookieDescriptor;
    pkce: AdminOidcFlowCookieDescriptor;
  };
}>;

export async function exchangeAdminAuthorizationCode(input: {
  config: AdminAuthConfig;
  discovery: OidcDiscoveryMetadata;
  code: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}): Promise<unknown> {
  const request = createAuthorizationCodeTokenRequest({
    config: input.config,
    code: input.code,
    codeVerifier: input.codeVerifier,
  });
  const headers = new Headers(request.headers);
  headers.set("accept", "application/json");
  return fetchSecurityJson(
    input.discovery.token_endpoint,
    { ...request, headers },
    input.fetchImpl,
  );
}

let adminAuthRuntime: AdminAuthRuntime | undefined;

export function getAdminAuthRuntime(): AdminAuthRuntime {
  if (adminAuthRuntime) return adminAuthRuntime;

  const config = getAdminAuthConfig();
  const executor = getRuntimeDatabase().executor;
  const production = process.env.NODE_ENV === "production";
  let jwks:
    | {
        uri: string;
        loader: ReturnType<typeof createTrustedJwksLoader>;
      }
    | undefined;

  adminAuthRuntime = {
    config,
    production,
    now: () => new Date(),
    rateLimiter: adminLoginRateLimiter,
    replayStore: adminFlowReplayStore,
    createFlowCookies: (now) =>
      createAdminOidcFlowCookies({
        secret: config.ADMIN_OIDC_FLOW_SECRET,
        now,
        production,
      }),
    loadDiscovery: () =>
      fetchOidcDiscovery({
        issuer: config.ADMIN_AUTH_ISSUER,
        production,
      }),
    exchangeAuthorizationCode: (input) =>
      exchangeAdminAuthorizationCode({ config, ...input }),
    verifyIdToken: async (input) => {
      if (!jwks || jwks.uri !== input.discovery.jwks_uri) {
        jwks = {
          uri: input.discovery.jwks_uri,
          loader: createTrustedJwksLoader({ discovery: input.discovery }),
        };
      }
      return verifyAdminIdToken({
        idToken: input.idToken,
        jwks: jwks.loader,
        expectedIssuer: config.ADMIN_AUTH_ISSUER,
        clientId: config.ADMIN_AUTH_CLIENT_ID,
        expectedNonce: input.expectedNonce,
        flowStartedAt: input.flowStartedAt,
        now: input.now,
      });
    },
    requireActiveAdmin: (externalAuthSubject) =>
      requireActiveAdminByExternalSubject(executor, externalAuthSubject),
    createSessionCookie: (adminUserId, now) =>
      createAdminSessionCookie(adminUserId, {
        secret: config.ADMIN_SESSION_SECRET,
        now,
        production,
      }),
  };
  return adminAuthRuntime;
}

export function getAdminLogoutRuntime(): AdminLogoutRuntime {
  const config = getAdminLogoutConfig();
  return {
    appBaseUrl: config.APP_BASE_URL,
    production: process.env.NODE_ENV === "production",
  };
}
