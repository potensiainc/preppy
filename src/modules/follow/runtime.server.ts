import "server-only";

import { getServerAnalyticsTracker } from "@/src/analytics/runtime.server";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { getAuthConfig } from "@/src/modules/auth/config.server";
import { activateFollow } from "@/src/modules/follow/activate-follow.server";
import { deactivateFollow } from "@/src/modules/follow/deactivate-follow.server";
import { getFollowStatus } from "@/src/modules/follow/status-query.server";

export function getFollowRuntime() {
  const config = getAuthConfig();
  const database = getRuntimeDatabase();
  const tracker = getServerAnalyticsTracker();

  return {
    appBaseUrl: config.APP_BASE_URL,
    sessionSecret: config.USER_SESSION_SECRET,
    activateFollow: (
      context: Parameters<typeof activateFollow>[0],
      input: Parameters<typeof activateFollow>[1],
    ) =>
      activateFollow(context, input, {
        transactionManager: database.transactionManager,
        tracker,
      }),
    deactivateFollow: (
      context: Parameters<typeof deactivateFollow>[0],
      input: Parameters<typeof deactivateFollow>[1],
    ) =>
      deactivateFollow(context, input, {
        transactionManager: database.transactionManager,
      }),
    getStatus: (sessionCookie: string | null, institutionId: string) =>
      getFollowStatus(sessionCookie, institutionId, {
        executor: database.executor,
        sessionSecret: config.USER_SESSION_SECRET,
      }),
  };
}
