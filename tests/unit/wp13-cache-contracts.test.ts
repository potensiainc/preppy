import { describe, expect, it } from "vitest";

import {
  CACHE_REVALIDATION_EVENT,
  parseArticleCacheRevalidationOutboxInput,
  parseArticleCacheRevalidationPayload,
} from "@/src/modules/cache/revalidation-contract";

const ARTICLE_ID = "11111111-1111-4111-8111-111111111111";
const INSTITUTION_A = "22222222-2222-4222-8222-222222222222";
const INSTITUTION_B = "33333333-3333-4333-8333-333333333333";
const OPPORTUNITY_ID = "44444444-4444-4444-8444-444444444444";

function payload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 1,
    articleId: ARTICLE_ID,
    reason: "ARTICLE_PUBLISHED",
    currentCanonicalPath: "/articles/current-guide",
    relatedInstitutionIds: [INSTITUTION_A, INSTITUTION_B],
    relatedOpportunityIds: [OPPORTUNITY_ID],
    ...overrides,
  };
}

describe("WP-13 cache revalidation contract", () => {
  it("accepts the exact V1 payload and closed event identity", () => {
    const value = payload();
    expect(parseArticleCacheRevalidationPayload(value)).toEqual(value);
    expect(CACHE_REVALIDATION_EVENT).toBe("CACHE_REVALIDATION_REQUESTED");
    expect(
      parseArticleCacheRevalidationOutboxInput({
        eventType: CACHE_REVALIDATION_EVENT,
        aggregateType: "ARTICLE",
        aggregateId: ARTICLE_ID,
        payloadSafe: value,
      }),
    ).toEqual({
      eventType: CACHE_REVALIDATION_EVENT,
      aggregateType: "ARTICLE",
      aggregateId: ARTICLE_ID,
      payloadSafe: value,
    });
  });

  it("requires the previous path exactly for a slug change", () => {
    expect(
      parseArticleCacheRevalidationPayload(
        payload({
          reason: "ARTICLE_SLUG_CHANGED",
          previousCanonicalPath: "/articles/previous-guide",
        }),
      ),
    ).toEqual(
      payload({
        reason: "ARTICLE_SLUG_CHANGED",
        previousCanonicalPath: "/articles/previous-guide",
      }),
    );
    expect(
      parseArticleCacheRevalidationPayload(
        payload({ reason: "ARTICLE_SLUG_CHANGED" }),
      ),
    ).toBeNull();
    expect(
      parseArticleCacheRevalidationPayload(
        payload({ previousCanonicalPath: "/articles/previous-guide" }),
      ),
    ).toBeNull();
  });

  it.each([
    ["wrong version", { version: 2 }],
    ["unknown reason", { reason: "ARTICLE_EDITED" }],
    ["arbitrary path", { currentCanonicalPath: "/admin/articles" }],
    ["query path", { currentCanonicalPath: "/articles/foo?preview=1" }],
    ["extra key", { tags: ["article:one"] }],
    ["PII", { email: "operator@example.test" }],
    ["unsorted IDs", { relatedInstitutionIds: [INSTITUTION_B, INSTITUTION_A] }],
    [
      "duplicate IDs",
      { relatedInstitutionIds: [INSTITUTION_A, INSTITUTION_A] },
    ],
  ])("rejects %s", (_case, overrides) => {
    expect(parseArticleCacheRevalidationPayload(payload(overrides))).toBeNull();
  });

  it("bounds each exact relation set at 12 UUIDs", () => {
    const ids = Array.from(
      { length: 13 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    expect(
      parseArticleCacheRevalidationPayload(
        payload({ relatedOpportunityIds: ids }),
      ),
    ).toBeNull();
  });

  it.each([
    ["wrong event", "DELIVERY_EMAIL_SEND", "ARTICLE", ARTICLE_ID],
    ["wrong aggregate", CACHE_REVALIDATION_EVENT, "OPPORTUNITY", ARTICLE_ID],
    [
      "mismatched aggregate ID",
      CACHE_REVALIDATION_EVENT,
      "ARTICLE",
      INSTITUTION_A,
    ],
  ])(
    "rejects an Outbox boundary with %s",
    (_case, eventType, aggregateType, aggregateId) => {
      expect(
        parseArticleCacheRevalidationOutboxInput({
          eventType,
          aggregateType,
          aggregateId,
          payloadSafe: payload(),
        }),
      ).toBeNull();
    },
  );
});
