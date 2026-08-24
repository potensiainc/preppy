import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  assertWp13ProductSignalsUnchanged,
  readWp13ProductSignalCounts,
  seedWp13ArticleCmsFixture,
  WP13_BROWSER_FIXTURE,
} from "../browser/wp13/seed-article-cms";

describe("WP-13 Article browser fixture contract", () => {
  it("exports the deterministic seed and Product-signal guard", () => {
    expect(seedWp13ArticleCmsFixture).toEqual(expect.any(Function));
    expect(readWp13ProductSignalCounts).toEqual(expect.any(Function));
    expect(assertWp13ProductSignalsUnchanged).toEqual(expect.any(Function));
  });

  it("binds the real fake issuer subject to an ACTIVE Admin and canonical relation targets", () => {
    expect(WP13_BROWSER_FIXTURE.activeSubject).toBe("wp13-browser-active");
    expect(WP13_BROWSER_FIXTURE.activeAdminStatus).toBe("ACTIVE");
    expect(WP13_BROWSER_FIXTURE.institutionPath).toMatch(
      /^\/institutions\/[a-z0-9-]+$/,
    );
    expect(WP13_BROWSER_FIXTURE.opportunityPath).toMatch(
      /^\/opportunities\/[a-z0-9-]+$/,
    );
  });

  it("defines a historical unsafe Article and empty Product-signal baseline", () => {
    expect(WP13_BROWSER_FIXTURE.historicalUnsafeHtml).toMatch(
      /<script|onclick|javascript:/i,
    );
    expect(WP13_BROWSER_FIXTURE.emptyProductSignalBaseline).toEqual({
      opportunityChanges: 0,
      notifications: 0,
      notificationDeliveries: 0,
      deliveryAttempts: 0,
      emailOutboxEvents: 0,
    });
  });

  it("keeps dedicated-database validation ahead of every fixture mutation", async () => {
    const source = await readFile(
      new URL("../browser/wp13/seed-article-cms.ts", import.meta.url),
      "utf8",
    );
    const guardIndex = source.indexOf(
      "assertDedicatedTestDatabaseUrl(databaseUrl)",
    );
    const connectionIndex = source.indexOf("postgres(databaseUrl");
    const firstMutationIndex = source.search(
      /\b(insert|update|delete)\s+into\b/i,
    );

    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(connectionIndex).toBeGreaterThan(guardIndex);
    expect(firstMutationIndex).toBeGreaterThan(connectionIndex);
    expect(source).not.toMatch(/test[-_ ]login|x-test-admin|auth bypass/i);
  });

  it("drives the approved real-OIDC lifecycle and adversarial browser assertions", async () => {
    const runner = await readFile(
      new URL("../browser/wp13/run-article-browser.py", import.meta.url),
      "utf8",
    );
    for (const boundary of [
      "/admin/auth/start",
      "Create Draft",
      "Save Draft",
      "Save Relations",
      "Publish Article",
      "Publish Changes",
      "Unpublish",
      "Change slug",
      "java_script_enabled=False",
      "cache_events",
      "productSignals",
      '.locator(".admin-article-workbench > .admin-form-status")',
      "/api/auth/session",
    ]) {
      expect(runner).toContain(boundary);
    }
    expect(runner).not.toMatch(/test[-_ ]login|x-test-admin|auth bypass/i);
  });
});
