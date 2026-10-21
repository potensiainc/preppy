import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/src/db/migrate";
import {
  LEGACY_MODEL_TABLES,
  auditLegacyModel,
} from "@/src/modules/legacy-audit/legacy-model-audit";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(databaseUrl);
const sql = postgres(databaseUrl, { max: 1 });

describe("legacy model audit", () => {
  beforeAll(async () => {
    await migrateDatabase(databaseUrl);
  });
  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("reports counts for every legacy table and opportunity truth mode", async () => {
    const audit = await auditLegacyModel(sql);
    expect(audit.readOnly).toBe(true);
    expect(audit.tables.map(({ table }) => table)).toEqual([
      ...LEGACY_MODEL_TABLES,
    ]);
    for (const entry of audit.tables) {
      expect(entry.rows).toBeGreaterThanOrEqual(0);
      if (entry.writesLast90Days !== null)
        expect(entry.writesLast90Days).toBeLessThanOrEqual(entry.rows);
    }
    for (const row of audit.opportunitiesByTruthMode)
      expect(["NATIVE", "LEGACY_BACKED"]).toContain(row.truthMode);
  });

  it("only reads: the transaction rejects writes", async () => {
    await expect(
      sql.begin(
        "isolation level repeatable read read only",
        (tx) => tx`insert into guides (id) values (gen_random_uuid())`,
      ),
    ).rejects.toMatchObject({ code: "25006" });
  });
});
