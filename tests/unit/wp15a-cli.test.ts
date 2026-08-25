import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  productionPreflightConfig,
  skippedProductionPreflight,
} from "@/src/modules/production-preflight/run-production-preflight.server";

describe("WP-15A production preflight entry point", () => {
  it("treats absent production credentials as an explicit safe skip", () => {
    expect(
      productionPreflightConfig({
        PRODUCTION_DATABASE_URL: undefined,
        APP_BASE_URL: "https://preppy.example",
      }),
    ).toEqual({
      status: "SKIPPED_CREDENTIALS_UNAVAILABLE",
      appBaseUrl: "https://preppy.example",
    });
    expect(skippedProductionPreflight()).toEqual({
      executed: false,
      reason: "CREDENTIALS_UNAVAILABLE",
      exitCode: 0,
      finalGate: "READY_FOR_WP16A",
    });
    expect(
      productionPreflightConfig({
        PRODUCTION_DATABASE_URL: undefined,
        APP_BASE_URL: undefined,
      }),
    ).toEqual({
      status: "SKIPPED_CREDENTIALS_UNAVAILABLE",
      appBaseUrl: "NOT_EXECUTED",
    });
  });

  it("accepts only the explicit production URL and canonical app origin", () => {
    expect(
      productionPreflightConfig({
        PRODUCTION_DATABASE_URL:
          "postgres://reader:secret@db.example/preppy_production",
        DATABASE_URL: "postgres://writer:secret@db.example/preppy",
        APP_BASE_URL: "https://preppy.example/",
      }),
    ).toEqual({
      status: "READY",
      productionDatabaseUrl:
        "postgres://reader:secret@db.example/preppy_production",
      appBaseUrl: "https://preppy.example",
    });
    expect(() =>
      productionPreflightConfig({
        PRODUCTION_DATABASE_URL: "postgres://reader:secret@db.example/preppy",
        APP_BASE_URL: "not-an-origin",
      }),
    ).toThrow(/APP_BASE_URL/);
  });

  it("does not import production mutation paths", async () => {
    const source = await readFile(
      join(
        process.cwd(),
        "src/modules/production-preflight/run-production-preflight.server.ts",
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
      "EmailSender",
      "AnalyticsTracker",
      "revalidation-client",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
