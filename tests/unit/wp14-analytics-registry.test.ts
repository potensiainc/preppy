import { describe, expect, it } from "vitest";

import {
  analyticsEventNames,
  parseAnalyticsEvent,
  type AnalyticsEventName,
} from "@/src/analytics/events";
import {
  NoopAnalyticsTracker,
  TestAnalyticsTracker,
} from "@/src/analytics/tracker";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const C = "00000000-0000-4000-8000-000000000003";

const validPayloads = {
  home_view: { landingPage: "HOME" },
  article_view: { articleId: A },
  search: {
    queryLengthBucket: "4_10",
    resultCount: 4,
    category: "INTERNATIONAL_SCHOOL",
  },
  filter: {
    filterType: "CATEGORY",
    filterValue: "PRIVATE_ELEMENTARY",
    resultCount: 2,
  },
  institution_view: {
    institutionId: A,
    category: "ENGLISH_KINDERGARTEN",
    regionCode: "KR-11",
  },
  opportunity_view: { opportunityId: A, institutionId: B, kind: "OPEN_HOUSE" },
  follow_click: { institutionId: A, context: "ARTICLE", articleId: C },
  signup_start: { context: "HOME" },
  signup_complete: { context: "MY_PREPPY" },
  follow_created: { institutionId: A, followCount: 1 },
  additional_follow: { institutionId: A, followCount: 2 },
  my_preppy_view: { followCount: 2, emailState: "ENABLED" },
  notification_sent: { notificationId: A, opportunityId: B },
  notification_open: { deliveryId: A },
  notification_click: { deliveryId: A },
  article_to_institution: { articleId: A, institutionId: B },
  article_to_follow: { articleId: A, institutionId: B },
  hero_primary_cta_click: { cta: "INSTITUTIONS" },
  hero_secondary_cta_click: { cta: "CURRENT_OPPORTUNITIES" },
} as const satisfies Record<AnalyticsEventName, object>;

describe("WP-14 canonical analytics registry", () => {
  it("accepts one strict, bounded payload for every canonical event", () => {
    expect(Object.keys(validPayloads)).toEqual(analyticsEventNames);
    for (const name of analyticsEventNames) {
      expect(parseAnalyticsEvent(name, validPayloads[name])).toEqual({
        name,
        properties: validPayloads[name],
      });
    }
  });

  it.each([
    [
      "unknown neutral key",
      "home_view",
      { landingPage: "HOME", color: "blue" },
    ],
    ["wrong type", "search", { queryLengthBucket: "1_3", resultCount: "1" }],
    [
      "oversized categorical value",
      "filter",
      { filterType: "REGION", filterValue: "X".repeat(65), resultCount: 1 },
    ],
    [
      "unknown categorical value",
      "filter",
      { filterType: "REGION", filterValue: "FREE_TEXT_REGION", resultCount: 1 },
    ],
    [
      "mismatched categorical value",
      "filter",
      { filterType: "CATEGORY", filterValue: "OPEN", resultCount: 1 },
    ],
    ["non-canonical ID", "article_view", { articleId: "legacy-guide-1" }],
    [
      "legacy School ID",
      "institution_view",
      { institutionId: A, category: "PRIVATE_ELEMENTARY", schoolId: B },
    ],
    [
      "legacy AdmissionEvent ID",
      "opportunity_view",
      {
        opportunityId: A,
        institutionId: B,
        kind: "OPEN_HOUSE",
        admissionEventId: C,
      },
    ],
    [
      "raw search text",
      "search",
      { queryLengthBucket: "1_3", resultCount: 1, rawQuery: "child name" },
    ],
    [
      "full URL",
      "home_view",
      { landingPage: "HOME", url: "https://preppy.test/?code=secret" },
    ],
    [
      "PII key",
      "home_view",
      { landingPage: "HOME", email: "person@example.com" },
    ],
    [
      "nested PII key",
      "home_view",
      { landingPage: "HOME", metadata: { childName: "Ari" } },
    ],
  ])("rejects %s", (_label, name, properties) => {
    expect(() => parseAnalyticsEvent(name, properties)).toThrow();
  });

  it("makes Noop and Test trackers enforce the same runtime registry", () => {
    const noop = new NoopAnalyticsTracker();
    const test = new TestAnalyticsTracker();

    expect(() =>
      noop.track("home_view", { landingPage: "HOME" }),
    ).not.toThrow();
    expect(() => test.track("article_view", { articleId: A })).not.toThrow();
    expect(() =>
      (noop.track as (name: string, properties: unknown) => void)("home_view", {
        landingPage: "HOME",
        phone: "010-0000-0000",
      }),
    ).toThrow();
    expect(() =>
      (test.track as (name: string, properties: unknown) => void)(
        "unknown_event",
        {},
      ),
    ).toThrow();
  });

  it("copies validated properties before exposing a Test tracker snapshot", () => {
    const tracker = new TestAnalyticsTracker();
    const properties = { articleId: A };
    tracker.track("article_view", properties);
    properties.articleId = B;
    expect(tracker.snapshot()).toEqual([
      { name: "article_view", properties: { articleId: A } },
    ]);
  });
});
