import { describe, expect, it } from "vitest";

import {
  assertDedicatedRehearsalDatabaseUrl,
  databaseIdentityFromUrl,
} from "@/src/modules/production-preflight/database-guard";

describe("WP-15A database guards", () => {
  it("accepts only explicitly dedicated rehearsal-like database names", () => {
    for (const name of [
      "preppy_rehearsal",
      "preppy_verify",
      "preppy_test",
      "preppy_staging",
      "preppy_wp15a_rehearsal_42",
    ]) {
      expect(() =>
        assertDedicatedRehearsalDatabaseUrl(
          `postgres://runner:secret@localhost:55433/${name}`,
        ),
      ).not.toThrow();
    }
  });

  it("rejects production/default names, malformed URLs, and production equality", () => {
    for (const value of [
      "postgres://runner:secret@localhost:55433/preppy",
      "postgres://runner:secret@localhost:55433/preppy_production",
      "postgres://runner:secret@localhost:55433/postgres",
      "not-a-url",
    ]) {
      expect(() => assertDedicatedRehearsalDatabaseUrl(value)).toThrow(
        /dedicated rehearsal database/i,
      );
    }

    expect(() =>
      assertDedicatedRehearsalDatabaseUrl(
        "postgres://runner:rehearsal-secret@localhost:55433/preppy_rehearsal",
        "postgres://runner:production-secret@LOCALHOST:55433/preppy_rehearsal",
      ),
    ).toThrow(/must not equal production/i);
  });

  it("returns safe identity metadata and never leaks credentials in failures", () => {
    expect(
      databaseIdentityFromUrl(
        "postgres://reader:super-secret@db.example:5432/preppy_rehearsal?sslmode=require",
      ),
    ).toEqual({
      databaseName: "preppy_rehearsal",
      host: "db.example",
      port: "5432",
    });

    let failure: unknown;
    try {
      assertDedicatedRehearsalDatabaseUrl(
        "postgres://reader:super-secret@db.example:5432/preppy",
      );
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).not.toContain("super-secret");
    expect(String(failure)).not.toContain("reader@");
  });
});
