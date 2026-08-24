import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const MAX_PROVIDER_EVENT_ID_BYTES = 255;

export type ResendWebhookVerificationErrorCode =
  | "MISSING_HEADERS"
  | "INVALID_HEADERS"
  | "INVALID_SECRET"
  | "STALE_TIMESTAMP"
  | "INVALID_SIGNATURE";

export class ResendWebhookVerificationError extends Error {
  readonly code: ResendWebhookVerificationErrorCode;

  constructor(code: ResendWebhookVerificationErrorCode) {
    super(`Resend webhook verification failed: ${code}`);
    this.name = "ResendWebhookVerificationError";
    this.code = code;
  }
}

function fail(code: ResendWebhookVerificationErrorCode): never {
  throw new ResendWebhookVerificationError(code);
}

function parseSigningSecret(secret: string): Buffer {
  if (!secret.startsWith("whsec_")) fail("INVALID_SECRET");
  const encoded = secret.slice("whsec_".length);
  if (
    encoded.length === 0 ||
    encoded.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    fail("INVALID_SECRET");
  }
  const padded = encoded.padEnd(
    encoded.length + ((4 - (encoded.length % 4)) % 4),
    "=",
  );
  const bytes = Buffer.from(padded, "base64");
  if (bytes.length < 16 || bytes.toString("base64") !== padded) {
    fail("INVALID_SECRET");
  }
  return bytes;
}

function parseSignatureValues(header: string): Buffer[] {
  const signatures: Buffer[] = [];
  for (const entry of header.split(" ")) {
    if (!entry.startsWith("v1,")) continue;
    const encoded = entry.slice(3);
    if (
      encoded.length === 0 ||
      encoded.length % 4 === 1 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
    ) {
      continue;
    }
    const padded = encoded.padEnd(
      encoded.length + ((4 - (encoded.length % 4)) % 4),
      "=",
    );
    const decoded = Buffer.from(padded, "base64");
    if (decoded.length === 32 && decoded.toString("base64") === padded) {
      signatures.push(decoded);
    }
  }
  return signatures;
}

export function verifyResendWebhookSignature(input: {
  body: Uint8Array;
  headers: Headers;
  secret: string;
  now?: Date;
}): { providerEventId: string; providerTimestamp: Date } {
  const providerEventId = input.headers.get("svix-id");
  const rawTimestamp = input.headers.get("svix-timestamp");
  const rawSignatures = input.headers.get("svix-signature");
  if (!providerEventId || !rawTimestamp || !rawSignatures) {
    fail("MISSING_HEADERS");
  }
  if (
    Buffer.byteLength(providerEventId, "utf8") > MAX_PROVIDER_EVENT_ID_BYTES ||
    !/^[!-~]+$/.test(providerEventId) ||
    !/^\d{1,15}$/.test(rawTimestamp)
  ) {
    fail("INVALID_HEADERS");
  }

  const timestampSeconds = Number(rawTimestamp);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS
  ) {
    fail("STALE_TIMESTAMP");
  }

  const secretBytes = parseSigningSecret(input.secret);
  const expected = createHmac("sha256", secretBytes)
    .update(`${providerEventId}.${rawTimestamp}.`)
    .update(input.body)
    .digest();
  const candidates = parseSignatureValues(rawSignatures);
  if (
    !candidates.some(
      (candidate) =>
        candidate.length === expected.length &&
        timingSafeEqual(candidate, expected),
    )
  ) {
    fail("INVALID_SIGNATURE");
  }

  return {
    providerEventId,
    providerTimestamp: new Date(timestampSeconds * 1_000),
  };
}
