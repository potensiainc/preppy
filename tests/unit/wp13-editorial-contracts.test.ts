import { describe, expect, it } from "vitest";

import { ValidationError } from "@/src/application/errors";
import {
  parseArticleLifecycleInput,
  parseArticlePublishCandidate,
  parseChangeArticleSlugInput,
  parseCreateArticleDraftInput,
  parseSetArticleRelationsInput,
  parseUpdateArticleDraftInput,
} from "@/src/modules/editorial/contracts";

const ARTICLE_ID = "11111111-1111-4111-8111-111111111111";
const INSTITUTION_A = "22222222-2222-4222-8222-222222222222";
const INSTITUTION_B = "33333333-3333-4333-8333-333333333333";
const OPPORTUNITY_ID = "44444444-4444-4444-8444-444444444444";
const EXPECTED_UPDATED_AT = "2026-08-25T00:00:00.000Z";

const candidate = {
  title: "  First   guide  ",
  type: "GUIDE",
  category: "ADMISSIONS_GENERAL",
  excerpt: "  A useful   summary. ",
  contentHtml: "<p>Body</p>",
  seoTitle: "  First guide SEO ",
  seoDescription: " ",
  canonicalUrl: null,
  robotsIndex: true,
  robotsFollow: true,
  featuredImageUrl: "https://images.example/guide.jpg",
  featuredImageAlt: "  Students   applying ",
} as const;

describe("WP-13 Article command contracts", () => {
  it("parses and normalizes the complete browser-owned draft candidate", () => {
    expect(
      parseUpdateArticleDraftInput({
        articleId: ARTICLE_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        candidate,
      }),
    ).toEqual({
      articleId: ARTICLE_ID,
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
      candidate: {
        ...candidate,
        title: "First guide",
        excerpt: "A useful summary.",
        seoTitle: "First guide SEO",
        seoDescription: null,
        featuredImageAlt: "Students applying",
      },
    });
  });

  it("normalizes complete relation sets to sorted unique UUIDs", () => {
    expect(
      parseSetArticleRelationsInput({
        articleId: ARTICLE_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        institutionIds: [INSTITUTION_B, INSTITUTION_A, INSTITUTION_B],
        opportunityIds: [OPPORTUNITY_ID, OPPORTUNITY_ID],
      }),
    ).toEqual({
      articleId: ARTICLE_ID,
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
      institutionIds: [INSTITUTION_A, INSTITUTION_B],
      opportunityIds: [OPPORTUNITY_ID],
    });

    const published = parseArticlePublishCandidate({
      ...candidate,
      institutionIds: [INSTITUTION_B, INSTITUTION_A],
      opportunityIds: [OPPORTUNITY_ID],
    });
    expect(published.institutionIds).toEqual([INSTITUTION_A, INSTITUTION_B]);
  });

  it.each([
    ["status", "PUBLISHED"],
    ["authorAdminId", ARTICLE_ID],
    ["publishedAt", EXPECTED_UPDATED_AT],
    ["unpublishedAt", EXPECTED_UPDATED_AT],
    ["archivedAt", EXPECTED_UPDATED_AT],
    ["correlationId", ARTICLE_ID],
    ["eventType", "CACHE_REVALIDATION_REQUESTED"],
    ["paths", ["/admin"]],
    ["tags", ["articles"]],
  ])("rejects the server-owned candidate field %s", (field, value) => {
    expect(() =>
      parseUpdateArticleDraftInput({
        articleId: ARTICLE_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        candidate: { ...candidate, [field]: value },
      }),
    ).toThrow(ValidationError);
  });

  it("accepts only an exact Date.toISOString stale token", () => {
    expect(
      parseArticleLifecycleInput({
        articleId: ARTICLE_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      }),
    ).toEqual({
      articleId: ARTICLE_ID,
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    });

    for (const timestamp of [
      "2026-08-25T00:00:00Z",
      "2026-08-25T09:00:00.000+09:00",
      "2026-08-25",
      "not-a-date",
    ]) {
      expect(() =>
        parseArticleLifecycleInput({
          articleId: ARTICLE_ID,
          expectedUpdatedAt: timestamp,
        }),
      ).toThrow(ValidationError);
    }
  });

  it("enforces exact field bounds and strict URL types", () => {
    expect(() =>
      parseCreateArticleDraftInput({
        slug: "a".repeat(121),
        title: "Guide",
        type: "GUIDE",
        category: "ADMISSIONS_GENERAL",
      }),
    ).toThrow(ValidationError);
    expect(() =>
      parseUpdateArticleDraftInput({
        articleId: ARTICLE_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        candidate: { ...candidate, title: "🔐".repeat(161) },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      parseUpdateArticleDraftInput({
        articleId: ARTICLE_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        candidate: { ...candidate, featuredImageUrl: "data:image/png,x" },
      }),
    ).toThrow(ValidationError);
    expect(() =>
      parseSetArticleRelationsInput({
        articleId: ARTICLE_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        institutionIds: Array.from(
          { length: 13 },
          (_, index) =>
            `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
        opportunityIds: [],
      }),
    ).toThrow(ValidationError);
  });

  it("rejects unknown, inherited, accessor, and prototype-sensitive input", () => {
    expect(() =>
      parseChangeArticleSlugInput({
        articleId: ARTICLE_ID,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
        newSlug: "next-guide",
        status: "PUBLISHED",
      }),
    ).toThrow(ValidationError);

    const inherited = Object.create({ status: "PUBLISHED" }) as Record<
      string,
      unknown
    >;
    Object.assign(inherited, {
      articleId: ARTICLE_ID,
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    });
    expect(() => parseArticleLifecycleInput(inherited)).toThrow(
      ValidationError,
    );

    const accessor = {
      articleId: ARTICLE_ID,
      expectedUpdatedAt: EXPECTED_UPDATED_AT,
    } as Record<string, unknown>;
    Object.defineProperty(accessor, "articleId", {
      enumerable: true,
      get: () => ARTICLE_ID,
    });
    expect(() => parseArticleLifecycleInput(accessor)).toThrow(ValidationError);

    const polluted = JSON.parse(
      `{"articleId":"${ARTICLE_ID}","expectedUpdatedAt":"${EXPECTED_UPDATED_AT}","__proto__":{"status":"PUBLISHED"}}`,
    ) as unknown;
    expect(() => parseArticleLifecycleInput(polluted)).toThrow(ValidationError);
  });
});
