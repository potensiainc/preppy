"use client";

import Script from "next/script";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  AnalyticsConsentContext,
  AnalyticsContext,
} from "@/src/analytics/client-context";
import type { ClientAnalyticsConfig } from "@/src/analytics/config.server";
import type { CapturedAnalyticsEvent } from "@/src/analytics/events";
import { ClientGa4AnalyticsTracker } from "@/src/analytics/ga4-client";
import { safeGa4LocationContext } from "@/src/analytics/url-guard";

declare global {
  interface Window {
    dataLayer?: Array<IArguments | unknown[]>;
    gtag?: (...args: unknown[]) => void;
    __PREPPY_GTAG_INITIALIZED__?: string;
    __PREPPY_ANALYTICS_CAPTURE__?: (event: CapturedAnalyticsEvent) => void;
  }
}

function ensureGoogleInitialized(measurementId: string) {
  if (window.__PREPPY_GTAG_INITIALIZED__ === measurementId) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    window.dataLayer?.push(arguments);
  };
  const page = safeGa4LocationContext(window.location.href, document.referrer);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_expires: 60 * 60 * 24 * 90,
    cookie_update: false,
    page_location: page.pageLocation,
    ...(page.pageReferrer ? { page_referrer: page.pageReferrer } : {}),
  });
  window.__PREPPY_GTAG_INITIALIZED__ = measurementId;
}

const CONSENT_STORAGE_KEY = "preppy.analytics.consent.v1";
type ConsentChoice = "loading" | "unset" | "granted" | "denied";

function subscribeConsent(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("preppy:analytics-consent", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("preppy:analytics-consent", listener);
  };
}

function getConsentSnapshot(): ConsentChoice {
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === "granted" || stored === "denied" ? stored : "unset";
  } catch {
    return "unset";
  }
}

function getServerConsentSnapshot(): ConsentChoice {
  return "loading";
}

function setGoogleDisabled(measurementId: string, disabled: boolean) {
  Object.assign(window, { [`ga-disable-${measurementId}`]: disabled });
}

function clearGoogleCookies() {
  const host = window.location.hostname;
  const hostParts = host.split(".");
  const domains = [
    "",
    ...hostParts
      .slice(0, -1)
      .map((_, index) => `; domain=.${hostParts.slice(index).join(".")}`),
  ];
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=", 1)[0];
    if (name !== "_ga" && !name.startsWith("_ga_")) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax`;
    }
  }
}

export function AnalyticsProvider({
  children,
  config,
}: Readonly<{ children: ReactNode; config: ClientAnalyticsConfig }>) {
  const storedConsent = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getServerConsentSnapshot,
  );
  const [temporaryConsent, setTemporaryConsent] =
    useState<ConsentChoice | null>(null);
  const consent = temporaryConsent ?? storedConsent;
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (config.mode !== "GA4") return;
    setGoogleDisabled(config.measurementId, consent !== "granted");
    if (consent === "denied") clearGoogleCookies();
  }, [config, consent]);

  const chooseConsent = useCallback(
    (choice: "granted" | "denied") => {
      if (config.mode !== "GA4") return;
      setGoogleDisabled(config.measurementId, choice !== "granted");
      if (choice === "denied") clearGoogleCookies();
      try {
        window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
        window.dispatchEvent(new Event("preppy:analytics-consent"));
      } catch {
        // The current-page choice still applies when storage is unavailable.
        setTemporaryConsent(choice);
      }
      setSettingsOpen(false);
    },
    [config],
  );

  const analyticsAllowed = config.mode === "GA4" && consent === "granted";
  const tracker = useMemo(
    () =>
      new ClientGa4AnalyticsTracker({
        mode: analyticsAllowed ? "GA4" : "NOOP",
        gtag:
          config.mode === "GA4" && analyticsAllowed
            ? (command, name, params) => {
                ensureGoogleInitialized(config.measurementId);
                window.gtag?.(command, name, params);
              }
            : undefined,
        resolveCapture: () => window.__PREPPY_ANALYTICS_CAPTURE__,
      }),
    [analyticsAllowed, config],
  );

  return (
    <AnalyticsConsentContext.Provider
      value={{
        available: config.mode === "GA4",
        ready: config.mode !== "GA4" || analyticsAllowed,
        openSettings: () => setSettingsOpen(true),
      }}
    >
      <AnalyticsContext.Provider value={tracker}>
        {config.mode === "GA4" && analyticsAllowed ? (
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${config.measurementId}`}
            strategy="afterInteractive"
            onReady={() => ensureGoogleInitialized(config.measurementId)}
          />
        ) : null}
        {children}
        {config.mode === "GA4" && (consent === "unset" || settingsOpen) ? (
          <section className="analytics-consent" aria-label="방문 분석 설정">
            <div>
              <h2>방문 분석 설정</h2>
              <p>
                분석을 허용하면 Google Analytics로 방문과 클릭을 살펴보고 분석
                쿠키를 사용해요. 거부해도 서비스를 이용할 수 있어요. 자세한
                내용은 <Link href="/privacy">개인정보 처리방침</Link>을 확인해
                주세요.
              </p>
            </div>
            <div className="analytics-consent__actions">
              <button type="button" onClick={() => chooseConsent("denied")}>
                분석 거부
              </button>
              <button type="button" onClick={() => chooseConsent("granted")}>
                분석 허용
              </button>
            </div>
          </section>
        ) : null}
      </AnalyticsContext.Provider>
    </AnalyticsConsentContext.Provider>
  );
}
