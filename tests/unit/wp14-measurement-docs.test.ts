import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { analyticsEventNames } from "@/src/analytics/events";

const documentation = readFileSync("docs/14_ANALYTICS_MEASUREMENT.md", "utf8");

describe("WP-14 measurement documentation", () => {
  it("documents every canonical event and its client/server owner", () => {
    for (const eventName of analyticsEventNames) {
      expect(documentation).toContain(`\`${eventName}\``);
    }
    expect(documentation).toMatch(/Client-owned/i);
    expect(documentation).toMatch(/Server-owned/i);
    expect(documentation).toMatch(/after commit/i);
  });

  it("locks operational metric definitions, sources, denominator, and time window", () => {
    expect(documentation).toContain("Active Monitoring Parents");
    expect(documentation).toMatch(/PostgreSQL.*source of truth/is);
    expect(documentation).toMatch(/AMP users.*denominator/is);
    expect(documentation).toMatch(/rolling 30-day/is);
    expect(documentation).toMatch(/Asia\/Seoul|KST/);
  });

  it("documents safe production setup and explicit reporting deferrals", () => {
    expect(documentation).toContain("ANALYTICS_ENABLED");
    expect(documentation).toContain("GA4_MEASUREMENT_ID");
    expect(documentation).toContain("GA4_API_SECRET");
    expect(documentation).toMatch(/non-production.*Noop/is);
    expect(documentation).toMatch(/internal traffic/i);
    expect(documentation).toMatch(/GSC.*manual/is);
    expect(documentation).toMatch(/GA Data API.*NONE/is);
    expect(documentation).toMatch(/GSC API.*NONE/is);
  });

  it("locks the PII, raw query, URL, identity, and legacy-ID bans", () => {
    expect(documentation).toMatch(/raw query.*forbidden/is);
    expect(documentation).toMatch(/Kakao subject.*forbidden/is);
    expect(documentation).toMatch(/child data.*forbidden/is);
    expect(documentation).toMatch(/legacy.*forbidden/is);
    expect(documentation).toMatch(/page_location.*origin root/is);
    expect(documentation).toMatch(/API secret.*server-only/is);
  });
});
