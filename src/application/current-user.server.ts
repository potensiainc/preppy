import "server-only";

import { UnauthenticatedError } from "@/src/application/errors";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { readUserSession } from "@/src/modules/auth/session.server";
import { findUserById } from "@/src/modules/identity/repository.server";

export type CurrentUserDependencies = {
  secret: string;
  executor: DatabaseExecutor;
  now?: Date;
};

export async function getSessionUser(
  cookieValue: string | null | undefined,
  dependencies: CurrentUserDependencies,
) {
  const session = readUserSession(cookieValue, dependencies);
  if (!session) return null;

  const user = await findUserById(dependencies.executor, session.userId);
  if (!user || (user.status !== "ACTIVE" && user.status !== "PENDING")) {
    return null;
  }
  return user;
}

export async function getCurrentUser(
  cookieValue: string | null | undefined,
  dependencies: CurrentUserDependencies,
) {
  const user = await getSessionUser(cookieValue, dependencies);
  return user?.status === "ACTIVE" ? user : null;
}

export async function requireCurrentUser(
  cookieValue: string | null | undefined,
  dependencies: CurrentUserDependencies,
) {
  const user = await getCurrentUser(cookieValue, dependencies);
  if (!user) throw new UnauthenticatedError();
  return user;
}
