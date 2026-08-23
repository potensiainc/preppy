import "server-only";

import { ConflictError, UnauthenticatedError } from "@/src/application/errors";
import { getCurrentLegalPolicyVersions } from "@/src/application/legal-policies.server";
import { getSessionUser } from "@/src/application/current-user.server";
import type { DatabaseExecutor } from "@/src/infrastructure/db/runtime.server";
import { readPendingFollowIntent } from "@/src/modules/auth/pending-follow-intent.server";
import { resolveCanonicalPendingFollowTarget } from "@/src/modules/auth/pending-follow-target.server";
import { hasMonitorableSourceCoverage } from "@/src/modules/follow/followability-policy.server";
import { findOnboardingDefaults } from "@/src/modules/identity/repository.server";
import { findInstitutionById } from "@/src/modules/institution/repository.server";

export type OnboardingQueryDependencies = {
  executor: DatabaseExecutor;
  sessionSecret: string;
  pendingIntentSecret: string;
  now?: Date;
};

export async function getOnboardingState(
  sessionCookieValue: string | null | undefined,
  pendingIntentCookieValue: string | null | undefined,
  dependencies: OnboardingQueryDependencies,
) {
  const user = await getSessionUser(sessionCookieValue, {
    executor: dependencies.executor,
    secret: dependencies.sessionSecret,
    now: dependencies.now,
  });
  if (!user) throw new UnauthenticatedError();
  if (user.status !== "PENDING") throw new ConflictError();

  const [defaults, pendingInstitution] = await Promise.all([
    findOnboardingDefaults(dependencies.executor, user.id),
    findPendingInstitution(
      pendingIntentCookieValue,
      dependencies.pendingIntentSecret,
      dependencies.executor,
      dependencies.now,
    ),
  ]);

  return {
    userState: "PENDING" as const,
    defaults,
    policyVersions: getCurrentLegalPolicyVersions(),
    pendingInstitution,
  };
}

async function findPendingInstitution(
  cookieValue: string | null | undefined,
  secret: string,
  executor: DatabaseExecutor,
  now?: Date,
) {
  const intent = readPendingFollowIntent(cookieValue, { secret, now });
  if (!intent) return null;

  const target = await resolveCanonicalPendingFollowTarget(
    intent.institutionId,
    (institutionId) => findInstitutionById(executor, institutionId),
    (institutionId) => hasMonitorableSourceCoverage(executor, institutionId),
  );
  if (!target) return null;
  return {
    id: target.institution.id,
    slug: target.institution.slug,
    displayName: target.institution.displayName,
    category: target.institution.category,
    regionCode: target.institution.regionCode,
  };
}
