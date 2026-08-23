import "server-only";

import { z } from "zod";

import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { readUserSession } from "@/src/modules/auth/session.server";
import { findAuthorizedFollowStatus } from "@/src/modules/follow/repository.server";

const institutionIdSchema = z.uuid().transform((value) => value.toLowerCase());

export type FollowStatusQueryDependencies = {
  executor: DatabaseExecutor;
  sessionSecret: string;
  now?: Date;
  findAuthorizedFollowStatus?: (
    executor: DatabaseExecutor,
    userId: string,
    institutionId: string,
  ) => Promise<{ authenticated: true; following: boolean } | null>;
};

const anonymousStatus = {
  authenticated: false,
  following: false,
} as const;

/**
 * Reads private Follow state exclusively for the user in the signed session.
 * The target parameter can select only an Institution, never another user.
 */
export async function getFollowStatus(
  sessionCookie: string | null | undefined,
  rawInstitutionId: string,
  dependencies: FollowStatusQueryDependencies,
): Promise<{ authenticated: boolean; following: boolean }> {
  const institutionId = institutionIdSchema.safeParse(rawInstitutionId);
  if (!institutionId.success) return anonymousStatus;

  const session = readUserSession(sessionCookie, {
    secret: dependencies.sessionSecret,
    now: dependencies.now,
  });
  if (!session) return anonymousStatus;

  const readStatus =
    dependencies.findAuthorizedFollowStatus ?? findAuthorizedFollowStatus;
  const status = await readStatus(
    dependencies.executor,
    session.userId,
    institutionId.data,
  );
  return status ?? anonymousStatus;
}
