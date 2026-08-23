import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  TestAnalyticsTracker,
  type AnalyticsTracker,
} from "@/src/analytics/tracker";
import { createUserCommandContext } from "@/src/application/context";
import { getCurrentLegalPolicyVersions } from "@/src/application/legal-policies.server";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  completeSignup,
  defaultCompleteSignupPersistence,
} from "@/src/modules/auth/complete-signup.server";
import { resolveKakaoIdentity } from "@/src/modules/auth/identity-service.server";
import { getOnboardingState } from "@/src/modules/auth/onboarding-query.server";
import { createPendingFollowIntent } from "@/src/modules/auth/pending-follow-intent.server";
import { createUserSessionCookie } from "@/src/modules/auth/session.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 16,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const sessionSecret = "signup-session-secret-that-is-at-least-32-characters";
const intentSecret = "signup-intent-secret-that-is-at-least-32-characters";
const now = new Date("2026-08-23T09:12:34.000Z");
const policyVersions = getCurrentLegalPolicyVersions();
const trackedUserIds = new Set<string>();
const trackedInstitutionIds = new Set<string>();

function signupContext(userId: string, occurredAt: Date = now) {
  return createUserCommandContext({ userId, occurredAt });
}

function signupInput(overrides: Record<string, unknown> = {}) {
  return {
    consents: [
      {
        type: "TERMS_OF_SERVICE",
        decision: "GRANTED",
        policyVersion: policyVersions.TERMS_OF_SERVICE,
      },
      {
        type: "PRIVACY_POLICY",
        decision: "GRANTED",
        policyVersion: policyVersions.PRIVACY_POLICY,
      },
    ],
    serviceEmailUpdatesConsent: true,
    ...overrides,
  };
}

async function createUserFixture(
  options: {
    status?: "PENDING" | "ACTIVE";
    withExistingData?: boolean;
  } = {},
): Promise<string> {
  const userId = randomUUID();
  trackedUserIds.add(userId);
  await runtime.client`
    insert into users (id, status, activated_at)
    values (
      ${userId},
      ${options.status ?? "PENDING"},
      ${options.status === "ACTIVE" ? now.toISOString() : null}
    )
  `;

  if (options.withExistingData) {
    await runtime.client.begin(async (transaction) => {
      await transaction`
        insert into user_emails (
          user_id, email, email_normalized, source,
          verification_state, delivery_state
        ) values (
          ${userId}, 'provider@example.test', 'provider@example.test', 'KAKAO',
          'VERIFIED', 'USABLE'
        )
      `;
      await transaction`
        insert into user_profiles (user_id, child_birth_year)
        values (${userId}, 2018)
      `;
      await transaction`
        insert into user_interest_regions (user_id, region_code)
        values (${userId}, 'BUSAN')
      `;
      await transaction`
        insert into user_interest_categories (user_id, category)
        values (${userId}, 'PRIVATE_ELEMENTARY')
      `;
      await transaction`
        insert into consent_decisions (
          user_id, consent_type, policy_version, decision, source, decided_at
        ) values (
          ${userId}, 'SERVICE_EMAIL_UPDATES', 'old-version', 'REVOKED',
          'ONBOARDING', ${"2026-01-01T00:00:00.000Z"}
        )
      `;
    });
  }

  return userId;
}

async function createInstitutionFixture(): Promise<string> {
  const institutionId = randomUUID();
  trackedInstitutionIds.add(institutionId);
  await runtime.client`
    insert into institutions (
      id, slug, display_name, category, publication_state, region_code,
      city, district, address_line, website_url, short_description, published_at
    ) values (
      ${institutionId}, ${`signup-school-${institutionId}`}, 'Safe School',
      'INTERNATIONAL_SCHOOL', 'PUBLISHED', 'SEOUL', 'Seoul', 'Jongno-gu',
      'sensitive address', 'https://secret.example.test', 'sensitive copy', ${now.toISOString()}
    )
  `;
  return institutionId;
}

async function createKakaoUserFixture(emailClaim: {
  value: string;
  valid: boolean;
  verified: boolean;
}): Promise<string> {
  const userId = randomUUID();
  trackedUserIds.add(userId);
  const user = await resolveKakaoIdentity(
    {
      subject: `signup-${randomUUID()}`,
      emailClaim,
    },
    {
      executor: runtime.executor,
      transactionManager: runtime.transactionManager,
      newUserId: () => userId,
    },
  );
  return user.id;
}

