import { describe, expect, it } from "vitest";

import {
  beginClientNavigation,
  emitClientEventOncePerNavigation,
  resetClientNavigationDedupeForTests,
} from "@/src/analytics/navigation-dedupe";
import { TestAnalyticsTracker } from "@/src/analytics/tracker";

const ARTICLE_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ARTICLE_ID = "00000000-0000-4000-8000-000000000002";

describe("WP-14 canonical navigation dedupe", () => {
  it("emits once across rerender/Strict Mode remount for one canonical navigation", () => {
    resetClientNavigationDedupeForTests();
    const tracker = new TestAnalyticsTracker();
    const event = {
      name: "article_view" as const,
      properties: { articleId: ARTICLE_ID },
    };
    expect(
      emitClientEventOncePerNavigation(
        "ARTICLE_DETAIL:" + ARTICLE_ID,
        event,
        tracker,
      ),
    ).toBe(true);
    expect(
      emitClientEventOncePerNavigation(
        "ARTICLE_DETAIL:" + ARTICLE_ID,
        event,
        tracker,
      ),
    ).toBe(false);
    expect(tracker.snapshot()).toHaveLength(1);
  });

  it("emits again after a real canonical navigation change, including back navigation", () => {
    resetClientNavigationDedupeForTests();
    const tracker = new TestAnalyticsTracker();
    emitClientEventOncePerNavigation(
      "ARTICLE_DETAIL:" + ARTICLE_ID,
      { name: "article_view", properties: { articleId: ARTICLE_ID } },
      tracker,
    );
    emitClientEventOncePerNavigation(
      "ARTICLE_DETAIL:" + OTHER_ARTICLE_ID,
      {
        name: "article_view",
        properties: { articleId: OTHER_ARTICLE_ID },
      },
      tracker,
    );
    emitClientEventOncePerNavigation(
      "ARTICLE_DETAIL:" + ARTICLE_ID,
      { name: "article_view", properties: { articleId: ARTICLE_ID } },
      tracker,
    );
    expect(tracker.snapshot()).toHaveLength(3);
  });

  it("resets across a real navigation that has no canonical view event", () => {
    resetClientNavigationDedupeForTests();
    const tracker = new TestAnalyticsTracker();
    const event = {
      name: "article_view" as const,
      properties: { articleId: ARTICLE_ID },
    };
    emitClientEventOncePerNavigation("ARTICLE:" + ARTICLE_ID, event, tracker);
    beginClientNavigation("INSTITUTION_LIST:UNFILTERED");
    emitClientEventOncePerNavigation("ARTICLE:" + ARTICLE_ID, event, tracker);
    expect(tracker.snapshot()).toHaveLength(2);
  });

  it("allows different canonical events once within the same list navigation", () => {
    resetClientNavigationDedupeForTests();
    const tracker = new TestAnalyticsTracker();
    const navigation = "INSTITUTION_LIST:CATEGORY:1_3";
    emitClientEventOncePerNavigation(
      navigation,
      {
        name: "search",
        properties: { queryLengthBucket: "1_3", resultCount: 2 },
      },
      tracker,
    );
    emitClientEventOncePerNavigation(
      navigation,
      {
        name: "filter",
        properties: {
          filterType: "CATEGORY",
          filterValue: "PRIVATE_ELEMENTARY",
          resultCount: 2,
        },
      },
      tracker,
    );
    expect(tracker.snapshot().map((event) => event.name)).toEqual([
      "search",
      "filter",
    ]);
  });
});
