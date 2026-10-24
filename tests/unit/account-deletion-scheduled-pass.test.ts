import { describe, expect, it, vi } from "vitest";

import { runAccountDeletionPass } from "@/src/modules/account-deletion/scheduled-pass.server";
import type { DeletionDatabase } from "@/src/modules/account-deletion/repository.server";

const validKey = "a".repeat(64);
const untouchedDatabase = new Proxy(
  {},
  {
    get() {
      throw new Error("database must not be opened");
    },
  },
) as DeletionDatabase;

describe("account deletion pass configuration", () => {
  it("rejects an invalid deletion key before touching the database", async () => {
    await expect(
      runAccountDeletionPass(untouchedDatabase, {
        ACCOUNT_DELETION_KEY: "short",
        KAKAO_ADMIN_KEY: "admin",
      }),
    ).rejects.toThrow("DELETION_KEY_INVALID");
  });

  it("requires the Kakao admin key before touching the database", async () => {
    await expect(
      runAccountDeletionPass(untouchedDatabase, {
        ACCOUNT_DELETION_KEY: validKey,
      }),
    ).rejects.toThrow("KAKAO_ADMIN_KEY_REQUIRED");
  });
});

describe("scheduled worker deletion step", () => {
  it("does nothing while account deletion is disabled", async () => {
    vi.stubEnv("ACCOUNT_DELETION_ENABLED", "false");
    vi.stubEnv("DATABASE_URL", "");
    try {
      const { runScheduledAccountDeletion } = await import("@/scripts/worker");
      await expect(runScheduledAccountDeletion()).resolves.toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports a failed pass without exposing configuration details", async () => {
    vi.stubEnv("ACCOUNT_DELETION_KEY", "short");
    try {
      const { runScheduledAccountDeletion } = await import("@/scripts/worker");
      await expect(runScheduledAccountDeletion(true)).resolves.toEqual({
        exitCode: 1,
        output: "ACCOUNT_DELETION_WORKER_FAILED",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
