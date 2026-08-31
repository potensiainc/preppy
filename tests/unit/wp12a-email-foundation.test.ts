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
      subject: "[PREPPY] PREPPY Academy 입학정보가 변경됐어요",
      text: [
        "PREPPY Academy",
        "2027 Application",
        "Application deadline changed.",
        "변경된 입학정보 보기\nhttps://preppy.test/opportunities/2027-application",
        "알림 설정 보기\nhttps://preppy.test/me/settings",
      ].join("\n\n"),
      notificationId: message.notificationId,
      deliveryId: message.deliveryId,
    });
  });

  it("preserves the full official conditions in plain text beside distinct action destinations", () => {
    // Mutation caught: summary rewriting strips the year, exception, mandatory original or uncertainty; labels point to the wrong destination.
    const summary =
      '2027학년도: 2026년 11월 11일 16:30 KST까지 원본만 제출해야 합니다. PDF 3쪽의 수업료는 분기 2,520,000원이며 환불 불가입니다. 쌍둥이는 별도 접수해야 합니다. 예정안이므로 학교 확인이 필요합니다. <script>& "인용"';
    const rendered = renderOpportunityChangeEmail(
      { ...message, changeSummary: summary },
      { appBaseUrl: "https://preppy.test/internal" },
    );
    expect(rendered.text).toContain(summary);
    expect(rendered.text).toContain(
      "변경된 입학정보 보기\nhttps://preppy.test/opportunities/2027-application",
    );
    expect(rendered.text).toContain(
      "알림 설정 보기\nhttps://preppy.test/me/settings",
    );
    expect(rendered).not.toHaveProperty("html");
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
