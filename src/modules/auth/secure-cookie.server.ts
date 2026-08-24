import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const ENVELOPE_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_CLOCK_SKEW_SECONDS = 30;
const MAX_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_MAX_PLAINTEXT_BYTES = 2_048;
const DEFAULT_MAX_TOKEN_BYTES = 4_096;
const KEY_DERIVATION_SALT = Buffer.from("preppy-secure-cookie-v1", "utf8");
const BASE64URL = /^[A-Za-z0-9_-]+$/;

type SecureEnvelope = {
  version: number;
  purpose: string;
  issuedAt: number;
  expiresAt: number;
  payload: unknown;
};

export type SealSecureCookieOptions = {
  purpose: string;
  secret: string;
  ttlSeconds: number;
  now?: Date;
  maxPlaintextBytes?: number;
  maxTokenBytes?: number;
};

export type OpenSecureCookieOptions = {
  purpose: string;
  secret: string;
  now?: Date;
  maxPlaintextBytes?: number;
  maxTokenBytes?: number;
};

export type AuthenticatedSecureCookie = Readonly<{
  payload: unknown | null;
  issuedAt: number;
  expiresAt: number;
}>;

export type SecureCookiePath = "/" | "/admin/auth";

export type SecureCookieAttributes<Path extends SecureCookiePath = "/"> = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: Path;
  maxAge: number;
};

function assertPurpose(purpose: string): void {
  if (!/^[a-z0-9][a-z0-9:_-]{0,63}$/.test(purpose)) {
    throw new Error("Secure cookie purpose is invalid");
  }
}

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Secure cookie secret must be at least 32 bytes");
  }
}

function deriveKey(secret: string, purpose: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      KEY_DERIVATION_SALT,
      Buffer.from(purpose, "utf8"),
      32,
    ),
  );
}

function associatedData(purpose: string): Buffer {
  return Buffer.from(`preppy:${purpose}:v${ENVELOPE_VERSION}`, "utf8");
}

function decodeBase64Url(value: string, expectedBytes?: number): Buffer | null {
  if (!BASE64URL.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return null;
    if (expectedBytes !== undefined && decoded.length !== expectedBytes) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export function secureCookieAttributes<
  Path extends SecureCookiePath = "/",
>(options: {
  maxAgeSeconds: number;
  production?: boolean;
  path?: Path;
}): SecureCookieAttributes<Path> {
  if (!Number.isInteger(options.maxAgeSeconds) || options.maxAgeSeconds <= 0) {
    throw new Error("Cookie max age must be a positive integer");
  }
  const path = options.path ?? "/";
  if (path !== "/" && path !== "/admin/auth") {
    throw new Error("Cookie path is invalid");
  }
  return {
    httpOnly: true,
    secure: options.production ?? process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: path as Path,
    maxAge: options.maxAgeSeconds,
  };
}

export function sealSecureCookie(
  payload: unknown,
  options: SealSecureCookieOptions,
): string {
  assertPurpose(options.purpose);
  assertSecret(options.secret);
  if (
    !Number.isInteger(options.ttlSeconds) ||
    options.ttlSeconds <= 0 ||
    options.ttlSeconds > MAX_TTL_SECONDS
  ) {
    throw new Error("Secure cookie TTL is invalid");
  }

  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1_000);
  if (!Number.isSafeInteger(issuedAt)) {
    throw new Error("Secure cookie timestamp is invalid");
  }
  const envelope: SecureEnvelope = {
    version: ENVELOPE_VERSION,
    purpose: options.purpose,
    issuedAt,
    expiresAt: issuedAt + options.ttlSeconds,
    payload,
  };
  const plaintext = Buffer.from(JSON.stringify(envelope), "utf8");
  const maxPlaintextBytes =
    options.maxPlaintextBytes ?? DEFAULT_MAX_PLAINTEXT_BYTES;
  if (plaintext.length > maxPlaintextBytes) {
    throw new Error("Secure cookie payload is too large");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(
    ALGORITHM,
    deriveKey(options.secret, options.purpose),
    iv,
    {
      authTagLength: TAG_BYTES,
    },
  );
  cipher.setAAD(associatedData(options.purpose));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const token = [
    `v${ENVELOPE_VERSION}`,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");

  if (
    Buffer.byteLength(token, "utf8") >
    (options.maxTokenBytes ?? DEFAULT_MAX_TOKEN_BYTES)
  ) {
    throw new Error("Secure cookie value is too large");
  }
  return token;
}

export function openSecureCookieWithMetadata(
  token: string | null | undefined,
  options: OpenSecureCookieOptions,
): AuthenticatedSecureCookie | null {
  try {
    assertPurpose(options.purpose);
    assertSecret(options.secret);
    if (
      !token ||
      Buffer.byteLength(token, "utf8") >
        (options.maxTokenBytes ?? DEFAULT_MAX_TOKEN_BYTES)
    ) {
      return null;
    }

    const parts = token.split(".");
    if (parts.length !== 4 || parts[0] !== `v${ENVELOPE_VERSION}`) {
      return null;
    }
    const iv = decodeBase64Url(parts[1] ?? "", IV_BYTES);
    const ciphertext = decodeBase64Url(parts[2] ?? "");
    const tag = decodeBase64Url(parts[3] ?? "", TAG_BYTES);
    if (!iv || !ciphertext || !tag) return null;
    if (
      ciphertext.length >
      (options.maxPlaintextBytes ?? DEFAULT_MAX_PLAINTEXT_BYTES)
    ) {
      return null;
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      deriveKey(options.secret, options.purpose),
      iv,
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(associatedData(options.purpose));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    if (
      plaintext.length >
      (options.maxPlaintextBytes ?? DEFAULT_MAX_PLAINTEXT_BYTES)
    ) {
      return null;
    }

    const envelope = JSON.parse(
      plaintext.toString("utf8"),
    ) as Partial<SecureEnvelope>;
    const nowSeconds = Math.floor(
      (options.now ?? new Date()).getTime() / 1_000,
    );
    if (
      envelope.version !== ENVELOPE_VERSION ||
      envelope.purpose !== options.purpose ||
      !Number.isSafeInteger(envelope.issuedAt) ||
      !Number.isSafeInteger(envelope.expiresAt) ||
      (envelope.issuedAt as number) > nowSeconds + MAX_CLOCK_SKEW_SECONDS ||
      (envelope.expiresAt as number) <= (envelope.issuedAt as number) ||
      (envelope.expiresAt as number) - (envelope.issuedAt as number) >
        MAX_TTL_SECONDS ||
      nowSeconds >= (envelope.expiresAt as number)
    ) {
      return null;
    }
    return {
      payload: envelope.payload ?? null,
      issuedAt: envelope.issuedAt as number,
      expiresAt: envelope.expiresAt as number,
    };
  } catch {
    return null;
  }
}

export function openSecureCookie(
  token: string | null | undefined,
  options: OpenSecureCookieOptions,
): unknown | null {
  return openSecureCookieWithMetadata(token, options)?.payload ?? null;
}
