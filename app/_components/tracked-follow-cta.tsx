"use client";

import { FollowCta, type FollowCtaTarget } from "@/app/_components/follow-cta";
import { useAnalytics } from "@/src/analytics/client-context";
import { buildFollowClickEvents } from "@/src/analytics/public-events";

export function TrackedFollowCta(
  props: FollowCtaTarget & Readonly<{ label?: string }>,
) {
  const analytics = useAnalytics();
  const onAnalyticsAction = () => {
    for (const event of buildFollowClickEvents(props)) {
      void analytics.track(event.name, event.properties as never);
    }
  };
  return <FollowCta {...props} onAnalyticsAction={onAnalyticsAction} />;
}
