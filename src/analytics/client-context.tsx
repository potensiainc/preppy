"use client";

import { createContext, useContext } from "react";

import {
  NoopAnalyticsTracker,
  type AnalyticsTracker,
} from "@/src/analytics/tracker";

const fallbackTracker = new NoopAnalyticsTracker();

export const AnalyticsContext =
  createContext<AnalyticsTracker>(fallbackTracker);
export const AnalyticsConsentContext = createContext<{
  available: boolean;
  ready: boolean;
  openSettings: () => void;
}>({ available: false, ready: true, openSettings: () => {} });

export function useAnalytics(): AnalyticsTracker {
  return useContext(AnalyticsContext);
}

export function useAnalyticsConsent() {
  return useContext(AnalyticsConsentContext);
}
