import { describe, expect, it, vi } from "vitest";

import { createUserSessionCookie } from "@/src/modules/auth/session.server";
import { getFollowStatus } from "@/src/modules/follow/status-query.server";

const secret = "status-session-secret-that-is-at-least-thirty-two-bytes";
const now = new Date("2026-08-23T09:10:11.000Z");
const userId = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const institutionId = "550e8400-e29b-41d4-a716-446655440000";
const executor = { scope: "runtime" } as never;

function sessionCookie(at = now): string {
  return createUserSessionCookie(userId, {
    secret,
    now: at,
    production: false,
  }).value;
}

describe("WP-09 authoritative private Follow status query", () => {
  it.each(["PENDING", "SUSPENDED", "DELETED"] as const)(
    "cannot retain an earlier ACTIVE authorization when User becomes %s before the Follow projection",
    async (deniedState) => {
      // Mutation caught: restoring the two-statement User-then-Follow read,
      // which can authorize ACTIVE before a denied-state commit and personalize afterward.
      let currentState: "ACTIVE" | typeof deniedState = "ACTIVE";
      const splitUserRead = vi.fn().mockImplementation(async () => {
        const observed = currentState;
        currentState = deniedState;
        return { id: userId, status: observed };
      });
      const splitFollowRead = vi.fn().mockResolvedValue("ACTIVE");
      const authoritativeRead = vi.fn().mockImplementation(async () => {
        currentState = deniedState;
        return null;
      });
      const dependencies = {
        executor,
        sessionSecret: secret,
        now,
        findUserById: splitUserRead,
        findFollowStatus: splitFollowRead,
        findAuthorizedFollowStatus: authoritativeRead,
      };

      const result = await getFollowStatus(
        sessionCookie(),
        institutionId,
        dependencies,
      );

      expect(result).toEqual({ authenticated: false, following: false });
      expect(authoritativeRead).toHaveBeenCalledTimes(1);
      expect(splitUserRead).not.toHaveBeenCalled();
      expect(splitFollowRead).not.toHaveBeenCalled();
    },
  );

  it.each(["PENDING", "SUSPENDED", "DELETED"] as const)(
    "denies a current DB %s user as anonymous-safe",
    async () => {
      // Mutation caught: treating any existing session User as currently authorized.
      const authoritativeRead = vi.fn().mockResolvedValue(null);
      const result = await getFollowStatus(sessionCookie(), institutionId, {
        executor,
        sessionSecret: secret,
        now,
        findAuthorizedFollowStatus: authoritativeRead,
      });

      expect(result).toEqual({ authenticated: false, following: false });
      expect(authoritativeRead).toHaveBeenCalledWith(
        executor,
        userId,
        institutionId,
      );
    },
  );

  it.each([
    [null],
    ["tampered"],
    [sessionCookie(new Date("2026-08-21T09:10:11.000Z"))],
  ])(
    "returns anonymous-safe before DB access for invalid/stale cookie %s",
    async (cookie) => {
      // Mutation caught: reading private state for an invalid or expired signed session.
      const authoritativeRead = vi.fn();
      const result = await getFollowStatus(cookie, institutionId, {
        executor,
        sessionSecret: secret,
        now,
        findAuthorizedFollowStatus: authoritativeRead,
      });

      expect(result).toEqual({ authenticated: false, following: false });
      expect(authoritativeRead).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    "returns the one-statement ACTIVE projection following=%s",
    async (following) => {
      // Mutation caught: discarding or fabricating the logical Follow state returned with authorization.
      const result = await getFollowStatus(sessionCookie(), institutionId, {
        executor,
        sessionSecret: secret,
        now,
        findAuthorizedFollowStatus: vi.fn().mockResolvedValue({
          authenticated: true,
          following,
        }),
      });

      expect(result).toEqual({ authenticated: true, following });
    },
  );

  it("fails closed before any DB read for a malformed Institution target", async () => {
    // Mutation caught: allowing an unvalidated target into the private repository predicate.
    const authoritativeRead = vi.fn();
    const result = await getFollowStatus(sessionCookie(), "not-a-uuid", {
      executor,
      sessionSecret: secret,
      now,
      findAuthorizedFollowStatus: authoritativeRead,
    });

    expect(result).toEqual({ authenticated: false, following: false });
    expect(authoritativeRead).not.toHaveBeenCalled();
  });
});
