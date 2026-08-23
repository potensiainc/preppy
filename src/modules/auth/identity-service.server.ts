import "server-only";

import { ConflictError, ForbiddenError } from "@/src/application/errors";
import { mapDatabaseError } from "@/src/infrastructure/db/errors";
import type {
  DatabaseExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";
import type { KakaoIdentity } from "@/src/modules/auth/kakao-provider.server";
import {
  createAuthIdentity,
  createKakaoUserEmail,
  createPendingUser,
  findAuthIdentity,
  findUserById,
} from "@/src/modules/identity/repository.server";

export type IdentityResolutionDependencies = {
  executor: DatabaseExecutor;
  transactionManager: TransactionManager;
  newUserId?: () => string;
};

function allowAuthenticatableUser<T extends { status: string }>(user: T): T {
  if (user.status !== "ACTIVE" && user.status !== "PENDING") {
    throw new ForbiddenError();
  }
  return user;
}

async function findExistingKakaoUser(
  identity: KakaoIdentity,
  executor: DatabaseExecutor,
) {
  const storedIdentity = await findAuthIdentity(
    executor,
    "KAKAO",
    identity.subject,
  );
  if (!storedIdentity) return null;
  if (storedIdentity.status !== "ACTIVE") {
    throw new ForbiddenError();
  }

  const user = await findUserById(executor, storedIdentity.userId);
  if (!user) throw new ForbiddenError();
  return allowAuthenticatableUser(user);
}

export async function resolveKakaoIdentity(
  identity: KakaoIdentity,
  dependencies: IdentityResolutionDependencies,
) {
  const existing = await findExistingKakaoUser(identity, dependencies.executor);
  if (existing) return existing;

  try {
    return await dependencies.transactionManager.run(async (executor) => {
      const user = await createPendingUser(executor, {
        ...(dependencies.newUserId ? { id: dependencies.newUserId() } : {}),
      });
      await createAuthIdentity(executor, {
        userId: user.id,
        provider: "KAKAO",
        providerSubject: identity.subject,
      });

      if (identity.emailClaim) {
        const usable = identity.emailClaim.valid;
        const verified = usable && identity.emailClaim.verified;
        await createKakaoUserEmail(executor, {
          userId: user.id,
          email: identity.emailClaim.value,
          emailNormalized: identity.emailClaim.value.trim().toLowerCase(),
          verificationState: verified ? "VERIFIED" : "UNVERIFIED",
          deliveryState: usable ? "USABLE" : "SUPPRESSED",
          ...(verified ? { verifiedAt: new Date() } : {}),
        });
      }

      return user;
    });
  } catch (error) {
    const cause =
      typeof error === "object" && error !== null && "cause" in error
        ? error.cause
        : error;
    const mapped = mapDatabaseError(cause);
    if (!(mapped instanceof ConflictError)) throw mapped;

    const winner = await findExistingKakaoUser(identity, dependencies.executor);
    if (winner) return winner;
    throw mapped;
  }
}
