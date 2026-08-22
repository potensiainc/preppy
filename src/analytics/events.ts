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

type AnalyticsContext =
  "HOME" | "ARTICLE" | "INSTITUTION" | "OPPORTUNITY" | "MY_PREPPY" | "EMAIL";

type InstitutionCategory =
  "ENGLISH_KINDERGARTEN" | "PRIVATE_ELEMENTARY" | "INTERNATIONAL_SCHOOL";

type EmailState = "ENABLED" | "DISABLED" | "UNAVAILABLE";

type QueryLengthBucket = "EMPTY" | "1_3" | "4_10" | "11_PLUS";

export type AnalyticsEventMap = {
  home_view: { landingPage: string };
  article_view: { articleId: string };
  search: {
    queryLengthBucket: QueryLengthBucket;
    resultCount: number;
    category?: InstitutionCategory;
  };
  filter: { filterType: string; filterValue: string; resultCount: number };
  institution_view: {
    institutionId: string;
    category: InstitutionCategory;
    regionCode?: string;
  };
  opportunity_view: {
    opportunityId: string;
    institutionId: string;
    kind: string;
  };
  follow_click: {
    institutionId: string;
    context: AnalyticsContext;
    articleId?: string;
    opportunityId?: string;
  };
  signup_start: { context: AnalyticsContext };
  signup_complete: { context: AnalyticsContext };
  follow_created: { institutionId: string; followCount: number };
  additional_follow: { institutionId: string; followCount: number };
  my_preppy_view: { followCount: number; emailState: EmailState };
  notification_sent: { notificationId: string; opportunityId: string };
  notification_open: { deliveryId: string };
  notification_click: { deliveryId: string };
  article_to_institution: { articleId: string; institutionId: string };
  article_to_follow: { articleId: string; institutionId: string };
  hero_primary_cta_click: { cta: string };
  hero_secondary_cta_click: { cta: string };
};

export type CapturedAnalyticsEvent = {
  [Name in AnalyticsEventName]: {
    name: Name;
    properties: Readonly<AnalyticsEventMap[Name]>;
  };
}[AnalyticsEventName];
