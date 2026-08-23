import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  getCurrentUser,
  getSessionUser,
  requireCurrentUser,
} from "@/src/application/current-user.server";
import { UnauthenticatedError } from "@/src/application/errors";
import { migrateDatabase } from "@/src/db/migrate";
import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import { resolveKakaoIdentity } from "@/src/modules/auth/identity-service.server";
import { createUserSessionCookie } from "@/src/modules/auth/session.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set for database integration tests",
  );
}

assertDedicatedTestDatabaseUrl(databaseUrl);

const prefix = `wp-08-identity-${randomUUID()}-`;
const sessionSecret = "session-secret-that-is-at-least-thirty-two-characters";
const runtime = getRuntimeDatabase({
  DATABASE_URL: databaseUrl,
  DATABASE_MAX_CONNECTIONS: 16,
  NODE_ENV: "test",
});
const schemaLockSql = postgres(databaseUrl, { max: 1 });
const trackedUserIds = new Set<string>();

async function createIdentityFixture(options: {
  subject: string;
  userStatus: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
  identityStatus?: "ACTIVE" | "REVOKED";
  email?: string;
}): Promise<string> {
  const userId = randomUUID();
  trackedUserIds.add(userId);
  await runtime.client.begin(async (transaction) => {
    await transaction`
      insert into users (id, status) values (${userId}, ${options.userStatus})
    `;
    await transaction`
      insert into auth_identities (
        user_id, provider, provider_subject, status, revoked_at
      ) values (
        ${userId}, 'KAKAO', ${options.subject},
        ${options.identityStatus ?? "ACTIVE"},
        ${options.identityStatus === "REVOKED" ? new Date().toISOString() : null}
      )
    `;
    if (options.email) {
      await transaction`
        insert into user_emails (
          user_id, email, email_normalized, source,
          verification_state, delivery_state
        ) values (
          ${userId}, ${options.email}, ${options.email.toLowerCase()}, 'KAKAO',
          'VERIFIED', 'USABLE'
        )
      `;
    }
  });
  return userId;
}

