import { describe, expect, it } from "vitest";

import {
  parseRuntimeDatabaseEnv,
  parseSideEffectEnv,
} from "@/src/config/runtime-env";

const DATABASE_URL =
  "postgres://user:password@localhost:5432/admissionradar_test";

describe("parseRuntimeDatabaseEnv", () => {
  it("uses a bounded local/test default without unrelated provider settings", () => {
    expect(parseRuntimeDatabaseEnv({ DATABASE_URL, NODE_ENV: "test" })).toEqual(
      {
        DATABASE_URL,
        DATABASE_MAX_CONNECTIONS: 5,
        NODE_ENV: "test",
      },
    );
  });

  it.each(["0", "-1", "1.5", "many", "9".repeat(400)])(
    "rejects an invalid pool size: %s",
    (DATABASE_MAX_CONNECTIONS) => {
      expect(() =>
        parseRuntimeDatabaseEnv({
          DATABASE_URL,
          DATABASE_MAX_CONNECTIONS,
          NODE_ENV: "test",
        }),
      ).toThrow(/DATABASE_MAX_CONNECTIONS/);
    },
  );

  it("requires an explicit pool size in production", () => {
    expect(() =>
      parseRuntimeDatabaseEnv({ DATABASE_URL, NODE_ENV: "production" }),
    ).toThrow(/DATABASE_MAX_CONNECTIONS/);
  });

  it("accepts production DB configuration without Kakao, Email, or GA4", () => {
    expect(
      parseRuntimeDatabaseEnv({
        DATABASE_URL,
        DATABASE_MAX_CONNECTIONS: "8",
        NODE_ENV: "production",
      }),
    ).toEqual({
      DATABASE_URL,
      DATABASE_MAX_CONNECTIONS: 8,
      NODE_ENV: "production",
    });
  });
});

describe("parseSideEffectEnv", () => {
  it("defaults every external side effect to disabled", () => {
    expect(parseSideEffectEnv({ NODE_ENV: "development" })).toEqual({
      EMAIL_SEND_ENABLED: false,
      WORKER_ENABLED: false,
      ANALYTICS_ENABLED: false,
      CACHE_REVALIDATION_ENABLED: false,
    });
  });

  it("parses explicit switches without requiring provider credentials", () => {
    expect(
      parseSideEffectEnv({
        NODE_ENV: "production",
        EMAIL_SEND_ENABLED: "true",
        WORKER_ENABLED: "false",
        ANALYTICS_ENABLED: "true",
        CACHE_REVALIDATION_ENABLED: "true",
      }),
    ).toEqual({
      EMAIL_SEND_ENABLED: true,
      WORKER_ENABLED: false,
      ANALYTICS_ENABLED: true,
      CACHE_REVALIDATION_ENABLED: true,
    });
  });
});
