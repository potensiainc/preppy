import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config, proxy } from "@/proxy";
import {
  hasDeploymentEnvironmentMismatch,
  isStagingEnvironment,
} from "@/src/config/deployment-environment";

afterEach(() => vi.unstubAllEnvs());

describe("Staging indexing boundary", () => {
  it("uses Railway's authoritative name even without an application flag", () => {
    expect(isStagingEnvironment({ RAILWAY_ENVIRONMENT_NAME: "staging" })).toBe(
      true,
    );
    expect(
      isStagingEnvironment({ RAILWAY_ENVIRONMENT_NAME: "production" }),
    ).toBe(false);
    expect(isStagingEnvironment({ RAILWAY_ENVIRONMENT_NAME: "preview" })).toBe(
      true,
    );
    expect(
      hasDeploymentEnvironmentMismatch({ RAILWAY_ENVIRONMENT_NAME: "staging" }),
    ).toBe(true);
  });

  it("sets a noindex response header on Staging pages", () => {
    vi.stubEnv("PREPPY_ENVIRONMENT", "STAGING");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "staging");
    const response = proxy(
      new NextRequest("https://staging.preppy.example/institutions"),
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("does not add a noindex response header in Production", () => {
    vi.stubEnv("PREPPY_ENVIRONMENT", "PRODUCTION");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    const response = proxy(
      new NextRequest("https://preppy.example/institutions"),
    );
    expect(response.headers.has("x-robots-tag")).toBe(false);
  });

  it("keeps Staging noindex when the PREPPY flag is missing or wrong", () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "staging");
    vi.stubEnv("PREPPY_ENVIRONMENT", "PRODUCTION");
    expect(
      proxy(new NextRequest("https://staging.preppy.example/")).headers.get(
        "x-robots-tag",
      ),
    ).toBe("noindex, nofollow");
  });

  it("does not deindex Production when the PREPPY flag is wrong", () => {
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "production");
    vi.stubEnv("PREPPY_ENVIRONMENT", "STAGING");
    expect(
      proxy(new NextRequest("https://preppy.example/")).headers.has(
        "x-robots-tag",
      ),
    ).toBe(false);
  });

  it("protects pages, PDFs, and public images but skips code assets and metadata", () => {
    for (const path of [
      "/",
      "/institutions",
      "/guide.pdf",
      "/article/guide.html",
      "/photos/campus.jpg",
    ]) {
      expect(
        unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }),
      ).toBe(true);
    }
    for (const path of [
      "/_next/static/chunk.js",
      "/_next/image",
      "/commute/vendor/map.js",
      "/commute/vendor/map.css",
      "/commute/vendor/font.woff2",
      "/robots.txt",
      "/sitemap.xml",
      "/favicon.ico",
    ]) {
      expect(
        unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }),
      ).toBe(false);
    }
  });
});
