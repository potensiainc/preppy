import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ForbiddenError } from "@/src/application/errors";
import { adminUsers } from "@/src/db/schema";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";

export type AdminPrincipal = Readonly<{
  adminUserId: string;
  displayName: string;
}>;

export async function requireActiveAdminByExternalSubject(
  executor: DatabaseExecutor,
  externalAuthSubject: string,
): Promise<AdminPrincipal> {
  const subjectBytes = Buffer.byteLength(externalAuthSubject, "utf8");
  if (subjectBytes === 0 || subjectBytes > 255) {
    throw new ForbiddenError();
  }

  const [admin] = await executor.drizzle
    .select({
      adminUserId: adminUsers.id,
      displayName: adminUsers.displayName,
    })
    .from(adminUsers)
    .where(
      and(
        eq(adminUsers.externalAuthSubject, externalAuthSubject),
        eq(adminUsers.status, "ACTIVE"),
      ),
    )
    .limit(1);

  if (!admin) throw new ForbiddenError();
  return admin;
}

export async function findActiveAdminById(
  executor: DatabaseExecutor,
  adminUserId: string,
): Promise<AdminPrincipal | null> {
  const parsedAdminUserId = z.uuid().safeParse(adminUserId);
  if (!parsedAdminUserId.success) return null;

  const [admin] = await executor.drizzle
    .select({
      adminUserId: adminUsers.id,
      displayName: adminUsers.displayName,
    })
    .from(adminUsers)
    .where(
      and(
        eq(adminUsers.id, parsedAdminUserId.data.toLowerCase()),
        eq(adminUsers.status, "ACTIVE"),
      ),
    )
    .limit(1);

  return admin ?? null;
}
