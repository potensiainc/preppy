import type { CapturedAnalyticsEvent } from "@/src/analytics/events";

export type Ga4Event = Readonly<{
  name: string;
  params: Readonly<Record<string, string | number>>;
}>;

export function toGa4Event(event: CapturedAnalyticsEvent): Ga4Event {
  switch (event.name) {
    case "home_view":
      return {
        name: event.name,
        params: { landing_page: event.properties.landingPage },
      };
    case "article_view":
      return {
        name: event.name,
        params: { article_id: event.properties.articleId },
      };
    case "search":
      return {
        name: event.name,
        params: {
          query_length_bucket: event.properties.queryLengthBucket,
          result_count: event.properties.resultCount,
          ...(event.properties.category === undefined
            ? {}
            : { category: event.properties.category }),
        },
      };
    case "filter":
      return {
        name: event.name,
        params: {
          filter_type: event.properties.filterType,
          filter_value: event.properties.filterValue,
          result_count: event.properties.resultCount,
        },
      };
    case "institution_view":
      return {
        name: event.name,
        params: {
          institution_id: event.properties.institutionId,
          category: event.properties.category,
          ...(event.properties.regionCode === undefined
            ? {}
            : { region_code: event.properties.regionCode }),
        },
      };
    case "opportunity_view":
      return {
        name: event.name,
        params: {
          opportunity_id: event.properties.opportunityId,
          institution_id: event.properties.institutionId,
          kind: event.properties.kind,
        },
      };
    case "follow_click":
      return {
        name: event.name,
        params: {
          institution_id: event.properties.institutionId,
          context: event.properties.context,
          ...(event.properties.articleId === undefined
            ? {}
            : { article_id: event.properties.articleId }),
          ...(event.properties.opportunityId === undefined
            ? {}
            : { opportunity_id: event.properties.opportunityId }),
        },
      };
    case "signup_start":
    case "signup_complete":
      return {
        name: event.name,
        params: { context: event.properties.context },
      };
    case "follow_created":
    case "additional_follow":
      return {
        name: event.name,
        params: {
          institution_id: event.properties.institutionId,
          follow_count: event.properties.followCount,
        },
      };
    case "my_preppy_view":
      return {
        name: event.name,
        params: {
          follow_count: event.properties.followCount,
          email_state: event.properties.emailState,
        },
      };
    case "notification_sent":
      return {
        name: event.name,
        params: {
          notification_id: event.properties.notificationId,
          opportunity_id: event.properties.opportunityId,
        },
      };
    case "notification_open":
    case "notification_click":
      return {
        name: event.name,
        params: { delivery_id: event.properties.deliveryId },
      };
    case "article_to_institution":
    case "article_to_follow":
      return {
        name: event.name,
        params: {
          article_id: event.properties.articleId,
          institution_id: event.properties.institutionId,
        },
      };
    case "hero_primary_cta_click":
    case "hero_secondary_cta_click":
      return { name: event.name, params: { cta: event.properties.cta } };
  }
}
