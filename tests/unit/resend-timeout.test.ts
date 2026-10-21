import { describe, expect, it } from "vitest";

import { ResendEmailSender } from "@/src/modules/notification/resend-email-sender.server";

const config = { apiKey: "re_test_key", from: "PREPPY <notice@example.com>" };

describe("Resend handoff timeout", () => {
  it("accepts timeouts up to ten seconds", () => {
    expect(() => new ResendEmailSender(config)).not.toThrow();
    expect(
      () => new ResendEmailSender(config, { timeoutMs: 10_000 }),
    ).not.toThrow();
  });

  it.each([0, 10_001, 1.5, Number.NaN])("rejects %s ms", (timeoutMs) => {
    expect(() => new ResendEmailSender(config, { timeoutMs })).toThrow(
      "Invalid Resend timeout.",
    );
  });
});
