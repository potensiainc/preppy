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
import {
  assertCurrentLegalPolicyVersion,
  getCurrentLegalPolicy,
} from "@/src/application/legal-policies.server";
import type {
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import {
  activatePendingUser,
  appendConsentDecision,
  findUserEmail,
  findUserForUpdate,
  replaceUserInterestCategories,
  replaceUserInterestRegions,
  upsertEmailNotificationPreference,
  upsertUserInputEmail,
  upsertUserProfile,
  type UserInterestCategory,
} from "@/src/modules/identity/repository.server";
import {
  activateFollowInTransaction,
  defaultActivateFollowPersistence,
  type ActivateFollowPersistence,
  type ActivateFollowResult,
} from "@/src/modules/follow/activate-follow.server";
import { mapFollowDatabaseError } from "@/src/modules/follow/database-errors.server";

const requiredConsentSchema = z
  .object({
    type: z.enum(["TERMS_OF_SERVICE", "PRIVACY_POLICY"]),
    decision: z.literal("GRANTED"),
    policyVersion: z.string().trim().min(1).max(64),
  })
  .strict();

const regionCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]+(?:[_-][A-Z0-9]+)*$/));

const optionalEmailSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z
    .string()
    .trim()
    .max(254)
    .email()
    .transform((value) => value.toLowerCase())
    .optional(),
);

const completeSignupInputSchema = z
  .object({
    consents: z.array(requiredConsentSchema).length(2),
    serviceEmailUpdatesConsent: z.boolean(),
    email: optionalEmailSchema,
    childBirthYear: z.number().int().optional(),
    interestRegions: z
      .array(regionCodeSchema)
      .max(20)
      .optional()
      .default([])
      .transform((values) => [...new Set(values)]),
    interestCategories: z
      .array(
        z.enum([
          "ENGLISH_KINDERGARTEN",
          "PRIVATE_ELEMENTARY",
          "INTERNATIONAL_SCHOOL",
        ]),
      )
      .max(3)
      .optional()
      .default([])
      .transform((values) => [...new Set(values)]),
  })
  .strict()
  .superRefine((input, context) => {
    for (const requiredType of [
      "TERMS_OF_SERVICE",
      "PRIVACY_POLICY",
    ] as const) {
      if (
        input.consents.filter((consent) => consent.type === requiredType)
          .length !== 1
      ) {
        context.addIssue({
          code: "custom",
          path: ["consents"],
          message: "Each required consent must appear exactly once",
        });
      }
    }
  });

export type CompleteSignupInput = z.output<typeof completeSignupInputSchema>;

const completeSignupServerInputSchema = z
  .object({
    pendingFollow: z.object({ institutionId: z.uuid() }).strict().nullable(),
  })
  .strict();

export type CompleteSignupServerInput = z.output<
  typeof completeSignupServerInputSchema
>;

export type CompleteSignupResult = {
  userId: string;
  userState: "ACTIVE";
  follow: ActivateFollowResult | null;
};

export type CompleteSignupPersistence = {
  findUserForUpdate: typeof findUserForUpdate;
  findUserEmail: typeof findUserEmail;
  appendConsentDecision: typeof appendConsentDecision;
  upsertUserInputEmail: typeof upsertUserInputEmail;
  upsertUserProfile: typeof upsertUserProfile;
  replaceUserInterestRegions: typeof replaceUserInterestRegions;
  replaceUserInterestCategories: typeof replaceUserInterestCategories;
  upsertEmailNotificationPreference: typeof upsertEmailNotificationPreference;
  activatePendingUser: typeof activatePendingUser;
};

export const defaultCompleteSignupPersistence: CompleteSignupPersistence = {
  findUserForUpdate,
  findUserEmail,
  appendConsentDecision,
  upsertUserInputEmail,
  upsertUserProfile,
  replaceUserInterestRegions,
  replaceUserInterestCategories,
  upsertEmailNotificationPreference,
  activatePendingUser,
};

export type CompleteSignupDependencies = {
  transactionManager: TransactionManager;
  tracker: AnalyticsTracker;
  persistence?: CompleteSignupPersistence;
  followPersistence?: ActivateFollowPersistence;
};

function parseCompleteSignupInput(input: unknown): CompleteSignupInput {
  const parsed = completeSignupInputSchema.safeParse(input);
  if (!parsed.success) throw ValidationError.fromZodError(parsed.error);
  return parsed.data;
}

function parseCompleteSignupServerInput(
  input: unknown,
): CompleteSignupServerInput {
  const parsed = completeSignupServerInputSchema.safeParse(input);
  return parsed.success ? parsed.data : { pendingFollow: null };
}

function requiredConsentVersion(
  input: CompleteSignupInput,
  type: "TERMS_OF_SERVICE" | "PRIVACY_POLICY",
): string {
  return input.consents.find((consent) => consent.type === type)!.policyVersion;
}

function assertPlausibleChildBirthYear(
  childBirthYear: number | undefined,
  occurredAt: Date,
): void {
  const currentYear = occurredAt.getUTCFullYear();
  if (!Number.isInteger(currentYear)) throw ValidationError.invalidRequest();
  if (childBirthYear === undefined) return;
  if (childBirthYear < currentYear - 18 || childBirthYear > currentYear) {
    throw ValidationError.invalidRequest();
  }
}

