import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminOutboxActions } from "@/app/admin/_components/outbox-actions";
import { handleAdminReconcileResendRequest } from "@/src/modules/admin/http/outbox-operations.server";
import { isEmailSendAvailable } from "@/src/modules/notification/resend-config.server";

const configured = {
  EMAIL_SEND_ENABLED: "true",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "PREPPY <notice@example.com>",
};

describe("email send availability", () => {
  it("is available only when sending is on and Resend is configured", () => {
    expect(isEmailSendAvailable(configured)).toBe(true);
    expect(
      isEmailSendAvailable({ ...configured, EMAIL_SEND_ENABLED: "false" }),
    ).toBe(false);
    expect(
      isEmailSendAvailable({ ...configured, RESEND_API_KEY: undefined }),
    ).toBe(false);
    expect(isEmailSendAvailable({ ...configured, EMAIL_FROM: "" })).toBe(false);
  });
});

describe("Admin Resend reconciliation guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses before any provider call while sending is disabled", async () => {
    vi.stubEnv("EMAIL_SEND_ENABLED", "false");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adminUserId = randomUUID();
    const deliveryId = randomUUID();
    const response = await handleAdminReconcileResendRequest(
      new Request(
        `https://preppy.test/api/admin/operations/deliveries/${deliveryId}/reconcile-resend`,
        {
          method: "POST",
          headers: {
            origin: "https://preppy.test",
            "content-type": "application/json",
          },
          body: JSON.stringify({ expectedAttemptId: randomUUID() }),
        },
      ),
      { deliveryId },
      {
        requireCurrentAdmin: vi.fn().mockResolvedValue({
          adminUserId,
          displayName: "Guard Admin",
        }),
        getAppBaseUrl: () => "https://preppy.test",
        createContext: ({ reason }: { reason: string }) => ({
          adminUserId,
          correlationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          occurredAt: new Date("2026-08-24T04:00:00Z"),
          reason,
        }),
        createErrorCorrelationId: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    );
    expect(response.status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("Admin outbox reconciliation action", () => {
  const item = {
    id: randomUUID(),
    deliveryId: randomUUID(),
    latestAttempt: { id: randomUUID() },
    actions: { canRetry: false, canCancel: false, canReconcileResend: true },
  } as never;

  it("explains why reconciliation is unavailable while sending is off", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminOutboxActions, { item, emailSendAvailable: false }),
    );
    expect(markup).toContain(
      "메일 발송이 꺼져 있어 Resend 결과를 대조할 수 없어요.",
    );
    expect(markup).not.toContain("<button");
  });

  it("offers reconciliation once sending is available", () => {
    const markup = renderToStaticMarkup(
      createElement(AdminOutboxActions, { item, emailSendAvailable: true }),
    );
    expect(markup).toContain("Resend 결과 대조");
    expect(markup).toContain("<button");
  });
});
