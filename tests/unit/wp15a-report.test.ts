import { describe, expect, it } from "vitest";

import {
  PREFLIGHT_EXIT_CODES,
  assertPreflightReportSafe,
  buildPreflightReport,
  exitCodeForPreflight,
} from "@/src/modules/production-preflight/report";

describe("WP-15A preflight report", () => {
  it("summarizes findings and uses only the WP-15A gate vocabulary", () => {
    const ready = buildPreflightReport({
      mode: "REHEARSAL",
      generatedAt: "2026-08-25T00:00:00.000Z",
      database: {
        name: "preppy_rehearsal",
        user: "preflight_reader",
        serverVersion: "PostgreSQL 16",
        snapshotConsistency: "REPEATABLE_READ_READ_ONLY",
      },
      migrations: {
        expected: ["0000", "0001"],
        applied: ["0000", "0001"],
        latestApplied: "0001",
        missing: [],
        unexpected: [],
        hashMismatches: [],
        identifierStatus: "MATCH",
      },
      inventory: {},
      backfills: {},
      checks: [
        { code: "MIGRATION_LEDGER_MATCH", severity: "INFO", message: "ok" },
        {
          code: "OPTIONAL_GA4_MISSING",
          severity: "WARNING",
          count: 1,
          message: "optional",
        },
      ],
    });

    expect(ready.version).toBe(1);
    expect(ready.summary).toEqual({
      blockers: 0,
      warnings: 1,
      infos: 1,
      readyForNextGate: true,
      finalGate: "READY_FOR_WP16A",
    });
    expect(exitCodeForPreflight(ready)).toBe(PREFLIGHT_EXIT_CODES.OK);

    const blocked = buildPreflightReport({
      ...ready,
      checks: [
        {
          code: "BRIDGE_OWNERSHIP_CONTRADICTION",
          severity: "BLOCKER",
          entityType: "OPPORTUNITY",
          entityId: "11111111-1111-4111-8111-111111111111",
          message: "Canonical bridge ownership is inconsistent.",
        },
      ],
    });
    expect(blocked.summary.finalGate).toBe("BLOCKED");
    expect(exitCodeForPreflight(blocked)).toBe(PREFLIGHT_EXIT_CODES.BLOCKERS);
  });

  it("rejects PII, secrets, credentials, HTML, and raw payload families", () => {
    const unsafeValues: unknown[] = [
      { email: "parent@example.com" },
      { displayName: "Operator Name" },
      { oauthSubject: "provider-subject" },
      { contentHtml: "<p>private body</p>" },
      { rawWebhookPayload: { event: "delivered" } },
      { databaseUrl: "postgres://user:password@db.example/preppy" },
      { message: "postgres://user:password@db.example/preppy" },
      { apiSecret: "secret-value" },
    ];

    for (const value of unsafeValues) {
      expect(() => assertPreflightReportSafe(value)).toThrow(
        /unsafe preflight report/i,
      );
    }

    expect(() =>
      assertPreflightReportSafe({
        configured: { ga4: false, resend: true },
        entityId: "11111111-1111-4111-8111-111111111111",
        reasonCode: "MULTIPLE_ACTIVE_PRIMARY",
        count: 2,
      }),
    ).not.toThrow();
  });

  it("reserves deterministic exit codes for safety and tooling failures", () => {
    expect(PREFLIGHT_EXIT_CODES).toEqual({
      OK: 0,
      BLOCKERS: 2,
      UNSAFE_PRODUCTION_CONNECTION: 3,
      INVALID_CONFIG_OR_TOOLING: 4,
    });
  });
});
