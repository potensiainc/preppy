import {
  constants,
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
  startFakeAdminOidcIssuer,
  type FakeAdminOidcIssuer,
  type FakeAdminOidcMode,
} from "../browser/wp11/fake-admin-oidc-issuer";

const clientId = "preppy admin+browser";
const clientSecret = "browser:secret + % encoded with enough bytes";
const redirectUri = "http://127.0.0.1:3311/admin/auth/callback";
const activeSubject = "wp11-browser-active";
const disabledSubject = "wp11-browser-disabled";
const verifier = "a".repeat(43);
const challenge = createHash("sha256")
  .update(verifier, "ascii")
  .digest("base64url");

let fixture: FakeAdminOidcIssuer | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function start() {
  fixture = await startFakeAdminOidcIssuer({
    hostname: "127.0.0.1",
    port: 0,
    clientId,
    clientSecret,
    redirectUri,
    activeSubject,
    disabledSubject,
  });
  return fixture;
}

function encodedCredential(value: string): string {
  return new URLSearchParams({ credential: value })
    .toString()
    .slice("credential=".length);
}

function basicHeader(id = clientId, secret = clientSecret): string {
  return `Basic ${Buffer.from(
    `${encodedCredential(id)}:${encodedCredential(secret)}`,
    "utf8",
  ).toString("base64")}`;
}

async function authorize(
  issuer: FakeAdminOidcIssuer,
  overrides: Record<string, string> = {},
) {
  const url = new URL("/authorize", issuer.issuer);
  const parameters = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: "openid",
    state: "state-value",
    nonce: "nonce-value",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...overrides,
  };
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return fetch(url, { redirect: "manual" });
}

async function issueCode(issuer: FakeAdminOidcIssuer): Promise<string> {
  const response = await authorize(issuer);
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location")!);
  expect(location.origin + location.pathname).toBe(redirectUri);
  expect(location.searchParams.get("state")).toBe("state-value");
  expect(location.searchParams.getAll("code")).toHaveLength(1);
  return location.searchParams.get("code")!;
}

async function exchange(
  issuer: FakeAdminOidcIssuer,
  code: string,
  options: { verifier?: string; authorization?: string } = {},
) {
  return fetch(new URL("/token", issuer.issuer), {
    method: "POST",
    headers: {
      authorization: options.authorization ?? basicHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: options.verifier ?? verifier,
      redirect_uri: redirectUri,
    }),
  });
}

