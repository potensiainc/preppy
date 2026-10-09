"use client";

import { useAnalyticsConsent } from "@/src/analytics/client-context";

export function AnalyticsSettingsButton() {
  const { available, openSettings } = useAnalyticsConsent();
  if (!available) return null;
  return (
    <button type="button" onClick={openSettings}>
      방문 분석 설정
    </button>
  );
}
