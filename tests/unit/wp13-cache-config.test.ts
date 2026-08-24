import { describe, expect, it } from "vitest";

import { getCacheRevalidationConfig } from "@/src/modules/cache/config.server";

describe("WP-13 cache revalidation config", () => {
  it("requires a distinct secret with at least 32 UTF-8 bytes", () => {
    const secret = "cache-secret-with-at-least-32-bytes!";
    expect(
      getCacheRevalidationConfig({ CACHE_REVALIDATION_SECRET: secret }),
    ).toEqual({ secret, maxClockSkewSeconds: 300 });
    for (const invalid of [undefined, "short", "가".repeat(10)]) {
      expect(() =>
        getCacheRevalidationConfig({ CACHE_REVALIDATION_SECRET: invalid }),
      ).toThrow();
    }
    expect(() =>
      getCacheRevalidationConfig({
        CACHE_REVALIDATION_SECRET: secret,
        ADMIN_SESSION_SECRET: secret,
      }),
    ).toThrow();
    expect(() =>
      getCacheRevalidationConfig({
        CACHE_REVALIDATION_SECRET: secret,
        RESEND_WEBHOOK_SECRET: secret,
      }),
    ).toThrow();
  });
});
