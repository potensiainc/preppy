import { describe, expect, it } from "vitest";

import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

describe("assertDedicatedTestDatabaseUrl", () => {
  it("accepts explicit test and verification database names", () => {
    expect(() =>
      assertDedicatedTestDatabaseUrl(
        "postgres://user:secret@localhost/admissionradar_test",
      ),
    ).not.toThrow();
    expect(() =>
      assertDedicatedTestDatabaseUrl(
        "postgres://user:secret@localhost/admissionradar_verify3",
      ),
    ).not.toThrow();
  });

  it("rejects development, staging, and production-looking names", () => {
    for (const databaseName of [
      "admissionradar",
      "admissionradar_development",
      "admissionradar_staging",
      "admissionradar_production",
    ]) {
      expect(() =>
        assertDedicatedTestDatabaseUrl(
          `postgres://user:secret@localhost/${databaseName}`,
        ),
      ).toThrow(/dedicated database/);
    }
  });
});
