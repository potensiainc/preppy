import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ResendWebhookVerificationError,
  verifyResendWebhookSignature,
} from "@/src/modules/notification/resend-webhook-signature.server";
import {
  parseResendWebhookEvent,
  resendWebhookPayloadHash,
} from "@/src/modules/notification/resend-webhook-event.server";

const secretBytes = Buffer.from("wp12b-resend-webhook-secret");
const secret = `whsec_${secretBytes.toString("base64")}`;
const timestamp = 1_787_529_600;
const body = Buffer.from(
  JSON.stringify({
    type: "email.bounced",
    created_at: "2026-08-24T00:00:00.000Z",
    data: {
      email_id: "provider-message-1",
      bounce: { type: "Permanent", message: "must not persist" },
      to: ["recipient@example.test"],
    },
  }),
);

function signature(id = "msg_wp12b_1", at = timestamp, bytes = body) {
  return createHmac("sha256", secretBytes)
    .update(`${id}.${at}.`)
    .update(bytes)
    .digest("base64");
}

function headers(overrides: Record<string, string> = {}) {
  return new Headers({
    "svix-id": "msg_wp12b_1",
    "svix-timestamp": String(timestamp),
    "svix-signature": `v1,${signature()}`,
    ...overrides,
  });
}

describe("WP-12B Resend webhook signature verification", () => {
  it("verifies raw bytes with the trusted whsec secret and returns the receipt id", () => {
    expect(
      verifyResendWebhookSignature({
        body,
        headers: headers(),
        secret,
        now: new Date(timestamp * 1_000),
      }),
    ).toEqual({
      providerEventId: "msg_wp12b_1",
      providerTimestamp: new Date(timestamp * 1_000),
    });
  });

  it("accepts any matching v1 value in a space-separated signature list", () => {
    expect(
      verifyResendWebhookSignature({
        body,
        headers: headers({
          "svix-signature": `v1,${Buffer.alloc(32).toString("base64")} v1,${signature()}`,
        }),
        secret,
        now: new Date(timestamp * 1_000),
      }).providerEventId,
    ).toBe("msg_wp12b_1");
  });

  it("accepts canonical unpadded base64 used by provider secrets/signatures", () => {
    expect(
      verifyResendWebhookSignature({
        body,
        headers: headers({
          "svix-signature": `v1,${signature().replace(/=+$/, "")}`,
        }),
        secret: secret.replace(/=+$/, ""),
        now: new Date(timestamp * 1_000),
      }).providerEventId,
    ).toBe("msg_wp12b_1");
  });

  it.each([
    ["missing headers", new Headers(), "MISSING_HEADERS"],
    ["wrong body", headers(), "INVALID_SIGNATURE", Buffer.from("{}")],
    [
      "expired timestamp",
      headers(),
      "STALE_TIMESTAMP",
      body,
      new Date((timestamp + 301) * 1_000),
    ],
    [
      "future timestamp",
      headers(),
      "STALE_TIMESTAMP",
      body,
      new Date((timestamp - 301) * 1_000),
    ],
    [
      "malformed secret",
      headers(),
      "INVALID_SECRET",
      body,
      new Date(timestamp * 1_000),
      "whsec_not/base64!",
    ],
  ])(
    "rejects %s fail-closed",
    (
      _case,
      signedHeaders,
      code,
      signedBody = body,
      now = new Date(timestamp * 1_000),
      signingSecret = secret,
    ) => {
      expect(() =>
        verifyResendWebhookSignature({
          body: signedBody,
          headers: signedHeaders,
          secret: signingSecret,
          now,
        }),
      ).toThrow(expect.objectContaining({ code }));
    },
  );

  it("uses a bounded, printable provider receipt id", () => {
    const badId = `bad id`;
    expect(() =>
      verifyResendWebhookSignature({
        body,
        headers: headers({
          "svix-id": badId,
          "svix-signature": `v1,${signature(badId)}`,
        }),
        secret,
        now: new Date(timestamp * 1_000),
      }),
    ).toThrow(ResendWebhookVerificationError);
  });
});

describe("WP-12B Resend webhook security parser", () => {
  it("extracts only bounded reconciliation fields from a supported event", () => {
    expect(parseResendWebhookEvent(body)).toEqual({
      type: "email.bounced",
      providerCreatedAt: new Date("2026-08-24T00:00:00.000Z"),
      providerMessageId: "provider-message-1",
      bounceType: "PERMANENT",
      supported: true,
    });
    expect(resendWebhookPayloadHash(body)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("classifies an authenticated unknown event for durable ignore", () => {
    expect(
      parseResendWebhookEvent(
        Buffer.from(
          '{"type":"domain.created","created_at":"2026-08-24T00:00:00Z","data":{"email_id":"provider-message-2","secret":"drop"}}',
        ),
      ),
    ).toEqual({
      type: "domain.created",
      providerCreatedAt: new Date("2026-08-24T00:00:00.000Z"),
      providerMessageId: "provider-message-2",
      supported: false,
    });
  });

  it.each([
    [
      "duplicate member",
      '{"type":"email.sent","type":"email.delivered","created_at":"2026-08-24T00:00:00Z","data":{"email_id":"m"}}',
    ],
    [
      "missing message id for supported event",
      '{"type":"email.sent","created_at":"2026-08-24T00:00:00Z","data":{}}',
    ],
    [
      "invalid created time",
      '{"type":"email.sent","created_at":"not-a-time","data":{"email_id":"m"}}',
    ],
    ["invalid UTF-8", Buffer.from([0xc3, 0x28])],
  ])("rejects %s", (_case, source) => {
    const bytes = typeof source === "string" ? Buffer.from(source) : source;
    expect(() => parseResendWebhookEvent(bytes)).toThrow();
  });

  it("rejects an oversized body before parsing", () => {
    expect(() => parseResendWebhookEvent(Buffer.alloc(64 * 1_024 + 1))).toThrow(
      /size/i,
    );
  });
});