async function clearFixtures(): Promise<void> {
  if (trackedUserIds.size > 0) {
    const ids = [...trackedUserIds];
    await runtime.client.begin(async (transaction) => {
      await transaction.unsafe("set local session_replication_role = replica");
      await transaction`delete from notification_preferences where user_id in ${transaction(ids)}`;
      await transaction`delete from consent_decisions where user_id in ${transaction(ids)}`;
      await transaction`delete from user_interest_categories where user_id in ${transaction(ids)}`;
      await transaction`delete from user_interest_regions where user_id in ${transaction(ids)}`;
      await transaction`delete from user_profiles where user_id in ${transaction(ids)}`;
      await transaction`delete from user_emails where user_id in ${transaction(ids)}`;
      await transaction`delete from auth_identities where user_id in ${transaction(ids)}`;
      await transaction`delete from users where id in ${transaction(ids)}`;
    });
  }
  if (trackedInstitutionIds.size > 0) {
    await runtime.client`
      delete from institutions where id in ${runtime.client([...trackedInstitutionIds])}
    `;
  }
  trackedUserIds.clear();
  trackedInstitutionIds.clear();
}

async function forbiddenSideEffectsForUser(userId: string) {
  const [counts] = await runtime.client<
    {
      follows: number;
      episodes: number;
      notifications: number;
      deliveries: number;
      customer_outbox: number;
    }[]
  >`
    select
      (select count(*)::int from follows
       where user_id = ${userId}) as follows,
      (select count(*)::int from follow_episodes as episode
       join follows as follow on follow.id = episode.follow_id
       where follow.user_id = ${userId}) as episodes,
      (select count(distinct notification.id)::int
       from notifications as notification
       join notification_deliveries as delivery
         on delivery.notification_id = notification.id
       where delivery.user_id = ${userId}) as notifications,
      (select count(*)::int from notification_deliveries
       where user_id = ${userId}) as deliveries,
      (select count(*)::int from outbox_events
       where aggregate_type in ('User', 'Follow', 'Notification', 'Delivery')
         and (
           aggregate_id = ${userId}
           or payload ->> 'userId' = ${userId}
           or payload ->> 'user_id' = ${userId}
           or (aggregate_type = 'Follow' and aggregate_id in (
             select id from follows where user_id = ${userId}
           ))
           or (aggregate_type = 'Delivery' and aggregate_id in (
             select id from notification_deliveries where user_id = ${userId}
           ))
           or (aggregate_type = 'Notification' and aggregate_id in (
             select notification_id from notification_deliveries
             where user_id = ${userId}
           ))
         )) as customer_outbox
  `;
  return counts;
}

async function signupStateForUser(userId: string) {
  const [user, emails, profiles, regions, categories, consents, preferences] =
    await Promise.all([
      runtime.client`select * from users where id = ${userId}`,
      runtime.client`select * from user_emails where user_id = ${userId} order by id`,
      runtime.client`select * from user_profiles where user_id = ${userId}`,
      runtime.client`select * from user_interest_regions where user_id = ${userId} order by region_code`,
      runtime.client`select * from user_interest_categories where user_id = ${userId} order by category`,
      runtime.client`select * from consent_decisions where user_id = ${userId} order by decided_at, id`,
      runtime.client`select * from notification_preferences where user_id = ${userId} order by channel`,
    ]);

  return { user, emails, profiles, regions, categories, consents, preferences };
}

beforeAll(async () => {
  await schemaLockSql`select pg_advisory_lock(880008)`;
  try {
    await migrateDatabase(databaseUrl);
  } finally {
    await schemaLockSql`select pg_advisory_unlock(880008)`;
  }
});

afterEach(clearFixtures);

afterAll(async () => {
  await clearFixtures();
  await closeRuntimeDatabase();
  await schemaLockSql.end({ timeout: 5 });
});

