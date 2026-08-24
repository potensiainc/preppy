import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  getAdminAuthConfig,
  type AdminAuthConfig,
} from "@/src/modules/admin/auth/config.server";
import {
  buildOidcDiscoveryUrl,
  createAuthorizationCodeTokenRequest,
  createClientSecretBasicHeader,
  createPkcePair,
  createS256CodeChallenge,
  fetchOidcDiscovery,
  fetchSecurityJson,
} from "@/src/modules/admin/auth/oidc-client.server";

const clientSecret = "client-secret-that-is-at-least-32-bytes";
const adminSessionSecret = "admin-session-secret-that-is-at-least-32-bytes";
const oidcFlowSecret = "oidc-flow-secret-that-is-at-least-32-bytes";
const userSessionSecret = "consumer-user-secret-that-is-at-least-32-bytes";
const oauthStateSecret = "consumer-state-secret-that-is-at-least-32-bytes";
const followIntentSecret = "consumer-follow-secret-that-is-at-least-32-bytes";

const validAdminEnvironment = {
  APP_BASE_URL: "https://preppy.example/configured/path?ignored=yes#fragment",
  ADMIN_AUTH_ISSUER: "https://identity.example.com/tenant/",
  ADMIN_AUTH_CLIENT_ID: "preppy-admin",
  ADMIN_AUTH_CLIENT_SECRET: clientSecret,
  ADMIN_SESSION_SECRET: adminSessionSecret,
  ADMIN_OIDC_FLOW_SECRET: oidcFlowSecret,
  USER_SESSION_SECRET: userSessionSecret,
  OAUTH_STATE_SECRET: oauthStateSecret,
  FOLLOW_INTENT_SECRET: followIntentSecret,
};

