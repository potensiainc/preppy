"use client";

import type { CapturedAnalyticsEvent } from "@/src/analytics/events";
import type { AnalyticsTracker } from "@/src/analytics/tracker";

let currentNavigationKey: string | null = null;
const emittedEventKeys = new Set<string>();

export function beginClientNavigation(navigationKey: string): void {
  if (currentNavigationKey === navigationKey) return;
  currentNavigationKey = navigationKey;
  emittedEventKeys.clear();
}

export function emitClientEventOncePerNavigation(
  navigationKey: string,
  event: CapturedAnalyticsEvent,
  tracker: AnalyticsTracker,
): boolean {
  beginClientNavigation(navigationKey);
  const eventKey = JSON.stringify(event);
  if (emittedEventKeys.has(eventKey)) return false;
  emittedEventKeys.add(eventKey);
  void tracker.track(event.name, event.properties as never);
  return true;
}

export function resetClientNavigationDedupeForTests(): void {
  currentNavigationKey = null;
  emittedEventKeys.clear();
}
