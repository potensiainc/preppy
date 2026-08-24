import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  handleAdminCancelOutboxRequest,
  handleAdminReconcileResendRequest,
  handleAdminRetryOutboxRequest,
} from "@/src/modules/admin/http/outbox-operations.server";

const adminUserId = randomUUID();
const eventId = randomUUID();
const deliveryId = randomUUID();
const attemptId = randomUUID();

function request(path: string, body: string) {
  return new Request(`https://preppy.test${path}`, {
    method: "POST",
    headers: {
      origin: "https://preppy.test",
      "content-type": "application/json",
    },
    body,
  });
}

function pipeline() {
  return {
    requireCurrentAdmin: vi.fn().mockResolvedValue({
      adminUserId,
      displayName: "WP12B Admin",
    }),
    getAppBaseUrl: () => "https://preppy.test",
    createContext: ({
      adminUserId: actor,
      reason,
    }: {
      adminUserId: string;
      reason: string;
    }) => ({
      adminUserId: actor,
      correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      occurredAt: new Date("2026-08-24T04:00:00Z"),
      reason,
    }),
    createErrorCorrelationId: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  };
}

describe("WP-12B Admin Operations HTTP boundary", () => {
  it("passes a strict retry candidate through ACTIVE Admin and Origin guards", async () => {
    const retryOutbox = vi.fn().mockResolvedValue({ kind: "RETRIED", eventId });
    const response = await handleAdminRetryOutboxRequest(
      request(
        `/api/admin/operations/outbox/${eventId}/retry`,
        '{"expectedStatus":"FAILED","expectedAttemptCount":2}',
      ),
      { eventId },
      { ...pipeline(), retryOutbox },
    );

    expect(response.status).toBe(200);
    expect(retryOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ adminUserId, reason: "ADMIN_RETRY_OUTBOX" }),
      { eventId, expectedStatus: "FAILED", expectedAttemptCount: 2 },
    );
  });

  it("delegates cancel through the same command boundary", async () => {
    const cancelOutbox = vi
      .fn()
      .mockResolvedValue({ kind: "CANCELLED", eventId });
    const response = await handleAdminCancelOutboxRequest(
      request(
        `/api/admin/operations/outbox/${eventId}/cancel`,
        '{"expectedStatus":"PENDING","expectedAttemptCount":0}',
      ),
      { eventId },
      { ...pipeline(), cancelOutbox },
    );
    expect(response.status).toBe(200);
    expect(cancelOutbox).toHaveBeenCalledOnce();
  });

  it("exposes explicit Resend reconciliation instead of generic Retry", async () => {
    const reconcileResend = vi.fn().mockResolvedValue({
      kind: "RECONCILED",
      deliveryId,
      attemptId,
      providerMessageId: "resend-message-safe",
    });
    const response = await handleAdminReconcileResendRequest(
      request(
        `/api/admin/operations/deliveries/${deliveryId}/reconcile-resend`,
        JSON.stringify({ expectedAttemptId: attemptId }),
      ),
      { deliveryId },
      { ...pipeline(), reconcileResend },
    );
    expect(response.status).toBe(200);
    expect(reconcileResend).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "ADMIN_RECONCILE_RESEND" }),
      { deliveryId, expectedAttemptId: attemptId },
    );
  });

  it.each([
    [
      "cross-origin",
      403,
      () =>
        new Request(
          `https://preppy.test/api/admin/operations/outbox/${eventId}/retry`,
          {
            method: "POST",
            headers: {
              origin: "https://attacker.test",
              "content-type": "application/json",
            },
            body: '{"expectedStatus":"FAILED","expectedAttemptCount":1}',
          },
        ),
    ],
    [
      "duplicate member",
      400,
      () =>
        request(
          `/api/admin/operations/outbox/${eventId}/retry`,
          '{"expectedStatus":"FAILED","expectedStatus":"DEAD_LETTER","expectedAttemptCount":1}',
        ),
    ],
    [
      "policy injection",
      400,
      () =>
        request(
          `/api/admin/operations/outbox/${eventId}/retry`,
          '{"expectedStatus":"FAILED","expectedAttemptCount":1,"force":true}',
        ),
    ],
  ])(
    "rejects %s before command execution",
    async (_case, expectedStatus, makeRequest) => {
      const retryOutbox = vi.fn();
      const response = await handleAdminRetryOutboxRequest(
        makeRequest(),
        { eventId },
        { ...pipeline(), retryOutbox },
      );
      expect(response.status).toBe(expectedStatus);
      expect(retryOutbox).not.toHaveBeenCalled();
    },
  );
});
