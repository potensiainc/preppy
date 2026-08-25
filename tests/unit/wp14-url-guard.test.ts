import { describe, expect, it } from "vitest";

import { safeGa4LocationContext } from "@/src/analytics/url-guard";

describe("WP-14 GA4 URL guard", () => {
  it("reduces the current page and referrer to origins without path, query, or fragment", () => {
    const context = safeGa4LocationContext(
      "https://preppy.test/institutions?query=child-name#result",
      "https://www.google.com/search?q=private-school",
    );
    expect(context).toEqual({
      pageLocation: "https://preppy.test/",
      pageReferrer: "https://www.google.com/",
    });
    expect(JSON.stringify(context)).not.toMatch(
      /child-name|private-school|search\?/,
    );
  });

  it("drops an invalid or non-HTTP referrer and fails closed on an invalid app URL", () => {
    expect(
      safeGa4LocationContext(
        "https://preppy.test/articles/a",
        "javascript:alert(1)",
      ),
    ).toEqual({ pageLocation: "https://preppy.test/" });
    expect(() => safeGa4LocationContext("not-a-url", "")).toThrow();
  });
});
