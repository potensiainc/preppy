import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { ClientGa4AnalyticsTracker } from "@/src/analytics/ga4-client";

const ARTICLE_ID = "00000000-0000-4000-8000-000000000001";

describe("WP-14 client GA4 adapter", () => {
  it("sends only validated provider-mapped events in GA4 mode", () => {
    const gtag = vi.fn();
    const tracker = new ClientGa4AnalyticsTracker({ mode: "GA4", gtag });
    tracker.track("article_view", { articleId: ARTICLE_ID });
    expect(gtag).toHaveBeenCalledWith("event", "article_view", {
      article_id: ARTICLE_ID,
    });
  });

  it("uses injected canonical Test capture without live Google", () => {
    const gtag = vi.fn();
    const capture = vi.fn();
    const tracker = new ClientGa4AnalyticsTracker({
      mode: "NOOP",
      gtag,
      capture,
    });
    tracker.track("home_view", { landingPage: "HOME" });
    expect(capture).toHaveBeenCalledWith({
      name: "home_view",
      properties: { landingPage: "HOME" },
    });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("resolves Test capture at event time so pre-hydration injection is not snapshotted", () => {
    const captured: unknown[] = [];
    const captureState: { capture?: (event: unknown) => void } = {};
    const tracker = new ClientGa4AnalyticsTracker({
      mode: "NOOP",
      resolveCapture: () => captureState.capture as never,
    });
    captureState.capture = (event) => captured.push(event);
    tracker.track("home_view", { landingPage: "HOME" });
    expect(captured).toEqual([
      { name: "home_view", properties: { landingPage: "HOME" } },
    ]);
  });

  it("does nothing in Noop mode and rejects unsafe arbitrary input", () => {
    const gtag = vi.fn();
    const tracker = new ClientGa4AnalyticsTracker({ mode: "NOOP", gtag });
    tracker.track("home_view", { landingPage: "HOME" });
    expect(gtag).not.toHaveBeenCalled();
    expect(() =>
      (tracker.track as (name: string, payload: unknown) => unknown)("search", {
        queryLengthBucket: "1_3",
        resultCount: 1,
        locationSearch: "?query=child-name",
      }),
    ).toThrow();
  });

  it("keeps a validated product action successful when browser transport throws", () => {
    const tracker = new ClientGa4AnalyticsTracker({
      mode: "GA4",
      gtag: () => {
        throw new Error("blocked by browser");
      },
    });
    expect(() =>
      tracker.track("article_view", { articleId: ARTICLE_ID }),
    ).not.toThrow();
  });

  it("loads the provider only from the public layout, never the Admin layout", () => {
    const publicLayout = readFileSync("app/(public)/layout.tsx", "utf8");
    const adminLayout = readFileSync("app/admin/layout.tsx", "utf8");
    expect(publicLayout).toContain("AnalyticsProvider");
    expect(adminLayout).not.toMatch(/AnalyticsProvider|googletagmanager|gtag/i);
  });
});
