import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

describe("WP-13 robots metadata route", () => {
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
