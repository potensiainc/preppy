import "server-only";

import { parseServerAnalyticsConfig } from "@/src/analytics/config.server";
import { parseSideEffectEnv } from "@/src/config/runtime-env";
import { getCacheRevalidationConfig } from "@/src/modules/cache/config.server";
import { parseResendSendConfig } from "@/src/modules/notification/resend-config.server";

type Environment = Record<string, string | undefined>;

const capabilitySecrets = [
  "USER_SESSION_SECRET",
  "OAUTH_STATE_SECRET",
  "FOLLOW_INTENT_SECRET",
  "KAKAO_CLIENT_SECRET",
  "ADMIN_AUTH_CLIENT_SECRET",
  "ADMIN_SESSION_SECRET",
  "ADMIN_OIDC_FLOW_SECRET",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "GA4_API_SECRET",
  "CACHE_REVALIDATION_SECRET",
] as const;

function configured(environment: Environment, key: string): boolean {
  return Boolean(environment[key]);
}

function entry(environment: Environment, configName: string) {
  return {
    configName,
    configured: configured(environment, configName),
  } as const;
}

export function getProductionCapabilityMatrix(environment: Environment) {
  const sideEffects = parseSideEffectEnv(environment);
  return {
    database: {
      readOnlyPreflight: entry(environment, "PRODUCTION_DATABASE_URL"),
      migrationCutover: entry(environment, "DATABASE_URL"),
      runtimeWeb: entry(environment, "DATABASE_URL"),
      worker: entry(environment, "DATABASE_URL"),
    },
    sideEffects: {
      worker: sideEffects.WORKER_ENABLED,
      email: sideEffects.EMAIL_SEND_ENABLED,
      analytics: sideEffects.ANALYTICS_ENABLED,
      cacheRevalidation: sideEffects.CACHE_REVALIDATION_ENABLED,
    },
    secrets: {
      adminOidcClient: entry(environment, "ADMIN_AUTH_CLIENT_SECRET"),
      adminSession: entry(environment, "ADMIN_SESSION_SECRET"),
      oidcFlow: entry(environment, "ADMIN_OIDC_FLOW_SECRET"),
      resendApi: entry(environment, "RESEND_API_KEY"),
      resendWebhook: entry(environment, "RESEND_WEBHOOK_SECRET"),
      ga4Server: entry(environment, "GA4_API_SECRET"),
      cacheHmac: entry(environment, "CACHE_REVALIDATION_SECRET"),
    },
  } as const;
}

function assertSecretDomainSeparation(environment: Environment): void {
  const owners = new Map<string, string>();
  for (const key of capabilitySecrets) {
    const value = environment[key];
    if (!value) continue;
    if (owners.has(value)) {
      throw new Error("Configured capability secrets must be distinct.");
    }
    owners.set(value, key);
  }
}

export function validateProductionCapabilityConfig(
  environment: Environment,
): ReturnType<typeof getProductionCapabilityMatrix> {
  const matrix = getProductionCapabilityMatrix(environment);
  assertSecretDomainSeparation(environment);
  if (matrix.sideEffects.worker && !matrix.database.worker.configured) {
    throw new Error("Worker capability requires DATABASE_URL.");
  }
  if (matrix.sideEffects.email) {
    try {
      parseResendSendConfig(environment);
    } catch {
      throw new Error("Email capability configuration is incomplete.");
    }
  }
  if (matrix.sideEffects.analytics) {
    try {
      parseServerAnalyticsConfig({ ...environment, NODE_ENV: "production" });
    } catch {
      throw new Error("Analytics capability configuration is incomplete.");
    }
  }
  if (matrix.sideEffects.cacheRevalidation) {
    try {
      getCacheRevalidationConfig(environment);
    } catch {
      throw new Error("Cache capability configuration is incomplete.");
    }
  }
  return matrix;
}
