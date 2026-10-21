import { randomUUID } from "node:crypto";

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

  it("counts a recent update of an old row as a recent write", async () => {
    const id = randomUUID();
    await sql`insert into guides
        (id, slug, title, summary, body_markdown, status, created_at, updated_at)
      values (${id}, ${`legacy-audit-${id}`}, 'legacy audit', 'summary', 'body',
        'DRAFT', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z')`;
    try {
      const before = (await auditLegacyModel(sql)).tables.find(
        ({ table }) => table === "guides",
      )!;
      await sql`update guides set updated_at = now() where id = ${id}`;
      const after = (await auditLegacyModel(sql)).tables.find(
        ({ table }) => table === "guides",
      )!;
      expect(after.writesLast90Days).toBe(before.writesLast90Days! + 1);
    } finally {
      await sql`delete from guides where id = ${id}`;
    }
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
