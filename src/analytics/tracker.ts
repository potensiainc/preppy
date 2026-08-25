import type {
  AnalyticsEventMap,
  AnalyticsEventName,
  CapturedAnalyticsEvent,
} from "@/src/analytics/events";
import { parseAnalyticsEvent } from "@/src/analytics/events";

export interface AnalyticsTracker {
  track<Name extends AnalyticsEventName>(
    name: Name,
    properties: Readonly<AnalyticsEventMap[Name]>,
  ): void | Promise<void>;
}

export class NoopAnalyticsTracker implements AnalyticsTracker {
  track<Name extends AnalyticsEventName>(
    name: Name,
    properties: Readonly<AnalyticsEventMap[Name]>,
  ): void {
    parseAnalyticsEvent(name, properties);
  }
}

export class TestAnalyticsTracker implements AnalyticsTracker {
  private readonly capturedEvents: CapturedAnalyticsEvent[] = [];

  track<Name extends AnalyticsEventName>(
    name: Name,
    properties: Readonly<AnalyticsEventMap[Name]>,
  ): void {
    this.capturedEvents.push(parseAnalyticsEvent(name, properties));
  }

  snapshot(): readonly CapturedAnalyticsEvent[] {
    return this.capturedEvents.map((event) => ({
      name: event.name,
      properties: { ...event.properties },
    })) as readonly CapturedAnalyticsEvent[];
  }

  reset(): void {
    this.capturedEvents.length = 0;
  }
}