async function clearFixtures(): Promise<void> {
  const subjectPattern = `${prefix}%`;
  await runtime.client.begin(async (transaction) => {
    await transaction`
      delete from user_emails where user_id in (
        select user_id from auth_identities
        where provider = 'KAKAO' and provider_subject like ${subjectPattern}
      )
    `;
    await transaction`
      delete from auth_identities
      where provider = 'KAKAO' and provider_subject like ${subjectPattern}
    `;
    if (trackedUserIds.size > 0) {
      await transaction`
        delete from users where id in ${transaction([...trackedUserIds])}
      `;
    }
  });
  trackedUserIds.clear();
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

describe("Kakao canonical identity resolution", () => {
  it("creates one PENDING User, active identity, and claim-reflective Kakao email atomically", async () => {
    const subject = `${prefix}new`;
    const user = await resolveKakaoIdentity(
      {
        subject,
        emailClaim: {
          value: "New.Person@Example.COM",
          valid: true,
          verified: false,
        },
      },
      runtime,
    );
    trackedUserIds.add(user.id);

    expect(user).toMatchObject({ status: "PENDING" });
    const [stored] = await runtime.client<
      {
        user_id: string;
        provider: string;
        provider_subject: string;
        identity_status: string;
        email: string;
        email_normalized: string;
        source: string;
        verification_state: string;
        delivery_state: string;
      }[]
    >`
      select identity.user_id, identity.provider, identity.provider_subject,
             identity.status as identity_status, email.email,
             email.email_normalized, email.source,
             email.verification_state, email.delivery_state
      from auth_identities as identity
      join user_emails as email on email.user_id = identity.user_id
      where identity.provider = 'KAKAO' and identity.provider_subject = ${subject}
    `;
    expect(stored).toEqual({
      user_id: user.id,
      provider: "KAKAO",
      provider_subject: subject,
      identity_status: "ACTIVE",
      email: "New.Person@Example.COM",
      email_normalized: "new.person@example.com",
      source: "KAKAO",
      verification_state: "UNVERIFIED",
      delivery_state: "USABLE",
    });
  });

  it("returns an existing ACTIVE or PENDING canonical User without replacing its email", async () => {
    for (const status of ["ACTIVE", "PENDING"] as const) {
      const subject = `${prefix}existing-${status}`;
      const userId = await createIdentityFixture({
        subject,
        userStatus: status,
        email: `${status.toLowerCase()}@example.test`,
      });

      const user = await resolveKakaoIdentity(
        {
          subject,
          emailClaim: {
            value: `changed-${status.toLowerCase()}@example.test`,
            valid: true,
            verified: true,
          },
        },
        runtime,
      );

      expect(user).toMatchObject({ id: userId, status });
      const [email] = await runtime.client<
        { email: string; email_normalized: string }[]
      >`select email, email_normalized from user_emails where user_id = ${userId}`;
      expect(email).toEqual({
        email: `${status.toLowerCase()}@example.test`,
        email_normalized: `${status.toLowerCase()}@example.test`,
      });
    }
  });

  it.each([
    ["SUSPENDED", "ACTIVE"],
    ["DELETED", "ACTIVE"],
    ["ACTIVE", "REVOKED"],
  ] as const)(
    "denies %s User with %s identity without changing either status",
    async (userStatus, identityStatus) => {
      const subject = `${prefix}denied-${userStatus}-${identityStatus}`;
      const userId = await createIdentityFixture({
        subject,
        userStatus,
        identityStatus,
      });

      await expect(
        resolveKakaoIdentity({ subject }, runtime),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const [stored] = await runtime.client<
        { user_status: string; identity_status: string }[]
      >`
        select users.status as user_status, identity.status as identity_status
        from users join auth_identities as identity on identity.user_id = users.id
        where users.id = ${userId}
      `;
      expect(stored).toEqual({
        user_status: userStatus,
        identity_status: identityStatus,
      });
    },
  );

  it("collapses concurrent callbacks for one subject to one canonical User without an orphan loser", async () => {
    const subject = `${prefix}concurrent`;
    const unrelatedUserId = randomUUID();
    const candidateUserIds = Array.from({ length: 12 }, () => randomUUID());
    const issuedCandidateUserIds: string[] = [];
    let nextCandidate = 0;
    trackedUserIds.add(unrelatedUserId);
    for (const userId of candidateUserIds) trackedUserIds.add(userId);

    const [resolved] = await Promise.all([
      Promise.all(
        Array.from({ length: 12 }, () =>
          resolveKakaoIdentity(
            { subject },
            {
              ...runtime,
              newUserId: () => {
                const candidateUserId = candidateUserIds[nextCandidate++]!;
                issuedCandidateUserIds.push(candidateUserId);
                return candidateUserId;
              },
            },
          ),
        ),
      ),
      runtime.client`
        insert into users (id, status) values (${unrelatedUserId}, 'PENDING')
      `,
    ]);
    const userIds = new Set(resolved.map((user) => user.id));
    for (const userId of userIds) trackedUserIds.add(userId);

    const candidateUsers = await runtime.client<{ id: string }[]>`
      select id from users where id in ${runtime.client(candidateUserIds)}
    `;
    const unrelatedUsers = await runtime.client<{ id: string }[]>`
      select id from users where id = ${unrelatedUserId}
    `;
    const [{ identity_count: identityCount, user_count: linkedUserCount }] =
      await runtime.client<{ identity_count: number; user_count: number }[]>`
        select count(*)::int as identity_count,
               count(distinct user_id)::int as user_count
        from auth_identities
        where provider = 'KAKAO' and provider_subject = ${subject}
      `;

    expect(userIds.size).toBe(1);
    expect(nextCandidate).toBe(candidateUserIds.length);
    expect(issuedCandidateUserIds).toEqual(candidateUserIds);
    expect(new Set(issuedCandidateUserIds).size).toBe(candidateUserIds.length);
    expect(identityCount).toBe(1);
    expect(linkedUserCount).toBe(1);
    expect(candidateUsers).toEqual([{ id: [...userIds][0] }]);
    expect(candidateUserIds.length - candidateUsers.length).toBe(11);
    expect(unrelatedUsers).toEqual([{ id: unrelatedUserId }]);
  });
});

describe("application current User resolution", () => {
  it("allows PENDING only through getSessionUser and re-reads status for ACTIVE access", async () => {
    const subject = `${prefix}session-status`;
    const userId = await createIdentityFixture({
      subject,
      userStatus: "PENDING",
    });
    const cookie = createUserSessionCookie(userId, {
      secret: sessionSecret,
    });
    const options = { secret: sessionSecret, executor: runtime.executor };

    await expect(getSessionUser(cookie.value, options)).resolves.toMatchObject({
      id: userId,
      status: "PENDING",
    });
    await expect(getCurrentUser(cookie.value, options)).resolves.toBeNull();
    await runtime.client`update users set status = 'ACTIVE' where id = ${userId}`;
    await expect(getCurrentUser(cookie.value, options)).resolves.toMatchObject({
      id: userId,
      status: "ACTIVE",
    });
    await runtime.client`
      update users set status = 'SUSPENDED', suspended_at = now()
      where id = ${userId}
    `;
    await expect(getSessionUser(cookie.value, options)).resolves.toBeNull();
    await expect(getCurrentUser(cookie.value, options)).resolves.toBeNull();
    await expect(
      requireCurrentUser(cookie.value, options),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("treats invalid cookies and DELETED Users as anonymous", async () => {
    const subject = `${prefix}deleted-session`;
    const userId = await createIdentityFixture({
      subject,
      userStatus: "DELETED",
    });
    const cookie = createUserSessionCookie(userId, {
      secret: sessionSecret,
    });
    const options = { secret: sessionSecret, executor: runtime.executor };

    await expect(getSessionUser("tampered", options)).resolves.toBeNull();
    await expect(getSessionUser(cookie.value, options)).resolves.toBeNull();
    await expect(getCurrentUser(cookie.value, options)).resolves.toBeNull();
  });
});
