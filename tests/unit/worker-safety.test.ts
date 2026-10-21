import { describe, expect, it, vi } from "vitest";

import { NoopAnalyticsTracker } from "@/src/analytics/tracker";
import {
  DEFAULT_NOTIFICATION_MAX_SIGNAL_AGE_HOURS,
  parseNotificationMaxSignalAgeMs,
} from "@/src/config/runtime-env";
import { heldOutboxEventTypes } from "@/src/modules/production-safety/operational-snapshot.server";
import { runWorkerOnce } from "@/src/modules/worker/run-once.server";
import { preHandoffTimeoutCode } from "@/src/modules/notification/send-delivery.server";
import { workerExitDecision } from "@/src/modules/worker/run-summary.server";

describe("notification maximum signal age", () => {
  it("defaults to 72 hours", () => {
    expect(DEFAULT_NOTIFICATION_MAX_SIGNAL_AGE_HOURS).toBe(72);
    expect(parseNotificationMaxSignalAgeMs({})).toBe(72 * 3_600_000);
  });

  it("accepts whole hours from 1 to 720", () => {
    expect(
      parseNotificationMaxSignalAgeMs({
        NOTIFICATION_MAX_SIGNAL_AGE_HOURS: "1",
      }),
    ).toBe(3_600_000);
    expect(
      parseNotificationMaxSignalAgeMs({
        NOTIFICATION_MAX_SIGNAL_AGE_HOURS: "720",
      }),
    ).toBe(720 * 3_600_000);
  });

  it.each(["0", "abc", "721", "1.5", "-3", " 72"])("rejects %j", (value) => {
    expect(() =>
      parseNotificationMaxSignalAgeMs({
        NOTIFICATION_MAX_SIGNAL_AGE_HOURS: value,
      }),
    ).toThrow();
  });
});

describe("worker exit decision", () => {
  it("succeeds when nothing failed or dead-lettered", () => {
    expect(
      workerExitDecision({ failed: 0 }, { deadLettered: 0, failedEvents: 0 }),
    ).toEqual({
      exitCode: 0,
      exitReason: "OK",
    });
  });

  it("reports a partial failure when an event threw", () => {
    expect(
      workerExitDecision({ failed: 1 }, { deadLettered: 0, failedEvents: 0 }),
    ).toEqual({
      exitCode: 3,
      exitReason: "EVENT_FAILED",
    });
  });

  it("reports a partial failure when the run moved work to FAILED", () => {
    expect(
      workerExitDecision({ failed: 0 }, { deadLettered: 0, failedEvents: 1 }),
    ).toEqual({ exitCode: 3, exitReason: "EVENT_FAILED" });
  });

  it("reports a partial failure when the run dead-lettered work", () => {
    expect(
      workerExitDecision({ failed: 0 }, { deadLettered: 2, failedEvents: 0 }),
    ).toEqual({
      exitCode: 3,
      exitReason: "DEAD_LETTERED",
    });
  });
});

describe("held outbox event types", () => {
  it("holds exactly the capabilities that are switched off", () => {
    expect(
      heldOutboxEventTypes({
        EMAIL_SEND_ENABLED: false,
        CACHE_REVALIDATION_ENABLED: false,
      }),
    ).toEqual(["DELIVERY_EMAIL_SEND", "CACHE_REVALIDATION_REQUESTED"]);
    expect(
      heldOutboxEventTypes({
        EMAIL_SEND_ENABLED: true,
        CACHE_REVALIDATION_ENABLED: true,
      }),
    ).toEqual([]);
  });
});

describe("worker claim scope", () => {
  async function claimedTypes(emailSendEnabled: boolean) {
    const claimBatch = vi.fn(async () => []);
    const recoverStale = vi.fn(async () => ({
      pending: 0,
      failed: 0,
      deadLettered: 0,
    }));
    await runWorkerOnce(
      {
        enabled: true,
        emailSendEnabled,
        cacheRevalidationEnabled: false,
        workerId: "worker-scope",
        batchSize: 10,
        leaseDurationMs: 300_000,
        now: new Date("2026-08-24T00:00:00.000Z"),
      },
      {
        transactionManager: { run: vi.fn() },
        sender: { provider: "FAKE", send: vi.fn() },
        tracker: new NoopAnalyticsTracker(),
        cacheRevalidator: { revalidate: vi.fn() },
        claimBatch: claimBatch as never,
        recoverStale: recoverStale as never,
      },
    );
    const claimInput = (claimBatch.mock.calls[0] as unknown[])[1] as {
      eventTypes: string[];
    };
    const recoverInput = (recoverStale.mock.calls[0] as unknown[])[1] as {
      eventTypes: string[];
    };
    expect(recoverInput.eventTypes).toEqual(claimInput.eventTypes);
    return claimInput.eventTypes;
  }

  it("does not claim or recover email work while sending is disabled", async () => {
    expect(await claimedTypes(false)).toEqual(["OPPORTUNITY_CHANGE_PUBLISHED"]);
  });

  it("claims email work once sending is enabled", async () => {
    expect(await claimedTypes(true)).toEqual([
      "OPPORTUNITY_CHANGE_PUBLISHED",
      "DELIVERY_EMAIL_SEND",
    ]);
  });
});

describe("worker configuration errors", () => {
  it("exits 2 without opening the database for an invalid signal age", async () => {
    vi.stubEnv("WORKER_ENABLED", "true");
    vi.stubEnv("EMAIL_SEND_ENABLED", "false");
    vi.stubEnv("CACHE_REVALIDATION_ENABLED", "false");
    vi.stubEnv("NOTIFICATION_MAX_SIGNAL_AGE_HOURS", "0");
    vi.stubEnv("DATABASE_URL", "");
    try {
      const { runWorkerCommand } = await import("@/scripts/worker");
      await expect(
        runWorkerCommand(["--once", "--fake-outcome=ACCEPTED"]),
      ).resolves.toEqual({
        exitCode: 2,
        output: "Invalid worker configuration.",
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("pre-handoff timeouts", () => {
  it("maps lock and statement timeouts, including wrapped driver errors", () => {
    expect(preHandoffTimeoutCode({ code: "55P03" })).toBe(
      "RECIPIENT_LOCK_TIMEOUT",
    );
    expect(
      preHandoffTimeoutCode(
        new Error("query failed", { cause: { code: "57014" } }),
      ),
    ).toBe("PRE_HANDOFF_STATEMENT_TIMEOUT");
  });

  it("leaves every other error to the existing failure handling", () => {
    expect(preHandoffTimeoutCode({ code: "23505" })).toBeNull();
    expect(preHandoffTimeoutCode(new Error("boom"))).toBeNull();
    expect(preHandoffTimeoutCode(null)).toBeNull();
  });
});
