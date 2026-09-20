import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/deployment-health/route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/deployment-health", () => {
  it("rejects a mismatched Railway environment without revealing secrets", async () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "staging");
    vi.stubEnv("PREPPY_ENVIRONMENT", "PRODUCTION");
    const response = GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "misconfigured",
      service: "admissionradar",
    });
  });

  it("accepts matching Staging and Production labels", () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "staging");
    vi.stubEnv("PREPPY_ENVIRONMENT", "STAGING");
    expect(GET().status).toBe(200);
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    vi.stubEnv("PREPPY_ENVIRONMENT", "PRODUCTION");
    expect(GET().status).toBe(200);
  });
});
