import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  DatabaseContractViolationError,
  queryOne,
  queryRows,
} from "@/src/infrastructure/db/typed-query";

function executor(rows: unknown[]) {
  return { raw: (async () => rows) as never };
}
const schema = z.object({ id: z.string(), count: z.number().int() });

describe("typed raw queries", () => {
  it("returns rows that match the contract", async () => {
    await expect(
      queryRows(executor([{ id: "a", count: 1 }]), sql`select 1`, schema),
    ).resolves.toEqual([{ id: "a", count: 1 }]);
    await expect(
      queryOne(executor([]), sql`select 1`, schema),
    ).resolves.toBeUndefined();
  });

  it("rejects a drifted row without echoing its values", async () => {
    const failure = queryRows(
      executor([{ id: "a", count: "1", email: "parent@example.test" }]),
      sql`select 1`,
      schema.strict(),
    );
    await expect(failure).rejects.toBeInstanceOf(
      DatabaseContractViolationError,
    );
    await expect(failure).rejects.toMatchObject({
      code: "DATABASE_CONTRACT_VIOLATION",
    });
    const error = (await failure.catch((caught: unknown) => caught)) as Error;
    expect(error.message).not.toContain("parent@example.test");
    expect(error.message).toContain("0.count");
  });
});
