import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import {
  authIdentities,
  consentDecisions,
  notificationPreferences,
  userEmails,
  userInterestCategories,
  userInterestRegions,
  userProfiles,
  users,
} from "@/src/db/schema";
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

export async function createKakaoUserEmail(
  executor: TransactionExecutor,
  input: {
    userId: string;
    email: string;
    emailNormalized: string;
    verificationState: "UNVERIFIED" | "VERIFIED";
    deliveryState: "USABLE" | "SUPPRESSED";
    verifiedAt?: Date;
  },
) {
  const [email] = await executor.drizzle
    .insert(userEmails)
    .values({
      userId: input.userId,
      email: input.email,
      emailNormalized: input.emailNormalized,
      source: "KAKAO",
      verificationState: input.verificationState,
      deliveryState: input.deliveryState,
      verifiedAt: input.verifiedAt,
    })
    .returning();

  return email!;
}

export async function appendConsentDecision(
  executor: TransactionExecutor,
  input: {
    userId: string;
    consentType:
      "TERMS_OF_SERVICE" | "PRIVACY_POLICY" | "SERVICE_EMAIL_UPDATES";
    policyVersion: string;
    decision: "GRANTED" | "REVOKED";
    decidedAt: Date;
  },
) {
  const [decision] = await executor.drizzle
    .insert(consentDecisions)
    .values({ ...input, source: "ONBOARDING" })
    .returning();

  return decision!;
}

export async function upsertUserInputEmail(
  executor: TransactionExecutor,
  input: { userId: string; email: string },
) {
  const [email] = await executor.drizzle
    .insert(userEmails)
    .values({
      userId: input.userId,
      email: input.email,
      emailNormalized: input.email,
      source: "USER_INPUT",
      verificationState: "UNVERIFIED",
      deliveryState: "USABLE",
    })
    .onConflictDoUpdate({
      target: userEmails.userId,
      set: {
        email: input.email,
        emailNormalized: input.email,
        source: "USER_INPUT",
        verificationState: "UNVERIFIED",
        deliveryState: "USABLE",
        verifiedAt: null,
        lastBouncedAt: null,
        removedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return email!;
}

export async function findUserEmail(
  executor: DatabaseExecutor,
  userId: string,
) {
  const [email] = await executor.drizzle
    .select()
    .from(userEmails)
    .where(eq(userEmails.userId, userId))
    .limit(1);

  return email ?? null;
}

export async function upsertUserProfile(
  executor: TransactionExecutor,
  input: { userId: string; childBirthYear: number },
) {
  const [profile] = await executor.drizzle
    .insert(userProfiles)
    .values(input)
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { childBirthYear: input.childBirthYear, updatedAt: new Date() },
    })
    .returning();

  return profile!;
}

export async function replaceUserInterestRegions(
  executor: TransactionExecutor,
  userId: string,
  regionCodes: readonly string[],
): Promise<void> {
  await executor.drizzle
    .delete(userInterestRegions)
    .where(eq(userInterestRegions.userId, userId));
  if (regionCodes.length > 0) {
    await executor.drizzle
      .insert(userInterestRegions)
      .values(regionCodes.map((regionCode) => ({ userId, regionCode })));
  }
}

export type UserInterestCategory =
  "ENGLISH_KINDERGARTEN" | "PRIVATE_ELEMENTARY" | "INTERNATIONAL_SCHOOL";

export async function replaceUserInterestCategories(
  executor: TransactionExecutor,
  userId: string,
  categories: readonly UserInterestCategory[],
): Promise<void> {
  await executor.drizzle
    .delete(userInterestCategories)
    .where(eq(userInterestCategories.userId, userId));
  if (categories.length > 0) {
    await executor.drizzle
      .insert(userInterestCategories)
      .values(categories.map((category) => ({ userId, category })));
  }
}

export async function upsertEmailNotificationPreference(
  executor: TransactionExecutor,
  input: { userId: string; state: "ENABLED" | "DISABLED" },
) {
  const [preference] = await executor.drizzle
    .insert(notificationPreferences)
    .values({ userId: input.userId, channel: "EMAIL", state: input.state })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.channel],
      set: { state: input.state, updatedAt: new Date() },
    })
    .returning();

  return preference!;
}

export async function activatePendingUser(
  executor: TransactionExecutor,
  userId: string,
  activatedAt: Date,
) {
  const [user] = await executor.drizzle
    .update(users)
    .set({ status: "ACTIVE", activatedAt, updatedAt: activatedAt })
    .where(and(eq(users.id, userId), eq(users.status, "PENDING")))
    .returning();

  return user ?? null;
}

export async function findOnboardingDefaults(
  executor: DatabaseExecutor,
  userId: string,
) {
  const [[email], [profile], regions, categories, [serviceConsent]] =
    await Promise.all([
      executor.drizzle
        .select({ email: userEmails.email })
        .from(userEmails)
        .where(and(eq(userEmails.userId, userId), isNull(userEmails.removedAt)))
        .limit(1),
      executor.drizzle
        .select({ childBirthYear: userProfiles.childBirthYear })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1),
      executor.drizzle
        .select({ regionCode: userInterestRegions.regionCode })
        .from(userInterestRegions)
        .where(eq(userInterestRegions.userId, userId))
        .orderBy(userInterestRegions.regionCode),
      executor.drizzle
        .select({ category: userInterestCategories.category })
        .from(userInterestCategories)
        .where(eq(userInterestCategories.userId, userId))
        .orderBy(userInterestCategories.category),
      executor.drizzle
        .select({ decision: consentDecisions.decision })
        .from(consentDecisions)
        .where(
          and(
            eq(consentDecisions.userId, userId),
            eq(consentDecisions.consentType, "SERVICE_EMAIL_UPDATES"),
          ),
        )
        .orderBy(desc(consentDecisions.decidedAt), desc(consentDecisions.id))
        .limit(1),
    ]);

  return {
    email: email?.email ?? null,
    childBirthYear: profile?.childBirthYear ?? null,
    interestRegions: regions.map((region) => region.regionCode),
    interestCategories: categories.map(
      (category) => category.category as UserInterestCategory,
    ),
    serviceEmailUpdatesConsent: serviceConsent?.decision === "GRANTED",
  };
}
