import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const docs = (name: string) =>
  readFile(join(process.cwd(), "docs", name), "utf8");

describe("WP-16A operator document contracts", () => {
  it("locks every required runbook gate, order, abort, and rollback boundary", async () => {
    const runbook = await docs("16A_PRODUCTION_SAFETY_RUNBOOK.md");
    for (const heading of [
      "Prerequisites",
      "Credentials and roles",
      "Operational alert contract",
      "Fresh backup gate",
      "Restore evidence",
      "Migration sequence",
      "Backfill sequence",
      "Cutover gates",
      "Smoke checks",
      "Kill-switch state",
      "Worker enable order",
      "Email enable order",
      "Analytics enable order",
      "Cache enable order",
      "Abort conditions",
      "Rollback and restore decision tree",
      "WP-16B handoff",
    ]) {
      expect(runbook).toContain(`## ${heading}`);
    }
    expect(runbook).toContain("WP-15A production read-only preflight");
    expect(runbook).toContain("NEW backup");
    expect(runbook).toContain("WORKER_ENABLED=false");
    expect(runbook.indexOf("Enable Worker")).toBeLessThan(
      runbook.indexOf("Enable Email"),
    );
    expect(runbook).toContain("DB rollback cannot undo sent emails");
    expect(runbook).toContain("READY_FOR_WP15B does not authorize");
    expect(runbook).toContain("Database unavailable");
    expect(runbook).toContain("RESULT_UNKNOWN > 0");
    expect(runbook).toContain("PROPOSED — OWNER APPROVAL REQUIRED");
    for (const abort of [
      "migration failure",
      "backfill BLOCKER",
      "bridge invariant violation",
      "unexpected row-count delta",
      "multiple active primary bindings",
      "Outbox invariant violation",
      "public detail failure",
      "auth failure",
      "restore capability unavailable",
      "unknown or ambiguous provider-side effects",
    ]) {
      expect(runbook.toLowerCase()).toContain(abort.toLowerCase());
    }
  });

  it("uses explicit readiness vocabulary and proposed owner decisions", async () => {
    const checklist = await docs("16A_PRODUCTION_READINESS_CHECKLIST.md");
    for (const value of ["PASS", "FAIL", "NOT EXECUTED", "NOT APPLICABLE"]) {
      expect(checklist).toContain(value);
    }
    expect(checklist).toContain(
      "RPO <= 24h — PROPOSED — OWNER APPROVAL REQUIRED",
    );
    expect(checklist).toContain(
      "RTO <= 2h — PROPOSED — OWNER APPROVAL REQUIRED",
    );
    expect(checklist).toContain(
      "Retention — PROPOSED — OWNER APPROVAL REQUIRED",
    );
    expect(checklist).toContain("READY_FOR_WP15B");
    expect(checklist).toContain("BLOCKED");
  });

  it("keeps unknown topology explicit and blocks unsafe multi-instance assumptions", async () => {
    const topology = await docs("16A_PRODUCTION_TOPOLOGY.md");
    for (const key of [
      "Web instance count",
      "Worker instance count",
      "Scheduler source",
      "Database topology",
      "Email provider",
      "Analytics mode",
      "Cache mode",
    ]) {
      expect(topology).toContain(key);
    }
    expect(topology).toContain("UNRESOLVED");
    expect(topology).toContain("distributed OAuth replay");
    expect(topology).toContain("distributed rate limiting");
    expect(topology).toContain("distributed cache replay");
    expect(topology).toContain("PostgreSQL SKIP LOCKED");
    expect(topology).toContain("BLOCKER FOR WP-15B");
    expect(topology).not.toMatch(/password|postgres:\/\/|api[_ -]?key\s*[:=]/i);
  });
});
