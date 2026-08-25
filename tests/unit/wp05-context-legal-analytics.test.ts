import { describe, expect, it } from "vitest";

import {
  createAdminCommandContext,
  createLiveSystemCommandContext,
  createMigrationCommandContext,
  createUserCommandContext,
} from "@/src/application/context";
import {
  ConsentPolicyUpdatedError,
  mapApplicationErrorToHttp,
} from "@/src/application/errors";
import {
  assertCurrentLegalPolicyVersion,
  getCurrentLegalPolicy,
  getCurrentLegalPolicyVersions,
  legalPolicyTypes,
} from "@/src/application/legal-policies.server";
import { analyticsEventNames } from "@/src/analytics/events";
import {
  type AnalyticsTracker,
  NoopAnalyticsTracker,
  TestAnalyticsTracker,
} from "@/src/analytics/tracker";

describe("WP-05 command contexts", () => {
  it("keeps correlation IDs server-owned across user, admin, and system contexts", () => {
    // Mutation caught: accepting a client-controlled correlation ID in a derived context.
    const occurredAt = new Date("2026-08-23T00:00:00.000Z");
    const user = createUserCommandContext({
      userId: "user-1",
      occurredAt,
      clientCorrelationId: "client-controlled",
    });
    const admin = createAdminCommandContext({
      adminUserId: "admin-1",
      reason: "Support request",
      occurredAt,
    });
    const liveSystem = createLiveSystemCommandContext({
      source: "WEBHOOK",
      occurredAt,
    });
    const migration = createMigrationCommandContext({ occurredAt });

    expect(user).toMatchObject({ userId: "user-1", occurredAt });
    expect(admin).toMatchObject({
      adminUserId: "admin-1",
      reason: "Support request",
      occurredAt,
    });
    expect(liveSystem).toMatchObject({
      source: "WEBHOOK",
      emitProductSignals: true,
      occurredAt,
    });
    expect(migration).toMatchObject({
      source: "MIGRATION",
      emitProductSignals: false,
      occurredAt,
    });
    expect(user.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(user.correlationId).not.toBe("client-controlled");
    expect(
      new Set([
        user.correlationId,
        admin.correlationId,
        liveSystem.correlationId,
        migration.correlationId,
      ]).size,
    ).toBe(4);
  });

  it("always disables product signals for migration contexts", () => {
    // Mutation caught: a migration factory that enables product signals.
    expect(createMigrationCommandContext()).toMatchObject({
      source: "MIGRATION",
      emitProductSignals: false,
    });
  });
});

describe("WP-05 legal policies", () => {
  it("returns the three current server-owned policies with their stable references", () => {
    // Mutation caught: a policy identity, version, or stable content reference drifting.
    expect(legalPolicyTypes).toEqual([
      "TERMS_OF_SERVICE",
      "PRIVACY_POLICY",
      "SERVICE_EMAIL_UPDATES",
    ]);
    expect(getCurrentLegalPolicy("TERMS_OF_SERVICE")).toEqual({
      type: "TERMS_OF_SERVICE",
      version: "2026-08-23",
      effectiveAt: "2026-08-23T00:00:00+09:00",
      contentReference: "legal/terms/2026-08-23",
    });
    expect(getCurrentLegalPolicy("PRIVACY_POLICY")).toEqual({
      type: "PRIVACY_POLICY",
      version: "2026-08-23",
      effectiveAt: "2026-08-23T00:00:00+09:00",
      contentReference: "legal/privacy/2026-08-23",
    });
    expect(getCurrentLegalPolicy("SERVICE_EMAIL_UPDATES")).toEqual({
      type: "SERVICE_EMAIL_UPDATES",
      version: "2026-08-23",
      effectiveAt: "2026-08-23T00:00:00+09:00",
      contentReference: "legal/service-email-updates/2026-08-23",
    });
    expect(getCurrentLegalPolicyVersions()).toEqual({
      TERMS_OF_SERVICE: "2026-08-23",
      PRIVACY_POLICY: "2026-08-23",
      SERVICE_EMAIL_UPDATES: "2026-08-23",
    });
  });

  it("accepts only current legal policy versions", () => {
    // Mutation caught: version checks accepting a stale or blank version.
    expect(() =>
      assertCurrentLegalPolicyVersion("TERMS_OF_SERVICE", "2026-08-23"),
    ).not.toThrow();
    expect(() =>
      assertCurrentLegalPolicyVersion("TERMS_OF_SERVICE", "2026-08-22"),
    ).toThrow(ConsentPolicyUpdatedError);
    expect(() => assertCurrentLegalPolicyVersion("PRIVACY_POLICY", "")).toThrow(
      ConsentPolicyUpdatedError,
    );
    expect(() =>
      assertCurrentLegalPolicyVersion("UNKNOWN_POLICY", "2026-08-23"),
    ).toThrow(ConsentPolicyUpdatedError);
  });

  it("keeps the exported policy catalog immutable and unknown identities safe", () => {
    // Mutation caught: runtime mutation of policy identities changing unknown-policy error behavior.
    const unsafeCatalog = legalPolicyTypes as unknown as string[];

    expect(() => unsafeCatalog.push("UNKNOWN_POLICY")).toThrow(TypeError);
    expect(legalPolicyTypes).toEqual([
      "TERMS_OF_SERVICE",
      "PRIVACY_POLICY",
      "SERVICE_EMAIL_UPDATES",
    ]);
    expect(() =>
      assertCurrentLegalPolicyVersion("UNKNOWN_POLICY", "2026-08-23"),
    ).toThrow(ConsentPolicyUpdatedError);
  });

  it("prevents returned policy mutation from changing server-owned version validation", () => {
    // Mutation caught: exposing a mutable policy manifest object to callers.
    const returnedPolicy = getCurrentLegalPolicy("TERMS_OF_SERVICE") as {
      version: string;
    };
    returnedPolicy.version = "1999-01-01";

    expect(getCurrentLegalPolicy("TERMS_OF_SERVICE").version).toBe(
      "2026-08-23",
    );
    expect(() =>
      assertCurrentLegalPolicyVersion("TERMS_OF_SERVICE", "2026-08-23"),
    ).not.toThrow();
  });

  it("maps a changed legal policy to the safe conflict response", () => {
    // Mutation caught: exposing the wrong error code, HTTP status, or message for stale consent.
    expect(
      mapApplicationErrorToHttp(
        new ConsentPolicyUpdatedError(),
        "correlation-id",
      ),
    ).toEqual({
      status: 409,
      body: {
        error: {
          code: "CONSENT_POLICY_UPDATED",
          message: "The consent policy version has changed.",
          correlationId: "correlation-id",
        },
      },
    });
  });
});

describe("WP-05 analytics", () => {
  const institutionId = "00000000-0000-4000-8000-000000000001";
  const articleId = "00000000-0000-4000-8000-000000000002";
  it("publishes the exact ordered analytics event catalog", () => {
    // Mutation caught: renaming, removing, adding, or reordering canonical event names.
    expect(analyticsEventNames).toEqual([
      "home_view",
      "article_view",
      "search",
      "filter",
      "institution_view",
      "opportunity_view",
      "follow_click",
      "signup_start",
      "signup_complete",
      "follow_created",
      "additional_follow",
      "my_preppy_view",
      "notification_sent",
      "notification_open",
      "notification_click",
      "article_to_institution",
      "article_to_follow",
      "hero_primary_cta_click",
      "hero_secondary_cta_click",
    ]);
  });

  it("accepts representative valid analytics events with the noop tracker", () => {
    // Mutation caught: the noop tracker throwing for a valid typed event.
    const tracker: AnalyticsTracker = new NoopAnalyticsTracker();

    expect(() => {
      tracker.track("home_view", { landingPage: "HOME" });
      tracker.track("search", {
        queryLengthBucket: "4_10",
        resultCount: 3,
        category: "INTERNATIONAL_SCHOOL",
      });
      tracker.track("follow_click", {
        institutionId,
        context: "ARTICLE",
        articleId,
      });
    }).not.toThrow();
  });

  it("captures heterogeneous events in order without exposing mutable tracker state", () => {
    // Mutation caught: tracker event ordering, reset behavior, or snapshot isolation breaking.
    const tracker = new TestAnalyticsTracker();
    tracker.track("article_view", { articleId });
    tracker.track("my_preppy_view", {
      followCount: 2,
      emailState: "ENABLED",
    });

    const snapshot = tracker.snapshot();
    expect(snapshot).toEqual([
      { name: "article_view", properties: { articleId } },
      {
        name: "my_preppy_view",
        properties: { followCount: 2, emailState: "ENABLED" },
      },
    ]);

    (snapshot as Array<(typeof snapshot)[number]>).push({
      name: "notification_open",
      properties: { deliveryId: institutionId },
    });
    expect(tracker.snapshot()).toHaveLength(2);

    tracker.reset();
    expect(tracker.snapshot()).toEqual([]);
  });

  it("keeps raw queries and other prohibited PII keys out of typed analytics properties", () => {
    // Mutation caught: adding a prohibited PII-bearing property to any canonical event contract.
    const tracker: AnalyticsTracker = new NoopAnalyticsTracker();
    expect(() =>
      tracker.track("search", {
        queryLengthBucket: "1_3",
        resultCount: 1,
        // @ts-expect-error rawQuery must never be accepted by search analytics.
        rawQuery: "abc",
      }),
    ).toThrow();
    expect(() =>
      tracker.track("home_view", {
        landingPage: "HOME",
        // @ts-expect-error email must never be accepted by analytics.
        email: "person@example.com",
      }),
    ).toThrow();
    expect(() =>
      tracker.track("home_view", {
        landingPage: "HOME",
        // @ts-expect-error providerSubject must never be accepted by analytics.
        providerSubject: "subject",
      }),
    ).toThrow();
    expect(() =>
      tracker.track("home_view", {
        landingPage: "HOME",
        // @ts-expect-error oauthToken must never be accepted by analytics.
        oauthToken: "token",
      }),
    ).toThrow();
    expect(() =>
      tracker.track("home_view", {
        landingPage: "HOME",
        // @ts-expect-error childName must never be accepted by analytics.
        childName: "Ari",
      }),
    ).toThrow();
    expect(() =>
      tracker.track("home_view", {
        landingPage: "HOME",
        // @ts-expect-error phone must never be accepted by analytics.
        phone: "010-0000-0000",
      }),
    ).toThrow();
    expect(() =>
      tracker.track("home_view", {
        landingPage: "HOME",
        // @ts-expect-error childBirthYear must never be accepted by analytics.
        childBirthYear: 2020,
      }),
    ).toThrow();
  });
});
