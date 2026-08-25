import "server-only";

import { z } from "zod";

const analyticsEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  ANALYTICS_ENABLED: z.enum(["true", "false"]).default("false"),
});
const measurementIdSchema = z.string().regex(/^G-[A-Z0-9]{4,20}$/);
const apiSecretSchema = z.string().min(1).max(256);

type AnalyticsEnvironment = Record<string, string | undefined>;

function parseEnabledProduction(environment: AnalyticsEnvironment) {
  const parsed = analyticsEnvironmentSchema.parse(environment);
  const enabled =
    parsed.NODE_ENV === "production" && parsed.ANALYTICS_ENABLED === "true";
  if (!enabled) return null;
  if (!environment.GA4_MEASUREMENT_ID || !environment.GA4_API_SECRET) {
    throw new Error(
      "Production analytics requires GA4_MEASUREMENT_ID and GA4_API_SECRET",
    );
  }
  return {
    measurementId: measurementIdSchema.parse(environment.GA4_MEASUREMENT_ID),
    apiSecret: apiSecretSchema.parse(environment.GA4_API_SECRET),
  };
}

export type ClientAnalyticsConfig =
  Readonly<{ mode: "NOOP" }> | Readonly<{ mode: "GA4"; measurementId: string }>;

export type ServerAnalyticsConfig =
  | Readonly<{ mode: "NOOP" }>
  | Readonly<{
      mode: "GA4";
      measurementId: string;
      apiSecret: string;
    }>;

export function parseClientAnalyticsConfig(
  environment: AnalyticsEnvironment,
): ClientAnalyticsConfig {
  const enabled = parseEnabledProduction(environment);
  return enabled
    ? { mode: "GA4", measurementId: enabled.measurementId }
    : { mode: "NOOP" };
}

export function parseServerAnalyticsConfig(
  environment: AnalyticsEnvironment,
): ServerAnalyticsConfig {
  const enabled = parseEnabledProduction(environment);
  return enabled ? { mode: "GA4", ...enabled } : { mode: "NOOP" };
}

export function getClientAnalyticsConfig(): ClientAnalyticsConfig {
  return parseClientAnalyticsConfig(process.env);
}

export function getServerAnalyticsConfig(): ServerAnalyticsConfig {
  return parseServerAnalyticsConfig(process.env);
}
