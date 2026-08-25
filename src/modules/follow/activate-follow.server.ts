import "server-only";

import { z } from "zod";

import type { AnalyticsTracker } from "@/src/analytics/tracker";
import type { UserCommandContext } from "@/src/application/context";
import {
  ConflictError,
  ForbiddenError,
  NotEligibleError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/src/application/errors";
import type {
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import {
  activateLogicalFollow,
  countActiveFollows,
  createLogicalFollowIfAbsent,
  findFollowForUpdate,
  findOpenEpisode,
  openEpisode,
} from "@/src/modules/follow/repository.server";
import { mapFollowDatabaseError } from "@/src/modules/follow/database-errors.server";
import {
  hasMonitorableSourceCoverage,
  isInstitutionFollowable,
} from "@/src/modules/follow/followability-policy.server";
import { findUserForUpdate } from "@/src/modules/identity/repository.server";
import { findInstitutionById } from "@/src/modules/institution/repository.server";

const activateFollowInputSchema = z
  .object({ institutionId: z.uuid() })
  .strict();

export type ActivateFollowInput = z.output<typeof activateFollowInputSchema>;

export type ActivateFollowResult = {
  followId: string;
  institutionId: string;
  state: "ACTIVE";
  activatedAt: string;
  created: boolean;
  reactivated: boolean;
  activeFollowCount: number;
};

export type ActivateFollowPersistence = {
  findUserForUpdate: typeof findUserForUpdate;
  findInstitutionById: typeof findInstitutionById;
  hasMonitorableSourceCoverage: typeof hasMonitorableSourceCoverage;
  findFollowForUpdate: typeof findFollowForUpdate;
  createLogicalFollowIfAbsent: typeof createLogicalFollowIfAbsent;
  activateLogicalFollow: typeof activateLogicalFollow;
  findOpenEpisode: typeof findOpenEpisode;
  openEpisode: typeof openEpisode;
  countActiveFollows: typeof countActiveFollows;
};

export const defaultActivateFollowPersistence: ActivateFollowPersistence = {
  findUserForUpdate,
  findInstitutionById,
  hasMonitorableSourceCoverage,
  findFollowForUpdate,
  createLogicalFollowIfAbsent,
  activateLogicalFollow,
  findOpenEpisode,
  openEpisode,
  countActiveFollows,
};

export type ActivateFollowDependencies = {
  transactionManager: TransactionManager;
  tracker: AnalyticsTracker;
  persistence?: ActivateFollowPersistence;
};

function parseInput(rawInput: unknown): ActivateFollowInput {
  const parsed = activateFollowInputSchema.safeParse(rawInput);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

function parseUserId(userId: string): string {
  const parsed = z.uuid().safeParse(userId);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

function sameBoundary(left: Date | null, right: Date): boolean {
  return left !== null && left.getTime() === right.getTime();
}

export async function activateFollowInTransaction(
  executor: TransactionExecutor,
  ctx: UserCommandContext,
  input: ActivateFollowInput,
  persistence: ActivateFollowPersistence = defaultActivateFollowPersistence,
): Promise<ActivateFollowResult> {
  const user = await persistence.findUserForUpdate(executor, ctx.userId);
  if (!user) throw new UnauthenticatedError();
  if (user.status !== "ACTIVE") throw new ForbiddenError();

  const institution = await persistence.findInstitutionById(
    executor,
    input.institutionId,
  );
  if (!institution) throw new NotFoundError();
  const monitorable = await persistence.hasMonitorableSourceCoverage(
    executor,
    institution.id,
  );
  if (!isInstitutionFollowable(institution, monitorable)) {
    throw new NotEligibleError();
  }

  let follow = await persistence.findFollowForUpdate(
    executor,
    ctx.userId,
    input.institutionId,
  );
  let created = false;
  let reactivated = false;
  let activatedAt: Date | null = null;

  if (!follow) {
    const inserted = await persistence.createLogicalFollowIfAbsent(executor, {
      userId: ctx.userId,
      institutionId: input.institutionId,
      activatedAt: ctx.occurredAt,
    });
    if (inserted) {
      follow = inserted;
      await persistence.openEpisode(executor, {
        followId: follow.id,
        activatedAt: ctx.occurredAt,
      });
      created = true;
      activatedAt = ctx.occurredAt;
    } else {
      follow = await persistence.findFollowForUpdate(
        executor,
        ctx.userId,
        input.institutionId,
      );
      if (!follow) throw new ConflictError();
    }
  }

  if (!created) {
    const openEpisode = await persistence.findOpenEpisode(executor, follow.id);
    if (follow.status === "ACTIVE") {
      if (
        !openEpisode ||
        !sameBoundary(follow.currentActivatedAt, openEpisode.activatedAt)
      ) {
        throw new ConflictError();
      }
      activatedAt = follow.currentActivatedAt!;
    } else {
      if (openEpisode) throw new ConflictError();
      if (
        !follow.currentActivatedAt ||
        !follow.deactivatedAt ||
        ctx.occurredAt.getTime() < follow.currentActivatedAt.getTime() ||
        ctx.occurredAt.getTime() < follow.deactivatedAt.getTime()
      ) {
        throw new ConflictError();
      }
      const activated = await persistence.activateLogicalFollow(
        executor,
        follow.id,
        ctx.occurredAt,
      );
      if (!activated) throw new ConflictError();
      follow = activated;
      await persistence.openEpisode(executor, {
        followId: follow.id,
        activatedAt: ctx.occurredAt,
      });
      reactivated = true;
      activatedAt = ctx.occurredAt;
    }
  }

  if (!activatedAt) throw new ConflictError();

  const activeFollowCount = await persistence.countActiveFollows(
    executor,
    ctx.userId,
  );

  return {
    followId: follow.id,
    institutionId: input.institutionId,
    state: "ACTIVE",
    activatedAt: activatedAt.toISOString(),
    created,
    reactivated,
    activeFollowCount,
  };
}

async function runActivationTransaction(
  ctx: UserCommandContext,
  input: ActivateFollowInput,
  dependencies: ActivateFollowDependencies,
): Promise<ActivateFollowResult> {
  const persistence =
    dependencies.persistence ?? defaultActivateFollowPersistence;
  return dependencies.transactionManager.run((executor) =>
    activateFollowInTransaction(executor, ctx, input, persistence),
  );
}

export async function activateFollow(
  ctx: UserCommandContext,
  rawInput: unknown,
  dependencies: ActivateFollowDependencies,
): Promise<ActivateFollowResult> {
  const userId = parseUserId(ctx.userId);
  const input = parseInput(rawInput);
  const normalizedContext = { ...ctx, userId };
  try {
    const result = await runActivationTransaction(
      normalizedContext,
      input,
      dependencies,
    );

    if (result.created || result.reactivated) {
      try {
        if (result.activeFollowCount === 1) {
          await dependencies.tracker.track("follow_created", {
            institutionId: result.institutionId,
            followCount: result.activeFollowCount,
          });
        } else {
          await dependencies.tracker.track("additional_follow", {
            institutionId: result.institutionId,
            followCount: result.activeFollowCount,
          });
        }
      } catch {
        // Analytics is deliberately best effort and runs only after commit.
      }
    }

    return result;
  } catch (error) {
    throw mapFollowDatabaseError(error);
  }
}
