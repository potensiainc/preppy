import "server-only";

import { getServerAnalyticsConfig } from "@/src/analytics/config.server";
import { Ga4ServerAnalyticsTracker } from "@/src/analytics/ga4-server.server";
import {
  NoopAnalyticsTracker,
  type AnalyticsTracker,
} from "@/src/analytics/tracker";

let runtimeTracker: AnalyticsTracker | undefined;

export function getServerAnalyticsTracker(): AnalyticsTracker {
  if (runtimeTracker) return runtimeTracker;
  const config = getServerAnalyticsConfig();
  runtimeTracker =
    config.mode === "GA4"
      ? new Ga4ServerAnalyticsTracker(config)
      : new NoopAnalyticsTracker();
  return runtimeTracker;
}

export function resetServerAnalyticsTrackerForTests(): void {
  runtimeTracker = undefined;
}
