"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

import { browserCampaignEntry } from "@/src/analytics/campaign-entry";
import {
  useAnalytics,
  useAnalyticsConsent,
} from "@/src/analytics/client-context";
import type { AnalyticsEventMap } from "@/src/analytics/events";
import {
  beginClientNavigation,
  emitClientEventOncePerNavigation,
} from "@/src/analytics/navigation-dedupe";

type GuideTarget = AnalyticsEventMap["guide_cta_click"]["target"];

// One key per page mount: a re-render or Strict Mode effect replay reuses it,
// while returning to the page later mounts again and counts a new view.
function useMountKey(): string {
  const [key] = useState(() => Math.random().toString(36).slice(2));
  return key;
}

export function GuideViewAnalytics() {
  const tracker = useAnalytics();
  const { ready } = useAnalyticsConsent();
  const mountKey = useMountKey();
  useEffect(() => {
    const entry = browserCampaignEntry();
    if (!ready) return;
    const navigationKey = JSON.stringify({
      route: "GUIDE_EK_CHECKLIST",
      mountKey,
    });
    beginClientNavigation(navigationKey);
    emitClientEventOncePerNavigation(
      navigationKey,
      { name: "guide_view", properties: { guide: "EK_CHECKLIST", entry } },
      tracker,
    );
  }, [mountKey, ready, tracker]);
  return null;
}

export function CompareViewAnalytics({
  district,
}: Readonly<{ district: AnalyticsEventMap["compare_view"]["district"] }>) {
  const tracker = useAnalytics();
  const { ready } = useAnalyticsConsent();
  const mountKey = useMountKey();
  useEffect(() => {
    const entry = browserCampaignEntry();
    if (!ready) return;
    const navigationKey = JSON.stringify({
      route: "COMPARE_EK",
      district,
      mountKey,
    });
    beginClientNavigation(navigationKey);
    emitClientEventOncePerNavigation(
      navigationKey,
      {
        name: "compare_view",
        properties: {
          category: "ENGLISH_KINDERGARTEN",
          district,
          entry,
        },
      },
      tracker,
    );
  }, [district, mountKey, ready, tracker]);
  return null;
}

export function GuideCtaLink({
  children,
  className,
  href,
  target,
}: Readonly<{
  children: ReactNode;
  className?: string;
  href: string;
  target: GuideTarget;
}>) {
  const tracker = useAnalytics();
  function onClick(click: MouseEvent<HTMLAnchorElement>) {
    if (click.defaultPrevented) return;
    void tracker.track("guide_cta_click", {
      guide: "EK_CHECKLIST",
      entry: browserCampaignEntry(),
      target,
    });
  }
  return (
    <Link className={className} href={href} onClick={onClick}>
      {children}
    </Link>
  );
}
