import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  runWithProductionReadOnlyDatabase,
  UnsafeProductionConnectionError,
} from "@/src/modules/production-preflight/read-only-database.server";
import { runProductionPreflight } from "@/src/modules/production-preflight/run-production-preflight.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);

describe("WP-15A production connection gate", () => {
  const readOnlyRole = "wp15a_readonly_test";
  const readOnlyPassword = "wp15a-test-only";
  const admin = postgres(databaseUrl, { max: 1 });

  beforeAll(async () => {
    await admin.unsafe(`drop role if exists ${readOnlyRole}`);
    await admin.unsafe(
      `create role ${readOnlyRole} login password '${readOnlyPassword}'`,
    );
    await admin.unsafe(
      `alter role ${readOnlyRole} set default_transaction_read_only = on`,
    );
    await admin.unsafe(
      `grant connect on database admissionradar_test to ${readOnlyRole}`,
    );
    await admin.unsafe(`grant usage on schema public to ${readOnlyRole}`);
    await admin.unsafe(
      `grant select on all tables in schema public to ${readOnlyRole}`,
    );
    await admin.unsafe(`grant usage on schema drizzle to ${readOnlyRole}`);
    await admin.unsafe(
      `grant select on all tables in schema drizzle to ${readOnlyRole}`,
    );
  });

  afterAll(async () => {
    await admin.unsafe(`drop owned by ${readOnlyRole}`);
    await admin.unsafe(`drop role if exists ${readOnlyRole}`);
    await admin.end({ timeout: 5 });
  });

  it("rejects a writable connection before the inventory callback", async () => {
    let enteredInventory = false;
    await expect(
      runWithProductionReadOnlyDatabase(databaseUrl, async () => {
        enteredInventory = true;
      }),
    ).rejects.toBeInstanceOf(UnsafeProductionConnectionError);
    expect(enteredInventory).toBe(false);
  });

  it("runs bounded reads when the connection is demonstrably read-only", async () => {
    const readOnlyUrl = new URL(databaseUrl);
    readOnlyUrl.username = readOnlyRole;
    readOnlyUrl.password = readOnlyPassword;

    const result = await runWithProductionReadOnlyDatabase(
      readOnlyUrl.toString(),
      async ({ metadata, session }) => ({
        metadata,
        relations: await session.listPublicTables(),
      }),
    );

    expect(result.metadata.transactionReadOnly).toBe("on");
    expect(result.metadata.defaultTransactionReadOnly).toBe("on");
    expect(result.metadata.snapshotConsistency).toBe(
      "REPEATABLE_READ_READ_ONLY",
    );
    expect(result.relations).toContain("institutions");
  });

  it("assembles a PII-safe machine report without production mutation paths", async () => {
    const readOnlyUrl = new URL(databaseUrl);
    readOnlyUrl.username = readOnlyRole;
    readOnlyUrl.password = readOnlyPassword;
    const result = await runProductionPreflight({
      productionDatabaseUrl: readOnlyUrl.toString(),
      appBaseUrl: "https://preppy.example",
      generatedAt: new Date("2026-08-25T03:00:00.000Z"),
      ga4Configured: false,
    });

    expect(result.executed).toBe(true);
    expect(result.report.mode).toBe("PRODUCTION_READ_ONLY");
    expect(result.report.database.snapshotConsistency).toBe(
      "REPEATABLE_READ_READ_ONLY",
    );
    expect(result.report.migrations.latestApplied).toBe("0012_loving_trauma");
    expect(JSON.stringify(result.report)).not.toContain(readOnlyPassword);
    expect(JSON.stringify(result.report)).not.toContain("postgres://");
  });
});
