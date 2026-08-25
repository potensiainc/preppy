import { describe, expect, it } from "vitest";

import {
  assertDedicatedBackupSourceDatabaseUrl,
  assertDedicatedRestoreDatabaseUrl,
} from "@/src/modules/production-safety/database-guard";

describe("WP-16A backup and restore database guards", () => {
  const production =
    "postgres://production_reader:redacted@db.example:5432/preppy";

  it("accepts only unmistakably non-production source and restore targets", () => {
    for (const name of [
      "preppy_rehearsal",
      "preppy_verify",
      "preppy_test",
      "preppy_staging",
      "preppy_wp16a_restore_42",
    ]) {
      expect(() =>
        assertDedicatedBackupSourceDatabaseUrl(
          `postgres://runner:redacted@localhost:55433/${name}`,
          production,
        ),
      ).not.toThrow();
    }

    expect(() =>
      assertDedicatedRestoreDatabaseUrl(
        "postgres://runner:redacted@localhost:55433/preppy_restore",
        {
          sourceDatabaseUrl:
            "postgres://runner:redacted@localhost:55433/preppy_rehearsal",
          productionDatabaseUrl: production,
        },
      ),
    ).not.toThrow();
  });

  it("rejects production-like, default, ambiguous, equal, and malformed targets", () => {
    for (const value of [
      "postgres://runner:redacted@localhost:55433/preppy",
      "postgres://runner:redacted@localhost:55433/preppy_production_restore",
      "postgres://runner:redacted@localhost:55433/postgres",
      "postgres://runner:redacted@localhost:55433/preppy_test%0A--flag",
      "postgres://runner:redacted@localhost:55433/preppy_test%2Fother",
      "not-a-url",
    ]) {
      expect(() =>
        assertDedicatedRestoreDatabaseUrl(value, {
          sourceDatabaseUrl:
            "postgres://runner:redacted@localhost:55433/preppy_rehearsal",
          productionDatabaseUrl: production,
        }),
      ).toThrow(/dedicated non-production restore database/i);
    }

    expect(() =>
      assertDedicatedRestoreDatabaseUrl(
        "postgres://other:different@LOCALHOST:55433/preppy_rehearsal",
        {
          sourceDatabaseUrl:
            "postgres://runner:redacted@localhost:55433/preppy_rehearsal",
          productionDatabaseUrl: production,
        },
      ),
    ).toThrow(/must differ from source/i);
  });

  it("never includes credentials in guard failures", () => {
    let failure: unknown;
    try {
      assertDedicatedBackupSourceDatabaseUrl(
        "postgres://private-user:super-secret@db.example:5432/preppy",
        production,
      );
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).not.toContain("super-secret");
    expect(String(failure)).not.toContain("private-user");
  });
});
