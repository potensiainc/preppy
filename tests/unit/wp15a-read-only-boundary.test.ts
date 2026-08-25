import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertReadOnlySessionSettings,
  isReadOnlySqlText,
  UnsafeProductionConnectionError,
} from "@/src/modules/production-preflight/read-only-database.server";

describe("WP-15A production read-only boundary", () => {
  it("requires both current and default transaction settings to be read-only", () => {
    expect(() =>
      assertReadOnlySessionSettings({
        transactionReadOnly: "on",
        defaultTransactionReadOnly: "on",
      }),
    ).not.toThrow();

    for (const settings of [
      { transactionReadOnly: "off", defaultTransactionReadOnly: "on" },
      { transactionReadOnly: "on", defaultTransactionReadOnly: "off" },
      { transactionReadOnly: "off", defaultTransactionReadOnly: "off" },
    ]) {
      expect(() => assertReadOnlySessionSettings(settings)).toThrow(
        UnsafeProductionConnectionError,
      );
    }
  });

  it("allows only one read statement with an explicitly read-only root keyword", () => {
    for (const query of [
      "SELECT count(*) FROM institutions",
      "show transaction_read_only",
      "WITH counts AS (SELECT 1) SELECT * FROM counts",
    ]) {
      expect(isReadOnlySqlText(query)).toBe(true);
    }

    for (const query of [
      "INSERT INTO institutions DEFAULT VALUES",
      "SELECT 1; DELETE FROM users",
      "WITH changed AS (UPDATE users SET status='DELETED' RETURNING *) SELECT * FROM changed",
      "VACUUM institutions",
      "SELECT pg_advisory_lock(1)",
      "SELECT nextval('some_sequence')",
    ]) {
      expect(isReadOnlySqlText(query)).toBe(false);
    }
  });

  it("contains no production mutation, worker, migration, or apply-backfill imports", async () => {
    const source = await readFile(
      join(
        process.cwd(),
        "src/modules/production-preflight/read-only-database.server.ts",
      ),
      "utf8",
    );

    for (const forbidden of [
      "modules/admin/http",
      "AuditWriter",
      "OutboxWriter",
      "modules/worker",
      "db/migrate",
      "applyInstitutionBackfill",
      "applyOpportunityBackfill",
      "applySourceBindingBackfill",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).not.toMatch(
      /\b(insert|update|delete|truncate|alter|drop)\s*`/i,
    );
  });
});
