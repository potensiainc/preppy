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

  it("enables production client and server analytics with both credentials", () => {
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

  it("enables client tagging without a server API secret", () => {
    const environment = {
      NODE_ENV: "production",
      ANALYTICS_ENABLED: "true",
      GA4_MEASUREMENT_ID: "G-J8C7HH3YJ3",
    };
    expect(parseClientAnalyticsConfig(environment)).toEqual({
      mode: "GA4",
      measurementId: "G-J8C7HH3YJ3",
    });
    expect(parseServerAnalyticsConfig(environment)).toEqual({ mode: "NOOP" });
  });

  it("fails closed when production analytics is enabled without a valid measurement ID", () => {
    expect(() =>
      parseClientAnalyticsConfig({
        NODE_ENV: "production",
        ANALYTICS_ENABLED: "true",
      }),
    ).toThrow();
    expect(() =>
      parseClientAnalyticsConfig({
        NODE_ENV: "production",
        ANALYTICS_ENABLED: "true",
        GA4_MEASUREMENT_ID: "invalid",
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
