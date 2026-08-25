import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const runnerPath = "tests/browser/wp14/run-analytics-browser.py";
const seedPath = "tests/browser/wp14/seed-analytics.ts";
const scenarioPath = "tests/browser/wp14/analytics-scenarios.md";

describe("WP-14 browser fixture contract", () => {
  it("uses injected Test capture with no Google network and asserts Admin/404 zero", () => {
    const runner = readFileSync(runnerPath, "utf8");
    expect(runner).toContain("__PREPPY_ANALYTICS_CAPTURE__");
    expect(runner).toContain("add_init_script");
    expect(runner).toMatch(/googletagmanager|google-analytics/);
    expect(runner).toMatch(/admin.*zero|zero.*admin/is);
    expect(runner).toMatch(/404.*zero|zero.*404/is);
    expect(runner).not.toContain("GA4_API_SECRET");
  });

  it("covers public discovery, follow/signup, My Preppy, Article, and a forbidden scan", () => {
    const runner = readFileSync(runnerPath, "utf8");
    for (const marker of [
      "home_view",
      "search",
      "institution_view",
      "article_view",
      "article_to_institution",
      "follow_click",
      "article_to_follow",
      "my_preppy_view",
      "forbidden",
    ]) {
      expect(runner).toContain(marker);
    }
    expect(readFileSync(seedPath, "utf8")).toContain("PENDING");
    expect(readFileSync(scenarioPath, "utf8")).toMatch(/Admin.*zero/is);
  });
});
