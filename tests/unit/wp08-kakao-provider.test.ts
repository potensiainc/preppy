import { describe, expect, it } from "vitest";

import {
  createKakaoProvider,
  type KakaoProviderConfig,
} from "@/src/modules/auth/kakao-provider.server";

const config: KakaoProviderConfig = {
  clientId: "kakao-rest-api-key",
  clientSecret: "kakao-client-secret",
  redirectUri: "https://preppy.example/auth/kakao/callback",
};

function oversizedBody(options?: { declared?: boolean }) {
  let cancelled = false;
  let chunk = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (chunk < 2) {
          chunk += 1;
          controller.enqueue(new Uint8Array(40 * 1_024));
        } else {
          controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    },
    {
      highWaterMark: 0,
    },
  );
  return {
    response: new Response(stream, {
      headers: options?.declared ? { "content-length": "65537" } : undefined,
    }),
    wasCancelled: () => cancelled,
  };
}

describe("Kakao provider boundary", () => {
  it("builds an authorization URL from fixed provider parameters and browser state", () => {
    const provider = createKakaoProvider(config, async () => {
      throw new Error("network should not be called");
    });

    expect(provider.buildAuthorizationUrl("browser-state")).toBe(
      "https://kauth.kakao.com/oauth/authorize?client_id=kakao-rest-api-key&redirect_uri=https%3A%2F%2Fpreppy.example%2Fauth%2Fkakao%2Fcallback&response_type=code&state=browser-state&scope=account_email",
    );
  });

  it("exchanges a code through an opaque grant and resolves only normalized identity", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });

      if (url === "https://kauth.kakao.com/oauth/token") {
        return Response.json({
          token_type: "bearer",
          access_token: "sensitive-access-token",
          expires_in: 21_599,
          refresh_token: "sensitive-refresh-token",
          refresh_token_expires_in: 5_184_000,
          scope: "account_email",
        });
      }

      return Response.json({
        id: 123456789,
        connected_at: "2026-08-23T00:00:00Z",
        has_signed_up: true,
        properties: { nickname: "Raw Name" },
        kakao_account: {
          profile_needs_agreement: false,
          email_needs_agreement: false,
          is_email_valid: true,
          is_email_verified: true,
          email: "approved@example.com",
          profile: { nickname: "Raw Name" },
        },
      });
    };
    const provider = createKakaoProvider(config, fetchImpl);

    const grant = await provider.exchangeCode("authorization-code");
    expect(JSON.stringify(grant)).toBe("{}");
    expect(Object.values(grant)).not.toContain("sensitive-access-token");

    await expect(provider.resolveIdentity(grant)).resolves.toEqual({
      subject: "123456789",
      emailClaim: {
        value: "approved@example.com",
        valid: true,
        verified: true,
      },
    });

    expect(requests[0]?.url).toBe("https://kauth.kakao.com/oauth/token");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(String(requests[0]?.init?.body)).toBe(
      "grant_type=authorization_code&client_id=kakao-rest-api-key&redirect_uri=https%3A%2F%2Fpreppy.example%2Fauth%2Fkakao%2Fcallback&code=authorization-code&client_secret=kakao-client-secret",
    );
    expect(requests[1]?.url).toBe("https://kapi.kakao.com/v2/user/me");
    expect(new Headers(requests[1]?.init?.headers).get("authorization")).toBe(
      "Bearer sensitive-access-token",
    );
  });

  it("omits unapproved email and omits an unset client secret", async () => {
    const requests: RequestInit[] = [];
    const provider = createKakaoProvider(
      { ...config, clientSecret: undefined },
      async (input, init) => {
        requests.push(init ?? {});
        if (String(input).includes("oauth/token")) {
          return Response.json({
            token_type: "bearer",
            access_token: "access-token",
            expires_in: 21_599,
            refresh_token: "refresh-token",
            refresh_token_expires_in: 5_184_000,
          });
        }
        return Response.json({
          id: "987654321",
          kakao_account: {
            email_needs_agreement: true,
            is_email_valid: true,
            is_email_verified: true,
            email: "not-approved@example.com",
          },
        });
      },
    );

    const identity = await provider.resolveIdentity(
      await provider.exchangeCode("authorization-code"),
    );

    expect(identity).toEqual({ subject: "987654321" });
    expect(String(requests[0]?.body)).not.toContain("client_secret");
  });

  it("rejects provider failures and malformed responses without exposing secrets", async () => {
    const provider = createKakaoProvider(config, async () =>
      Response.json(
        {
          error: "invalid_grant",
          error_description: "sensitive-code sensitive-access-token",
        },
        { status: 400 },
      ),
    );

    const error = await provider.exchangeCode("sensitive-code").catch(String);
    expect(error).toContain("Kakao token exchange failed");
    expect(error).not.toContain("sensitive-code");
    expect(error).not.toContain("sensitive-access-token");
  });

  it("redacts credential-bearing network failures during identity resolution", async () => {
    const provider = createKakaoProvider(config, async (input) => {
      if (String(input).includes("oauth/token")) {
        return Response.json({
          token_type: "bearer",
          access_token: "network-sensitive-token",
          expires_in: 21_599,
          refresh_token: "network-sensitive-refresh-token",
          refresh_token_expires_in: 5_184_000,
        });
      }
      throw new Error("request failed with Bearer network-sensitive-token");
    });
    const grant = await provider.exchangeCode("authorization-code");

    const error = await provider.resolveIdentity(grant).catch(String);
    expect(error).toContain("Kakao identity resolution failed");
    expect(error).not.toContain("network-sensitive-token");
  });

  it.each([
    ["declared", true],
    ["chunked", false],
  ])(
    "rejects and cancels %s oversized token responses before decoding",
    async (_case, declared) => {
      const oversized = oversizedBody({ declared });
      const provider = createKakaoProvider(
        config,
        async () => oversized.response,
      );

      await expect(provider.exchangeCode("authorization-code")).rejects.toThrow(
        "Kakao token exchange failed",
      );
      expect(oversized.wasCancelled()).toBe(true);
    },
  );

  it("redacts credential-bearing body-stream failures", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode("fake-sensitive-provider-payload"),
        );
        controller.error(
          new Error("stream failed with fake-sensitive-provider-payload"),
        );
      },
    });
    const provider = createKakaoProvider(config, async () =>
      Promise.resolve(new Response(stream)),
    );

    const error = await provider
      .exchangeCode("authorization-code")
      .catch(String);
    expect(error).toContain("Kakao token exchange failed");
    expect(error).not.toContain("fake-sensitive-provider-payload");
  });

  it.each([
    ["malformed JSON", new Response('{"access_token":"fake-sensitive-token"')],
    [
      "schema-invalid JSON",
      Response.json({
        token_type: "bearer",
        access_token: "fake-sensitive-token",
      }),
    ],
  ])("maps %s token responses to a generic error", async (_case, response) => {
    const provider = createKakaoProvider(config, async () => response);

    const error = await provider
      .exchangeCode("authorization-code")
      .catch(String);
    expect(error).toContain("Kakao token exchange failed");
    expect(error).not.toContain("fake-sensitive-token");
  });
});
