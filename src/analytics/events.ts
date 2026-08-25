import { z } from "zod";

import { assertAnalyticsPayloadHasNoProhibitedKeys } from "@/src/analytics/pii-guard";

export const analyticsEventNames = [
  "home_view",
  "article_view",
  "search",
  "filter",
  "institution_view",
  "opportunity_view",
  "follow_click",
  "signup_start",
  "signup_complete",
  "follow_created",
  "additional_follow",
  "my_preppy_view",
  "notification_sent",
  "notification_open",
  "notification_click",
  "article_to_institution",
  "article_to_follow",
  "hero_primary_cta_click",
  "hero_secondary_cta_click",
] as const;

export type AnalyticsEventName = (typeof analyticsEventNames)[number];

const canonicalId = z.uuid().transform((value) => value.toLowerCase());
const boundedCount = z.number().int().min(0).max(2_147_483_647);
const context = z.enum([
  "HOME",
  "ARTICLE",
  "INSTITUTION",
  "OPPORTUNITY",
  "MY_PREPPY",
  "EMAIL",
]);
const category = z.enum([
  "ENGLISH_KINDERGARTEN",
  "PRIVATE_ELEMENTARY",
  "INTERNATIONAL_SCHOOL",
]);
const regionCode = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Z0-9][A-Z0-9_-]*$/);
const opportunityKind = z.enum([
  "RECRUITMENT",
  "ADDITIONAL_RECRUITMENT",
  "INFORMATION_SESSION",
  "CONSULTATION",
  "LEVEL_TEST",
  "OPEN_HOUSE",
  "APPLICATION",
  "DOCUMENT_SUBMISSION",
  "ASSESSMENT",
  "INTERVIEW",
  "LOTTERY",
  "RESULT_ANNOUNCEMENT",
  "REGISTRATION",
  "DEADLINE",
  "OTHER",
]);

export const analyticsEventSchemas = {
  home_view: z.object({ landingPage: z.literal("HOME") }).strict(),
  article_view: z.object({ articleId: canonicalId }).strict(),
  search: z
    .object({
      queryLengthBucket: z.enum(["EMPTY", "1_3", "4_10", "11_PLUS"]),
      resultCount: boundedCount,
      category: category.optional(),
    })
    .strict(),
  filter: z.discriminatedUnion("filterType", [
    z
      .object({
        filterType: z.literal("CATEGORY"),
        filterValue: category,
        resultCount: boundedCount,
      })
      .strict(),
    z
      .object({
        filterType: z.literal("REGION"),
        filterValue: z.enum(["SEOUL", "KR-11"]),
        resultCount: boundedCount,
      })
      .strict(),
    z
      .object({
        filterType: z.literal("RECRUITMENT_STATE"),
        filterValue: z.enum([
          "UPCOMING",
          "OPEN",
          "CLOSED",
          "COMPLETED",
          "CANCELLED",
          "UNKNOWN",
        ]),
        resultCount: boundedCount,
      })
      .strict(),
  ]),
  institution_view: z
    .object({
      institutionId: canonicalId,
      category,
      regionCode: regionCode.optional(),
    })
    .strict(),
  opportunity_view: z
    .object({
      opportunityId: canonicalId,
      institutionId: canonicalId,
      kind: opportunityKind,
    })
    .strict(),
  follow_click: z
    .object({
      institutionId: canonicalId,
      context,
      articleId: canonicalId.optional(),
      opportunityId: canonicalId.optional(),
    })
    .strict(),
  signup_start: z.object({ context }).strict(),
  signup_complete: z.object({ context }).strict(),
  follow_created: z
    .object({ institutionId: canonicalId, followCount: boundedCount.min(1) })
    .strict(),
  additional_follow: z
    .object({ institutionId: canonicalId, followCount: boundedCount.min(2) })
    .strict(),
  my_preppy_view: z
    .object({
      followCount: boundedCount,
      emailState: z.enum(["ENABLED", "DISABLED", "UNAVAILABLE"]),
    })
    .strict(),
  notification_sent: z
    .object({ notificationId: canonicalId, opportunityId: canonicalId })
    .strict(),
  notification_open: z.object({ deliveryId: canonicalId }).strict(),
  notification_click: z.object({ deliveryId: canonicalId }).strict(),
  article_to_institution: z
    .object({ articleId: canonicalId, institutionId: canonicalId })
    .strict(),
  article_to_follow: z
    .object({ articleId: canonicalId, institutionId: canonicalId })
    .strict(),
  hero_primary_cta_click: z.object({ cta: z.literal("INSTITUTIONS") }).strict(),
  hero_secondary_cta_click: z
    .object({ cta: z.literal("CURRENT_OPPORTUNITIES") })
    .strict(),
} as const;

export type AnalyticsEventMap = {
  [Name in AnalyticsEventName]: z.output<(typeof analyticsEventSchemas)[Name]>;
};

export type CapturedAnalyticsEvent = {
  [Name in AnalyticsEventName]: {
    name: Name;
    properties: Readonly<AnalyticsEventMap[Name]>;
  };
}[AnalyticsEventName];

export function parseAnalyticsEvent(
  name: string,
  properties: unknown,
): CapturedAnalyticsEvent {
  if (!(analyticsEventNames as readonly string[]).includes(name)) {
    throw new Error("Unknown analytics event");
  }
  assertAnalyticsPayloadHasNoProhibitedKeys(properties);
  const eventName = name as AnalyticsEventName;
  const schema = analyticsEventSchemas[
    eventName
  ] as unknown as z.ZodType<unknown>;
  return {
    name: eventName,
    properties: schema.parse(properties),
  } as CapturedAnalyticsEvent;
}
