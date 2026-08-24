import { describe, expect, expectTypeOf, it } from "vitest";

import { parseDatabaseEnv, parseServerEnv } from "@/src/config/env";
import type { AdminAuthConfig } from "@/src/modules/admin/auth/config.server";

const validEnv = {
  DATABASE_URL: "postgres://user:password@localhost:5432/admissionradar",
  APP_BASE_URL: "http://localhost:3000",
};

describe("parseServerEnv", () => {
  it("parses generic server configuration without Admin OIDC settings", () => {
    expect(parseServerEnv(validEnv)).toEqual(validEnv);
  });

  it("rejects a missing database URL", () => {
    expect(() =>
      parseServerEnv({ ...validEnv, DATABASE_URL: undefined }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects an invalid application base URL", () => {
    expect(() =>
      parseServerEnv({ ...validEnv, APP_BASE_URL: "admissionradar" }),
    ).toThrow(/APP_BASE_URL/);
  });

  it("rejects a non-PostgreSQL database URL scheme", () => {
    expect(() =>
      parseServerEnv({
        ...validEnv,
        DATABASE_URL: "postgresx://user:password@localhost/admissionradar",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-HTTP application base URL scheme", () => {
    expect(() =>
      parseServerEnv({
        ...validEnv,
        APP_BASE_URL: "ftp://admissionradar.example.com",
      }),
    ).toThrow(/APP_BASE_URL/);
  });

  it("does not eagerly validate Admin capability settings", () => {
    expect(
      parseServerEnv({
        ...validEnv,
        ADMIN_AUTH_ISSUER: "not-an-issuer",
        ADMIN_AUTH_CLIENT_SECRET: "short",
      }),
    ).toEqual(validEnv);
  });
});

describe("parseDatabaseEnv", () => {
  it("validates database commands without unrelated application settings", () => {
    expect(parseDatabaseEnv({ DATABASE_URL: validEnv.DATABASE_URL })).toEqual({
      DATABASE_URL: validEnv.DATABASE_URL,
    });
  });
});

describe("environment capability isolation", () => {
  it("allows public server modules to import without Admin OIDC settings", async () => {
    const adminNames = [
      "ADMIN_AUTH_ISSUER",
      "ADMIN_AUTH_CLIENT_ID",
      "ADMIN_AUTH_CLIENT_SECRET",
      "ADMIN_SESSION_SECRET",
      "ADMIN_OIDC_FLOW_SECRET",
    ] as const;
    const previousValues = Object.fromEntries(
      adminNames.map((name) => [name, process.env[name]]),
    );
    for (const name of adminNames) delete process.env[name];

    try {
      const publicModule = await import("@/src/modules/public/indexability");

      expect(publicModule.getIndexability).toBeTypeOf("function");
    } finally {
      for (const name of adminNames) {
        const previous = previousValues[name];
        if (previous === undefined) delete process.env[name];
        else process.env[name] = previous;
      }
    }
  });

  it("keeps type-only Admin configuration imports runtime-inert", () => {
    expectTypeOf<AdminAuthConfig["redirectUri"]>().toEqualTypeOf<string>();
  });
});
