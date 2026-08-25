import { describe, expect, it } from "vitest";

import {
  buildFollowClickEvents,
  buildInstitutionListAnalytics,
  queryLengthBucket,
} from "@/src/analytics/public-events";

const INSTITUTION_ID = "00000000-0000-4000-8000-000000000001";
const ARTICLE_ID = "00000000-0000-4000-8000-000000000002";

describe("WP-14 public event builders", () => {
  it("buckets search length without retaining raw query text", () => {
    expect(queryLengthBucket(undefined)).toBe("EMPTY");
    expect(queryLengthBucket("abc")).toBe("1_3");
    expect(queryLengthBucket("abcdefghij")).toBe("4_10");
    expect(queryLengthBucket("abcdefghijk")).toBe("11_PLUS");
    const analytics = buildInstitutionListAnalytics(
      { query: "a child's private name", page: 1, pageSize: 12 },
      4,
    );
    expect(JSON.stringify(analytics)).not.toContain("child");
    expect(analytics.events).toEqual([
      {
        name: "search",
        properties: { queryLengthBucket: "11_PLUS", resultCount: 4 },
      },
    ]);
  });

  it("emits only allowlisted structured filters and rejects free-text regions", () => {
    const analytics = buildInstitutionListAnalytics(
      {
        category: "PRIVATE_ELEMENTARY",
        recruitmentState: "OPEN",
        region: "서울 강남",
        page: 2,
        pageSize: 12,
      },
      8,
    );
    expect(analytics.events).toEqual([
      {
        name: "filter",
        properties: {
          filterType: "CATEGORY",
          filterValue: "PRIVATE_ELEMENTARY",
          resultCount: 8,
        },
      },
      {
        name: "filter",
        properties: {
          filterType: "RECRUITMENT_STATE",
          filterValue: "OPEN",
          resultCount: 8,
        },
      },
    ]);
    expect(analytics.navigationKey).not.toContain("서울");
  });

  it("emits a region filter only for the locked MVP taxonomy", () => {
    expect(
      buildInstitutionListAnalytics(
        { region: "seoul-free-text", page: 1, pageSize: 12 },
        1,
      ).events,
    ).toEqual([]);
    expect(
      buildInstitutionListAnalytics(
        { region: "KR-11", page: 1, pageSize: 12 },
        1,
      ).events,
    ).toEqual([
      {
        name: "filter",
        properties: {
          filterType: "REGION",
          filterValue: "KR-11",
          resultCount: 1,
        },
      },
    ]);
  });

  it("emits article conversion intent in addition to the canonical follow click", () => {
    expect(
      buildFollowClickEvents({
        institutionId: INSTITUTION_ID,
        context: "ARTICLE",
        articleId: ARTICLE_ID,
      }),
    ).toEqual([
      {
        name: "follow_click",
        properties: {
          institutionId: INSTITUTION_ID,
          context: "ARTICLE",
          articleId: ARTICLE_ID,
        },
      },
      {
        name: "article_to_follow",
        properties: {
          articleId: ARTICLE_ID,
          institutionId: INSTITUTION_ID,
        },
      },
    ]);
  });
});
