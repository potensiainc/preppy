import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import type { AdminAuthConfig } from "./config.server";
import { parseSecurityJson } from "./security-json.server";

const SECURITY_JSON_MAX_BYTES = 64 * 1_024;
const SECURITY_JSON_TIMEOUT_MS = 5_000;
const pkceVerifierSchema = z
  .string()
  .min(43)
  .max(128)
  .regex(/^[A-Za-z0-9._~-]+$/);

const discoveryMetadataSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  jwks_uri: z.string(),
  response_types_supported: z.array(z.string()),
  id_token_signing_alg_values_supported: z.array(z.string()),
  grant_types_supported: z.array(z.string()).optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
  response_modes_supported: z.array(z.string()).optional(),
});

export type OidcDiscoveryMetadata = z.infer<typeof discoveryMetadataSchema>;

export type PkcePair = Readonly<{
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
}>;

export function createS256CodeChallenge(codeVerifier: string): string {
  const verifier = pkceVerifierSchema.parse(codeVerifier);
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function createPkcePair(): PkcePair {
  const codeVerifier = randomBytes(32).toString("base64url");
  return {
    codeVerifier,
    codeChallenge: createS256CodeChallenge(codeVerifier),
    codeChallengeMethod: "S256",
  };
}

function formEncodeCredential(value: string): string {
  return new URLSearchParams({ credential: value })
    .toString()
    .slice("credential=".length);
}

export function createClientSecretBasicHeader(
  clientId: string,
  clientSecret: string,
): string {
  const encodedClientId = formEncodeCredential(clientId);
  const encodedClientSecret = formEncodeCredential(clientSecret);
  return `Basic ${Buffer.from(`${encodedClientId}:${encodedClientSecret}`, "utf8").toString("base64")}`;
}

export function createAuthorizationCodeTokenRequest(input: {
  config: Pick<
    AdminAuthConfig,
    "ADMIN_AUTH_CLIENT_ID" | "ADMIN_AUTH_CLIENT_SECRET" | "redirectUri"
  >;
  code: string;
  codeVerifier: string;
}): RequestInit {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: pkceVerifierSchema.parse(input.codeVerifier),
    redirect_uri: input.config.redirectUri,
  });
  return {
    method: "POST",
    headers: {
      authorization: createClientSecretBasicHeader(
        input.config.ADMIN_AUTH_CLIENT_ID,
        input.config.ADMIN_AUTH_CLIENT_SECRET,
      ),
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: body.toString(),
    redirect: "error",
  };
}

export function buildOidcDiscoveryUrl(issuer: string): string {
  const issuerWithoutTrailingSlash = issuer.endsWith("/")
    ? issuer.slice(0, -1)
    : issuer;
  return `${issuerWithoutTrailingSlash}/.well-known/openid-configuration`;
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The caller receives the security-boundary error, not a cancellation error.
  }
}

async function readBoundedResponseBytes(
  response: Response,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      await cancelResponseBody(response);
      throw new Error("Security JSON response has an invalid content length");
    }
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length > SECURITY_JSON_MAX_BYTES) {
      await cancelResponseBody(response);
      throw new Error("Security JSON response was too large");
    }
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > SECURITY_JSON_MAX_BYTES) {
        await reader.cancel();
        throw new Error("Security JSON response was too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchSecurityJson(
  url: string | URL,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const abortController = new AbortController();
  const timeout = setTimeout(
    () => abortController.abort(),
    SECURITY_JSON_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: abortController.signal,
    });
    if (!response.ok) {
      await cancelResponseBody(response);
      throw new Error("Security JSON endpoint rejected the request");
    }

    const bytes = await readBoundedResponseBytes(response);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Security JSON response contains invalid UTF-8");
    }
    return parseSecurityJson(text, { maxBytes: SECURITY_JSON_MAX_BYTES });
  } finally {
    clearTimeout(timeout);
  }
}

function parseTrustedUrl(
  value: string,
  fieldName: string,
  production: boolean,
  issuer = false,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`OIDC discovery ${fieldName} must be an absolute URL`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`OIDC discovery ${fieldName} must use HTTP or HTTPS`);
  }
  if (production && url.protocol !== "https:") {
    throw new Error(`OIDC discovery ${fieldName} must use HTTPS in production`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error(`OIDC discovery ${fieldName} must not contain credentials`);
  }
  if (issuer && (url.search !== "" || url.hash !== "")) {
    throw new Error(
      `OIDC discovery ${fieldName} must not contain a query or fragment`,
    );
  }
  return url;
}

function requireCapability(
  metadata: OidcDiscoveryMetadata,
  name:
    | "response_types_supported"
    | "id_token_signing_alg_values_supported"
    | "grant_types_supported"
    | "token_endpoint_auth_methods_supported"
    | "code_challenge_methods_supported"
    | "response_modes_supported",
  requiredValue: string,
): void {
  const values = metadata[name];
  if (values !== undefined && !values.includes(requiredValue)) {
    throw new Error(`OIDC discovery ${name} must contain ${requiredValue}`);
  }
}

export async function fetchOidcDiscovery(options: {
  issuer: string;
  production?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<OidcDiscoveryMetadata> {
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  parseTrustedUrl(options.issuer, "issuer", production, true);

  const parsed = discoveryMetadataSchema.parse(
    await fetchSecurityJson(
      buildOidcDiscoveryUrl(options.issuer),
      { headers: { accept: "application/json" } },
      options.fetchImpl,
    ),
  );

  if (parsed.issuer !== options.issuer) {
    throw new Error("OIDC discovery issuer must exactly match configuration");
  }
  parseTrustedUrl(
    parsed.authorization_endpoint,
    "authorization_endpoint",
    production,
  );
  parseTrustedUrl(parsed.token_endpoint, "token_endpoint", production);
  parseTrustedUrl(parsed.jwks_uri, "jwks_uri", production);

  requireCapability(parsed, "response_types_supported", "code");
  requireCapability(parsed, "id_token_signing_alg_values_supported", "RS256");
  requireCapability(parsed, "grant_types_supported", "authorization_code");
  requireCapability(
    parsed,
    "token_endpoint_auth_methods_supported",
    "client_secret_basic",
  );
  requireCapability(parsed, "code_challenge_methods_supported", "S256");
  requireCapability(parsed, "response_modes_supported", "query");

  return parsed;
}
