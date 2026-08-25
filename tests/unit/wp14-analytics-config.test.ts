import { describe, expect, it } from "vitest";

import {
  parseClientAnalyticsConfig,
  parseServerAnalyticsConfig,
} from "@/src/analytics/config.server";

describe("WP-14 analytics configuration", () => {
  it("defaults every non-production environment to Noop without credentials", () => {
    expect(parseClientAnalyticsConfig({ NODE_ENV: "development" })).toEqual({
      mode: "NOOP",
    });
    expect(
      parseServerAnalyticsConfig({
        NODE_ENV: "test",
        ANALYTICS_ENABLED: "true",
      }),
    ).toEqual({ mode: "NOOP" });
    expect(
      parseClientAnalyticsConfig({
        NODE_ENV: "development",
        ANALYTICS_ENABLED: "false",
        GA4_MEASUREMENT_ID: "",
        GA4_API_SECRET: "",
      }),
    ).toEqual({ mode: "NOOP" });
  });

  it("enables production only with a valid measurement ID and server API secret", () => {
    const environment = {
      NODE_ENV: "production",
      ANALYTICS_ENABLED: "true",
      GA4_MEASUREMENT_ID: "G-ABC12345",
      GA4_API_SECRET: "server-only-secret",
    };
    expect(parseClientAnalyticsConfig(environment)).toEqual({
      mode: "GA4",
      measurementId: "G-ABC12345",
    });
    expect(parseServerAnalyticsConfig(environment)).toEqual({
      mode: "GA4",
      measurementId: "G-ABC12345",
      apiSecret: "server-only-secret",
    });
    expect(
      JSON.stringify(parseClientAnalyticsConfig(environment)),
    ).not.toContain("server-only-secret");
  });

  it("fails closed when production analytics is enabled without either credential", () => {
    expect(() =>
      parseClientAnalyticsConfig({
        NODE_ENV: "production",
        ANALYTICS_ENABLED: "true",
      }),
    ).toThrow();
    expect(() =>
      parseServerAnalyticsConfig({
        NODE_ENV: "production",
        ANALYTICS_ENABLED: "true",
        GA4_MEASUREMENT_ID: "G-ABC12345",
      }),
    ).toThrow();
  });

  it("keeps explicitly disabled production analytics Noop without credentials", () => {
    expect(
      parseServerAnalyticsConfig({
        NODE_ENV: "production",
        ANALYTICS_ENABLED: "false",
      }),
    ).toEqual({ mode: "NOOP" });
  });
});
