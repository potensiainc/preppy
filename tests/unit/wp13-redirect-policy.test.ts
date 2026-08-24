import { describe, expect, it } from "vitest";

import {
  parseCanonicalArticlePath,
  validateHistoricalArticleRedirect,
} from "@/src/modules/editorial/redirects.server";

describe("WP-13 historical Article redirect policy", () => {
  it("accepts only an exact canonical Article path", () => {
    expect(parseCanonicalArticlePath("/articles/first-guide")).toBe(
      "first-guide",
    );
    for (const path of [
      "/articles/First-guide",
      "/articles/first-guide/extra",
      "/articles/first-guide/",
      "/articles/first-guide?preview=1",
      "/articles/first-guide#x",
      "/articles/first%2fguide",
      "/articles/first\\guide",
      "/institutions/first-guide",
      "//evil.example/articles/first-guide",
      "/articles/first\nguide",
    ]) {
      expect(parseCanonicalArticlePath(path)).toBeNull();
    }
  });

  it("admits one active, non-self, canonical 308 registry target", () => {
    expect(
      validateHistoricalArticleRedirect("/articles/old-guide", {
        sourcePath: "/articles/old-guide",
        targetPath: "/articles/current-guide",
        statusCode: 308,
        disabledAt: null,
      }),
    ).toEqual({
      kind: "TARGET",
      targetPath: "/articles/current-guide",
      targetSlug: "current-guide",
    });
  });

  it.each([
    ["unknown", null],
    [
      "disabled",
      {
        sourcePath: "/articles/old-guide",
        targetPath: "/articles/current-guide",
        statusCode: 308,
        disabledAt: new Date("2026-08-25T00:00:00.000Z"),
      },
    ],
    [
      "wrong status",
      {
        sourcePath: "/articles/old-guide",
        targetPath: "/articles/current-guide",
        statusCode: 301,
        disabledAt: null,
      },
    ],
    [
      "self redirect",
      {
        sourcePath: "/articles/old-guide",
        targetPath: "/articles/old-guide",
        statusCode: 308,
        disabledAt: null,
      },
    ],
    [
      "source mismatch",
      {
        sourcePath: "/articles/another-guide",
        targetPath: "/articles/current-guide",
        statusCode: 308,
        disabledAt: null,
      },
    ],
    [
      "unsafe target",
      {
        sourcePath: "/articles/old-guide",
        targetPath: "/admin/articles",
        statusCode: 308,
        disabledAt: null,
      },
    ],
  ])("returns NOT_FOUND for %s", (_case, row) => {
    expect(
      validateHistoricalArticleRedirect("/articles/old-guide", row),
    ).toEqual({ kind: "NOT_FOUND" });
  });
});
