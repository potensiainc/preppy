import { describe, expect, it } from "vitest";

import { renderOpportunityChangeEmail } from "@/src/modules/notification/email-renderer.server";
import type { SendEmailResult } from "@/src/modules/notification/email-sender";
import { FakeEmailSender } from "@/src/modules/notification/fake-email-sender.server";

const message = {
  to: "transient@example.test",
  notificationId: "11111111-1111-4111-8111-111111111111",
  deliveryId: "22222222-2222-4222-8222-222222222222",
  institutionName: "PREPPY Academy",
  opportunityTitle: "2027 Application",
  changeSummary: "Application deadline changed.",
  deepLinkPath: "/opportunities/2027-application",
};

describe("WP-12A provider-neutral email foundation", () => {
  it("renders deterministic public-safe content", () => {
    expect(
      renderOpportunityChangeEmail(message, {
        appBaseUrl: "https://preppy.test",
      }),
    ).toEqual({
      to: "transient@example.test",
      subject: "[PREPPY] PREPPY Academy 입학정보가 변경되었습니다",
      text: [
        "PREPPY Academy",
        "2027 Application",
        "Application deadline changed.",
        "https://preppy.test/opportunities/2027-application",
        "https://preppy.test/me/settings",
      ].join("\n\n"),
      notificationId: message.notificationId,
      deliveryId: message.deliveryId,
    });
  });

  it.each<SendEmailResult>([
    {
      kind: "ACCEPTED",
      provider: "FAKE",
      providerMessageId: "fake-message-1",
    },
    {
      kind: "RETRYABLE_FAILURE",
      provider: "FAKE",
      errorCode: "FAKE_TEMPORARY_FAILURE",
    },
    {
      kind: "TERMINAL_FAILURE",
      provider: "FAKE",
      errorCode: "FAKE_TERMINAL_FAILURE",
    },
    {
      kind: "RESULT_UNKNOWN",
      provider: "FAKE",
      errorCode: "PROVIDER_RESULT_UNKNOWN",
    },
  ])(
    "returns deterministic $kind outcomes without network",
    async (outcome) => {
      const sender = new FakeEmailSender([outcome]);
      await expect(
        sender.send(renderOpportunityChangeEmail(message), {
          deliveryId: message.deliveryId,
          attemptNumber: 1,
        }),
      ).resolves.toEqual(outcome);
      expect(sender.snapshot()).toEqual([
        {
          message: renderOpportunityChangeEmail(message),
          context: { deliveryId: message.deliveryId, attemptNumber: 1 },
        },
      ]);
    },
  );
});
