import { describe, expect, it } from "vitest";

import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const config = {
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 2,
  NODE_ENV: "test" as const,
};

describe("runtime database lifecycle", () => {
  it("rejects live reconfiguration and can reopen after an explicit close", async () => {
    const first = getRuntimeDatabase(config);

    expect(() =>
      getRuntimeDatabase({ ...config, DATABASE_MAX_CONNECTIONS: 3 }),
    ).toThrow(/different settings/);
    await expect(first.client`select 1 as ready`).resolves.toHaveLength(1);

    const closing = closeRuntimeDatabase();
    expect(() => getRuntimeDatabase(config)).toThrow(/closing/);
    expect(closeRuntimeDatabase()).toBe(closing);
    await closing;

    const reopened = getRuntimeDatabase(config);
    expect(reopened).not.toBe(first);
    await expect(reopened.client`select 1 as ready`).resolves.toHaveLength(1);

    await closeRuntimeDatabase();
  });
});
