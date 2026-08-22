import "server-only";

import { and, count, eq, isNull } from "drizzle-orm";

import { followEpisodes, follows } from "@/src/db/schema";
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

export async function findFollowForUpdate(
  executor: TransactionExecutor,
  userId: string,
  institutionId: string,
) {
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

export async function findOpenEpisode(
  executor: DatabaseExecutor,
  followId: string,
) {
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
