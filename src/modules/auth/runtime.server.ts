import "server-only";

import { getServerAnalyticsTracker } from "@/src/analytics/runtime.server";
import { getCurrentUser } from "@/src/application/current-user.server";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { completeSignup } from "@/src/modules/auth/complete-signup.server";
import { getAuthConfig } from "@/src/modules/auth/config.server";
import { resolveKakaoIdentity } from "@/src/modules/auth/identity-service.server";
import { createKakaoProvider } from "@/src/modules/auth/kakao-provider.server";
import { getOnboardingState } from "@/src/modules/auth/onboarding-query.server";
import { ProcessLocalOAuthReplayStore } from "@/src/modules/auth/oauth-replay.server";
import {
  resolveCanonicalPendingFollowTarget,
  type PendingFollowInstitutionRecord,
} from "@/src/modules/auth/pending-follow-target.server";
import { ProcessLocalRateLimiter } from "@/src/modules/auth/rate-limit.server";
import { activateFollow } from "@/src/modules/follow/activate-follow.server";
import { hasMonitorableSourceCoverage } from "@/src/modules/follow/followability-policy.server";
import { findInstitutionById } from "@/src/modules/institution/repository.server";

// Emergency process ceiling only: it neither isolates callers nor coordinates hosts.
// A trusted edge/shared limiter remains required for production-grade enforcement.
const rateLimiter = new ProcessLocalRateLimiter();
// REGISTERED -> CONSUMED is atomic only here. UNKNOWN must remain valid after
// protected-cookie validation because start/callback can reach distinct runtimes.
// Cross-runtime atomic replay prevention requires an external shared store, which
// this work package explicitly cannot add (no Redis, schema, or start DB writes).
const replayStore = new ProcessLocalOAuthReplayStore({ maxEntries: 10_000 });

export async function resolveCanonicalCompletionInstitutionPath(
  institutionId: string,
  findInstitution: (
    id: string,
  ) => Promise<PendingFollowInstitutionRecord | null>,
  monitorableCoverage: (id: string) => Promise<boolean>,
): Promise<string | null> {
  const target = await resolveCanonicalPendingFollowTarget(
    institutionId,
    findInstitution,
    monitorableCoverage,
  );
  return target?.canonicalPath ?? null;
}

export function getLogoutRuntime() {
  const config = getAuthConfig();
  return {
    appBaseUrl: config.APP_BASE_URL,
    production: process.env.NODE_ENV === "production",
  };
}

export function getAuthRuntime() {
  const config = getAuthConfig();
  const database = getRuntimeDatabase();
  const provider = createKakaoProvider({
    clientId: config.KAKAO_CLIENT_ID,
    ...(config.KAKAO_CLIENT_SECRET
      ? { clientSecret: config.KAKAO_CLIENT_SECRET }
      : {}),
    redirectUri: config.KAKAO_REDIRECT_URI,
  });
  const production = process.env.NODE_ENV === "production";
  const tracker = getServerAnalyticsTracker();

  return {
    appBaseUrl: config.APP_BASE_URL,
    oauthStateSecret: config.OAUTH_STATE_SECRET,
    followIntentSecret: config.FOLLOW_INTENT_SECRET,
    sessionSecret: config.USER_SESSION_SECRET,
    production,
    provider,
    tracker,
    rateLimiter,
    replayStore,
    findInstitution: (id: string) => findInstitutionById(database.executor, id),
    hasMonitorableSourceCoverage: (id: string) =>
      hasMonitorableSourceCoverage(database.executor, id),
    resolveIdentity: async (
      identity: Parameters<typeof resolveKakaoIdentity>[0],
    ) => {
      const user = await resolveKakaoIdentity(identity, {
        executor: database.executor,
        transactionManager: database.transactionManager,
      });
      return {
        id: user.id,
        status: user.status as "PENDING" | "ACTIVE",
      };
    },
    resolvePendingFollowTarget: (institutionId: string) =>
      resolveCanonicalPendingFollowTarget(
        institutionId,
        (id) => findInstitutionById(database.executor, id),
        (id) => hasMonitorableSourceCoverage(database.executor, id),
      ),
    activateFollow: (
      context: Parameters<typeof activateFollow>[0],
      input: Parameters<typeof activateFollow>[1],
    ) =>
      activateFollow(context, input, {
        transactionManager: database.transactionManager,
        tracker,
      }),
    getOnboardingState: (
      sessionCookie: string | null,
      intentCookie: string | null,
    ) =>
      getOnboardingState(sessionCookie, intentCookie, {
        executor: database.executor,
        sessionSecret: config.USER_SESSION_SECRET,
        pendingIntentSecret: config.FOLLOW_INTENT_SECRET,
      }),
    completeSignup: (
      context: Parameters<typeof completeSignup>[0],
      input: unknown,
      serverInput: Parameters<typeof completeSignup>[3],
    ) =>
      completeSignup(
        context,
        input,
        {
          transactionManager: database.transactionManager,
          tracker,
        },
        serverInput,
      ),
    getCurrentUser: (sessionCookie: string | null) =>
      getCurrentUser(sessionCookie, {
        executor: database.executor,
        secret: config.USER_SESSION_SECRET,
      }),
  };
}
