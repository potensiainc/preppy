import { describe, expect, it } from "vitest";

import { buildOperationalLog } from "@/src/modules/production-safety/operational-log";

describe("WP-16A structured operational logs", () => {
  it("emits only bounded allowlisted fields", () => {
    expect(
      buildOperationalLog({
        correlationId: "11111111-1111-4111-8111-111111111111",
        eventType: "RESTORE_DRILL_COMPLETED",
        entityType: "DATABASE",
        entityId: "preppy_restore",
        status: "PASS",
        errorCode: null,
        durationMs: 123,
        attemptCount: 1,
        workerId: null,
      }),
    ).toEqual({
      correlationId: "11111111-1111-4111-8111-111111111111",
      eventType: "RESTORE_DRILL_COMPLETED",
      entityType: "DATABASE",
      entityId: "preppy_restore",
      status: "PASS",
      errorCode: null,
      durationMs: 123,
      attemptCount: 1,
      workerId: null,
    });
  });

  it("rejects extra PII, secret, raw body, and unsafe identifier fields", () => {
    for (const value of [
      { eventType: "SAFE", email: "person@example.test" },
      { eventType: "SAFE", token: "secret" },
      { eventType: "SAFE", body: "raw" },
      { eventType: "unsafe event" },
      { eventType: "SAFE", durationMs: -1 },
    ]) {
      expect(() => buildOperationalLog(value)).toThrow(
        /invalid operational log/i,
      );
    }
  });
});
