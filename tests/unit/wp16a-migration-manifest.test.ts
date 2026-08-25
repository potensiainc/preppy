import { describe, expect, it } from "vitest";

import { loadRepositoryMigrationManifest } from "@/src/modules/production-preflight/migrations";
import { EXPECTED_REPOSITORY_MIGRATIONS } from "@/src/modules/production-safety/migration-manifest";

describe("WP-16A static runtime migration manifest", () => {
  it("matches the repository journal and SQL hashes exactly", async () => {
    await expect(
      loadRepositoryMigrationManifest("src/db/migrations"),
    ).resolves.toEqual(EXPECTED_REPOSITORY_MIGRATIONS);
  });
});
