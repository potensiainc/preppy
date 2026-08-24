import { describe, expect, it, vi } from "vitest";

import { parseWorkerCliArguments } from "@/src/modules/worker/cli";
import {
  parseWorkerRunOnceConfig,
  runWorkerOnce,
} from "@/src/modules/worker/run-once.server";

describe("WP-12A bounded worker runner", () => {
  it("accepts only bounded non-secret run-once configuration", () => {
    const now = new Date("2026-08-24T00:00:00.000Z");
    expect(
      parseWorkerRunOnceConfig({
        enabled: true,
        emailSendEnabled: false,
        workerId: "worker-local.1",
        batchSize: 10,
        leaseDurationMs: 300_000,
        now,
      }),
    ).toEqual({
      enabled: true,
      emailSendEnabled: false,
      workerId: "worker-local.1",
      batchSize: 10,
      leaseDurationMs: 300_000,
      now,
    });
    expect(
      parseWorkerRunOnceConfig({
        enabled: true,
        emailSendEnabled: true,
        workerId: "Bearer a secret",
        batchSize: 10,
        leaseDurationMs: 300_000,
        now,
      }),
    ).toBeNull();
    expect(
      parseWorkerRunOnceConfig({
        enabled: true,
        emailSendEnabled: true,
        workerId: "worker-a",
        batchSize: 101,
        leaseDurationMs: 300_000,
        now,
      }),
    ).toBeNull();
    expect(
      parseWorkerRunOnceConfig({
        enabled: true,
        emailSendEnabled: true,
        workerId: "worker-a",
        batchSize: 1,
        leaseDurationMs: 999,
        now,
      }),
    ).toBeNull();
  });

  it("does no database work when WORKER_ENABLED is false", async () => {
    const recover = vi.fn();
    const claim = vi.fn();
    await expect(
      runWorkerOnce(
        {
          enabled: false,
          emailSendEnabled: false,
          workerId: "worker-a",
          batchSize: 10,
          leaseDurationMs: 300_000,
          now: new Date("2026-08-24T00:00:00.000Z"),
        },
        {
          transactionManager: { run: vi.fn() },
          sender: { provider: "FAKE", send: vi.fn() },
          tracker: { track: vi.fn() },
          recoverStale: recover,
          claimBatch: claim,
        },
      ),
    ).resolves.toEqual({
      enabled: false,
      recovered: { pending: 0, failed: 0, deadLettered: 0 },
      claimed: 0,
      processed: 0,
      failed: 0,
    });
    expect(recover).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it("parses only explicit one-shot fake CLI arguments", () => {
    expect(
      parseWorkerCliArguments([
        "--once",
        "--fake-outcome=ACCEPTED",
        "--worker-id=worker-cli",
        "--batch=5",
        "--lease-ms=300000",
      ]),
    ).toEqual({
      once: true,
      fakeOutcome: "ACCEPTED",
      workerId: "worker-cli",
      batchSize: 5,
      leaseDurationMs: 300_000,
    });
    expect(parseWorkerCliArguments([])).toBeNull();
    expect(parseWorkerCliArguments(["--loop"])).toBeNull();
    expect(
      parseWorkerCliArguments(["--once", "--fake-outcome=LIVE_PROVIDER"]),
    ).toBeNull();
  });

  it("parses an explicit Resend mode without accepting mixed fake policy", () => {
    expect(
      parseWorkerCliArguments([
        "--once",
        "--provider=resend",
        "--worker-id=worker-live",
        "--batch=5",
        "--lease-ms=300000",
      ]),
    ).toEqual({
      once: true,
      provider: "RESEND",
      workerId: "worker-live",
      batchSize: 5,
      leaseDurationMs: 300_000,
    });
    expect(
      parseWorkerCliArguments([
        "--once",
        "--provider=resend",
        "--fake-outcome=ACCEPTED",
      ]),
    ).toBeNull();
    expect(
      parseWorkerCliArguments(["--once", "--provider=automatic"]),
    ).toBeNull();
  });
});
