import "server-only";

export type CacheRevalidationConfig = Readonly<{
  secret: string;
  maxClockSkewSeconds: 300;
}>;

const CAPABILITY_SECRET_KEYS = [
  "USER_SESSION_SECRET",
  "OAUTH_STATE_SECRET",
  "FOLLOW_INTENT_SECRET",
  "ADMIN_AUTH_CLIENT_SECRET",
  "ADMIN_SESSION_SECRET",
  "ADMIN_OIDC_FLOW_SECRET",
  "RESEND_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "GA4_API_SECRET",
  "KAKAO_CLIENT_SECRET",
] as const;

export function getCacheRevalidationConfig(
  environment: Record<string, string | undefined> = process.env,
): CacheRevalidationConfig {
  const secret = environment.CACHE_REVALIDATION_SECRET;
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error(
      "CACHE_REVALIDATION_SECRET must contain at least 32 UTF-8 bytes",
    );
  }
  if (CAPABILITY_SECRET_KEYS.some((key) => environment[key] === secret)) {
    throw new Error("CACHE_REVALIDATION_SECRET must be capability-distinct");
  }
  return { secret, maxClockSkewSeconds: 300 };
}
