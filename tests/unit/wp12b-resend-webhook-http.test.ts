import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { handleResendWebhookRequest } from "@/src/modules/notification/resend-webhook-http.server";

const secretBytes = Buffer.from("wp12b-webhook-http-secret");
const secret = `whsec_${secretBytes.toString("base64")}`;
const nowSeconds = 1_787_529_600;

function request(
  body: string,
  overrides: Record<string, string> = {},
  id = "msg_http_1",
) {
  const signature = createHmac("sha256", secretBytes)
    .update(`${id}.${nowSeconds}.${body}`)
    .digest("base64");
  return new Request("https://preppy.test/api/webhooks/resend", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(nowSeconds),
      "svix-signature": `v1,${signature}`,
      ...overrides,
    },
    body,
  });
}

const validBody = JSON.stringify({
  type: "email.delivered",
  created_at: "2026-08-24T00:00:00Z",
  data: { email_id: "provider-message-http" },
});

describe("WP-12B Resend webhook HTTP boundary", () => {
  it("verifies raw bytes before delegating a safe parsed event", async () => {
    const processEvent = vi.fn().mockResolvedValue({
      kind: "PROCESSED",
      deliveryId: "9e77d322-36d2-4c3d-8cf4-10e1dbfc0e94",
    });
    const response = await handleResendWebhookRequest(request(validBody), {
      webhookSecret: secret,
      now: () => new Date(nowSeconds * 1_000),
      processEvent,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ received: true });
    expect(processEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        providerEventId: "msg_http_1",
        payloadHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        event: expect.objectContaining({
          type: "email.delivered",
          providerMessageId: "provider-message-http",
        }),
      }),
    );
  });

  it("rejects an invalid signature before parse or persistence", async () => {
    const processEvent = vi.fn();
    const response = await handleResendWebhookRequest(
      request('{"type":"email.sent","type":"email.clicked"}', {
        "svix-signature": `v1,${Buffer.alloc(32).toString("base64")}`,
      }),
      {
        webhookSecret: secret,
        now: () => new Date(nowSeconds * 1_000),
        processEvent,
      },
    );
    expect(response.status).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("signature");
  });

  it("rejects duplicate JSON after a valid signature and before persistence", async () => {
    const processEvent = vi.fn();
    const response = await handleResendWebhookRequest(
      request(
        '{"type":"email.sent","type":"email.clicked","created_at":"2026-08-24T00:00:00Z","data":{"email_id":"m"}}',
      ),
      {
        webhookSecret: secret,
        now: () => new Date(nowSeconds * 1_000),
        processEvent,
      },
    );
    expect(response.status).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("accepts duplicate and ignored outcomes without leaking internals", async () => {
    for (const outcome of [
      { kind: "DUPLICATE" },
      { kind: "IGNORED", reason: "UNSUPPORTED_EVENT_TYPE" },
    ]) {
      const response = await handleResendWebhookRequest(request(validBody), {
        webhookSecret: secret,
        now: () => new Date(nowSeconds * 1_000),
        processEvent: vi.fn().mockResolvedValue(outcome),
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true });
    }
  });

  it("rejects non-JSON and oversized requests before persistence", async () => {
    const processEvent = vi.fn();
    const wrongType = await handleResendWebhookRequest(
      request(validBody, { "content-type": "text/plain" }),
      {
        webhookSecret: secret,
        now: () => new Date(nowSeconds * 1_000),
        processEvent,
      },
    );
    expect(wrongType.status).toBe(415);

    const oversized = await handleResendWebhookRequest(
      new Request("https://preppy.test/api/webhooks/resend", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(64 * 1_024 + 1),
        },
        body: "{}",
      }),
      {
        webhookSecret: secret,
        now: () => new Date(nowSeconds * 1_000),
        processEvent,
      },
    );
    expect(oversized.status).toBe(413);
    const streamedOversized = await handleResendWebhookRequest(
      new Request("https://preppy.test/api/webhooks/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(64 * 1_024 + 1),
      }),
      {
        webhookSecret: secret,
        now: () => new Date(nowSeconds * 1_000),
        processEvent,
      },
    );
    expect(streamedOversized.status).toBe(413);
    expect(processEvent).not.toHaveBeenCalled();
  });
});