describe("WP-11 fake Admin OIDC issuer", () => {
  it("publishes exact single-issuer capabilities and an ephemeral public RS256 JWKS", async () => {
    const issuer = await start();
    const discovery = await fetch(
      new URL("/.well-known/openid-configuration", issuer.issuer),
    ).then((response) => response.json());

    expect(discovery).toEqual({
      issuer: issuer.issuer,
      authorization_endpoint: `${issuer.issuer}/authorize`,
      token_endpoint: `${issuer.issuer}/token`,
      jwks_uri: `${issuer.issuer}/jwks`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["client_secret_basic"],
      id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
    });

    const jwks = await fetch(new URL("/jwks", issuer.issuer)).then((response) =>
      response.json(),
    );
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({
      kty: "RSA",
      alg: "RS256",
      use: "sig",
      kid: issuer.kid,
    });
    expect(jwks.keys[0]).toHaveProperty("n");
    expect(jwks.keys[0]).toHaveProperty("e");
    expect(jwks.keys[0]).not.toHaveProperty("d");
  });

  it("enforces exact authorization parameters, redirect URI, state, nonce, and PKCE S256", async () => {
    const issuer = await start();
    for (const [field, value] of [
      ["client_id", "wrong-client"],
      ["redirect_uri", `${redirectUri}/wrong`],
      ["response_type", "token"],
      ["response_mode", "fragment"],
      ["scope", "profile"],
      ["state", ""],
      ["nonce", ""],
      ["code_challenge_method", "plain"],
      ["code_challenge", "not-a-canonical-challenge"],
    ] as const) {
      const response = await authorize(issuer, { [field]: value });
      expect(response.status, field).toBe(400);
      expect(response.headers.get("location"), field).toBeNull();
    }
  });

  it("accepts RFC 6749 form-encoded Basic credentials and rejects raw concatenation", async () => {
    const issuer = await start();
    const good = await exchange(issuer, await issueCode(issuer));
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({
      token_type: "Bearer",
      expires_in: 300,
    });

    const secondCode = await issueCode(issuer);
    const raw = `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`;
    const rejected = await exchange(issuer, secondCode, {
      authorization: raw,
    });
    expect(rejected.status).toBe(401);
  });

  it("enforces PKCE and consumes each authorization code exactly once", async () => {
    const issuer = await start();
    const wrongVerifierCode = await issueCode(issuer);
    expect(
      (await exchange(issuer, wrongVerifierCode, { verifier: "b".repeat(43) }))
        .status,
    ).toBe(400);
    expect((await exchange(issuer, wrongVerifierCode)).status).toBe(400);

    const code = await issueCode(issuer);
    expect((await exchange(issuer, code)).status).toBe(200);
    expect((await exchange(issuer, code)).status).toBe(400);
  });

  it("signs a normal token and selects only fixture-owned subject modes", async () => {
    const issuer = await start();
    for (const [mode, expectedSubject] of [
      ["NORMAL", activeSubject],
      ["UNKNOWN_SUBJECT", "wp11-browser-unknown"],
      ["DISABLED_SUBJECT", disabledSubject],
    ] as const) {
      issuer.setMode(mode);
      const response = await exchange(issuer, await issueCode(issuer));
      const body = (await response.json()) as { id_token: string };
      const [header, claims, signature] = body.id_token.split(".");
      expect(
        JSON.parse(Buffer.from(header, "base64url").toString("utf8")),
      ).toEqual({ alg: "RS256", kid: issuer.kid, typ: "JWT" });
      expect(
        JSON.parse(Buffer.from(claims, "base64url").toString("utf8")),
      ).toMatchObject({
        iss: issuer.issuer,
        sub: expectedSubject,
        aud: clientId,
        nonce: "nonce-value",
      });
      expect(signature).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it.each([
    "INVALID_SIGNATURE",
    "INVALID_ISSUER",
    "INVALID_AUDIENCE",
    "INVALID_NONCE",
    "EXPIRED",
    "DUPLICATE_TOKEN_JSON",
    "DUPLICATE_JWKS_JSON",
    "DUPLICATE_JWT_HEADER_JSON",
    "DUPLICATE_JWT_CLAIMS_JSON",
  ] satisfies FakeAdminOidcMode[])(
    "provides deterministic %s mode",
    async (mode) => {
      const issuer = await start();
      issuer.setMode(mode);
      const tokenResponse = await exchange(issuer, await issueCode(issuer));
      expect(tokenResponse.status).toBe(200);
      const tokenText = await tokenResponse.text();
      if (mode === "DUPLICATE_TOKEN_JSON") {
        expect(tokenText.match(/"id_token"/g)).toHaveLength(2);
      } else if (mode === "DUPLICATE_JWKS_JSON") {
        const jwksText = await fetch(new URL("/jwks", issuer.issuer)).then(
          (response) => response.text(),
        );
        expect(jwksText.match(/"keys"/g)).toHaveLength(2);
      } else {
        const idToken = (JSON.parse(tokenText) as { id_token: string })
          .id_token;
        const [header, claims, signature] = idToken.split(".");
        const rawHeader = Buffer.from(header, "base64url").toString("utf8");
        const rawClaims = Buffer.from(claims, "base64url").toString("utf8");
        const parsedClaims = JSON.parse(rawClaims) as {
          iss: string;
          aud: string;
          nonce: string;
          exp: number;
        };
        if (mode === "INVALID_ISSUER") {
          expect(parsedClaims.iss).toBe(`${issuer.issuer}/untrusted`);
        }
        if (mode === "INVALID_AUDIENCE") {
          expect(parsedClaims.aud).toBe(`${clientId}-untrusted`);
        }
        if (mode === "INVALID_NONCE") {
          expect(parsedClaims.nonce).toBe("nonce-value-wrong");
        }
        if (mode === "EXPIRED") {
          expect(parsedClaims.exp).toBeLessThan(
            Math.floor(Date.now() / 1_000) - 60,
          );
        }
        if (mode === "DUPLICATE_JWT_HEADER_JSON") {
          expect(rawHeader.match(/"alg"/g)).toHaveLength(2);
        }
        if (mode === "DUPLICATE_JWT_CLAIMS_JSON") {
          expect(rawClaims.match(/"nonce"/g)).toHaveLength(2);
        }
        if (mode === "INVALID_SIGNATURE") {
          const jwks = (await fetch(new URL("/jwks", issuer.issuer)).then(
            (response) => response.json(),
          )) as { keys: Array<{ e: string; n: string }> };
          const publicKey = createPublicKey({
            key: {
              e: jwks.keys[0]!.e,
              kty: "RSA",
              n: jwks.keys[0]!.n,
            },
            format: "jwk",
          });
          expect(
            verifySignature(
              "RSA-SHA256",
              Buffer.from(`${header}.${claims}`, "ascii"),
              { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
              Buffer.from(signature, "base64url"),
            ),
          ).toBe(false);
        }
      }
    },
  );

  it.each([
    "DUPLICATE_DISCOVERY_JSON",
    "DISCOVERY_UNSUPPORTED_CODE",
    "DISCOVERY_UNSUPPORTED_RS256",
    "DISCOVERY_UNSUPPORTED_GRANT",
    "DISCOVERY_UNSUPPORTED_BASIC",
    "DISCOVERY_UNSUPPORTED_S256",
    "DISCOVERY_UNSUPPORTED_QUERY",
  ] satisfies FakeAdminOidcMode[])(
    "provides deterministic %s capability mode",
    async (mode) => {
      const issuer = await start();
      issuer.setMode(mode);
      const text = await fetch(
        new URL("/.well-known/openid-configuration", issuer.issuer),
      ).then((response) => response.text());
      if (mode === "DUPLICATE_DISCOVERY_JSON") {
        expect(text.match(/"issuer"/g)).toHaveLength(2);
      } else {
        const metadata = JSON.parse(text) as Record<string, string[]>;
        const expectation = {
          DISCOVERY_UNSUPPORTED_CODE: ["response_types_supported", "code"],
          DISCOVERY_UNSUPPORTED_RS256: [
            "id_token_signing_alg_values_supported",
            "RS256",
          ],
          DISCOVERY_UNSUPPORTED_GRANT: [
            "grant_types_supported",
            "authorization_code",
          ],
          DISCOVERY_UNSUPPORTED_BASIC: [
            "token_endpoint_auth_methods_supported",
            "client_secret_basic",
          ],
          DISCOVERY_UNSUPPORTED_S256: [
            "code_challenge_methods_supported",
            "S256",
          ],
          DISCOVERY_UNSUPPORTED_QUERY: ["response_modes_supported", "query"],
        } as const;
        const [field, required] = expectation[mode];
        expect(metadata[field]).not.toContain(required);
      }
    },
  );

  it("exposes a loopback control surface for deterministic browser modes", async () => {
    const issuer = await start();
    const changed = await fetch(new URL("/__fixture__/mode", issuer.issuer), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "DISABLED_SUBJECT" }),
    });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({ mode: "DISABLED_SUBJECT" });
    const status = await fetch(
      new URL("/__fixture__/status", issuer.issuer),
    ).then((response) => response.json());
    expect(status).toMatchObject({
      mode: "DISABLED_SUBJECT",
      issuer: issuer.issuer,
      kid: issuer.kid,
    });
  });
});
