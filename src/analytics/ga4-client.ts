"use client";

import type {
  AnalyticsEventMap,
  AnalyticsEventName,
  CapturedAnalyticsEvent,
} from "@/src/analytics/events";
import { parseAnalyticsEvent } from "@/src/analytics/events";
import { toGa4Event } from "@/src/analytics/provider-mapping";
import type { AnalyticsTracker } from "@/src/analytics/tracker";

type Gtag = (
  command: "event",
  name: string,
  params: Record<string, string | number>,
) => void;
type Capture = (event: CapturedAnalyticsEvent) => void;

type ClientGa4AnalyticsTrackerOptions = Readonly<{
  mode: "GA4" | "NOOP";
  gtag?: Gtag;
  capture?: Capture;
  resolveCapture?: () => Capture | undefined;
}>;

export class ClientGa4AnalyticsTracker implements AnalyticsTracker {
  constructor(private readonly options: ClientGa4AnalyticsTrackerOptions) {}

  track<Name extends AnalyticsEventName>(
    name: Name,
    properties: Readonly<AnalyticsEventMap[Name]>,
  ): void {
    const event = parseAnalyticsEvent(name, properties);
    const capture = this.options.capture ?? this.options.resolveCapture?.();
    if (capture) {
      try {
        capture(event);
      } catch {
        // Analytics capture never changes the product action.
      }
      return;
    }
    if (this.options.mode !== "GA4" || !this.options.gtag) return;
    const mapped = toGa4Event(event);
    try {
      this.options.gtag("event", mapped.name, { ...mapped.params });
    } catch {
      // Browser/provider failures remain best effort after validation.
    }
  }
}