describe("CompleteSignup", () => {
  it("atomically replaces optional signup data, appends consent, activates, then tracks", async () => {
    const userId = await createUserFixture({ withExistingData: true });
    const tracker = new TestAnalyticsTracker();
    const forbiddenBefore = await forbiddenSideEffectsForUser(userId);

    const result = await completeSignup(
      signupContext(userId),
      signupInput({
        email: "  Parent.Person@Example.COM  ",
        childBirthYear: 2020,
        interestRegions: [" seoul ", "SEOUL", " gyeonggi_do "],
        interestCategories: ["ENGLISH_KINDERGARTEN", "INTERNATIONAL_SCHOOL"],
      }),
      { transactionManager: runtime.transactionManager, tracker },
    );

    expect(result).toEqual({ userId, userState: "ACTIVE" });
    const [storedUser] = await runtime.client<
      { status: string; activated_at: Date }[]
    >`select status, activated_at from users where id = ${userId}`;
    expect(storedUser.status).toBe("ACTIVE");
    expect(new Date(storedUser.activated_at).toISOString()).toBe(
      now.toISOString(),
    );
    const [email] = await runtime.client<
      {
        email: string;
        email_normalized: string;
        source: string;
        verification_state: string;
        delivery_state: string;
      }[]
    >`
      select email, email_normalized, source, verification_state, delivery_state
      from user_emails where user_id = ${userId}
    `;
    expect(email).toEqual({
      email: "parent.person@example.com",
      email_normalized: "parent.person@example.com",
      source: "USER_INPUT",
      verification_state: "UNVERIFIED",
      delivery_state: "USABLE",
    });
    await expect(
      runtime.client`select child_birth_year from user_profiles where user_id = ${userId}`,
    ).resolves.toEqual([{ child_birth_year: 2020 }]);
    await expect(
      runtime.client`
        select region_code from user_interest_regions
        where user_id = ${userId} order by region_code
      `,
    ).resolves.toEqual([
      { region_code: "GYEONGGI_DO" },
      { region_code: "SEOUL" },
    ]);
    await expect(
      runtime.client`
        select category from user_interest_categories
        where user_id = ${userId} order by category
      `,
    ).resolves.toEqual([
      { category: "ENGLISH_KINDERGARTEN" },
      { category: "INTERNATIONAL_SCHOOL" },
    ]);
    const consent = await runtime.client<
      {
        consent_type: string;
        policy_version: string;
        decision: string;
        decided_at: Date;
      }[]
    >`
      select consent_type, policy_version, decision, decided_at
      from consent_decisions where user_id = ${userId}
      order by decided_at, consent_type
    `;
    expect(consent).toHaveLength(4);
    expect(consent[0]).toMatchObject({
      consent_type: "SERVICE_EMAIL_UPDATES",
      policy_version: "old-version",
      decision: "REVOKED",
    });
    expect(
      consent.slice(1).map((decision) => ({
        ...decision,
        decided_at: new Date(decision.decided_at).toISOString(),
      })),
    ).toEqual([
      {
        consent_type: "PRIVACY_POLICY",
        policy_version: policyVersions.PRIVACY_POLICY,
        decision: "GRANTED",
        decided_at: now.toISOString(),
      },
      {
        consent_type: "SERVICE_EMAIL_UPDATES",
        policy_version: policyVersions.SERVICE_EMAIL_UPDATES,
        decision: "GRANTED",
        decided_at: now.toISOString(),
      },
      {
        consent_type: "TERMS_OF_SERVICE",
        policy_version: policyVersions.TERMS_OF_SERVICE,
        decision: "GRANTED",
        decided_at: now.toISOString(),
      },
    ]);
    await expect(
      runtime.client`
        select channel, state from notification_preferences where user_id = ${userId}
      `,
    ).resolves.toEqual([{ channel: "EMAIL", state: "ENABLED" }]);
    expect(tracker.snapshot()).toEqual([
      { name: "signup_complete", properties: { context: "MY_PREPPY" } },
    ]);
    expect(await forbiddenSideEffectsForUser(userId)).toEqual(forbiddenBefore);
  });

  it("activates without optional data, records revocation, and swallows tracker failures", async () => {
    const userId = await createUserFixture();
    const tracker: AnalyticsTracker = {
      track() {
        throw new Error("analytics unavailable");
      },
    };

    await expect(
      completeSignup(
        signupContext(userId),
        signupInput({ serviceEmailUpdatesConsent: false }),
        { transactionManager: runtime.transactionManager, tracker },
      ),
    ).resolves.toEqual({ userId, userState: "ACTIVE" });

    await expect(
      runtime.client`select status from users where id = ${userId}`,
    ).resolves.toEqual([{ status: "ACTIVE" }]);
    await expect(
      runtime.client`select * from user_emails where user_id = ${userId}`,
    ).resolves.toHaveLength(0);
    await expect(
      runtime.client`select * from user_profiles where user_id = ${userId}`,
    ).resolves.toHaveLength(0);
    await expect(
      runtime.client`
        select consent_type, decision from consent_decisions
        where user_id = ${userId} order by consent_type
      `,
    ).resolves.toEqual([
      { consent_type: "PRIVACY_POLICY", decision: "GRANTED" },
      { consent_type: "SERVICE_EMAIL_UPDATES", decision: "REVOKED" },
      { consent_type: "TERMS_OF_SERVICE", decision: "GRANTED" },
    ]);
    await expect(
      runtime.client`
        select channel, state from notification_preferences where user_id = ${userId}
      `,
    ).resolves.toEqual([{ channel: "EMAIL", state: "DISABLED" }]);
  });

  it.each([
    ["unknown category", { interestCategories: ["DAYCARE"] }],
    ["oversized region", { interestRegions: ["X".repeat(33)] }],
    ["malformed region", { interestRegions: ["SEOUL WEST"] }],
    ["malformed email", { email: "not-an-email" }],
  ])("rejects %s before writing", async (_label, invalid) => {
    const userId = await createUserFixture();

    await expect(
      completeSignup(signupContext(userId), signupInput(invalid), {
        transactionManager: runtime.transactionManager,
        tracker: new TestAnalyticsTracker(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      runtime.client`select status from users where id = ${userId}`,
    ).resolves.toEqual([{ status: "PENDING" }]);
    await expect(
      runtime.client`select * from consent_decisions where user_id = ${userId}`,
    ).resolves.toHaveLength(0);
  });

  it.each([
    ["more than 18 years before the command", 2007],
    ["after the command year", 2027],
  ])("rejects a child birth year %s before writing", async (_label, year) => {
    const userId = await createUserFixture();

    await expect(
      completeSignup(
        signupContext(userId, new Date("2026-01-01T00:00:00.000Z")),
        signupInput({ childBirthYear: year }),
        {
          transactionManager: runtime.transactionManager,
          tracker: new TestAnalyticsTracker(),
        },
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      runtime.client`select status from users where id = ${userId}`,
    ).resolves.toEqual([{ status: "PENDING" }]);
    await expect(
      runtime.client`select * from consent_decisions where user_id = ${userId}`,
    ).resolves.toHaveLength(0);
  });

  it.each([2008, 2026])(
    "accepts inclusive child birth year boundary %i",
    async (year) => {
      const userId = await createUserFixture();

      await expect(
        completeSignup(
          signupContext(userId, new Date("2026-12-31T23:59:59.999Z")),
          signupInput({ childBirthYear: year }),
          {
            transactionManager: runtime.transactionManager,
            tracker: new TestAnalyticsTracker(),
          },
        ),
      ).resolves.toEqual({ userId, userState: "ACTIVE" });
      await expect(
        runtime.client`select child_birth_year from user_profiles where user_id = ${userId}`,
      ).resolves.toEqual([{ child_birth_year: year }]);
    },
  );

  it("rejects stale required policy versions without any writes", async () => {
    const userId = await createUserFixture();

    await expect(
      completeSignup(
        signupContext(userId),
        signupInput({
          consents: [
            {
              type: "TERMS_OF_SERVICE",
              decision: "GRANTED",
              policyVersion: "stale",
            },
            {
              type: "PRIVACY_POLICY",
              decision: "GRANTED",
              policyVersion: policyVersions.PRIVACY_POLICY,
            },
          ],
        }),
        {
          transactionManager: runtime.transactionManager,
          tracker: new TestAnalyticsTracker(),
        },
      ),
    ).rejects.toMatchObject({ code: "CONSENT_POLICY_UPDATED" });
    await expect(
      runtime.client`select status from users where id = ${userId}`,
    ).resolves.toEqual([{ status: "PENDING" }]);
    await expect(
      runtime.client`select * from consent_decisions where user_id = ${userId}`,
    ).resolves.toHaveLength(0);
  });

  it("rolls back every earlier write when activation persistence fails", async () => {
    const userId = await createUserFixture({ withExistingData: true });
    const tracker = new TestAnalyticsTracker();
    await runtime.client.begin(async (transaction) => {
      await transaction`
        insert into user_interest_regions (user_id, region_code)
        values (${userId}, 'INCHEON')
      `;
      await transaction`
        insert into user_interest_categories (user_id, category)
        values (${userId}, 'INTERNATIONAL_SCHOOL')
      `;
      await transaction`
        insert into notification_preferences (user_id, channel, state)
        values (${userId}, 'EMAIL', 'DISABLED')
      `;
    });
    const before = await signupStateForUser(userId);

    await expect(
      completeSignup(
        signupContext(userId),
        signupInput({
          email: "rollback@example.test",
          childBirthYear: 2021,
          interestRegions: ["SEOUL"],
          interestCategories: ["ENGLISH_KINDERGARTEN"],
        }),
        {
          transactionManager: runtime.transactionManager,
          tracker,
          persistence: {
            ...defaultCompleteSignupPersistence,
            activatePendingUser: async () => {
              throw new Error("forced post-write failure");
            },
          },
        },
      ),
    ).rejects.toThrow("forced post-write failure");

    expect(await signupStateForUser(userId)).toEqual(before);
    expect(tracker.snapshot()).toEqual([]);
    expect(await forbiddenSideEffectsForUser(userId)).toEqual({
      follows: 0,
      episodes: 0,
      notifications: 0,
      deliveries: 0,
      customer_outbox: 0,
    });
  });

  it("preserves an existing Kakao email exactly when email is omitted", async () => {
    const userId = await createUserFixture({ withExistingData: true });
    const before = await runtime.client`
      select * from user_emails where user_id = ${userId}
    `;

    await completeSignup(
      signupContext(userId),
      signupInput({ serviceEmailUpdatesConsent: false }),
      {
        transactionManager: runtime.transactionManager,
        tracker: new TestAnalyticsTracker(),
      },
    );

    await expect(
      runtime.client`select * from user_emails where user_id = ${userId}`,
    ).resolves.toEqual(before);
  });

  it.each([
    [
      "verified and usable",
      { valid: true, verified: true },
      { verification_state: "VERIFIED", delivery_state: "USABLE" },
    ],
    [
      "unverified and suppressed",
      { valid: false, verified: false },
      { verification_state: "UNVERIFIED", delivery_state: "SUPPRESSED" },
    ],
  ] as const)(
    "preserves a prefilled Kakao email byte-for-byte when it remains %s",
    async (_label, claimState, expectedState) => {
      // Mutation caught: treating the real prefilled Kakao address as a new
      // USER_INPUT address during completion.
      const providerEmail = "Provider.Parent@Example.COM";
      const userId = await createKakaoUserFixture({
        value: providerEmail,
        ...claimState,
      });
      const session = createUserSessionCookie(userId, {
        secret: sessionSecret,
        now,
      });
      const onboarding = await getOnboardingState(session.value, null, {
        executor: runtime.executor,
        sessionSecret,
        pendingIntentSecret: intentSecret,
        now,
      });
      const before = await runtime.client`
        select * from user_emails where user_id = ${userId}
      `;

      await completeSignup(
        signupContext(userId),
        signupInput({ email: onboarding.defaults.email }),
        {
          transactionManager: runtime.transactionManager,
          tracker: new TestAnalyticsTracker(),
        },
      );

      const after = await runtime.client`
        select * from user_emails where user_id = ${userId}
      `;
      expect(after).toEqual(before);
      expect(after).toMatchObject([
        {
          email: providerEmail,
          email_normalized: "provider.parent@example.com",
          source: "KAKAO",
          ...expectedState,
        },
      ]);
    },
  );

  it("replaces a genuinely changed prefilled Kakao address as user input", async () => {
    // Mutation caught: preserving provenance after the user actually changes
    // the normalized address shown by the onboarding query.
    const userId = await createKakaoUserFixture({
      value: "provider@example.test",
      valid: false,
      verified: false,
    });
    const session = createUserSessionCookie(userId, {
      secret: sessionSecret,
      now,
    });
    const onboarding = await getOnboardingState(session.value, null, {
      executor: runtime.executor,
      sessionSecret,
      pendingIntentSecret: intentSecret,
      now,
    });
    expect(onboarding.defaults.email).toBe("provider@example.test");

    await completeSignup(
      signupContext(userId),
      signupInput({ email: " Changed.Parent@Example.COM " }),
      {
        transactionManager: runtime.transactionManager,
        tracker: new TestAnalyticsTracker(),
      },
    );

    await expect(
      runtime.client`
        select email, email_normalized, source, verification_state,
               delivery_state, verified_at, last_bounced_at, removed_at
        from user_emails where user_id = ${userId}
      `,
    ).resolves.toEqual([
      {
        email: "changed.parent@example.com",
        email_normalized: "changed.parent@example.com",
        source: "USER_INPUT",
        verification_state: "UNVERIFIED",
        delivery_state: "USABLE",
        verified_at: null,
        last_bounced_at: null,
        removed_at: null,
      },
    ]);
  });

  it("allows the same normalized USER_INPUT email for two Users", async () => {
    const firstUserId = await createUserFixture();
    const secondUserId = await createUserFixture();
    const tracker = new TestAnalyticsTracker();

    await completeSignup(
      signupContext(firstUserId),
      signupInput({ email: " Shared.Parent@Example.COM " }),
      { transactionManager: runtime.transactionManager, tracker },
    );
    await completeSignup(
      signupContext(secondUserId),
      signupInput({ email: "shared.parent@example.com" }),
      { transactionManager: runtime.transactionManager, tracker },
    );

    await expect(
      runtime.client`
        select user_id, email_normalized, source from user_emails
        where user_id in (${firstUserId}, ${secondUserId})
        order by user_id
      `,
    ).resolves.toEqual(
      [firstUserId, secondUserId].sort().map((userId) => ({
        user_id: userId,
        email_normalized: "shared.parent@example.com",
        source: "USER_INPUT",
      })),
    );
  });

  it("rejects repeated completion for ACTIVE without appending history", async () => {
    const userId = await createUserFixture();
    const dependencies = {
      transactionManager: runtime.transactionManager,
      tracker: new TestAnalyticsTracker(),
    };
    await completeSignup(signupContext(userId), signupInput(), dependencies);

    await expect(
      completeSignup(signupContext(userId), signupInput(), dependencies),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const [{ count }] = await runtime.client<[{ count: number }]>`
      select count(*)::int as count from consent_decisions where user_id = ${userId}
    `;
    expect(count).toBe(3);
    expect(dependencies.tracker.snapshot()).toHaveLength(1);
  });

  it("serializes concurrent completion to one activation and one safe conflict", async () => {
    const userId = await createUserFixture();
    const tracker = new TestAnalyticsTracker();
    let activationCalls = 0;
    const persistence = {
      ...defaultCompleteSignupPersistence,
      activatePendingUser: async (
        ...args: Parameters<
          typeof defaultCompleteSignupPersistence.activatePendingUser
        >
      ) => {
        activationCalls += 1;
        return defaultCompleteSignupPersistence.activatePendingUser(...args);
      },
    };
    const ctx = signupContext(userId);
    const dependencies = {
      transactionManager: runtime.transactionManager,
      tracker,
      persistence,
    };

    const outcomes = await Promise.allSettled([
      completeSignup(ctx, signupInput(), dependencies),
      completeSignup(ctx, signupInput(), dependencies),
    ]);
    const fulfilled = outcomes.filter(
      (outcome) => outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0]).toMatchObject({
      value: { userId, userState: "ACTIVE" },
    });
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: { code: "CONFLICT" } });
    expect(activationCalls).toBe(1);
    await expect(
      runtime.client`select status, activated_at from users where id = ${userId}`,
    ).resolves.toEqual([
      { status: "ACTIVE", activated_at: "2026-08-23 09:12:34+00" },
    ]);
    await expect(
      runtime.client`
        select consent_type, decision from consent_decisions
        where user_id = ${userId} order by consent_type
      `,
    ).resolves.toEqual([
      { consent_type: "PRIVACY_POLICY", decision: "GRANTED" },
      { consent_type: "SERVICE_EMAIL_UPDATES", decision: "GRANTED" },
      { consent_type: "TERMS_OF_SERVICE", decision: "GRANTED" },
    ]);
    expect(tracker.snapshot()).toEqual([
      { name: "signup_complete", properties: { context: "MY_PREPPY" } },
    ]);
  });
});

describe("onboarding query", () => {
  it("returns PENDING-only safe defaults, manifest versions, and a safe intent target summary", async () => {
    const userId = await createUserFixture({ withExistingData: true });
    const institutionId = await createInstitutionFixture();
    const session = createUserSessionCookie(userId, {
      secret: sessionSecret,
      now,
    });
    const intent = createPendingFollowIntent(
      {
        institutionId,
        context: "INSTITUTION",
        returnPath: `/institutions/signup-school-${institutionId}`,
      },
      { secret: intentSecret, now },
    );

    const state = await getOnboardingState(session.value, intent, {
      executor: runtime.executor,
      sessionSecret,
      pendingIntentSecret: intentSecret,
      now,
    });

    expect(state).toEqual({
      userState: "PENDING",
      defaults: {
        email: "provider@example.test",
        childBirthYear: 2018,
        interestRegions: ["BUSAN"],
        interestCategories: ["PRIVATE_ELEMENTARY"],
        serviceEmailUpdatesConsent: false,
      },
      policyVersions,
      pendingInstitution: {
        id: institutionId,
        slug: `signup-school-${institutionId}`,
        displayName: "Safe School",
        category: "INTERNATIONAL_SCHOOL",
        regionCode: "SEOUL",
      },
    });
    expect(JSON.stringify(state)).not.toMatch(
      /providerSubject|accessToken|refreshToken|rawPayload|sensitive address|secret\.example/,
    );
  });

  it("rejects invalid or ACTIVE sessions and safely omits unknown intent targets", async () => {
    const pendingUserId = await createUserFixture();
    const activeUserId = await createUserFixture({ status: "ACTIVE" });
    const missingInstitutionId = randomUUID();
    const pendingSession = createUserSessionCookie(pendingUserId, {
      secret: sessionSecret,
      now,
    });
    const activeSession = createUserSessionCookie(activeUserId, {
      secret: sessionSecret,
      now,
    });
    const missingIntent = createPendingFollowIntent(
      {
        institutionId: missingInstitutionId,
        context: "INSTITUTION",
        returnPath: `/institutions/${missingInstitutionId}`,
      },
      { secret: intentSecret, now },
    );
    const dependencies = {
      executor: runtime.executor,
      sessionSecret,
      pendingIntentSecret: intentSecret,
      now,
    };

    await expect(
      getOnboardingState("tampered", null, dependencies),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      getOnboardingState(activeSession.value, null, dependencies),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      getOnboardingState(pendingSession.value, missingIntent, dependencies),
    ).resolves.toMatchObject({ pendingInstitution: null });
  });

  it.each([
    [
      "closed",
      "update institutions set operational_state = 'CLOSED' where id = $1",
    ],
    [
      "unpublished",
      "update institutions set publication_state = 'DRAFT' where id = $1",
    ],
    ["deleted", "delete from institutions where id = $1"],
  ] as const)(
    "ignores a pending target that becomes %s after intent issuance",
    async (_label, mutationSql) => {
      // Mutation caught: trusting the signed target without rechecking its
      // current Follow eligibility.
      const userId = await createUserFixture();
      const institutionId = await createInstitutionFixture();
      const session = createUserSessionCookie(userId, {
        secret: sessionSecret,
        now,
      });
      const intent = createPendingFollowIntent(
        {
          institutionId,
          context: "INSTITUTION",
          returnPath: `/institutions/signup-school-${institutionId}`,
        },
        { secret: intentSecret, now },
      );
      await runtime.client.unsafe(mutationSql, [institutionId]);

      await expect(
        getOnboardingState(session.value, intent, {
          executor: runtime.executor,
          sessionSecret,
          pendingIntentSecret: intentSecret,
          now,
        }),
      ).resolves.toMatchObject({ pendingInstitution: null });
    },
  );

  it("derives the current canonical slug after intent issuance", async () => {
    // Mutation caught: returning the path embedded in the signed cookie rather
    // than resolving the canonical Institution ID again.
    const userId = await createUserFixture();
    const institutionId = await createInstitutionFixture();
    const session = createUserSessionCookie(userId, {
      secret: sessionSecret,
      now,
    });
    const intent = createPendingFollowIntent(
      {
        institutionId,
        context: "INSTITUTION",
        returnPath: `/institutions/signup-school-${institutionId}`,
      },
      { secret: intentSecret, now },
    );
    const currentSlug = `renamed-school-${institutionId}`;
    await runtime.client`
      update institutions set slug = ${currentSlug} where id = ${institutionId}
    `;

    await expect(
      getOnboardingState(session.value, intent, {
        executor: runtime.executor,
        sessionSecret,
        pendingIntentSecret: intentSecret,
        now,
      }),
    ).resolves.toMatchObject({
      pendingInstitution: { id: institutionId, slug: currentSlug },
    });
  });
});
