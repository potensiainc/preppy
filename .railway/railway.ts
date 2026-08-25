import { defineRailway, postgres, project, service } from "railway/iac";

export default defineRailway((context) => {
  const sideEffectsOff = {
    WORKER_ENABLED: "false",
    EMAIL_SEND_ENABLED: "false",
    ANALYTICS_ENABLED: "false",
    CACHE_REVALIDATION_ENABLED: "false",
  } as const;

  const web = service("web", {
    build: "npm run build",
    start: "npm run start",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: 1,
    env: {
      NODE_ENV: "production",
      RAILPACK_NODE_NPM_INSTALL: "npm ci",
      DATABASE_URL: context.shared.PREPPY_WEB_DATABASE_URL,
      DATABASE_MAX_CONNECTIONS:
        context.shared.PREPPY_WEB_DATABASE_MAX_CONNECTIONS,
      APP_BASE_URL: context.shared.APP_BASE_URL,
      KAKAO_CLIENT_ID: context.shared.KAKAO_CLIENT_ID,
      KAKAO_CLIENT_SECRET: context.shared.KAKAO_CLIENT_SECRET,
      KAKAO_REDIRECT_URI: context.shared.KAKAO_REDIRECT_URI,
      USER_SESSION_SECRET: context.shared.USER_SESSION_SECRET,
      OAUTH_STATE_SECRET: context.shared.OAUTH_STATE_SECRET,
      FOLLOW_INTENT_SECRET: context.shared.FOLLOW_INTENT_SECRET,
      ADMIN_AUTH_ISSUER: context.shared.ADMIN_AUTH_ISSUER,
      ADMIN_AUTH_CLIENT_ID: context.shared.ADMIN_AUTH_CLIENT_ID,
      ADMIN_AUTH_CLIENT_SECRET: context.shared.ADMIN_AUTH_CLIENT_SECRET,
      ADMIN_SESSION_SECRET: context.shared.ADMIN_SESSION_SECRET,
      ADMIN_OIDC_FLOW_SECRET: context.shared.ADMIN_OIDC_FLOW_SECRET,
      RESEND_WEBHOOK_SECRET: context.shared.RESEND_WEBHOOK_SECRET,
      GA4_MEASUREMENT_ID: context.shared.GA4_MEASUREMENT_ID,
      GA4_API_SECRET: context.shared.GA4_API_SECRET,
      CACHE_REVALIDATION_SECRET: context.shared.CACHE_REVALIDATION_SECRET,
      ...sideEffectsOff,
    },
  });

  const worker = service("worker", {
    build: "npm run build",
    start: "npm run worker:once",
    replicas: 1,
    env: {
      NODE_ENV: "production",
      RAILPACK_NODE_NPM_INSTALL: "npm ci",
      DATABASE_URL: context.shared.PREPPY_WORKER_DATABASE_URL,
      DATABASE_MAX_CONNECTIONS:
        context.shared.PREPPY_WORKER_DATABASE_MAX_CONNECTIONS,
      APP_BASE_URL: context.shared.APP_BASE_URL,
      RESEND_API_KEY: context.shared.RESEND_API_KEY,
      EMAIL_FROM: context.shared.EMAIL_FROM,
      GA4_MEASUREMENT_ID: context.shared.GA4_MEASUREMENT_ID,
      GA4_API_SECRET: context.shared.GA4_API_SECRET,
      CACHE_REVALIDATION_SECRET: context.shared.CACHE_REVALIDATION_SECRET,
      ...sideEffectsOff,
    },
  });

  const database = postgres("postgres");

  return project("PREPPY Production", {
    resources: [web, worker, database],
  });
});
