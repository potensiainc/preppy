import "server-only";

import { and, eq } from "drizzle-orm";

import { authIdentities, users } from "@/src/db/schema";
import type {
  DatabaseExecutor,
  TransactionExecutor,
} from "@/src/infrastructure/db/runtime.server";

export async function findUserById(executor: DatabaseExecutor, id: string) {
  const [user] = await executor.drizzle
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user ?? null;
}

export async function findUserForUpdate(
  executor: TransactionExecutor,
  id: string,
) {
  const [user] = await executor.drizzle
    .select()
    .from(users)
    .where(eq(users.id, id))
    .for("update")
    .limit(1);

  return user ?? null;
}

export async function findAuthIdentity(
  executor: DatabaseExecutor,
  provider: "KAKAO",
  providerSubject: string,
) {
  const [identity] = await executor.drizzle
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.provider, provider),
        eq(authIdentities.providerSubject, providerSubject),
      ),
    )
    .limit(1);

  return identity ?? null;
}

export async function createPendingUser(
  executor: DatabaseExecutor,
  input: { id?: string },
) {
  const [user] = await executor.drizzle
    .insert(users)
    .values({ id: input.id, status: "PENDING" })
    .returning();

  return user!;
}

export async function createAuthIdentity(
  executor: DatabaseExecutor,
  input: {
    id?: string;
    userId: string;
    provider: "KAKAO";
    providerSubject: string;
    linkedAt?: Date;
  },
) {
  const [identity] = await executor.drizzle
    .insert(authIdentities)
    .values({
      id: input.id,
      userId: input.userId,
      provider: input.provider,
      providerSubject: input.providerSubject,
      status: "ACTIVE",
      linkedAt: input.linkedAt,
    })
    .returning();

  return identity!;
}
