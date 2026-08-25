import type { CapturedAnalyticsEvent } from "@/src/analytics/events";
import type { InstitutionListQuery } from "@/src/modules/public/dto";

export function queryLengthBucket(
  query: string | undefined,
): "EMPTY" | "1_3" | "4_10" | "11_PLUS" {
  const length = query?.length ?? 0;
  if (length === 0) return "EMPTY";
  if (length <= 3) return "1_3";
  if (length <= 10) return "4_10";
  return "11_PLUS";
}

function canonicalRegionFilter(
  value: string | undefined,
): "SEOUL" | "KR-11" | null {
  return value === "SEOUL" || value === "KR-11" ? value : null;
}

export function buildInstitutionListAnalytics(
  filters: InstitutionListQuery,
  resultCount: number,
): Readonly<{
  navigationKey: string;
  events: readonly CapturedAnalyticsEvent[];
}> {
  const events: CapturedAnalyticsEvent[] = [];
  const bucket = queryLengthBucket(filters.query);
  if (filters.query !== undefined) {
    events.push({
      name: "search",
      properties: {
        queryLengthBucket: bucket,
        resultCount,
        ...(filters.category ? { category: filters.category } : {}),
      },
    });
  }
  if (filters.category) {
    events.push({
      name: "filter",
      properties: {
        filterType: "CATEGORY",
        filterValue: filters.category,
        resultCount,
      },
    });
  }
  const region = canonicalRegionFilter(filters.region);
  if (region) {
    events.push({
      name: "filter",
      properties: {
        filterType: "REGION",
        filterValue: region,
        resultCount,
      },
    });
  }
  if (filters.recruitmentState) {
    events.push({
      name: "filter",
      properties: {
        filterType: "RECRUITMENT_STATE",
        filterValue: filters.recruitmentState,
        resultCount,
      },
    });
  }
  return {
    navigationKey: JSON.stringify({
      route: "INSTITUTION_LIST",
      queryLengthBucket: filters.query === undefined ? null : bucket,
      category: filters.category ?? null,
      region,
      recruitmentState: filters.recruitmentState ?? null,
      page: filters.page,
    }),
    events,
  };
}

type FollowClickTarget = Readonly<{
  institutionId: string;
  context: "INSTITUTION" | "ARTICLE" | "OPPORTUNITY";
  articleId?: string;
  opportunityId?: string;
}>;

export function buildFollowClickEvents(
  target: FollowClickTarget,
): readonly CapturedAnalyticsEvent[] {
  const events: CapturedAnalyticsEvent[] = [
    {
      name: "follow_click",
      properties: {
        institutionId: target.institutionId,
        context: target.context,
        ...(target.articleId ? { articleId: target.articleId } : {}),
        ...(target.opportunityId
          ? { opportunityId: target.opportunityId }
          : {}),
      },
    },
  ];
  if (target.context === "ARTICLE" && target.articleId) {
    events.push({
      name: "article_to_follow",
      properties: {
        articleId: target.articleId,
        institutionId: target.institutionId,
      },
    });
  }
  return events;
}
