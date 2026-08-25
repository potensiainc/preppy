"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import { useAnalytics } from "@/src/analytics/client-context";
import type { CapturedAnalyticsEvent } from "@/src/analytics/events";

export function AnalyticsLink({
  children,
  className,
  event,
  href,
}: Readonly<{
  children: ReactNode;
  className?: string;
  event: CapturedAnalyticsEvent;
  href: string;
}>) {
  const tracker = useAnalytics();
  function onClick(click: MouseEvent<HTMLAnchorElement>) {
    if (click.defaultPrevented) return;
    void tracker.track(event.name, event.properties as never);
  }
  return (
    <Link className={className} href={href} onClick={onClick}>
      {children}
    </Link>
  );
}
