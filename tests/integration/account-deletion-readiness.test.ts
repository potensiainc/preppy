import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { runFullMigrations, type MigrationSql } from "@/src/db/migrate";
import { loadMigrationSpecs } from "@/src/db/migration-plan";
import * as schema from "@/src/db/schema";
import { closeRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import {
  isAccountDeletionSchemaReady,
  resetAccountDeletionReadinessCache,
} from "@/src/modules/account-deletion/readiness.server";
import {
  deletionRoute,
  isAccountDeletionAvailable,
  pendingCancellationRoute,
} from "@/src/modules/account-deletion/runtime.server";
import { POST as kakaoUnlinkWebhook } from "@/app/api/webhooks/kakao/unlink/route";
import { getOperationalSnapshot } from "@/src/modules/production-safety/operational-snapshot.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const sharedUrl = process.env.TEST_DATABASE_URL;
if (!sharedUrl) throw new Error("TEST_DATABASE_URL must be set");
assertDedicatedTestDatabaseUrl(sharedUrl);

// Production applied migrations through 0016 plus 0018 but not 0017. A
// database migrated only through 0016 has the same missing 0017 objects.
const withoutDeletion = new URL(sharedUrl);
withoutDeletion.pathname += "_no_deletion_test";
const withoutDeletionUrl = withoutDeletion.toString();
assertDedicatedTestDatabaseUrl(withoutDeletionUrl);
const adminUrl = new URL(sharedUrl);
adminUrl.pathname = "/postgres";
const admin = postgres(adminUrl.toString(), { max: 1 });
const databaseName = withoutDeletion.pathname.slice(1);
let partial: MigrationSql;
const fullClient = postgres(sharedUrl, { max: 1 });

function executorFor(client: MigrationSql) {
  const database = drizzle(client, { schema });
  return { raw: database.execute.bind(database) };
}

describe("account deletion readiness", () => {
  beforeAll(async () => {
    await admin.unsafe(
      `drop database if exists "${databaseName}" with (force)`,
    );
    await admin.unsafe(`create database "${databaseName}"`);
    partial = postgres(withoutDeletionUrl, { max: 1 });
    const specs = await loadMigrationSpecs();
    const through0016 = specs.slice(
      0,
      specs.findIndex(
        ({ identifier }) => identifier === "0017_account_deletion",
      ),
    );
    await runFullMigrations(partial, through0016);
  });
  beforeEach(() => {
    resetAccountDeletionReadinessCache();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await closeRuntimeDatabase();
    await partial?.end({ timeout: 5 });
    await fullClient.end({ timeout: 5 });
    await admin.unsafe(
      `drop database if exists "${databaseName}" with (force)`,
    );
    await admin.end({ timeout: 5 });
  });

  it("is ready on a database with migration 0017 applied", async () => {
    const { migrateDatabase } = await import("@/src/db/migrate");
    await migrateDatabase(sharedUrl);
    await expect(
      isAccountDeletionSchemaReady(executorFor(fullClient)),
    ).resolves.toBe(true);
  });

  it("is not ready without migration 0017", async () => {
    await expect(
      isAccountDeletionSchemaReady(executorFor(partial)),
    ).resolves.toBe(false);
  });

  it("is not ready when only part of 0017 exists", async () => {
    await partial.unsafe(
      "create table account_deletion_jobs(id uuid primary key)",
    );
    await partial.unsafe(
      "create table kakao_unlink_inbox(subject_fingerprint text primary key)",
    );
    try {
      await expect(
        isAccountDeletionSchemaReady(executorFor(partial)),
      ).resolves.toBe(false);
    } finally {
      await partial.unsafe("drop table account_deletion_jobs");
      await partial.unsafe("drop table kakao_unlink_inbox");
    }
  });

  it("raises a critical admin alert when the flag is on but 0017 is missing", async () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const missing = await getOperationalSnapshot(
      executorFor(partial) as never,
      { now, accountDeletionEnabled: true },
    );
    expect(missing.alerts).toEqual(
      expect.arrayContaining([
        {
          code: "ACCOUNT_DELETION_SCHEMA_MISSING",
          severity: "CRITICAL",
          count: 1,
        },
      ]),
    );
    resetAccountDeletionReadinessCache();
    const off = await getOperationalSnapshot(executorFor(partial) as never, {
      now,
      accountDeletionEnabled: false,
    });
    expect(
      off.alerts.some(({ code }) => code === "ACCOUNT_DELETION_SCHEMA_MISSING"),
    ).toBe(false);
  });

  it("fails closed when the readiness query errors", async () => {
    const broken = {
      raw: async () => {
        throw new Error("permission denied");
      },
    };
    await expect(isAccountDeletionSchemaReady(broken as never)).resolves.toBe(
      false,
    );
  });

  describe("with the feature flag on against a database without 0017", () => {
    beforeEach(() => {
      vi.stubEnv("ACCOUNT_DELETION_ENABLED", "true");
      vi.stubEnv("ACCOUNT_DELETION_READINESS", "verified");
      vi.stubEnv("ACCOUNT_DELETION_KEY", "a".repeat(64));
      vi.stubEnv("ACCOUNT_DELETION_RECEIPT_SECRET", "r".repeat(40));
      vi.stubEnv("KAKAO_ADMIN_KEY", "kakao-admin-test");
      vi.stubEnv("KAKAO_APP_ID", "123456");
      vi.stubEnv("DATABASE_URL", withoutDeletionUrl);
      vi.stubEnv("DATABASE_MAX_CONNECTIONS", "2");
      vi.stubEnv("NODE_ENV", "test");
    });

    it("reports the feature as unavailable despite the flag", async () => {
      await expect(isAccountDeletionAvailable()).resolves.toBe(false);
    });

    it("reports the feature as available once the database has 0017", async () => {
      await closeRuntimeDatabase();
      vi.stubEnv("DATABASE_URL", sharedUrl);
      try {
        await expect(isAccountDeletionAvailable()).resolves.toBe(true);
      } finally {
        await closeRuntimeDatabase();
      }
    });

    it("keeps the deletion API unavailable without writing", async () => {
      const response = await deletionRoute(
        new Request("http://localhost:3000/api/me/account/deletion", {
          method: "POST",
          body: JSON.stringify({ confirm: true }),
        }),
        "POST",
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        code: "DELETION_UNAVAILABLE",
      });
    });

    it("keeps signup cancellation unavailable", async () => {
      const response = await pendingCancellationRoute(
        new Request("http://localhost:3000/api/auth/onboarding/cancel", {
          method: "POST",
        }),
      );
      expect(response.status).toBe(503);
    });

    it("answers the Kakao unlink webhook with 503 so Kakao retries later", async () => {
      const response = await kakaoUnlinkWebhook(
        new Request("http://localhost:3000/api/webhooks/kakao/unlink", {
          method: "POST",
          headers: {
            authorization: "KakaoAK kakao-admin-test",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: "app_id=123456&user_id=1&referrer_type=UNLINK_FROM_APPS",
        }),
      );
      expect(response.status).toBe(503);
    });
  });
});
