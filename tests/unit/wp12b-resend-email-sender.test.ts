import { createServer, type RequestListener, type Server } from "node:http";
import { once } from "node:events";

import { afterEach, describe, expect, it } from "vitest";

import {
  ResendEmailSender,
  RESEND_PROVIDER,
} from "@/src/modules/notification/resend-email-sender.server";
import {
  prepareResendRequest,
  resendIdempotencyKey,
} from "@/src/modules/notification/resend-request";

const deliveryId = "22222222-2222-4222-8222-222222222222";
const message = {
  to: "recipient@example.test",
  subject: "PREPPY update",
  text: "A verified admissions update.",
  notificationId: "11111111-1111-4111-8111-111111111111",
  deliveryId,
};
const config = {
  apiKey: "re_test_native_fetch",
  from: "PREPPY <notice@preppy.test>",
};
const context = { deliveryId, attemptNumber: 1 };

const servers: Server[] = [];

async function fakeResend(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("fake Resend server did not expose a TCP port");
  }
  return `http://127.0.0.1:${address.port}/emails`;
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

describe("WP-12B Resend native fetch sender", () => {
  it("builds one stable bounded key and canonical request identity", () => {
    expect(resendIdempotencyKey(deliveryId)).toBe(
      `preppy-delivery/${deliveryId}/v1`,
    );
    const first = prepareResendRequest(message, context, config);
    const retry = prepareResendRequest(
      message,
      { ...context, attemptNumber: 9 },
      config,
    );
    expect(first).toEqual(retry);
    expect(first.idempotencyKey.length).toBeLessThanOrEqual(256);
    expect(first.body).toBe(
      JSON.stringify({
        from: config.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    );
    expect(first.payloadHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.recipientHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.payloadHash).not.toContain(message.to);
  });

  it("sends the official request and accepts a bounded provider ID", async () => {
    let captured: { headers: Record<string, string>; body: string } | undefined;
    const endpoint = await fakeResend((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        captured = {
          headers: {
            authorization: request.headers.authorization ?? "",
            contentType: Array.isArray(request.headers["content-type"])
              ? request.headers["content-type"].join(",")
              : (request.headers["content-type"] ?? ""),
            idempotencyKey: Array.isArray(request.headers["idempotency-key"])
              ? request.headers["idempotency-key"].join(",")
              : (request.headers["idempotency-key"] ?? ""),
          },
          body: Buffer.concat(chunks).toString("utf8"),
        };
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}');
      });
    });
    const sender = new ResendEmailSender(config, { endpoint });
    await expect(sender.send(message, context)).resolves.toEqual({
      kind: "ACCEPTED",
      provider: RESEND_PROVIDER,
      providerMessageId: "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794",
    });
    expect(captured).toEqual({
      headers: {
        authorization: "Bearer re_test_native_fetch",
        contentType: "application/json",
        idempotencyKey: `preppy-delivery/${deliveryId}/v1`,
      },
      body: prepareResendRequest(message, context, config).body,
    });
  });

  it.each([
    [429, "rate_limit_exceeded", "RESEND_RATE_LIMITED", "RETRYABLE_FAILURE"],
    [500, "internal_server_error", "RESEND_SERVER_ERROR", "RETRYABLE_FAILURE"],
    [401, "invalid_api_key", "RESEND_AUTH_REJECTED", "TERMINAL_FAILURE"],
    [403, "restricted_api_key", "RESEND_AUTH_REJECTED", "TERMINAL_FAILURE"],
    [422, "validation_error", "RESEND_VALIDATION_REJECTED", "TERMINAL_FAILURE"],
    [
      400,
      "invalid_idempotency_key",
      "RESEND_INVALID_IDEMPOTENCY_KEY",
      "TERMINAL_FAILURE",
    ],
    [
      409,
      "invalid_idempotent_request",
      "RESEND_IDEMPOTENCY_CONFLICT",
      "TERMINAL_FAILURE",
    ],
    [
      409,
      "concurrent_idempotent_requests",
      "RESEND_IDEMPOTENCY_IN_PROGRESS",
      "RETRYABLE_FAILURE",
    ],
  ] as const)(
    "maps HTTP %i %s to %s",
    async (status, name, errorCode, kind) => {
      const endpoint = await fakeResend((_request, response) => {
        response.writeHead(status, {
          "content-type": "application/json",
          ...(status === 429 ? { "retry-after": "30" } : {}),
        });
        response.end(
          JSON.stringify({ name, message: "safe fixture", statusCode: status }),
        );
      });
      const sender = new ResendEmailSender(config, { endpoint });
      await expect(sender.send(message, context)).resolves.toEqual({
        kind,
        provider: RESEND_PROVIDER,
        errorCode,
        ...(status === 429 ? { retryAfterMs: 30_000 } : {}),
      });
    },
  );

  it.each([
    [200, "{}"],
    [200, '{"id":"bad id with spaces"}'],
    [200, '{"id":"one","id":"two"}'],
  ] as const)(
    "maps malformed HTTP %i success to unknown",
    async (status, body) => {
      const endpoint = await fakeResend((_request, response) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(body);
      });
      const sender = new ResendEmailSender(config, { endpoint });
      await expect(sender.send(message, context)).resolves.toEqual({
        kind: "RESULT_UNKNOWN",
        provider: RESEND_PROVIDER,
        errorCode: "PROVIDER_RESULT_UNKNOWN",
      });
    },
  );

  it("maps an oversized response to unknown without retaining the body", async () => {
    const endpoint = await fakeResend((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "x".repeat(2_000) }));
    });
    const sender = new ResendEmailSender(config, {
      endpoint,
      maxResponseBytes: 128,
    });
    await expect(sender.send(message, context)).resolves.toMatchObject({
      kind: "RESULT_UNKNOWN",
      errorCode: "PROVIDER_RESULT_UNKNOWN",
    });
  });

  it("maps an acceptance-ambiguous timeout to unknown", async () => {
    const endpoint = await fakeResend((_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"id":"late"}');
      }, 100);
    });
    const sender = new ResendEmailSender(config, { endpoint, timeoutMs: 10 });
    await expect(sender.send(message, context)).resolves.toEqual({
      kind: "RESULT_UNKNOWN",
      provider: RESEND_PROVIDER,
      errorCode: "PROVIDER_RESULT_UNKNOWN",
    });
  });
});
