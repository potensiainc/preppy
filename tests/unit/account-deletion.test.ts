import { describe, it, expect } from "vitest";
import { createDeletionHandlers } from "@/src/modules/account-deletion/http.server";
import { createUserSessionCookie } from "@/src/modules/auth/session.server";
import { unlinkKakao } from "@/src/modules/account-deletion/kakao.server";
const now = new Date("2026-09-25T01:00:00Z");
const secret = "test-only-secret-of-at-least-thirty-two-bytes";
const userId = "00000000-0000-4000-8000-000000000001";
function setup() {
  let requests = 0;
  const handlers = createDeletionHandlers({
    enabled: true,
    appBaseUrl: "https://preppy.test",
    sessionSecret: secret,
    receiptSecret: secret,
    now: () => now,
    request: async () => {
      requests++;
      return {
        receiptId: "00000000-0000-4000-8000-000000000002",
        status: "PENDING" as const,
      };
    },
    status: async () => "PENDING" as const,
  });
  const post = (
    options: { origin?: string; session?: string; body?: unknown } = {},
  ) =>
    handlers.POST(
      new Request("https://preppy.test/api/me/account/deletion", {
        method: "POST",
        headers: {
          origin: options.origin ?? "https://preppy.test",
          "content-type": "application/json",
          cookie:
            options.session ??
            `${createUserSessionCookie(userId, { secret, now, oauthAuthenticatedAt: Math.floor(now.getTime() / 1000) }).name}=${createUserSessionCookie(userId, { secret, now, oauthAuthenticatedAt: Math.floor(now.getTime() / 1000) }).value}`,
        },
        body: JSON.stringify(options.body ?? { confirm: true }),
      }),
    );
  return { handlers, post, requests: () => requests };
}
describe("deletion HTTP boundary", () => {
  it("rejects cross-origin and unsigned requests before mutation", async () => {
    const s = setup();
    expect((await s.post({ origin: "https://evil.test" })).status).toBe(403);
    expect((await s.post({ session: "" })).status).toBe(401);
    expect(s.requests()).toBe(0);
  });
  it("requires recent authentication and explicit confirmation", async () => {
    const s = setup();
    const old = createUserSessionCookie(userId, {
      secret,
      now: new Date(now.getTime() - 601000),
      oauthAuthenticatedAt: Math.floor(now.getTime() / 1000) - 601,
    });
    expect((await s.post({ session: `${old.name}=${old.value}` })).status).toBe(
      409,
    );
    expect((await s.post({ body: { confirm: false, userId } })).status).toBe(
      400,
    );
    expect(s.requests()).toBe(0);
  });
  it("returns pending, clears session and issues unguessable cookie-based receipt", async () => {
    const s = setup();
    const response = await s.post();
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ status: "PENDING" });
    expect(response.headers.get("set-cookie")).toContain(
      "preppy_deletion_receipt=",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("does not disclose status without receipt or accept account identifiers", async () => {
    const s = setup();
    expect(
      (
        await s.handlers.GET(
          new Request(
            `https://preppy.test/api/me/account/deletion?userId=${userId}`,
          ),
        )
      ).status,
    ).toBe(401);
  });
});
describe("Kakao unlink", () => {
  it("only accepts confirmed same-user success or documented not-linked code", async () => {
    const request = async () =>
      new Response(JSON.stringify({ id: 123 }), { status: 200 });
    await expect(
      unlinkKakao("123", "test-key", request),
    ).resolves.toBeUndefined();
    await expect(unlinkKakao("456", "test-key", request)).rejects.toThrow();
    await expect(
      unlinkKakao(
        "123",
        "test-key",
        async () =>
          new Response(JSON.stringify({ code: -101 }), { status: 400 }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      unlinkKakao(
        "123",
        "test-key",
        async () =>
          new Response(JSON.stringify({ code: -401 }), { status: 401 }),
      ),
    ).rejects.toThrow();
  });
});

import {
  encryptSubject,
  decryptSubject,
  subjectFingerprint,
} from "@/src/modules/account-deletion/crypto.server";
describe("deletion identifier protection", () => {
  it("authenticates encrypted retry identifiers and keeps deterministic blocking fingerprint", () => {
    const key = "ab".repeat(32);
    const encrypted = encryptSubject("123456", key);
    expect(encrypted).not.toContain("123456");
    expect(decryptSubject(encrypted, key)).toBe("123456");
    expect(() => decryptSubject(encrypted, "cd".repeat(32))).toThrow();
    expect(subjectFingerprint("123456")).toMatch(/^[a-f0-9]{64}$/);
    expect(subjectFingerprint("123456")).not.toBe(subjectFingerprint("123457"));
  });
});

import { createKakaoUnlinkWebhook } from "@/src/modules/account-deletion/webhook.server";
describe("Kakao legacy unlink callback", () => {
  it("requires the configured admin authorization and app ID before durable intake", async () => {
    let accepted = 0;
    const handler = createKakaoUnlinkWebhook({
      adminKey: "test-admin-key",
      appId: "123",
      accept: async () => {
        accepted++;
      },
    });
    const request = (auth: string, appId: string) =>
      new Request("https://preppy.test/api/webhooks/kakao/unlink", {
        method: "POST",
        headers: {
          authorization: auth,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          app_id: appId,
          user_id: "456",
          referrer_type: "UNLINK_FROM_APPS",
        }),
      });
    expect((await handler(request("KakaoAK forged", "123"))).status).toBe(401);
    expect(
      (await handler(request("KakaoAK test-admin-key", "999"))).status,
    ).toBe(400);
    expect(accepted).toBe(0);
    expect(
      (await handler(request("KakaoAK test-admin-key", "123"))).status,
    ).toBe(200);
    expect(accepted).toBe(1);
  });
  it("does not acknowledge a callback that failed durable intake", async () => {
    const handler = createKakaoUnlinkWebhook({
      adminKey: "test-admin-key",
      appId: "123",
      accept: async () => {
        throw new Error("DB unavailable");
      },
    });
    const response = await handler(
      new Request("https://preppy.test/api/webhooks/kakao/unlink", {
        method: "POST",
        headers: {
          authorization: "KakaoAK test-admin-key",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "app_id=123&user_id=456&referrer_type=UNLINK_FROM_APPS",
      }),
    );
    expect(response.status).toBe(503);
  });
});

import { completeReviewedDeletion } from "@/src/modules/account-deletion/review.server";
describe("operator completion evidence", () => {
  it("rejects missing erasure evidence before opening a DB transaction", async () => {
    let touched = false;
    const db = {
      executor: {} as never,
      transactionManager: {
        run: async () => {
          touched = true;
          throw new Error("must not run");
        },
      },
    };
    await expect(
      completeReviewedDeletion(db, {
        receiptId: userId,
        reference: "OPS-123",
        externalErasureConfirmed: true,
        backupErasureConfirmed: false,
        logErasureConfirmed: true,
      }),
    ).rejects.toThrow();
    expect(touched).toBe(false);
  });
});
