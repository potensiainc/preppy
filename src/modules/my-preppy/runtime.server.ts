import "server-only";

import { NoopAnalyticsTracker } from "@/src/analytics/tracker";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { getAuthConfig } from "@/src/modules/auth/config.server";
import { loadMyPreppy } from "@/src/modules/my-preppy/query.server";

const tracker = new NoopAnalyticsTracker();

export function getMyPreppyRuntime() {
  const config = getAuthConfig();
  const database = getRuntimeDatabase();
  return {
    load: (sessionCookie: string | null) =>
      loadMyPreppy(sessionCookie, {
        sessionSecret: config.USER_SESSION_SECRET,
        transactionManager: database.transactionManager,
        tracker,
      }),
  };
}
