import { afterAll, describe, expect, it } from "vitest";

import {
  checkDatabaseConnection,
  closeDatabaseConnection,
} from "@/src/db/connection";

describe("PostgreSQL connection", () => {
  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it("executes a readiness query against the configured database", async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    expect(databaseUrl, "TEST_DATABASE_URL must be set").toBeTruthy();

    await expect(checkDatabaseConnection(databaseUrl!)).resolves.toBe(true);
  });
});
