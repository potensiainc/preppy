import { describe, expect, it, vi } from "vitest";

import { TestAnalyticsTracker } from "@/src/analytics/tracker";
import { createUserSessionCookie } from "@/src/modules/auth/session.server";
import {
  deriveEmailReadiness,
  loadMyPreppy,
  type MyPreppyPersistence,
} from "@/src/modules/my-preppy/query.server";

const secret = "wp09-my-preppy-unit-secret-that-is-long-enough";
const now = new Date("2026-08-23T10:00:00.000Z");
const userId = "550e8400-e29b-41d4-a716-446655440000";
const institutionId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const opportunityId = "7ba7b810-9dad-11d1-80b4-00c04fd430c8";

function session(): string {
  return createUserSessionCookie(userId, { secret, now }).value;
}

function transactionManager() {
  return {
    run: vi.fn(async (operation: (executor: never) => Promise<unknown>) =>
      operation({ scope: "transaction" } as never),
    ),
  };
}

function persistence(
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED" = "ACTIVE",
): MyPreppyPersistence {
  return {
    findUserForShare: vi.fn().mockResolvedValue({ id: userId, status }),
    listActiveFollowedInstitutions: vi.fn().mockResolvedValue([
      {
        followId: "8ba7b810-9dad-11d1-80b4-00c04fd430c8",
        followedAt: "2026-08-20T00:00:00.000Z",
        institution: {
          id: institutionId,
          slug: "native-kindergarten",
          name: "네이티브 영유",
          category: "ENGLISH_KINDERGARTEN",
          region: "SEOUL",
        },
      },
    ]),
    countActiveEligibleFollows: vi.fn().mockResolvedValue(1),
    listPublishedOpportunityIds: vi.fn().mockResolvedValue([opportunityId]),
    getCanonicalOpportunityCards: vi.fn().mockResolvedValue([
      {
        id: opportunityId,
        slug: "native-kindergarten-2027",
        title: "2027 신입 원아 모집",
        kind: "APPLICATION",
        businessState: "OPEN",
        keyDate: "2026-09-01T00:00:00.000Z",
        institution: {
          id: institutionId,
          slug: "native-kindergarten",
          name: "네이티브 영유",
          category: "ENGLISH_KINDERGARTEN",
          region: "SEOUL",
          followable: true,
        },
        lastVerifiedAt: "2026-08-22T00:00:00.000Z",
        indexability: "INDEX",
      },
    ]),
    listRecentChanges: vi.fn().mockResolvedValue([
      {
        opportunityId,
        institutionId,
        summary: "접수 마감일이 변경되었습니다.",
        publishedAt: "2026-08-22T01:00:00.000Z",
      },
    ]),
    getEmailReadinessInputs: vi.fn().mockResolvedValue({
      emailExists: true,
      emailDeliveryState: "USABLE",
      emailRemoved: false,
      latestConsent: "GRANTED",
      emailPreference: "ENABLED",
    }),
  };
}

