import "server-only";

import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { getAuthConfig } from "@/src/modules/auth/config.server";
import { loadMyPreppy } from "@/src/modules/my-preppy/query.server";

export function getMyPreppyRuntime() {
  const config = getAuthConfig();
  const database = getRuntimeDatabase();
  return {
    load: (sessionCookie: string | null) =>
      loadMyPreppy(sessionCookie, {
        sessionSecret: config.USER_SESSION_SECRET,
        transactionManager: database.transactionManager,
      }),
  };
}
