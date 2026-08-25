import "server-only";

import { randomUUID } from "node:crypto";

import type {
  AnalyticsEventMap,
  AnalyticsEventName,
} from "@/src/analytics/events";
import { parseAnalyticsEvent } from "@/src/analytics/events";
import { toGa4Event } from "@/src/analytics/provider-mapping";
import type { AnalyticsTracker } from "@/src/analytics/tracker";

const DEFAULT_TIMEOUT_MS = 2_500;

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type ServerTrackerOptions = Readonly<{
  measurementId: string;
  apiSecret: string;
  fetcher?: Fetcher;
  randomId?: () => string;
  timeoutMs?: number;
  warn?: (...values: unknown[]) => void;
}>;

export class Ga4ServerAnalyticsTracker implements AnalyticsTracker {
  private readonly fetcher: Fetcher;
  private readonly randomId: () => string;
  private readonly timeoutMs: number;
  private readonly warn: (...values: unknown[]) => void;

  constructor(private readonly options: ServerTrackerOptions) {
    if (!/^G-[A-Z0-9]{4,20}$/.test(options.measurementId)) {
      throw new Error("Invalid GA4 measurement ID");
    }
    if (options.apiSecret.length < 1 || options.apiSecret.length > 256) {
      throw new Error("Invalid GA4 API secret");
    }
    this.fetcher = options.fetcher ?? fetch;
    this.randomId = options.randomId ?? randomUUID;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (
      !Number.isSafeInteger(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 3_000
    ) {
      throw new Error("Invalid analytics timeout");
    }
    this.warn =
      options.warn ??
      ((...values) => {
        console.warn(...values);
      });
  }

  track<Name extends AnalyticsEventName>(
    name: Name,
    properties: Readonly<AnalyticsEventMap[Name]>,
  ): Promise<void> {
    const canonical = parseAnalyticsEvent(name, properties);
    const provider = toGa4Event(canonical);
    return this.send(provider.name, provider.params);
  }

  private async send(
    eventName: string,
    params: Readonly<Record<string, string | number>>,
  ): Promise<void> {
    const query = new URLSearchParams({
      measurement_id: this.options.measurementId,
      api_secret: this.options.apiSecret,
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(
        `https://www.google-analytics.com/mp/collect?${query.toString()}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            client_id: this.randomId(),
            events: [
              {
                name: eventName,
                params: { ...params, engagement_time_msec: 1 },
              },
            ],
          }),
        },
      );
      if (!response.ok) {
        this.warn("analytics_transport_failed", eventName, response.status);
      }
    } catch {
      this.warn("analytics_transport_failed", eventName);
    } finally {
      clearTimeout(timeout);
    }
  }
}
