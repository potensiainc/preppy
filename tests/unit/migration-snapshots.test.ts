import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import * as schema from "@/src/db/schema";

const meta = resolve("src/db/migrations/meta");
const journal = JSON.parse(
  readFileSync(resolve(meta, "_journal.json"), "utf8"),
) as { entries: { idx: number; tag: string }[] };
const snapshots = journal.entries.map(
  ({ tag }) =>
    JSON.parse(
      readFileSync(resolve(meta, `${tag.slice(0, 4)}_snapshot.json`), "utf8"),
    ) as { id: string; prevId: string; tables: Record<string, unknown> },
);

// `drizzle-kit generate` diffs the schema against the latest snapshot. A
// missing snapshot makes it re-create tables that an earlier migration made.
describe("drizzle migration snapshots", () => {
  it("has one snapshot file per journal entry", () => {
    const files = readdirSync(meta).filter((name) =>
      name.endsWith("_snapshot.json"),
    );
    expect(files).toHaveLength(journal.entries.length);
  });

  it("chains every snapshot to its predecessor", () => {
    snapshots.forEach((snapshot, index) => {
      if (index > 0) expect(snapshot.prevId).toBe(snapshots[index - 1]!.id);
    });
  });

  it("records every schema table in the latest snapshot", () => {
    const schemaTables = (Object.values(schema) as unknown[])
      .filter(
        (value): value is PgTable =>
          typeof value === "object" &&
          value !== null &&
          Symbol.for("drizzle:IsDrizzleTable") in value,
      )
      .map((table) => `public.${getTableConfig(table).name}`)
      .sort();
    expect(Object.keys(snapshots.at(-1)!.tables).sort()).toEqual(schemaTables);
  });
});
