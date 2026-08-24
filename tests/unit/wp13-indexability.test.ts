import { describe, expect, it } from "vitest";

import { getIndexability } from "@/src/modules/public/indexability";

describe("WP-13 central Article indexability", () => {
  const eligible = {
    entity: "ARTICLE" as const,
    status: "PUBLISHED" as const,
    slug: "complete-guide",
    robotsIndex: true,
    hasMeaningfulSanitizedBody: true,
    hasDescription: true,
  };

  it("separates public retrieval from INDEX eligibility", () => {
    expect(getIndexability(eligible)).toBe("INDEX");
    expect(getIndexability({ ...eligible, robotsIndex: false })).toBe(
      "NOINDEX",
    );
    expect(getIndexability({ ...eligible, slug: null })).toBe("NOINDEX");
    expect(getIndexability({ ...eligible, slug: "Bad Slug" })).toBe("NOINDEX");
    expect(
      getIndexability({ ...eligible, hasMeaningfulSanitizedBody: false }),
    ).toBe("NOINDEX");
    expect(getIndexability({ ...eligible, hasDescription: false })).toBe(
      "NOINDEX",
    );
  });

  it.each(["DRAFT", "UNPUBLISHED", "ARCHIVED"] as const)(
    "returns NOT_PUBLIC for %s",
    (status) => {
      expect(getIndexability({ ...eligible, status })).toBe("NOT_PUBLIC");
    },
  );
});
