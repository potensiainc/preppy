import "server-only";

import { z } from "zod";

const httpUrl = z
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "URL must use http:// or https://",
  });

const applicationOrigin = httpUrl.refine(
  (value) => {
    const url = new URL(value);
    return (
      url.origin === value &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  },
  { message: "APP_BASE_URL must be an origin without a path" },
);

const optionalNonemptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const capabilitySecret = z.string().min(32);

const authConfigSchema = z
  .object({
    APP_BASE_URL: applicationOrigin,
    KAKAO_CLIENT_ID: z.string().min(1),
    KAKAO_CLIENT_SECRET: optionalNonemptyString,
    KAKAO_REDIRECT_URI: httpUrl,
    USER_SESSION_SECRET: capabilitySecret,
    OAUTH_STATE_SECRET: capabilitySecret,
    FOLLOW_INTENT_SECRET: capabilitySecret,
  })
  .superRefine((config, context) => {
    if (new URL(config.KAKAO_REDIRECT_URI).origin !== config.APP_BASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["KAKAO_REDIRECT_URI"],
        message: "KAKAO_REDIRECT_URI must use the APP_BASE_URL origin",
      });
    }

    const purposeSecrets = [
      config.USER_SESSION_SECRET,
      config.OAUTH_STATE_SECRET,
      config.FOLLOW_INTENT_SECRET,
    ];
    if (new Set(purposeSecrets).size !== purposeSecrets.length) {
      context.addIssue({
        code: "custom",
        path: ["OAUTH_STATE_SECRET"],
        message: "Capability secrets must be distinct",
      });
    }
  });

export type AuthConfig = z.infer<typeof authConfigSchema>;

export function parseAuthConfig(
  environment: Record<string, string | undefined>,
): AuthConfig {
  return authConfigSchema.parse(environment);
}

export function getAuthConfig(): AuthConfig {
  return parseAuthConfig(process.env);
}