describe("Admin auth configuration", () => {
  it("loads exactly the Admin capability settings and fixes the callback to the application origin", () => {
    const config: AdminAuthConfig = getAdminAuthConfig(validAdminEnvironment);

    expect(config).toEqual({
      APP_BASE_URL: validAdminEnvironment.APP_BASE_URL,
      ADMIN_AUTH_ISSUER: validAdminEnvironment.ADMIN_AUTH_ISSUER,
      ADMIN_AUTH_CLIENT_ID: validAdminEnvironment.ADMIN_AUTH_CLIENT_ID,
      ADMIN_AUTH_CLIENT_SECRET: clientSecret,
      ADMIN_SESSION_SECRET: adminSessionSecret,
      ADMIN_OIDC_FLOW_SECRET: oidcFlowSecret,
      redirectUri: "https://preppy.example/admin/auth/callback",
    });
    expectTypeOf(config).toEqualTypeOf<AdminAuthConfig>();
  });

  it("validates the Admin capability only when it is requested", () => {
    expect(() =>
      getAdminAuthConfig({
        APP_BASE_URL: "https://preppy.example",
      }),
    ).toThrow(/ADMIN_AUTH_ISSUER/);
  });

  it.each([
    "APP_BASE_URL",
    "ADMIN_AUTH_ISSUER",
    "ADMIN_AUTH_CLIENT_ID",
    "ADMIN_AUTH_CLIENT_SECRET",
    "ADMIN_SESSION_SECRET",
    "ADMIN_OIDC_FLOW_SECRET",
  ] as const)("requires the exact %s environment name", (name) => {
    const environment: Record<string, string | undefined> = {
      ...validAdminEnvironment,
      [name]: undefined,
      [`${name}_ALIAS`]: validAdminEnvironment[name],
    };

    expect(() => getAdminAuthConfig(environment)).toThrow(new RegExp(name));
  });

  it("measures capability secrets in UTF-8 bytes", () => {
    const thirtyTwoByteSecret = "é".repeat(16);

    expect(
      getAdminAuthConfig({
        ...validAdminEnvironment,
        ADMIN_AUTH_CLIENT_SECRET: thirtyTwoByteSecret,
        ADMIN_SESSION_SECRET: `${thirtyTwoByteSecret}a`,
        ADMIN_OIDC_FLOW_SECRET: `${thirtyTwoByteSecret}b`,
      }),
    ).toMatchObject({
      ADMIN_AUTH_CLIENT_SECRET: thirtyTwoByteSecret,
      ADMIN_SESSION_SECRET: `${thirtyTwoByteSecret}a`,
      ADMIN_OIDC_FLOW_SECRET: `${thirtyTwoByteSecret}b`,
    });

    for (const name of [
      "ADMIN_AUTH_CLIENT_SECRET",
      "ADMIN_SESSION_SECRET",
      "ADMIN_OIDC_FLOW_SECRET",
    ] as const) {
      expect(() =>
        getAdminAuthConfig({
          ...validAdminEnvironment,
          [name]: "é".repeat(15),
        }),
      ).toThrow(new RegExp(name));
    }
  });

  it.each([
    [
      "Admin session and OIDC flow",
      "ADMIN_SESSION_SECRET",
      "ADMIN_OIDC_FLOW_SECRET",
    ],
    [
      "Admin session and consumer session",
      "ADMIN_SESSION_SECRET",
      "USER_SESSION_SECRET",
    ],
    [
      "Admin session and OAuth state",
      "ADMIN_SESSION_SECRET",
      "OAUTH_STATE_SECRET",
    ],
    [
      "Admin session and follow intent",
      "ADMIN_SESSION_SECRET",
      "FOLLOW_INTENT_SECRET",
    ],
    [
      "OIDC flow and consumer session",
      "ADMIN_OIDC_FLOW_SECRET",
      "USER_SESSION_SECRET",
    ],
    [
      "OIDC flow and OAuth state",
      "ADMIN_OIDC_FLOW_SECRET",
      "OAUTH_STATE_SECRET",
    ],
    [
      "OIDC flow and follow intent",
      "ADMIN_OIDC_FLOW_SECRET",
      "FOLLOW_INTENT_SECRET",
    ],
  ] as const)(
    "rejects a secret reused by %s",
    (_case, firstName, secondName) => {
      const reusedSecret = "reused-secret-that-is-at-least-thirty-two-bytes";

      expect(() =>
        getAdminAuthConfig({
          ...validAdminEnvironment,
          [firstName]: reusedSecret,
          [secondName]: reusedSecret,
        }),
      ).toThrow(/distinct/i);
    },
  );

  it("allows consumer capability secrets to be absent", () => {
    const adminOnlyEnvironment = {
      APP_BASE_URL: validAdminEnvironment.APP_BASE_URL,
      ADMIN_AUTH_ISSUER: validAdminEnvironment.ADMIN_AUTH_ISSUER,
      ADMIN_AUTH_CLIENT_ID: validAdminEnvironment.ADMIN_AUTH_CLIENT_ID,
      ADMIN_AUTH_CLIENT_SECRET: validAdminEnvironment.ADMIN_AUTH_CLIENT_SECRET,
      ADMIN_SESSION_SECRET: validAdminEnvironment.ADMIN_SESSION_SECRET,
      ADMIN_OIDC_FLOW_SECRET: validAdminEnvironment.ADMIN_OIDC_FLOW_SECRET,
    };

    expect(getAdminAuthConfig(adminOnlyEnvironment)).toMatchObject({
      ADMIN_SESSION_SECRET: adminSessionSecret,
      ADMIN_OIDC_FLOW_SECRET: oidcFlowSecret,
    });
  });

  it.each([
    "https://user:password@identity.example.com",
    "https://identity.example.com?tenant=preppy",
    "https://identity.example.com#configuration",
    "ftp://identity.example.com",
  ])("rejects an untrusted issuer URL %s", (issuer) => {
    expect(() =>
      getAdminAuthConfig({
        ...validAdminEnvironment,
        ADMIN_AUTH_ISSUER: issuer,
      }),
    ).toThrow(/ADMIN_AUTH_ISSUER/);
  });

  it.each([
    " https://identity.example.com/tenant/ ",
    "\thttps://identity.example.com/tenant/\r\n",
  ])(
    "rejects surrounding issuer whitespace without normalization",
    (issuer) => {
      expect(() =>
        getAdminAuthConfig({
          ...validAdminEnvironment,
          ADMIN_AUTH_ISSUER: issuer,
        }),
      ).toThrow(/ADMIN_AUTH_ISSUER/);
    },
  );

  it("returns an accepted issuer byte-for-byte unchanged", () => {
    const exactIssuer = "https://IDENTITY.Example.com:443/tenant/%7Eadmin/";

    expect(
      getAdminAuthConfig({
        ...validAdminEnvironment,
        ADMIN_AUTH_ISSUER: exactIssuer,
      }).ADMIN_AUTH_ISSUER,
    ).toBe(exactIssuer);
  });

  it("rejects a non-HTTP application base URL", () => {
    expect(() =>
      getAdminAuthConfig({
        ...validAdminEnvironment,
        APP_BASE_URL: "ftp://preppy.example",
      }),
    ).toThrow(/APP_BASE_URL/);
  });
});

