import "server-only";

import {
  constants,
  createHash,
  timingSafeEqual,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

import { z } from "zod";

import type { TrustedJwksLoader } from "./jwks.server";
import { parseSecurityJson } from "./security-json.server";

const MAX_ENCODED_TOKEN_BYTES = 16 * 1_024;
const canonicalBase64Url = /^[A-Za-z0-9_-]+$/;
const numericDateSchema = z.number().int().safe();
const boundedSubjectSchema = z.string().superRefine((value, context) => {
  const byteLength = Buffer.byteLength(value, "utf8");
  if (byteLength === 0 || byteLength > 255) {
    context.addIssue({
      code: "custom",
      message: "Subject must contain between 1 and 255 UTF-8 bytes",
    });
  }
});

const protectedHeaderSchema = z.object({
  alg: z.literal("RS256"),
  kid: z.string().min(1).max(256),
  crit: z.array(z.string()).optional(),
});

const idTokenClaimsSchema = z.object({
  iss: z.string(),
  sub: boundedSubjectSchema,
  aud: z.union([z.string(), z.array(z.string())]),
  exp: numericDateSchema,
  iat: numericDateSchema,
  nbf: numericDateSchema.optional(),
  nonce: z.string(),
  azp: z.string().optional(),
});

export class AdminIdTokenError extends Error {
  readonly name = "AdminIdTokenError";

  constructor() {
    super("Admin ID Token verification failed");
  }
}

export type VerifiedAdminIdTokenClaims = Readonly<{
  sub: string;
  iss: string;
  aud: string | readonly [string];
  iat: number;
  exp: number;
}>;

function decodeCanonicalBase64Url(segment: string): Buffer {
  if (!canonicalBase64Url.test(segment)) throw new AdminIdTokenError();
  const bytes = Buffer.from(segment, "base64url");
  if (bytes.toString("base64url") !== segment) {
    throw new AdminIdTokenError();
  }
  return bytes;
}

function decodeSecurityJson(
  segment: string,
  limits: {
    maxBytes: number;
    maxDepth: number;
    maxObjectMembers: number;
    maxArrayItems: number;
    maxStringBytes: number;
  },
): unknown {
  const bytes = decodeCanonicalBase64Url(segment);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return parseSecurityJson(text, limits);
}

function verifyRs256Signature(input: {
  encodedHeader: string;
  encodedPayload: string;
  encodedSignature: string;
  publicKey: KeyObject;
}): boolean {
  const signingInput = `${input.encodedHeader}.${input.encodedPayload}`;
  return verifySignature(
    "RSA-SHA256",
    Buffer.from(signingInput, "ascii"),
    { key: input.publicKey, padding: constants.RSA_PKCS1_PADDING },
    decodeCanonicalBase64Url(input.encodedSignature),
  );
}

function noncesMatch(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

function validateClaims(
  claims: z.infer<typeof idTokenClaimsSchema>,
  input: {
    expectedIssuer: string;
    clientId: string;
    expectedNonce: string;
    flowStartedAt: number;
    now: number;
  },
): void {
  const audienceMatches =
    typeof claims.aud === "string"
      ? claims.aud === input.clientId
      : claims.aud.length === 1 && claims.aud[0] === input.clientId;

  if (
    claims.iss !== input.expectedIssuer ||
    !audienceMatches ||
    (claims.azp !== undefined && claims.azp !== input.clientId) ||
    !noncesMatch(claims.nonce, input.expectedNonce) ||
    claims.iat < input.flowStartedAt - 60 ||
    claims.iat > input.now + 60 ||
    input.now >= claims.exp + 60 ||
    (claims.nbf !== undefined && claims.nbf > input.now + 60)
  ) {
    throw new AdminIdTokenError();
  }
}

export async function verifyAdminIdToken(input: {
  idToken: string;
  jwks: TrustedJwksLoader;
  expectedIssuer: string;
  clientId: string;
  expectedNonce: string;
  flowStartedAt: number;
  now: number;
}): Promise<VerifiedAdminIdTokenClaims> {
  try {
    if (Buffer.byteLength(input.idToken, "utf8") > MAX_ENCODED_TOKEN_BYTES) {
      throw new AdminIdTokenError();
    }
    const segments = input.idToken.split(".");
    if (segments.length !== 3 || segments.some((segment) => segment === "")) {
      throw new AdminIdTokenError();
    }
    const [encodedHeader, encodedPayload, encodedSignature] = segments;
    const header = protectedHeaderSchema.parse(
      decodeSecurityJson(encodedHeader, {
        maxBytes: 4_096,
        maxDepth: 4,
        maxObjectMembers: 32,
        maxArrayItems: 16,
        maxStringBytes: 2_048,
      }),
    );
    if (header.crit !== undefined && header.crit.length !== 0) {
      throw new AdminIdTokenError();
    }
    const claims = idTokenClaimsSchema.parse(
      decodeSecurityJson(encodedPayload, {
        maxBytes: 12 * 1_024,
        maxDepth: 4,
        maxObjectMembers: 64,
        maxArrayItems: 16,
        maxStringBytes: 4_096,
      }),
    );
    const publicKey = await input.jwks.getRsaSigningKey(header.kid);
    if (
      !verifyRs256Signature({
        encodedHeader,
        encodedPayload,
        encodedSignature,
        publicKey,
      })
    ) {
      throw new AdminIdTokenError();
    }
    validateClaims(claims, input);

    return {
      sub: claims.sub,
      iss: claims.iss,
      aud: typeof claims.aud === "string" ? claims.aud : [claims.aud[0]],
      iat: claims.iat,
      exp: claims.exp,
    };
  } catch {
    throw new AdminIdTokenError();
  }
}
