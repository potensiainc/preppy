import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

afterEach(() => vi.unstubAllEnvs());

describe("Staging indexing boundary", () => {
  it("sets a noindex response header on Staging pages", () => {
    vi.stubEnv("PREPPY_ENVIRONMENT", "STAGING");
    const response = proxy(
      new NextRequest("https://staging.preppy.example/institutions"),
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("does not add a noindex response header in Production", () => {
    vi.stubEnv("PREPPY_ENVIRONMENT", "PRODUCTION");
    const response = proxy(
      new NextRequest("https://preppy.example/institutions"),
    );
    expect(response.headers.has("x-robots-tag")).toBe(false);
  });
});