const discoveryIssuer = "https://identity.example.com/tenant/";
const validDiscovery = {
  issuer: discoveryIssuer,
  authorization_endpoint: "https://identity.example.com/oauth/authorize",
  token_endpoint: "https://identity.example.com/oauth/token",
  jwks_uri: "https://identity.example.com/.well-known/jwks.json",
  response_types_supported: ["code", "id_token"],
  id_token_signing_alg_values_supported: ["RS256"],
};

function jsonResponse(source: string, headers?: HeadersInit): Response {
  return new Response(new TextEncoder().encode(source), {
    status: 200,
    headers,
  });
}

function discoveryResponse(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(JSON.stringify({ ...validDiscovery, ...overrides }));
}

describe("OIDC discovery", () => {
  it("constructs discovery from the configured issuer without normalizing the comparison value", () => {
    expect(buildOidcDiscoveryUrl(discoveryIssuer)).toBe(
      "https://identity.example.com/tenant/.well-known/openid-configuration",
    );
    expect(buildOidcDiscoveryUrl("https://identity.example.com/tenant")).toBe(
      "https://identity.example.com/tenant/.well-known/openid-configuration",
    );
  });

  it("fetches with a bounded redirect-refusing request and returns only known metadata", async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return discoveryResponse({
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
        code_challenge_methods_supported: ["S256"],
        response_modes_supported: ["query"],
        vendor_noncritical_extension: { enabled: true },
      });
    };

    const metadata = await fetchOidcDiscovery({
      issuer: discoveryIssuer,
      production: true,
      fetchImpl,
    });

    expect(String(requestedUrl)).toBe(
      "https://identity.example.com/tenant/.well-known/openid-configuration",
    );
    expect(requestedInit?.redirect).toBe("error");
    expect(requestedInit?.signal).toBeInstanceOf(AbortSignal);
    expect(metadata).toEqual({
      ...validDiscovery,
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
      code_challenge_methods_supported: ["S256"],
      response_modes_supported: ["query"],
    });
    expect(metadata).not.toHaveProperty("vendor_noncritical_extension");
  });

  it("accepts all specified discovery capability defaults when optional lists are omitted", async () => {
    const metadata = await fetchOidcDiscovery({
      issuer: discoveryIssuer,
      production: true,
      fetchImpl: async () => discoveryResponse(),
    });

    expect(metadata.response_types_supported).toContain("code");
    expect(metadata.id_token_signing_alg_values_supported).toContain("RS256");
    expect(metadata.grant_types_supported).toBeUndefined();
    expect(metadata.token_endpoint_auth_methods_supported).toBeUndefined();
    expect(metadata.code_challenge_methods_supported).toBeUndefined();
    expect(metadata.response_modes_supported).toBeUndefined();
  });

  it.each([
    ["response_types_supported", ["id_token"]],
    ["id_token_signing_alg_values_supported", ["ES256"]],
    ["grant_types_supported", ["implicit"]],
    ["token_endpoint_auth_methods_supported", ["client_secret_post"]],
    ["code_challenge_methods_supported", ["plain"]],
    ["response_modes_supported", ["fragment", "form_post"]],
  ] as const)(
    "rejects an incompatible %s list without a fallback",
    async (name, value) => {
      await expect(
        fetchOidcDiscovery({
          issuer: discoveryIssuer,
          production: true,
          fetchImpl: async () => discoveryResponse({ [name]: value }),
        }),
      ).rejects.toThrow(new RegExp(name));
    },
  );

  it("requires the discovery issuer to exactly equal configuration", async () => {
    await expect(
      fetchOidcDiscovery({
        issuer: discoveryIssuer,
        production: true,
        fetchImpl: async () =>
          discoveryResponse({ issuer: discoveryIssuer.slice(0, -1) }),
      }),
    ).rejects.toThrow(/issuer/);
  });

  it.each(["authorization_endpoint", "token_endpoint", "jwks_uri"] as const)(
    "rejects HTTP %s in production",
    async (name) => {
      await expect(
        fetchOidcDiscovery({
          issuer: discoveryIssuer,
          production: true,
          fetchImpl: async () =>
            discoveryResponse({
              [name]: `http://identity.example.com/${name}`,
            }),
        }),
      ).rejects.toThrow(new RegExp(name));
    },
  );

  it.each(["authorization_endpoint", "token_endpoint", "jwks_uri"] as const)(
    "rejects credentials in %s",
    async (name) => {
      await expect(
        fetchOidcDiscovery({
          issuer: discoveryIssuer,
          production: false,
          fetchImpl: async () =>
            discoveryResponse({
              [name]: `http://user:password@localhost/${name}`,
            }),
        }),
      ).rejects.toThrow(new RegExp(name));
    },
  );

  it("allows HTTP issuer and endpoints only outside production", async () => {
    const developmentIssuer = "http://127.0.0.1:9090/oidc";
    const response = discoveryResponse({
      issuer: developmentIssuer,
      authorization_endpoint: "http://127.0.0.1:9090/authorize",
      token_endpoint: "http://127.0.0.1:9090/token",
      jwks_uri: "http://127.0.0.1:9090/jwks",
    });

    await expect(
      fetchOidcDiscovery({
        issuer: developmentIssuer,
        production: false,
        fetchImpl: async () => response,
      }),
    ).resolves.toMatchObject({ issuer: developmentIssuer });

    await expect(
      fetchOidcDiscovery({
        issuer: developmentIssuer,
        production: true,
        fetchImpl: async () => discoveryResponse(),
      }),
    ).rejects.toThrow(/issuer/);
  });

  it("rejects a duplicate required discovery member", async () => {
    const source = `{"issuer":"${discoveryIssuer}","issuer":"https://evil.example","authorization_endpoint":"https://identity.example.com/oauth/authorize","token_endpoint":"https://identity.example.com/oauth/token","jwks_uri":"https://identity.example.com/jwks","response_types_supported":["code"],"id_token_signing_alg_values_supported":["RS256"]}`;

    await expect(
      fetchOidcDiscovery({
        issuer: discoveryIssuer,
        production: true,
        fetchImpl: async () => jsonResponse(source),
      }),
    ).rejects.toThrow(/duplicate/i);
  });

  it("rejects a wrong required discovery field type", async () => {
    await expect(
      fetchOidcDiscovery({
        issuer: discoveryIssuer,
        production: true,
        fetchImpl: async () =>
          discoveryResponse({ authorization_endpoint: ["not-a-string"] }),
      }),
    ).rejects.toThrow(/authorization_endpoint/);
  });

  it("rejects malformed UTF-8 before security JSON parsing", async () => {
    const malformedUtf8 = new Uint8Array([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]);

    await expect(
      fetchOidcDiscovery({
        issuer: discoveryIssuer,
        production: true,
        fetchImpl: async () => new Response(malformedUtf8),
      }),
    ).rejects.toThrow(/UTF-8/);
  });

  it("enforces the raw-byte ceiling before decoding", async () => {
    const oversizedMalformedUtf8 = new Uint8Array(65_537).fill(0x80);

    await expect(
      fetchSecurityJson(
        "https://identity.example.com/security-json",
        {},
        async () => new Response(oversizedMalformedUtf8),
      ),
    ).rejects.toThrow(/too large/i);
  });

  it("rejects an oversized declared response and cancels its body", async () => {
    let bodyWasCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
      cancel() {
        bodyWasCancelled = true;
      },
    });

    await expect(
      fetchSecurityJson(
        "https://identity.example.com/security-json",
        {},
        async () =>
          new Response(body, {
            headers: { "content-length": "65537" },
          }),
      ),
    ).rejects.toThrow(/too large/i);
    expect(bodyWasCancelled).toBe(true);
  });

  it("aborts a stalled security JSON fetch after five seconds", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const pending = fetchSecurityJson(
        "https://identity.example.com/security-json",
        {},
        async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("aborted"));
            });
          }),
      );
      const rejection = expect(pending).rejects.toThrow(/aborted/);

      await vi.advanceTimersByTimeAsync(4_999);
      expect(aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("OIDC PKCE and token authentication", () => {
  const rfc7636Verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

  it("derives the RFC 7636 S256 challenge without a plain fallback", () => {
    expect(createS256CodeChallenge(rfc7636Verifier)).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("creates independent 32-byte PKCE verifiers and S256-only challenges", () => {
    const first = createPkcePair();
    const second = createPkcePair();

    expect(first.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.codeVerifier).not.toBe(second.codeVerifier);
    expect(first.codeChallenge).toBe(
      createS256CodeChallenge(first.codeVerifier),
    );
    expect(first.codeChallenge).not.toBe(first.codeVerifier);
    expect(first.codeChallengeMethod).toBe("S256");
  });

  it("form-encodes each client credential before constructing Basic auth", () => {
    const header = createClientSecretBasicHeader(
      "admin client:100%",
      "s+e:c ret%",
    );

    expect(
      Buffer.from(header.slice("Basic ".length), "base64").toString("utf8"),
    ).toBe("admin+client%3A100%25:s%2Be%3Ac+ret%25");
  });

  it("constructs an authorization-code token request with secret only in Basic auth", () => {
    const config = getAdminAuthConfig(validAdminEnvironment);
    const request = createAuthorizationCodeTokenRequest({
      config: {
        ...config,
        ADMIN_AUTH_CLIENT_ID: "admin client:100%",
        ADMIN_AUTH_CLIENT_SECRET: "s+e:c ret%",
      },
      code: "issued-code",
      codeVerifier: rfc7636Verifier,
    });
    const headers = new Headers(request.headers);
    const body = new URLSearchParams(String(request.body));

    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("error");
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded;charset=UTF-8",
    );
    expect(headers.get("authorization")).toBe(
      createClientSecretBasicHeader("admin client:100%", "s+e:c ret%"),
    );
    expect([...body.keys()]).toEqual([
      "grant_type",
      "code",
      "code_verifier",
      "redirect_uri",
    ]);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      code: "issued-code",
      code_verifier: rfc7636Verifier,
      redirect_uri: "https://preppy.example/admin/auth/callback",
    });
    expect(String(request.body)).not.toContain("s%2Be%3Ac+ret%25");
    expect(String(request.body)).not.toContain("client_secret");
  });
});
