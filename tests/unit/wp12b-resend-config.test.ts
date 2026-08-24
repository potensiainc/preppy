import { describe, expect, it } from "vitest";

import {
  parseResendSendConfig,
  parseResendWebhookConfig,
} from "@/src/modules/notification/resend-config.server";

describe("WP-12B Resend capability configuration", () => {
  it("parses send and webhook capabilities independently", () => {
    expect(
      parseResendSendConfig({
        RESEND_API_KEY: "re_test_capability_key",
        EMAIL_FROM: "PREPPY <notice@preppy.test>",
      }),
    ).toEqual({
      apiKey: "re_test_capability_key",
      from: "PREPPY <notice@preppy.test>",
    });
    expect(
      parseResendWebhookConfig({
        RESEND_WEBHOOK_SECRET: "whsec_dGVzdC13ZWJob29rLXNlY3JldA==",
      }),
    ).toEqual({
      webhookSecret: "whsec_dGVzdC13ZWJob29rLXNlY3JldA==",
    });
  });

  it("does not require webhook configuration for send capability", () => {
    expect(() =>
      parseResendSendConfig({
        RESEND_API_KEY: "re_test_capability_key",
        EMAIL_FROM: "notice@preppy.test",
      }),
    ).not.toThrow();
  });

  it("does not require send configuration for webhook capability", () => {
    expect(() =>
      parseResendWebhookConfig({
        RESEND_WEBHOOK_SECRET: "whsec_dGVzdC13ZWJob29rLXNlY3JldA==",
      }),
    ).not.toThrow();
  });

  it.each([
    [{ EMAIL_FROM: "notice@preppy.test" }],
    [{ RESEND_API_KEY: "re_test_capability_key" }],
    [{ RESEND_API_KEY: " secret ", EMAIL_FROM: "notice@preppy.test" }],
    [{ RESEND_API_KEY: "re_test", EMAIL_FROM: "not-an-address" }],
  ])("rejects invalid send capability input %#", (environment) => {
    expect(() => parseResendSendConfig(environment)).toThrow();
  });

  it.each([
    [{}],
    [{ RESEND_WEBHOOK_SECRET: "secret-without-whsec-prefix" }],
    [{ RESEND_WEBHOOK_SECRET: "whsec_" }],
  ])("rejects invalid webhook capability input %#", (environment) => {
    expect(() => parseResendWebhookConfig(environment)).toThrow();
  });
});
