import { describe, expect, it } from "vitest";

import { parseDatabaseEnv, parseServerEnv } from "@/src/config/env";

const validEnv = {
  DATABASE_URL: "postgres://user:password@localhost:5432/admissionradar",
  APP_BASE_URL: "http://localhost:3000",
  ADMIN_AUTH_ISSUER: "https://identity.example.com",
  ADMIN_AUTH_CLIENT_ID: "admissionradar-local",
  ADMIN_AUTH_CLIENT_SECRET: "a-secure-local-secret-that-is-long-enough",
};

describe("parseServerEnv", () => {
  it("returns typed server configuration for a valid environment", () => {
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

  it("rejects an undersized admin client secret", () => {
    expect(() =>
      parseServerEnv({ ...validEnv, ADMIN_AUTH_CLIENT_SECRET: "short" }),
    ).toThrow(/ADMIN_AUTH_CLIENT_SECRET/);
  });
});

describe("parseDatabaseEnv", () => {
  it("validates database commands without unrelated application settings", () => {
    expect(parseDatabaseEnv({ DATABASE_URL: validEnv.DATABASE_URL })).toEqual({
      DATABASE_URL: validEnv.DATABASE_URL,
    });
  });
});