describe("WP-09 My Preppy private query", () => {
  it("routes anonymous, PENDING, SUSPENDED, and DELETED sessions without private data", async () => {
    const anonymousPersistence = persistence();
    const anonymousTransactions = transactionManager();
    await expect(
      loadMyPreppy(null, {
        sessionSecret: secret,
        now,
        transactionManager: anonymousTransactions as never,
        persistence: anonymousPersistence,
        tracker: new TestAnalyticsTracker(),
      }),
    ).resolves.toEqual({ access: "ANONYMOUS" });
    expect(anonymousTransactions.run).not.toHaveBeenCalled();

    for (const [status, access] of [
      ["PENDING", "PENDING"],
      ["SUSPENDED", "DENIED"],
      ["DELETED", "DENIED"],
    ] as const) {
      const store = persistence(status);
      await expect(
        loadMyPreppy(session(), {
          sessionSecret: secret,
          now,
          transactionManager: transactionManager() as never,
          persistence: store,
          tracker: new TestAnalyticsTracker(),
        }),
      ).resolves.toEqual({ access });
      expect(store.listActiveFollowedInstitutions).not.toHaveBeenCalled();
    }
  });

  it("builds an ACTIVE native 영유 snapshot with no legacy identifiers", async () => {
    const result = await loadMyPreppy(session(), {
      sessionSecret: secret,
      now,
      transactionManager: transactionManager() as never,
      persistence: persistence(),
      tracker: new TestAnalyticsTracker(),
    });

    expect(result.access).toBe("ACTIVE");
    if (result.access !== "ACTIVE") throw new Error("expected ACTIVE");
    expect(result.data.cards[0]).toMatchObject({
      institution: {
        name: "네이티브 영유",
        category: "ENGLISH_KINDERGARTEN",
      },
      currentAdmissionsState: "OPEN",
      currentOpportunities: [{ id: opportunityId }],
      upcomingOpportunities: [],
      recentChanges: [{ summary: "접수 마감일이 변경되었습니다." }],
      readiness: {
        ready: true,
        label: "이메일 업데이트 준비됨",
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /legacy|admissionEventId|schoolId|cycleId/i,
    );
  });

  it.each([
    [
      {
        emailExists: false,
        emailDeliveryState: null,
        emailRemoved: false,
        latestConsent: "GRANTED",
        emailPreference: "ENABLED",
      },
      false,
      "이메일 미등록",
      "UNAVAILABLE",
    ],
    [
      {
        emailExists: true,
        emailDeliveryState: "SUPPRESSED",
        emailRemoved: false,
        latestConsent: "GRANTED",
        emailPreference: "ENABLED",
      },
      false,
      "이메일 사용 불가",
      "UNAVAILABLE",
    ],
    [
      {
        emailExists: true,
        emailDeliveryState: "USABLE",
        emailRemoved: false,
        latestConsent: "REVOKED",
        emailPreference: "ENABLED",
      },
      false,
      "서비스 이메일 동의 필요",
      "UNAVAILABLE",
    ],
    [
      {
        emailExists: true,
        emailDeliveryState: "USABLE",
        emailRemoved: false,
        latestConsent: null,
        emailPreference: "ENABLED",
      },
      false,
      "서비스 이메일 동의 필요",
      "UNAVAILABLE",
    ],
    [
      {
        emailExists: true,
        emailDeliveryState: "USABLE",
        emailRemoved: false,
        latestConsent: "GRANTED",
        emailPreference: "DISABLED",
      },
      false,
      "이메일 업데이트 꺼짐",
      "DISABLED",
    ],
    [
      {
        emailExists: true,
        emailDeliveryState: "USABLE",
        emailRemoved: false,
        latestConsent: "GRANTED",
        emailPreference: null,
      },
      false,
      "이메일 업데이트 꺼짐",
      "DISABLED",
    ],
  ] as const)(
    "derives truthful readiness %# without live-delivery claims",
    (inputs, ready, label, analyticsState) => {
      expect(deriveEmailReadiness(inputs)).toEqual({
        ready,
        label,
        analyticsState,
      });
      expect(label).not.toMatch(/실시간|발송 중|전송됨/);
    },
  );

  it("keeps the query set-wise and bounded as Follow count grows", async () => {
    const store = persistence();
    const roots = Array.from({ length: 24 }, (_, index) => ({
      followId: `follow-${index}`,
      followedAt: "2026-08-20T00:00:00.000Z",
      institution: {
        id: `institution-${index}`,
        slug: `institution-${index}`,
        name: `기관 ${index}`,
        category: "INTERNATIONAL_SCHOOL" as const,
        region: "SEOUL",
      },
    }));
    vi.mocked(store.listActiveFollowedInstitutions).mockResolvedValue(roots);
    vi.mocked(store.listPublishedOpportunityIds).mockResolvedValue([]);
    vi.mocked(store.getCanonicalOpportunityCards).mockResolvedValue([]);
    vi.mocked(store.listRecentChanges).mockResolvedValue([]);

    await loadMyPreppy(session(), {
      sessionSecret: secret,
      now,
      transactionManager: transactionManager() as never,
      persistence: store,
      tracker: new TestAnalyticsTracker(),
    });

    expect(store.listActiveFollowedInstitutions).toHaveBeenCalledTimes(1);
    expect(store.countActiveEligibleFollows).toHaveBeenCalledTimes(1);
    expect(store.listPublishedOpportunityIds).toHaveBeenCalledTimes(1);
    expect(store.getCanonicalOpportunityCards).toHaveBeenCalledTimes(1);
    expect(store.listRecentChanges).toHaveBeenCalledTimes(1);
    expect(store.getEmailReadinessInputs).toHaveBeenCalledTimes(1);
    expect(store.listActiveFollowedInstitutions).toHaveBeenCalledWith(
      expect.anything(),
      userId,
      24,
    );
  });

  it("returns safe analytics inputs without duplicating the client-owned my_preppy_view", async () => {
    const tracker = new TestAnalyticsTracker();
    const result = await loadMyPreppy(session(), {
      sessionSecret: secret,
      now,
      transactionManager: transactionManager() as never,
      persistence: persistence(),
      tracker,
    });
    expect(result.access).toBe("ACTIVE");
    expect(result).toMatchObject({
      access: "ACTIVE",
      data: {
        activeFollowCount: 1,
        readiness: { analyticsState: "ENABLED" },
      },
    });
    expect(tracker.snapshot()).toEqual([]);

    await expect(
      loadMyPreppy(session(), {
        sessionSecret: secret,
        now,
        transactionManager: transactionManager() as never,
        persistence: persistence(),
        tracker: {
          track: () =>
            void (() => {
              throw new Error("offline");
            })(),
        },
      }),
    ).resolves.toMatchObject({ access: "ACTIVE" });
  });

  it("does not emit the client-owned my_preppy_view from the private read", async () => {
    const phases: string[] = [];
    const manager = {
      run: vi.fn(async (operation: (executor: never) => Promise<unknown>) => {
        const result = await operation({ scope: "transaction" } as never);
        phases.push("transaction-resolved");
        return result;
      }),
    };

    await loadMyPreppy(session(), {
      sessionSecret: secret,
      now,
      transactionManager: manager as never,
      persistence: persistence(),
      tracker: {
        track(name, properties) {
          phases.push(`tracked:${name}`);
          expect(properties).toEqual({
            followCount: 1,
            emailState: "ENABLED",
          });
        },
      },
    });

    expect(phases).toEqual(["transaction-resolved"]);
  });

  it("returns the full active eligible Follow total rather than the bounded card count", async () => {
    const store = persistence() as MyPreppyPersistence & {
      countActiveEligibleFollows: ReturnType<typeof vi.fn>;
    };
    const roots = Array.from({ length: 24 }, (_, index) => ({
      followId: `bounded-follow-${index}`,
      followedAt: "2026-08-20T00:00:00.000Z",
      institution: {
        id: `bounded-institution-${index}`,
        slug: `bounded-institution-${index}`,
        name: `기관 ${index}`,
        category: "INTERNATIONAL_SCHOOL" as const,
        region: "SEOUL",
      },
    }));
    vi.mocked(store.listActiveFollowedInstitutions).mockResolvedValue(roots);
    vi.mocked(store.listPublishedOpportunityIds).mockResolvedValue([]);
    vi.mocked(store.getCanonicalOpportunityCards).mockResolvedValue([]);
    vi.mocked(store.listRecentChanges).mockResolvedValue([]);
    store.countActiveEligibleFollows = vi.fn().mockResolvedValue(31);
    const tracker = new TestAnalyticsTracker();

    const result = await loadMyPreppy(session(), {
      sessionSecret: secret,
      now,
      transactionManager: transactionManager() as never,
      persistence: store,
      tracker,
    });

    expect(result).toMatchObject({
      access: "ACTIVE",
      data: { activeFollowCount: 31 },
    });
    expect(tracker.snapshot()).toEqual([]);
  });
});
