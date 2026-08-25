"use client";

import Script from "next/script";
import { useMemo, type ReactNode } from "react";

import { AnalyticsContext } from "@/src/analytics/client-context";
import type { ClientAnalyticsConfig } from "@/src/analytics/config.server";
import type { CapturedAnalyticsEvent } from "@/src/analytics/events";
import { ClientGa4AnalyticsTracker } from "@/src/analytics/ga4-client";
import { safeGa4LocationContext } from "@/src/analytics/url-guard";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
    __PREPPY_GTAG_INITIALIZED__?: string;
    __PREPPY_ANALYTICS_CAPTURE__?: (event: CapturedAnalyticsEvent) => void;
  }
}

function ensureGoogleInitialized(measurementId: string) {
  if (window.__PREPPY_GTAG_INITIALIZED__ === measurementId) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
  const page = safeGa4LocationContext(window.location.href, document.referrer);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: page.pageLocation,
    ...(page.pageReferrer ? { page_referrer: page.pageReferrer } : {}),
  });
  window.__PREPPY_GTAG_INITIALIZED__ = measurementId;
}

export function AnalyticsProvider({
  children,
  config,
}: Readonly<{ children: ReactNode; config: ClientAnalyticsConfig }>) {
  const tracker = useMemo(
    () =>
      new ClientGa4AnalyticsTracker({
        mode: config.mode,
        gtag:
          config.mode === "GA4"
            ? (command, name, params) => {
                ensureGoogleInitialized(config.measurementId);
                window.gtag?.(command, name, params);
              }
            : undefined,
        resolveCapture: () => window.__PREPPY_ANALYTICS_CAPTURE__,
      }),
    [config],
  );

  return (
    <AnalyticsContext.Provider value={tracker}>
      {config.mode === "GA4" ? (
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${config.measurementId}`}
          strategy="afterInteractive"
        />
      ) : null}
      {children}
    </AnalyticsContext.Provider>
  );
}
