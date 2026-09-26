import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

describe("WP-13 robots metadata route", () => {
  it("lets crawlers read Staging noindex headers but omits its sitemap", () => {
    expect(
      robots({
        APP_BASE_URL: "https://staging.preppy.example",
        PREPPY_ENVIRONMENT: "STAGING",
        RAILWAY_ENVIRONMENT_NAME: "staging",
      }),
    ).toEqual({ rules: { userAgent: "*", allow: "/" } });
  });

  it("uses the Railway environment even when the PREPPY flag is wrong", () => {
    expect(
      robots({
        APP_BASE_URL: "https://staging.preppy.example",
        PREPPY_ENVIRONMENT: "PRODUCTION",
        RAILWAY_ENVIRONMENT_NAME: "staging",
      }),
    ).toEqual({ rules: { userAgent: "*", allow: "/" } });

    expect(
      robots({
        APP_BASE_URL: "https://preppy.example",
        PREPPY_ENVIRONMENT: "STAGING",
        RAILWAY_ENVIRONMENT_NAME: "production",
      }).sitemap,
    ).toBe("https://preppy.example/sitemap.xml");
  });

  it("publishes one sitemap and disallows every private surface prefix", () => {
    const result = robots({ APP_BASE_URL: "https://preppy.example" });
    expect(result.sitemap).toBe("https://preppy.example/sitemap.xml");
    expect(result.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/auth/", "/api/", "/onboarding", "/my-preppy"],
    });
    expect(result).not.toHaveProperty("noindex");
  });
});
