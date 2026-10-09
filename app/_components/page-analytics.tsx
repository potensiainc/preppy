"use client";

import { useEffect } from "react";

import {
  useAnalytics,
  useAnalyticsConsent,
} from "@/src/analytics/client-context";
import type { CapturedAnalyticsEvent } from "@/src/analytics/events";
import {
  beginClientNavigation,
  emitClientEventOncePerNavigation,
} from "@/src/analytics/navigation-dedupe";

export function PageAnalytics({
  navigationKey,
  events,
}: Readonly<{
  navigationKey: string;
  events: readonly CapturedAnalyticsEvent[];
}>) {
  const tracker = useAnalytics();
  const { ready } = useAnalyticsConsent();
  useEffect(() => {
    if (!ready) return;
    beginClientNavigation(navigationKey);
    for (const event of events) {
      emitClientEventOncePerNavigation(navigationKey, event, tracker);
    }
  }, [events, navigationKey, ready, tracker]);
  return null;
}
