import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/auth/session/route";

describe("WP-UI-01 anonymous Preview session status", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns anonymous without initializing an unconfigured Kakao capability", async () => {
    for (const key of [
      "KAKAO_CLIENT_ID",
      "KAKAO_CLIENT_SECRET",
      "KAKAO_REDIRECT_URI",
      "USER_SESSION_SECRET",
      "OAUTH_STATE_SECRET",
      "FOLLOW_INTENT_SECRET",
    ]) {
      vi.stubEnv(key, undefined);
    }

    const response = await GET(
      new Request("https://preppy-preview.example/api/auth/session"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ authenticated: false });
  });
});
