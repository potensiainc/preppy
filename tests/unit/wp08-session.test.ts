import { describe, expect, it } from "vitest";

import {
  clearUserSessionCookie,
  createUserSessionCookie,
  readUserSession,
  USER_SESSION_COOKIE_NAME,
  USER_SESSION_TTL_SECONDS,
} from "@/src/modules/auth/session.server";

const sessionSecret = "session-secret-that-is-at-least-thirty-two-characters";
const now = new Date("2026-08-23T01:02:03.000Z");
const userId = "550e8400-e29b-41d4-a716-446655440000";

describe("PREPPY application session", () => {
  it("round-trips only the canonical user id and bounded session metadata", () => {
    const cookie = createUserSessionCookie(userId, {
      secret: sessionSecret,
      now,
      production: true,
    });

    expect(cookie).toEqual({
      name: USER_SESSION_COOKIE_NAME,
      value: expect.any(String),
      attributes: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: USER_SESSION_TTL_SECONDS,
      },
    });
    expect(
      readUserSession(cookie.value, { secret: sessionSecret, now }),
    ).toEqual({
      version: 1,
      userId,
      issuedAt: Math.floor(now.getTime() / 1_000),
      expiresAt: Math.floor(now.getTime() / 1_000) + USER_SESSION_TTL_SECONDS,
    });
    expect(cookie.value).not.toContain(userId);
    expect(
      Object.keys(
        readUserSession(cookie.value, {
          secret: sessionSecret,
          now,
        })!,
      ),
    ).toEqual(["version", "userId", "issuedAt", "expiresAt"]);
  });

  it("rejects tampered, expired, malformed, and wrong-purpose values as anonymous", () => {
    const cookie = createUserSessionCookie(userId, {
      secret: sessionSecret,
      now,
    });
    const tampered = `${cookie.value.slice(0, -1)}${
      cookie.value.endsWith("A") ? "B" : "A"
    }`;

    expect(
      readUserSession(tampered, { secret: sessionSecret, now }),
    ).toBeNull();
    expect(
      readUserSession(cookie.value, {
        secret: sessionSecret,
        now: new Date(now.getTime() + USER_SESSION_TTL_SECONDS * 1_000),
      }),
    ).toBeNull();
    expect(
      readUserSession("not-a-session", { secret: sessionSecret, now }),
    ).toBeNull();
    expect(
      readUserSession(cookie.value, {
        secret: "different-session-secret-that-is-long-enough-for-use",
        now,
      }),
    ).toBeNull();
  });

  it("rejects a noncanonical user id before issuing a cookie", () => {
    expect(() =>
      createUserSessionCookie("123456", { secret: sessionSecret, now }),
    ).toThrow();
  });

  it("exposes a host-only clear descriptor that expires the same cookie", () => {
    expect(clearUserSessionCookie({ production: false })).toEqual({
      name: USER_SESSION_COOKIE_NAME,
      value: "",
      attributes: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      },
    });
    expect("domain" in clearUserSessionCookie()).toBe(false);
  });
});
