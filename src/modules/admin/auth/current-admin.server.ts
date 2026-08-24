import "server-only";

import { cookies } from "next/headers";

import { UnauthenticatedError } from "@/src/application/errors";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { getAdminAuthConfig } from "@/src/modules/admin/auth/config.server";
import {
  findActiveAdminById,
  type AdminPrincipal,
} from "@/src/modules/admin/auth/repository.server";
import {
  ADMIN_SESSION_COOKIE_NAME,
  readAdminSession,
} from "@/src/modules/admin/auth/session.server";

export type AdminCookieReader = {
  get(name: string): { value: string } | undefined;
};

export type CurrentAdminDependencies = {
  cookieStore?: AdminCookieReader;
  executor?: DatabaseExecutor;
  sessionSecret?: string;
  now?: Date;
};

export async function requireCurrentAdmin(
  dependencies: CurrentAdminDependencies = {},
): Promise<AdminPrincipal> {
  const cookieStore = dependencies.cookieStore ?? (await cookies());
  const sessionSecret =
    dependencies.sessionSecret ?? getAdminAuthConfig().ADMIN_SESSION_SECRET;
  const executor = dependencies.executor ?? getRuntimeDatabase().executor;
  const cookieValue = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const session = readAdminSession(cookieValue, {
    secret: sessionSecret,
    now: dependencies.now,
  });

  if (!session) throw new UnauthenticatedError();
  const admin = await findActiveAdminById(executor, session.adminUserId);
  if (!admin) throw new UnauthenticatedError();
  return admin;
}
