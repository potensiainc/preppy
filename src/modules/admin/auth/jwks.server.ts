import "server-only";

import { createPublicKey, type KeyObject } from "node:crypto";

import { z } from "zod";

import type { OidcDiscoveryMetadata } from "./oidc-client.server";
import { fetchSecurityJson } from "./oidc-client.server";

const JWKS_CACHE_TTL_MS = 5 * 60 * 1_000;

const jwkSchema = z.object({
  kty: z.string(),
  kid: z.string().max(256).optional(),
  use: z.string().optional(),
  key_ops: z.array(z.string()).optional(),
  alg: z.string().optional(),
  n: z.string().optional(),
  e: z.string().optional(),
});

const jwksSchema = z.object({
  keys: z.array(jwkSchema).max(50),
});

type TrustedJwk = z.infer<typeof jwkSchema>;

const canonicalBase64Url = /^[A-Za-z0-9_-]+$/;

export class TrustedJwksError extends Error {
  readonly name = "TrustedJwksError";

  constructor() {
    super("OIDC signing keys are unavailable");
  }
}

export type TrustedJwksLoader = Readonly<{
  getRsaSigningKey(kid: string): Promise<KeyObject>;
}>;

export function createTrustedJwksLoader(options: {
  discovery: Pick<OidcDiscoveryMetadata, "jwks_uri">;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
}): TrustedJwksLoader {
  const nowMs = options.nowMs ?? Date.now;
  let cache:
    Readonly<{ keys: readonly TrustedJwk[]; expiresAt: number }> | undefined;

  const loadKeys = async (
    forceRefresh: boolean,
  ): Promise<readonly TrustedJwk[]> => {
    if (!forceRefresh && cache !== undefined && nowMs() < cache.expiresAt) {
      return cache.keys;
    }
    const parsed = jwksSchema.parse(
      await fetchSecurityJson(
        options.discovery.jwks_uri,
        { headers: { accept: "application/json" } },
        options.fetchImpl,
      ),
    );
    cache = {
      keys: parsed.keys,
      expiresAt: nowMs() + JWKS_CACHE_TTL_MS,
    };
    return cache.keys;
  };

  const toEligibleRsaKey = (
    jwk: TrustedJwk,
    kid: string,
  ): KeyObject | undefined => {
    if (
      jwk.kid !== kid ||
      jwk.kty !== "RSA" ||
      (jwk.use !== undefined && jwk.use !== "sig") ||
      (jwk.key_ops !== undefined && !jwk.key_ops.includes("verify")) ||
      (jwk.alg !== undefined && jwk.alg !== "RS256") ||
      jwk.n === undefined ||
      jwk.e === undefined ||
      !canonicalBase64Url.test(jwk.n) ||
      !canonicalBase64Url.test(jwk.e) ||
      Buffer.from(jwk.n, "base64url").toString("base64url") !== jwk.n ||
      Buffer.from(jwk.e, "base64url").toString("base64url") !== jwk.e
    ) {
      return undefined;
    }

    try {
      return createPublicKey({
        format: "jwk",
        key: { kty: "RSA", n: jwk.n, e: jwk.e },
      });
    } catch {
      return undefined;
    }
  };

  const selectKey = (
    keys: readonly TrustedJwk[],
    kid: string,
  ): KeyObject | undefined => {
    const eligibleKeys = keys.flatMap((jwk) => {
      const key = toEligibleRsaKey(jwk, kid);
      return key === undefined ? [] : [key];
    });
    if (eligibleKeys.length === 0) return undefined;
    if (eligibleKeys.length !== 1) throw new TrustedJwksError();
    return eligibleKeys[0];
  };

  return {
    async getRsaSigningKey(kid: string): Promise<KeyObject> {
      try {
        let key = selectKey(await loadKeys(false), kid);
        if (key === undefined) key = selectKey(await loadKeys(true), kid);
        if (key === undefined) throw new TrustedJwksError();
        return key;
      } catch {
        throw new TrustedJwksError();
      }
    },
  };
}
