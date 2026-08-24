import "server-only";

import { z } from "zod";

const httpUrl = z.url().superRefine((value, context) => {
  if (!["http:", "https:"].includes(new URL(value).protocol)) {
    context.addIssue({
      code: "custom",
      message: "URL must use http:// or https://",
    });
  }
});

const adminLogoutEnvironmentSchema = z.object({
  APP_BASE_URL: httpUrl,
});

const trustedIssuer = z.string().superRefine((value, context) => {
  if (value.trim() !== value) {
    context.addIssue({
      code: "custom",
      message: "Issuer must not contain surrounding whitespace",
    });
    return;
  }

  let issuer: URL;
  try {
    issuer = new URL(value);
  } catch {
    context.addIssue({
      code: "custom",
      message: "Issuer must be an absolute URL",
    });
    return;
  }
  if (!["http:", "https:"].includes(issuer.protocol)) {
    context.addIssue({
      code: "custom",
      message: "Issuer must use http:// or https://",
    });
  }
  if (
    issuer.username !== "" ||
    issuer.password !== "" ||
    issuer.search !== "" ||
    issuer.hash !== ""
  ) {
    context.addIssue({
      code: "custom",
      message: "Issuer must not contain credentials, a query, or a fragment",
    });
  }
});

const secretWithMinimumBytes = z.string().superRefine((value, context) => {
  if (new TextEncoder().encode(value).byteLength < 32) {
    context.addIssue({
      code: "custom",
      message: "Secret must contain at least 32 UTF-8 bytes",
    });
  }
});

const adminAuthEnvironmentSchema = z
  .object({
    APP_BASE_URL: httpUrl,
    ADMIN_AUTH_ISSUER: trustedIssuer,
    ADMIN_AUTH_CLIENT_ID: z.string().min(1),
    ADMIN_AUTH_CLIENT_SECRET: secretWithMinimumBytes,
    ADMIN_SESSION_SECRET: secretWithMinimumBytes,
    ADMIN_OIDC_FLOW_SECRET: secretWithMinimumBytes,
    USER_SESSION_SECRET: z.string().optional(),
    OAUTH_STATE_SECRET: z.string().optional(),
    FOLLOW_INTENT_SECRET: z.string().optional(),
  })
  .superRefine((environment, context) => {
    const consumerSecrets = [
      environment.USER_SESSION_SECRET,
      environment.OAUTH_STATE_SECRET,
      environment.FOLLOW_INTENT_SECRET,
    ].filter((secret): secret is string => secret !== undefined);

    if (
      environment.ADMIN_SESSION_SECRET === environment.ADMIN_OIDC_FLOW_SECRET ||
      consumerSecrets.includes(environment.ADMIN_SESSION_SECRET) ||
      consumerSecrets.includes(environment.ADMIN_OIDC_FLOW_SECRET)
    ) {
      context.addIssue({
        code: "custom",
        path: ["ADMIN_OIDC_FLOW_SECRET"],
        message: "Admin capability secrets must be distinct",
      });
    }
  });

export type AdminAuthConfig = Readonly<{
  APP_BASE_URL: string;
  ADMIN_AUTH_ISSUER: string;
  ADMIN_AUTH_CLIENT_ID: string;
  ADMIN_AUTH_CLIENT_SECRET: string;
  ADMIN_SESSION_SECRET: string;
  ADMIN_OIDC_FLOW_SECRET: string;
  redirectUri: string;
}>;

export type AdminLogoutConfig = Readonly<{
  APP_BASE_URL: string;
}>;

export function getAdminLogoutConfig(
  environment: Record<string, string | undefined> = process.env,
): AdminLogoutConfig {
  const parsed = adminLogoutEnvironmentSchema.parse(environment);
  return { APP_BASE_URL: parsed.APP_BASE_URL };
}

export function getAdminAuthConfig(
  environment: Record<string, string | undefined> = process.env,
): AdminAuthConfig {
  const parsed = adminAuthEnvironmentSchema.parse(environment);
  return {
    APP_BASE_URL: parsed.APP_BASE_URL,
    ADMIN_AUTH_ISSUER: parsed.ADMIN_AUTH_ISSUER,
    ADMIN_AUTH_CLIENT_ID: parsed.ADMIN_AUTH_CLIENT_ID,
    ADMIN_AUTH_CLIENT_SECRET: parsed.ADMIN_AUTH_CLIENT_SECRET,
    ADMIN_SESSION_SECRET: parsed.ADMIN_SESSION_SECRET,
    ADMIN_OIDC_FLOW_SECRET: parsed.ADMIN_OIDC_FLOW_SECRET,
    redirectUri: `${new URL(parsed.APP_BASE_URL).origin}/admin/auth/callback`,
  };
}
