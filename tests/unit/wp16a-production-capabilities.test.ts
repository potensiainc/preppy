import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getProductionCapabilityMatrix,
  validateProductionCapabilityConfig,
} from "@/src/config/production-capabilities";
import {
  getServerAnalyticsTracker,
  resetServerAnalyticsTrackerForTests,
} from "@/src/analytics/runtime.server";
import { NoopAnalyticsTracker } from "@/src/analytics/tracker";

describe("WP-16A production capability configuration", () => {
  afterEach(() => {
    resetServerAnalyticsTrackerForTests();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("allows disabled capabilities to omit their secrets", () => {
    expect(() => validateProductionCapabilityConfig({})).not.toThrow();
    const matrix = getProductionCapabilityMatrix({});
    expect(matrix.sideEffects).toEqual({
      worker: false,
      email: false,
      analytics: false,
      cacheRevalidation: false,
    });
    expect(matrix.database).toEqual({
      readOnlyPreflight: {
        configName: "PRODUCTION_DATABASE_URL",
        configured: false,
      },
      migrationCutover: { configName: "DATABASE_URL", configured: false },
      runtimeWeb: { configName: "DATABASE_URL", configured: false },
      worker: { configName: "DATABASE_URL", configured: false },
    });
  });

  it("fails closed only when an enabled capability lacks its required config", () => {
    expect(() =>
      validateProductionCapabilityConfig({ EMAIL_SEND_ENABLED: "true" }),
    ).toThrow(/email capability/i);
    expect(() =>
      validateProductionCapabilityConfig({ ANALYTICS_ENABLED: "true" }),
    ).toThrow(/analytics capability/i);
    expect(() =>
      validateProductionCapabilityConfig({
        CACHE_REVALIDATION_ENABLED: "true",
      }),
    ).toThrow(/cache capability/i);
    expect(() =>
      validateProductionCapabilityConfig({ WORKER_ENABLED: "true" }),
    ).toThrow(/worker capability/i);
  });

  it("accepts independently configured enabled capabilities", () => {
    expect(() =>
      validateProductionCapabilityConfig({
        EMAIL_SEND_ENABLED: "true",
        RESEND_API_KEY: "re_scoped_email_key",
        EMAIL_FROM: "PREPPY <notice@preppy.test>",
        ANALYTICS_ENABLED: "true",
        GA4_MEASUREMENT_ID: "G-ABC12345",
        GA4_API_SECRET: "analytics-scoped-secret",
        CACHE_REVALIDATION_ENABLED: "true",
        CACHE_REVALIDATION_SECRET:
          "cache-scoped-secret-that-is-at-least-32-bytes",
        WORKER_ENABLED: "true",
        DATABASE_URL: "postgres://worker:redacted@localhost/preppy_test",
      }),
    ).not.toThrow();
  });

  it("rejects configured cross-domain secret reuse without exposing values", () => {
    const repeated = "shared-secret-that-must-never-be-reused-123";
    let failure: unknown;
    try {
      validateProductionCapabilityConfig({
        ADMIN_SESSION_SECRET: repeated,
        ADMIN_OIDC_FLOW_SECRET: repeated,
      });
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toMatch(/capability secrets must be distinct/i);
    expect(String(failure)).not.toContain(repeated);
  });

  it("returns configured booleans and config names, never secret values", () => {
    const secret = "cache-scoped-secret-that-is-at-least-32-bytes";
    const matrix = getProductionCapabilityMatrix({
      CACHE_REVALIDATION_SECRET: secret,
      ADMIN_AUTH_CLIENT_ID: "admin-client",
    });
    expect(matrix.secrets.cacheHmac).toEqual({
      configName: "CACHE_REVALIDATION_SECRET",
      configured: true,
    });
    expect(matrix.secrets.adminOidcClient).toEqual({
      configName: "ADMIN_AUTH_CLIENT_SECRET",
      configured: false,
    });
    expect(JSON.stringify(matrix)).not.toContain(secret);
  });

  it("does not initialize the Worker database path when Worker is disabled", async () => {
    vi.stubEnv("WORKER_ENABLED", "false");
    vi.stubEnv("EMAIL_SEND_ENABLED", "false");
    vi.stubEnv("ANALYTICS_ENABLED", "false");
    vi.stubEnv("CACHE_REVALIDATION_ENABLED", "false");
    vi.stubEnv("DATABASE_URL", "");
    const { runWorkerCommand } = await import("@/scripts/worker");
    const result = await runWorkerCommand([
      "--once",
      "--fake-outcome=ACCEPTED",
    ]);
    expect(result).toEqual({
      exitCode: 0,
      output: JSON.stringify({
        enabled: false,
        recovered: { pending: 0, failed: 0, deadLettered: 0 },
        claimed: 0,
        processed: 0,
        failed: 0,
      }),
    });
  });

  it("uses Noop analytics and makes no GA request when Analytics is disabled", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ANALYTICS_ENABLED", "false");
    vi.stubEnv("GA4_MEASUREMENT_ID", "G-ABC12345");
    vi.stubEnv("GA4_API_SECRET", "configured-but-disabled");

    const tracker = getServerAnalyticsTracker();
    expect(tracker).toBeInstanceOf(NoopAnalyticsTracker);
    await tracker.track("article_view", {
      articleId: "00000000-0000-4000-8000-000000000001",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
