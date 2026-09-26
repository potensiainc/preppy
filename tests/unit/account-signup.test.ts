import { describe, expect, it, vi } from "vitest";
import { TestAnalyticsTracker } from "@/src/analytics/tracker";
import { createUserCommandContext } from "@/src/application/context";
import {
  getCurrentLegalPolicyVersions,
  getCurrentLegalPolicy,
  getLegalPublicationState,
} from "@/src/application/legal-policies.server";
import {
  completeSignup,
  defaultCompleteSignupPersistence,
  type CompleteSignupPersistence,
} from "@/src/modules/auth/complete-signup.server";
import type {
  TransactionExecutor,
  TransactionManager,
} from "@/src/infrastructure/db/runtime.server";

const userId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const context = createUserCommandContext({ userId });
function input(overrides: Record<string, unknown> = {}) {
  const versions = getCurrentLegalPolicyVersions();
  return {
    adultConfirmed: true,
    consents: [
      {
        type: "TERMS_OF_SERVICE",
        decision: "GRANTED",
        policyVersion: versions.TERMS_OF_SERVICE,
      },
      {
        type: "PRIVACY_POLICY",
        decision: "GRANTED",
        policyVersion: versions.PRIVACY_POLICY,
      },
    ],
    serviceEmailUpdatesPolicyVersion: versions.SERVICE_EMAIL_UPDATES,
    serviceEmailUpdatesConsent: false,
    ...overrides,
  };
}
function dependencies(ready = true, createdAt = context.occurredAt) {
  const decisions: unknown[] = [];
  const writes: string[] = [];
  const executor = {} as TransactionExecutor;
  const run = vi.fn(
    async (work: (executor: TransactionExecutor) => Promise<unknown>) =>
      work(executor),
  );
  return {
    decisions,
    writes,
    run,
    transactionManager: { run } as unknown as TransactionManager,
    tracker: new TestAnalyticsTracker(),
    isLegalPublicationReady: () => ready,
    persistence: {
      ...defaultCompleteSignupPersistence,
      findUserForUpdate: async () => ({
        id: userId,
        status: "PENDING" as const,
        createdAt,
        updatedAt: context.occurredAt,
        activatedAt: null,
        suspendedAt: null,
        deletedAt: null,
        piiAnonymizedAt: null,
      }),
      appendConsentDecision: async (
        _executor: TransactionExecutor,
        decision: unknown,
      ) => {
        decisions.push(decision);
      },
      findUserEmail: async () => null,
      upsertUserInputEmail: async () => {
        writes.push("email");
      },
      upsertUserProfile: async () => {
        writes.push("child");
      },
      replaceUserInterestRegions: async () => {},
      replaceUserInterestCategories: async () => {},
      upsertEmailNotificationPreference: async (
        _executor: TransactionExecutor,
        preference: { state: string },
      ) => {
        writes.push(preference.state);
      },
      activatePendingUser: async () => ({
        id: userId,
        status: "ACTIVE" as const,
        createdAt: context.occurredAt,
        updatedAt: context.occurredAt,
        activatedAt: context.occurredAt,
        suspendedAt: null,
        deletedAt: null,
        piiAnonymizedAt: null,
      }),
    } as unknown as CompleteSignupPersistence,
  };
}
describe("signup minimal collection", () => {
  it("rejects stale optional email consent before any consent write", async () => {
    const deps = dependencies();
    await expect(
      completeSignup(
        context,
        input({
          serviceEmailUpdatesConsent: true,
          serviceEmailUpdatesPolicyVersion: "old-email",
        }),
        deps,
      ),
    ).rejects.toMatchObject({ code: "CONSENT_POLICY_UPDATED" });
    expect(deps.decisions).toEqual([]);
  });
  it("expires pending signup at the original 24-hour boundary", async () => {
    const deps = dependencies(
      true,
      new Date(context.occurredAt.getTime() - 24 * 60 * 60 * 1000),
    );
    await expect(completeSignup(context, input(), deps)).rejects.toMatchObject({
      code: "NOT_ELIGIBLE",
    });
    expect(deps.decisions).toEqual([]);
  });
  it("allows pending signup immediately before the 24-hour boundary", async () => {
    const deps = dependencies(
      true,
      new Date(context.occurredAt.getTime() - 24 * 60 * 60 * 1000 + 1),
    );
    await expect(completeSignup(context, input(), deps)).resolves.toMatchObject(
      { userState: "ACTIVE" },
    );
  });
  // Missing validation must never activate an account or write consent.
  it.each([undefined, false, "true"])(
    "requires explicit adult confirmation: %s",
    async (adultConfirmed) => {
      const deps = dependencies();
      await expect(
        completeSignup(context, input({ adultConfirmed }), deps),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(deps.run).not.toHaveBeenCalled();
    },
  );
  it.each([2020, null, ""])(
    "rejects discontinued child intake: %s",
    async (childBirthYear) => {
      const deps = dependencies();
      await expect(
        completeSignup(context, input({ childBirthYear }), deps),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(deps.writes).toEqual([]);
    },
  );
  it("allows signup without email and without optional notification consent", async () => {
    const deps = dependencies();
    await expect(completeSignup(context, input(), deps)).resolves.toMatchObject(
      { userState: "ACTIVE" },
    );
    expect(deps.writes).toEqual(["DISABLED"]);
    expect(deps.decisions).toContainEqual(
      expect.objectContaining({
        consentType: "SERVICE_EMAIL_UPDATES",
        decision: "REVOKED",
      }),
    );
  });
  it("refuses unpublished legal documents before storing consent", async () => {
    const deps = dependencies(false);
    await expect(completeSignup(context, input(), deps)).rejects.toMatchObject({
      status: 503,
    });
    expect(deps.run).not.toHaveBeenCalled();
  });
});

describe("published signup policies", () => {
  it("uses the approved effective versions without an injected readiness bypass", async () => {
    expect(getLegalPublicationState()).toEqual({ ready: true, blockers: [] });
    expect(getCurrentLegalPolicy("TERMS_OF_SERVICE").effectiveAt).toBe(
      "2026-09-26",
    );
    const deps = dependencies();
    const { isLegalPublicationReady: _override, ...productionReadiness } = deps;
    await expect(
      completeSignup(context, input(), productionReadiness),
    ).resolves.toMatchObject({ userState: "ACTIVE" });
  });
});