async function persistSignup(
  executor: TransactionExecutor,
  userId: string,
  input: CompleteSignupInput,
  now: Date,
  persistence: CompleteSignupPersistence,
) {
  const user = await persistence.findUserForUpdate(executor, userId);
  if (!user) throw new UnauthenticatedError();
  if (user.status === "ACTIVE") throw new ConflictError();
  if (user.status !== "PENDING") throw new ForbiddenError();

  const termsVersion = requiredConsentVersion(input, "TERMS_OF_SERVICE");
  const privacyVersion = requiredConsentVersion(input, "PRIVACY_POLICY");
  assertCurrentLegalPolicyVersion("TERMS_OF_SERVICE", termsVersion);
  assertCurrentLegalPolicyVersion("PRIVACY_POLICY", privacyVersion);

  await persistence.appendConsentDecision(executor, {
    userId,
    consentType: "TERMS_OF_SERVICE",
    policyVersion: termsVersion,
    decision: "GRANTED",
    decidedAt: now,
  });
  await persistence.appendConsentDecision(executor, {
    userId,
    consentType: "PRIVACY_POLICY",
    policyVersion: privacyVersion,
    decision: "GRANTED",
    decidedAt: now,
  });
  await persistence.appendConsentDecision(executor, {
    userId,
    consentType: "SERVICE_EMAIL_UPDATES",
    policyVersion: getCurrentLegalPolicy("SERVICE_EMAIL_UPDATES").version,
    decision: input.serviceEmailUpdatesConsent ? "GRANTED" : "REVOKED",
    decidedAt: now,
  });

  if (input.email !== undefined) {
    const existingEmail = await persistence.findUserEmail(executor, userId);
    if (existingEmail?.emailNormalized !== input.email) {
      await persistence.upsertUserInputEmail(executor, {
        userId,
        email: input.email,
      });
    }
  }
  if (input.childBirthYear !== undefined) {
    await persistence.upsertUserProfile(executor, {
      userId,
      childBirthYear: input.childBirthYear,
    });
  }
  await persistence.replaceUserInterestRegions(
    executor,
    userId,
    input.interestRegions,
  );
  await persistence.replaceUserInterestCategories(
    executor,
    userId,
    input.interestCategories as readonly UserInterestCategory[],
  );
  await persistence.upsertEmailNotificationPreference(executor, {
    userId,
    state: input.serviceEmailUpdatesConsent ? "ENABLED" : "DISABLED",
  });

  const activated = await persistence.activatePendingUser(
    executor,
    userId,
    now,
  );
  if (!activated) throw new ConflictError();
  return activated;
}

export async function completeSignup(
  ctx: UserCommandContext,
  rawInput: unknown,
  dependencies: CompleteSignupDependencies,
  rawServerInput: unknown = { pendingFollow: null },
): Promise<CompleteSignupResult> {
  const parsedUserId = z.uuid().safeParse(ctx.userId);
  if (!parsedUserId.success) {
    throw ValidationError.fromZodError(parsedUserId.error);
  }
  const input = parseCompleteSignupInput(rawInput);
  const serverInput = parseCompleteSignupServerInput(rawServerInput);
  assertPlausibleChildBirthYear(input.childBirthYear, ctx.occurredAt);
  const persistence =
    dependencies.persistence ?? defaultCompleteSignupPersistence;
  const followPersistence =
    dependencies.followPersistence ?? defaultActivateFollowPersistence;

  let follow: ActivateFollowResult | null;
  try {
    follow = await dependencies.transactionManager.run(async (executor) => {
      await persistSignup(
        executor,
        parsedUserId.data,
        input,
        ctx.occurredAt,
        persistence,
      );

      if (!serverInput.pendingFollow) return null;
      try {
        return await activateFollowInTransaction(
          executor,
          { ...ctx, userId: parsedUserId.data },
          serverInput.pendingFollow,
          followPersistence,
        );
      } catch (error) {
        if (
          error instanceof NotFoundError ||
          error instanceof NotEligibleError
        ) {
          return null;
        }
        throw error;
      }
    });
  } catch (error) {
    throw mapFollowDatabaseError(error);
  }

  try {
    await dependencies.tracker.track("signup_complete", {
      context: "MY_PREPPY",
    });
  } catch {
    // Analytics is deliberately best effort and runs only after commit.
  }

  if (follow?.created || follow?.reactivated) {
    try {
      if (follow.activeFollowCount === 1) {
        await dependencies.tracker.track("follow_created", {
          institutionId: follow.institutionId,
          followCount: follow.activeFollowCount,
        });
      } else {
        await dependencies.tracker.track("additional_follow", {
          institutionId: follow.institutionId,
          followCount: follow.activeFollowCount,
        });
      }
    } catch {
      // Follow analytics is independently best effort after the shared commit.
    }
  }

  return { userId: parsedUserId.data, userState: "ACTIVE", follow };
}
