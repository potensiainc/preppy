"use client";

import { createContext, useContext } from "react";

import {
  NoopAnalyticsTracker,
  type AnalyticsTracker,
} from "@/src/analytics/tracker";

const fallbackTracker = new NoopAnalyticsTracker();

export const AnalyticsContext =
  createContext<AnalyticsTracker>(fallbackTracker);

export function useAnalytics(): AnalyticsTracker {
  return useContext(AnalyticsContext);
}
