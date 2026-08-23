import "server-only";

import { and, count, eq, isNull } from "drizzle-orm";

import { followEpisodes, follows, users } from "@/src/db/schema";
import type {
  DatabaseExecutor,
  TransactionExecutor,
} from "@/src/infrastructure/db/runtime.server";

export async function findFollow(
  executor: DatabaseExecutor,
  userId: string,
  institutionId: string,
) {
  const [follow] = await executor.drizzle
    .select()
    .from(follows)
    .where(
      and(eq(follows.userId, userId), eq(follows.institutionId, institutionId)),
    )
    .limit(1);

  return follow ?? null;
}

/**
 * One-statement private authorization and Follow projection. The ACTIVE User
 * predicate and requested logical Follow share the same PostgreSQL snapshot.
 */
export async function findAuthorizedFollowStatus(
  executor: DatabaseExecutor,
  userId: string,
  institutionId: string,
): Promise<{ authenticated: true; following: boolean } | null> {
  const [row] = await executor.drizzle
    .select({ followStatus: follows.status })
    .from(users)
    .leftJoin(
      follows,
      and(
        eq(follows.userId, users.id),
        eq(follows.institutionId, institutionId),
      ),
    )
    .where(and(eq(users.id, userId), eq(users.status, "ACTIVE")))
    .limit(1);

  return row
    ? { authenticated: true, following: row.followStatus === "ACTIVE" }
    : null;
}

export async function findFollowForUpdate(
  executor: TransactionExecutor,
  userId: string,
  institutionId: string,
): Promise<typeof follows.$inferSelect | null> {
  const [follow] = await executor.drizzle
    .select()
    .from(follows)
    .where(
      and(eq(follows.userId, userId), eq(follows.institutionId, institutionId)),
    )
    .for("update")
    .limit(1);

  return follow ?? null;
}

export async function createLogicalFollow(
  executor: DatabaseExecutor,
  input: {
    id?: string;
    userId: string;
    institutionId: string;
    activatedAt: Date;
  },
) {
  const [follow] = await executor.drizzle
    .insert(follows)
    .values({
      id: input.id,
      userId: input.userId,
      institutionId: input.institutionId,
      status: "ACTIVE",
      firstActivatedAt: input.activatedAt,
      currentActivatedAt: input.activatedAt,
      deactivatedAt: null,
    })
    .returning();

  return follow!;
}

export async function createLogicalFollowIfAbsent(
  executor: TransactionExecutor,
  input: {
    id?: string;
    userId: string;
    institutionId: string;
    activatedAt: Date;
  },
): Promise<typeof follows.$inferSelect | null> {
  const [follow] = await executor.drizzle
    .insert(follows)
    .values({
      id: input.id,
      userId: input.userId,
      institutionId: input.institutionId,
      status: "ACTIVE",
      firstActivatedAt: input.activatedAt,
      currentActivatedAt: input.activatedAt,
      deactivatedAt: null,
    })
    .onConflictDoNothing({ target: [follows.userId, follows.institutionId] })
    .returning();

  return follow ?? null;
}

export async function activateLogicalFollow(
  executor: TransactionExecutor,
  followId: string,
  activatedAt: Date,
) {
  const [follow] = await executor.drizzle
    .update(follows)
    .set({
      status: "ACTIVE",
      currentActivatedAt: activatedAt,
      deactivatedAt: null,
      updatedAt: activatedAt,
    })
    .where(and(eq(follows.id, followId), eq(follows.status, "INACTIVE")))
    .returning();

  return follow ?? null;
}

export async function deactivateLogicalFollow(
  executor: TransactionExecutor,
  followId: string,
  deactivatedAt: Date,
) {
  const [follow] = await executor.drizzle
    .update(follows)
    .set({ status: "INACTIVE", deactivatedAt, updatedAt: deactivatedAt })
    .where(and(eq(follows.id, followId), eq(follows.status, "ACTIVE")))
    .returning();

  return follow ?? null;
}

export async function findOpenEpisode(
  executor: DatabaseExecutor,
  followId: string,
): Promise<typeof followEpisodes.$inferSelect | null> {
  const [episode] = await executor.drizzle
    .select()
    .from(followEpisodes)
    .where(
      and(
        eq(followEpisodes.followId, followId),
        isNull(followEpisodes.deactivatedAt),
      ),
    )
    .limit(1);

  return episode ?? null;
}

export async function openEpisode(
  executor: DatabaseExecutor,
  input: {
    id?: string;
    followId: string;
    activatedAt: Date;
    reason?: string;
  },
) {
  const [episode] = await executor.drizzle
    .insert(followEpisodes)
    .values({
      id: input.id,
      followId: input.followId,
      activatedAt: input.activatedAt,
      reason: input.reason,
    })
    .returning();

  return episode!;
}

export async function closeEpisode(
  executor: DatabaseExecutor,
  followId: string,
  deactivatedAt: Date,
) {
  const [episode] = await executor.drizzle
    .update(followEpisodes)
    .set({ deactivatedAt })
    .where(
      and(
        eq(followEpisodes.followId, followId),
        isNull(followEpisodes.deactivatedAt),
      ),
    )
    .returning();

  return episode ?? null;
}

export async function countActiveFollows(
  executor: DatabaseExecutor,
  userId: string,
): Promise<number> {
  const [result] = await executor.drizzle
    .select({ count: count() })
    .from(follows)
    .where(and(eq(follows.userId, userId), eq(follows.status, "ACTIVE")));

  return Number(result?.count ?? 0);
}
