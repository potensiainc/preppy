import "server-only";

import { z } from "zod";

import type { UserCommandContext } from "@/src/application/context";
import {
  ConflictError,
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from "@/src/application/errors";
import type {
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import {
  closeEpisode,
  deactivateLogicalFollow,
  findFollowForUpdate,
  findOpenEpisode,
} from "@/src/modules/follow/repository.server";
import { mapFollowDatabaseError } from "@/src/modules/follow/database-errors.server";
import { findUserForUpdate } from "@/src/modules/identity/repository.server";

const deactivateFollowInputSchema = z
  .object({ institutionId: z.uuid() })
  .strict();

export type DeactivateFollowInput = z.output<
  typeof deactivateFollowInputSchema
>;

export type DeactivateFollowResult = {
  followId: string | null;
  institutionId: string;
  state: "INACTIVE";
  deactivatedAt: string | null;
  deactivated: boolean;
};

export type DeactivateFollowPersistence = {
  findUserForUpdate: typeof findUserForUpdate;
  findFollowForUpdate: typeof findFollowForUpdate;
  findOpenEpisode: typeof findOpenEpisode;
  closeEpisode: typeof closeEpisode;
  deactivateLogicalFollow: typeof deactivateLogicalFollow;
};

export const defaultDeactivateFollowPersistence: DeactivateFollowPersistence = {
  findUserForUpdate,
  findFollowForUpdate,
  findOpenEpisode,
  closeEpisode,
  deactivateLogicalFollow,
};

export type DeactivateFollowDependencies = {
  transactionManager: TransactionManager;
  persistence?: DeactivateFollowPersistence;
};

export async function deactivateFollowInTransaction(
  executor: TransactionExecutor,
  ctx: UserCommandContext,
  input: DeactivateFollowInput,
  persistence: DeactivateFollowPersistence = defaultDeactivateFollowPersistence,
): Promise<DeactivateFollowResult> {
  const user = await persistence.findUserForUpdate(executor, ctx.userId);
  if (!user) throw new UnauthenticatedError();
  if (user.status !== "ACTIVE") throw new ForbiddenError();

  const follow = await persistence.findFollowForUpdate(
    executor,
    ctx.userId,
    input.institutionId,
  );
  if (!follow) {
    return {
      followId: null,
      institutionId: input.institutionId,
      state: "INACTIVE",
      deactivatedAt: null,
      deactivated: false,
    };
  }
  const open = await persistence.findOpenEpisode(executor, follow.id);
  if (follow.status === "INACTIVE") {
    if (open) throw new ConflictError();
    return {
      followId: follow.id,
      institutionId: input.institutionId,
      state: "INACTIVE",
      deactivatedAt: follow.deactivatedAt?.toISOString() ?? null,
      deactivated: false,
    };
  }

  if (
    !open ||
    !follow.currentActivatedAt ||
    open.activatedAt.getTime() !== follow.currentActivatedAt.getTime()
  ) {
    throw new ConflictError();
  }
  if (ctx.occurredAt.getTime() < open.activatedAt.getTime()) {
    throw new ConflictError();
  }
  const closed = await persistence.closeEpisode(
    executor,
    follow.id,
    ctx.occurredAt,
  );
  if (!closed) throw new ConflictError();
  const deactivated = await persistence.deactivateLogicalFollow(
    executor,
    follow.id,
    ctx.occurredAt,
  );
  if (!deactivated) throw new ConflictError();

  return {
    followId: follow.id,
    institutionId: input.institutionId,
    state: "INACTIVE",
    deactivatedAt: ctx.occurredAt.toISOString(),
    deactivated: true,
  };
}

export async function deactivateFollow(
  ctx: UserCommandContext,
  rawInput: unknown,
  dependencies: DeactivateFollowDependencies,
): Promise<DeactivateFollowResult> {
  const parsedUserId = z.uuid().safeParse(ctx.userId);
  if (!parsedUserId.success) {
    throw ValidationError.fromZodError(parsedUserId.error);
  }
  const parsedInput = deactivateFollowInputSchema.safeParse(rawInput);
  if (!parsedInput.success) {
    throw ValidationError.fromZodError(parsedInput.error);
  }

  try {
    return await dependencies.transactionManager.run((executor) =>
      deactivateFollowInTransaction(
        executor,
        { ...ctx, userId: parsedUserId.data },
        parsedInput.data,
        dependencies.persistence,
      ),
    );
  } catch (error) {
    throw mapFollowDatabaseError(error);
  }
}
