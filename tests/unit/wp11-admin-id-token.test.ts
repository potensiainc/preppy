import {
  constants,
  createHmac,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { verifyAdminIdToken } from "@/src/modules/admin/auth/id-token.server";
import { createTrustedJwksLoader } from "@/src/modules/admin/auth/jwks.server";

const issuer = "https://identity.example.com/tenant/";
const clientId = "preppy-admin";
const nonce = "independent-login-nonce";
const now = 2_000_000_000;
const flowStartedAt = now - 120;
const jwksUri = "https://identity.example.com/.well-known/jwks.json";

const signingPair = generateKeyPairSync("rsa", { modulusLength: 2_048 });
const otherSigningPair = generateKeyPairSync("rsa", { modulusLength: 2_048 });
const unrelatedEcPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicJwk = {
  ...signingPair.publicKey.export({ format: "jwk" }),
  kid: "primary-key",
  use: "sig",
  alg: "RS256",
};

const validClaims = {
  iss: issuer,
  sub: "admin-subject-123",
  aud: clientId,
  exp: now + 300,
  iat: now - 30,
  nonce,
};

type Header = Readonly<Record<string, unknown>>;
type Claims = Readonly<Record<string, unknown>>;

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signRawJwt(
  headerSource: string,
  payloadSource: string,
  privateKey: KeyObject = signingPair.privateKey,
  signatureKind: "RS256" | "PS256" | "HS256" = "RS256",
): string {
  const encodedHeader = Buffer.from(headerSource, "utf8").toString("base64url");
  const encodedPayload = Buffer.from(payloadSource, "utf8").toString(
    "base64url",
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  let signature: Buffer;
  if (signatureKind === "PS256") {
    signature = sign("sha256", Buffer.from(signingInput, "ascii"), {
      key: privateKey,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32,
    });
  } else if (signatureKind === "HS256") {
    signature = createHmac("sha256", "attacker-controlled-secret")
      .update(signingInput, "ascii")
      .digest();
  } else {
    signature = sign(
      "RSA-SHA256",
      Buffer.from(signingInput, "ascii"),
      privateKey,
    );
  }
  return `${signingInput}.${signature.toString("base64url")}`;
}

function signEncodedJwt(
  encodedHeader: string,
  encodedPayload: string,
  privateKey: KeyObject = signingPair.privateKey,
): string {
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(signingInput, "ascii"),
    privateKey,
  );
  return `${signingInput}.${signature.toString("base64url")}`;
}

function createJwt(
  options: {
    header?: Header;
    claims?: Claims;
    privateKey?: KeyObject;
    signatureKind?: "RS256" | "PS256" | "HS256";
  } = {},
): string {
  return signRawJwt(
    JSON.stringify({
      alg: "RS256",
      kid: "primary-key",
      typ: "JWT",
      ...options.header,
    }),
    JSON.stringify({ ...validClaims, ...options.claims }),
    options.privateKey,
    options.signatureKind,
  );
}

function createJwtWithExactEncodedBytes(targetBytes: number): string {
  const splitPadding = (paddingBytes: number): string[] => {
    const chunks: string[] = [];
    let remaining = paddingBytes;
    while (remaining > 0) {
      const chunkBytes = Math.min(remaining, 4_000);
      chunks.push("a".repeat(chunkBytes));
      remaining -= chunkBytes;
    }
    return chunks;
  };
  const claimsWithEmptyPadding = {
    ...validClaims,
    boundary_padding: [] as string[],
  };
  const emptyPayloadBytes = Buffer.byteLength(
    JSON.stringify(claimsWithEmptyPadding),
    "utf8",
  );
  for (
    let headerPaddingBytes = 0;
    headerPaddingBytes <= 7;
    headerPaddingBytes += 1
  ) {
    const encodedHeader = encodeJson({
      alg: "RS256",
      kid: "primary-key",
      typ: "JWT",
      boundary_padding: "a".repeat(headerPaddingBytes),
    });
    const signatureLength = signEncodedJwt(
      encodedHeader,
      encodeJson(claimsWithEmptyPadding),
    ).split(".")[2].length;
    const targetPayloadLength =
      targetBytes - encodedHeader.length - signatureLength - 2;
    const estimatedPaddingBytes =
      Math.floor((targetPayloadLength * 3) / 4) - emptyPayloadBytes;

    for (
      let paddingBytes = Math.max(0, estimatedPaddingBytes - 64);
      paddingBytes <= estimatedPaddingBytes + 64;
      paddingBytes += 1
    ) {
      const encodedPayload = encodeJson({
        ...validClaims,
        boundary_padding: splitPadding(paddingBytes),
      });
      if (
        encodedHeader.length + encodedPayload.length + signatureLength + 2 ===
        targetBytes
      ) {
        return signEncodedJwt(encodedHeader, encodedPayload);
      }
    }
  }

  throw new Error(`Unable to construct ${targetBytes}-byte JWT fixture`);
}

function jwksResponse(
  keys: readonly Record<string, unknown>[] = [publicJwk],
): Response {
  return new Response(JSON.stringify({ keys }), {
    headers: { "content-type": "application/json" },
  });
}

function createLoader(
  fetchImpl: typeof fetch = async () => jwksResponse(),
  nowMs?: () => number,
) {
  return createTrustedJwksLoader({
    discovery: { jwks_uri: jwksUri },
    fetchImpl,
    nowMs,
  });
}

async function verifyToken(
  idToken: string,
  loader = createLoader(),
): Promise<unknown> {
  return verifyAdminIdToken({
    idToken,
    jwks: loader,
    expectedIssuer: issuer,
    clientId,
    expectedNonce: nonce,
    flowStartedAt,
    now,
  });
}

describe("Admin ID Token cryptographic verification", () => {
  it("verifies a real RS256 signature and returns only the bounded identity claims", async () => {
    await expect(verifyToken(createJwt())).resolves.toEqual({
      sub: "admin-subject-123",
      iss: issuer,
      aud: clientId,
      iat: now - 30,
      exp: now + 300,
    });
  });

  it("rejects a signature made by a key outside the trusted JWKS", async () => {
    await expect(
      verifyToken(createJwt({ privateKey: otherSigningPair.privateKey })),
    ).rejects.toThrow(/verification failed/i);
  });

  it.each([
    ["none", "RS256"],
    ["HS256", "HS256"],
    ["PS256", "PS256"],
  ] as const)("rejects the unsupported %s algorithm", async (alg, kind) => {
    const token = createJwt({
      header: { alg },
      signatureKind: kind,
    });

    await expect(verifyToken(token)).rejects.toThrow(/verification failed/i);
  });

  it.each([
    ["HMAC-SHA256", "HS256"],
    ["RSASSA-PSS", "PS256"],
  ] as const)(
    "rejects a token claiming RS256 whose signature actually uses %s",
    async (_case, signatureKind) => {
      const token = createJwt({ signatureKind });

      await expect(verifyToken(token)).rejects.toThrow(/verification failed/i);
    },
  );

  it("rejects a protected header with no kid", async () => {
    const token = signRawJwt(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
      JSON.stringify(validClaims),
    );

    await expect(verifyToken(token)).rejects.toThrow(/verification failed/i);
  });

  it("rejects an unknown kid after one bounded rotation refresh", async () => {
    let requests = 0;
    const loader = createLoader(async () => {
      requests += 1;
      return jwksResponse();
    });

    await expect(
      verifyToken(createJwt({ header: { kid: "unknown-key" } }), loader),
    ).rejects.toThrow(/verification failed/i);
    expect(requests).toBe(2);
  });

  it("rejects a duplicate decoded kid in the protected header", async () => {
    const token = signRawJwt(
      '{"alg":"RS256","kid":"primary-key","\\u006bid":"attacker-key"}',
      JSON.stringify(validClaims),
    );

    await expect(verifyToken(token)).rejects.toThrow(/verification failed/i);
  });

  it("rejects an ambiguous kid with multiple trusted JWKS matches", async () => {
    const loader = createLoader(async () =>
      jwksResponse([publicJwk, { ...publicJwk }]),
    );

    await expect(verifyToken(createJwt(), loader)).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("accepts a trusted JWKS containing an unrelated standards-compliant key without kid", async () => {
    const unrelatedKidlessJwk = unrelatedEcPair.publicKey.export({
      format: "jwk",
    });
    const loader = createLoader(async () =>
      jwksResponse([unrelatedKidlessJwk, publicJwk]),
    );

    await expect(verifyToken(createJwt(), loader)).resolves.toMatchObject({
      sub: "admin-subject-123",
    });
  });

  it.each([
    [
      "a non-RSA key",
      {
        ...unrelatedEcPair.publicKey.export({ format: "jwk" }),
        kid: "primary-key",
        use: "sig",
        alg: "ES256",
      },
    ],
    ["an encryption-use RSA key", { ...publicJwk, use: "enc" }],
    [
      "an RSA key without verify permission",
      { ...publicJwk, key_ops: ["encrypt"] },
    ],
    [
      "an RSA key constrained to another algorithm",
      { ...publicJwk, alg: "PS256" },
    ],
    ["an RSA key missing modulus material", { ...publicJwk, n: undefined }],
    ["an RSA key with invalid modulus material", { ...publicJwk, n: "*" }],
  ])(
    "selects one eligible signing key despite same-kid %s",
    async (_case, unusableKey) => {
      const loader = createLoader(async () =>
        jwksResponse([unusableKey, publicJwk]),
      );

      await expect(verifyToken(createJwt(), loader)).resolves.toMatchObject({
        sub: "admin-subject-123",
      });
    },
  );

  it.each([
    ["a non-RSA key", { kty: "EC", kid: "primary-key", use: "sig" }],
    ["an encryption-use RSA key", { ...publicJwk, use: "enc" }],
    [
      "an RSA key without verify permission",
      { ...publicJwk, key_ops: ["encrypt"] },
    ],
    [
      "an RSA key constrained to another algorithm",
      { ...publicJwk, alg: "PS256" },
    ],
  ])("rejects %s even when its kid matches", async (_case, key) => {
    const loader = createLoader(async () => jwksResponse([key]));

    await expect(verifyToken(createJwt(), loader)).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("accepts a signing JWK with an irrelevant non-critical extension", async () => {
    const loader = createLoader(async () =>
      jwksResponse([
        {
          ...publicJwk,
          vendor_noncritical_extension: { environment: "production" },
        },
      ]),
    );

    await expect(verifyToken(createJwt(), loader)).resolves.toMatchObject({
      sub: "admin-subject-123",
    });
  });

  it("rejects a duplicate security member inside an individual JWK", async () => {
    const { kty, n, e, kid, use, alg } = publicJwk;
    const duplicateJwk = `{"keys":[{"kty":"${kty}","n":"${n}","e":"${e}","kid":"${kid}","kid":"attacker-key","use":"${use}","alg":"${alg}"}]}`;
    const loader = createLoader(async () => new Response(duplicateJwk));

    await expect(verifyToken(createJwt(), loader)).rejects.toThrow(
      /verification failed/i,
    );
  });
});

describe("Admin ID Token compact serialization", () => {
  it.each([
    [
      "two segments",
      `${encodeJson({ alg: "RS256" })}.${encodeJson(validClaims)}`,
    ],
    [
      "four segments",
      `${encodeJson({ alg: "RS256" })}.${encodeJson(validClaims)}.AA.AA`,
    ],
    ["empty header", `.${encodeJson(validClaims)}.AA`],
    ["empty payload", `${encodeJson({ alg: "RS256" })}..AA`],
    [
      "empty signature",
      `${encodeJson({ alg: "RS256" })}.${encodeJson(validClaims)}.`,
    ],
    [
      "padding",
      `${encodeJson({ alg: "RS256" })}=.${encodeJson(validClaims)}.AA`,
    ],
    [
      "non-URL alphabet",
      `${encodeJson({ alg: "RS256" })}.${encodeJson(validClaims)}.+A`,
    ],
    [
      "non-canonical pad bits",
      `${encodeJson({ alg: "RS256" })}.${encodeJson(validClaims)}.AB`,
    ],
  ])("rejects %s", async (_case, token) => {
    await expect(verifyToken(token)).rejects.toThrow(/verification failed/i);
  });

  it("accepts a correctly signed compact token at exactly 16,384 bytes", async () => {
    const token = createJwtWithExactEncodedBytes(16_384);

    expect(Buffer.byteLength(token, "ascii")).toBe(16_384);
    await expect(verifyToken(token)).resolves.toEqual({
      sub: "admin-subject-123",
      iss: issuer,
      aud: clientId,
      iat: now - 30,
      exp: now + 300,
    });
  });

  it("rejects a correctly signed compact token at 16,385 bytes before JWKS access", async () => {
    let requests = 0;
    const loader = createLoader(async () => {
      requests += 1;
      return jwksResponse();
    });
    const token = createJwtWithExactEncodedBytes(16_385);

    expect(Buffer.byteLength(token, "ascii")).toBe(16_385);
    await expect(verifyToken(token, loader)).rejects.toThrow(
      /verification failed/i,
    );
    expect(requests).toBe(0);
  });

  it("rejects an encoded token larger than 16 KiB before any JWKS request", async () => {
    let requests = 0;
    const loader = createLoader(async () => {
      requests += 1;
      return jwksResponse();
    });
    const oversizedToken = `${"a".repeat(16 * 1_024)}.a.a`;

    await expect(verifyToken(oversizedToken, loader)).rejects.toThrow(
      /verification failed/i,
    );
    expect(requests).toBe(0);
  });
});

describe("Admin ID Token claim policy", () => {
  it("requires the issuer to match the configured value byte-for-byte", async () => {
    await expect(
      verifyToken(createJwt({ claims: { iss: issuer.slice(0, -1) } })),
    ).rejects.toThrow(/verification failed/i);
  });

  it("accepts a single-item audience array containing only the exact client", async () => {
    await expect(
      verifyToken(createJwt({ claims: { aud: [clientId] } })),
    ).resolves.toMatchObject({ aud: [clientId] });
  });

  it.each([
    ["a wrong string audience", "another-client"],
    ["a missing-client single-item audience", ["another-client"]],
    ["an empty audience array", []],
  ])("rejects %s", async (_case, aud) => {
    await expect(verifyToken(createJwt({ claims: { aud } }))).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("accepts a present azp only when it exactly equals the client ID", async () => {
    await expect(
      verifyToken(createJwt({ claims: { azp: clientId } })),
    ).resolves.toMatchObject({ aud: clientId });

    await expect(
      verifyToken(createJwt({ claims: { azp: "another-client" } })),
    ).rejects.toThrow(/verification failed/i);
  });

  it.each([
    ["without azp", { aud: [clientId, "another-client"] }],
    [
      "even with correct azp",
      { aud: [clientId, "another-client"], azp: clientId },
    ],
  ])("rejects every multi-audience token %s", async (_case, claims) => {
    await expect(verifyToken(createJwt({ claims }))).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("accepts an omitted nbf and rejects a token active too far in the future", async () => {
    await expect(verifyToken(createJwt())).resolves.toMatchObject({
      sub: "admin-subject-123",
    });
    await expect(
      verifyToken(createJwt({ claims: { nbf: now + 61 } })),
    ).rejects.toThrow(/verification failed/i);
  });

  it("rejects a nonce that does not exactly match the independent flow nonce", async () => {
    await expect(
      verifyToken(createJwt({ claims: { nonce: `${nonce}-attacker` } })),
    ).rejects.toThrow(/verification failed/i);
  });

  it.each([
    ["an empty subject", ""],
    ["a subject over 255 UTF-8 bytes", "a".repeat(256)],
    ["a multibyte subject over 255 UTF-8 bytes", "€".repeat(86)],
  ])("rejects %s", async (_case, sub) => {
    await expect(verifyToken(createJwt({ claims: { sub } }))).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("accepts a subject at the 255 UTF-8 byte bound", async () => {
    const sub = "€".repeat(85);

    await expect(verifyToken(createJwt({ claims: { sub } }))).resolves.toEqual({
      sub,
      iss: issuer,
      aud: clientId,
      iat: now - 30,
      exp: now + 300,
    });
  });

  it.each([
    ["iss", { iss: [issuer] }],
    ["sub", { sub: 123 }],
    ["aud", { aud: [clientId, 123] }],
    ["exp", { exp: String(now + 300) }],
    ["iat", { iat: null }],
    ["nbf", { nbf: String(now) }],
    ["nonce", { nonce: [nonce] }],
    ["azp", { azp: [clientId] }],
  ])("rejects type confusion in %s", async (_field, claims) => {
    await expect(verifyToken(createJwt({ claims }))).rejects.toThrow(
      /verification failed/i,
    );
  });

  it.each([
    ["fractional iat", { iat: now - 0.5 }],
    ["fractional exp", { exp: now + 0.5 }],
    ["fractional nbf", { nbf: now + 0.5 }],
    ["unsafe iat", { iat: Number.MAX_SAFE_INTEGER + 1 }],
  ])("rejects %s NumericDate ambiguity", async (_case, claims) => {
    await expect(verifyToken(createJwt({ claims }))).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("accepts and strips an extra non-critical claim", async () => {
    const result = await verifyToken(
      createJwt({
        claims: {
          email: "must-not-leave-the-verifier@example.com",
          profile: { role: "provider-extension" },
        },
      }),
    );

    expect(result).toEqual({
      sub: "admin-subject-123",
      iss: issuer,
      aud: clientId,
      iat: now - 30,
      exp: now + 300,
    });
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("profile");
    expect(result).not.toHaveProperty("nonce");
    expect(result).not.toHaveProperty("azp");
  });

  it("rejects duplicate decoded security claims", async () => {
    const token = signRawJwt(
      JSON.stringify({ alg: "RS256", kid: "primary-key" }),
      `{"iss":"${issuer}","sub":"admin-subject-123","aud":"${clientId}","exp":${now + 300},"iat":${now - 30},"nonce":"${nonce}","\\u0061ud":"attacker-client"}`,
    );

    await expect(verifyToken(token)).rejects.toThrow(/verification failed/i);
  });

  it("uses a fixed safe error that does not echo token or claim contents", async () => {
    const secretMarker = "never-echo-this-nonce";
    const token = createJwt({ claims: { nonce: secretMarker } });
    let error: unknown;

    try {
      await verifyToken(token);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Admin ID Token verification failed");
    expect((error as Error).message).not.toContain(secretMarker);
    expect((error as Error).message).not.toContain(token);
  });
});

describe("Admin ID Token exact 60-second clock skew boundaries", () => {
  it("accepts iat at flowStartedAt - 60 and rejects one second earlier", async () => {
    await expect(
      verifyToken(createJwt({ claims: { iat: flowStartedAt - 60 } })),
    ).resolves.toMatchObject({ iat: flowStartedAt - 60 });
    await expect(
      verifyToken(createJwt({ claims: { iat: flowStartedAt - 61 } })),
    ).rejects.toThrow(/verification failed/i);
  });

  it("accepts iat at now + 60 and rejects one second later", async () => {
    await expect(
      verifyToken(createJwt({ claims: { iat: now + 60 } })),
    ).resolves.toMatchObject({ iat: now + 60 });
    await expect(
      verifyToken(createJwt({ claims: { iat: now + 61 } })),
    ).rejects.toThrow(/verification failed/i);
  });

  it("accepts while now is below exp + 60 and rejects equality", async () => {
    await expect(
      verifyToken(createJwt({ claims: { exp: now - 59 } })),
    ).resolves.toMatchObject({ exp: now - 59 });
    await expect(
      verifyToken(createJwt({ claims: { exp: now - 60 } })),
    ).rejects.toThrow(/verification failed/i);
  });

  it("accepts nbf at now + 60 and rejects one second later", async () => {
    await expect(
      verifyToken(createJwt({ claims: { nbf: now + 60 } })),
    ).resolves.toMatchObject({ sub: "admin-subject-123" });
    await expect(
      verifyToken(createJwt({ claims: { nbf: now + 61 } })),
    ).rejects.toThrow(/verification failed/i);
  });
});

describe("Admin ID Token protected-header extension policy", () => {
  it("accepts and ignores an unknown non-critical protected-header member", async () => {
    await expect(
      verifyToken(
        createJwt({
          header: { vendor_noncritical_extension: { enabled: true } },
        }),
      ),
    ).resolves.toMatchObject({ sub: "admin-subject-123" });
  });

  it("rejects every unsupported crit entry", async () => {
    await expect(
      verifyToken(
        createJwt({
          header: {
            crit: ["vendor_critical_extension"],
            vendor_critical_extension: true,
          },
        }),
      ),
    ).rejects.toThrow(/verification failed/i);
  });
});

describe("trusted JWKS transport and parsing", () => {
  it("fetches only the discovery-provided JWKS URL and rejects redirects", async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedInit: RequestInit | undefined;
    const loader = createLoader(async (url, init) => {
      requestedUrl = url;
      requestedInit = init;
      return jwksResponse();
    });

    await expect(verifyToken(createJwt(), loader)).resolves.toMatchObject({
      sub: "admin-subject-123",
    });
    expect(String(requestedUrl)).toBe(jwksUri);
    expect(requestedInit?.redirect).toBe("error");
    expect(requestedInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects JWKS raw bytes above 64 KiB before UTF-8 decoding", async () => {
    const oversizedMalformedUtf8 = new Uint8Array(65_537).fill(0x80);
    const loader = createLoader(
      async () => new Response(oversizedMalformedUtf8),
    );

    await expect(verifyToken(createJwt(), loader)).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("accepts a valid JWKS response at exactly the 64 KiB raw-byte ceiling", async () => {
    const source = JSON.stringify({
      keys: [publicJwk],
      vendor_noncritical_extension: true,
    });
    const exactLimitSource = `${source}${" ".repeat(65_536 - Buffer.byteLength(source, "utf8"))}`;
    const loader = createLoader(async () => new Response(exactLimitSource));

    await expect(verifyToken(createJwt(), loader)).resolves.toMatchObject({
      sub: "admin-subject-123",
    });
  });

  it("rejects malformed JWKS UTF-8 before security JSON parsing", async () => {
    const malformedUtf8 = new Uint8Array([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]);
    const loader = createLoader(async () => new Response(malformedUtf8));

    await expect(verifyToken(createJwt(), loader)).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("rejects a duplicate decoded member in the JWKS root", async () => {
    const source = `{"keys":[],"\\u006beys":[${JSON.stringify(publicJwk)}]}`;
    const loader = createLoader(async () => new Response(source));

    await expect(verifyToken(createJwt(), loader)).rejects.toThrow(
      /verification failed/i,
    );
  });

  it.each([
    ["a non-array keys member", '{"keys":{"kid":"primary-key"}}'],
    [
      "type confusion in a known JWK member",
      `{"keys":[${JSON.stringify({ ...publicJwk, use: ["sig"] })}]}`,
    ],
  ])("rejects %s", async (_case, source) => {
    const loader = createLoader(async () => new Response(source));

    await expect(verifyToken(createJwt(), loader)).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("accepts 50 keys and rejects the 51st", async () => {
    const irrelevantKeys = Array.from({ length: 49 }, (_, index) => ({
      kty: "EC",
      kid: `irrelevant-${index}`,
    }));
    const fiftyKeyLoader = createLoader(async () =>
      jwksResponse([...irrelevantKeys, publicJwk]),
    );
    await expect(
      verifyToken(createJwt(), fiftyKeyLoader),
    ).resolves.toMatchObject({ sub: "admin-subject-123" });

    const fiftyOneKeyLoader = createLoader(async () =>
      jwksResponse([
        ...irrelevantKeys,
        { kty: "EC", kid: "irrelevant-49" },
        publicJwk,
      ]),
    );
    await expect(verifyToken(createJwt(), fiftyOneKeyLoader)).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("aborts a stalled JWKS request after exactly five seconds", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const loader = createLoader(
        async (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("transport secret must not escape"));
            });
          }),
      );
      const verification = verifyToken(createJwt(), loader);
      const rejection = expect(verification).rejects.toThrow(
        "Admin ID Token verification failed",
      );

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

describe("trusted JWKS cache and rotation", () => {
  it("uses a cached JWKS for less than five minutes and refreshes at expiry", async () => {
    let currentTimeMs = 10_000;
    let requests = 0;
    const loader = createLoader(
      async () => {
        requests += 1;
        return jwksResponse();
      },
      () => currentTimeMs,
    );

    await verifyToken(createJwt(), loader);
    currentTimeMs += 299_999;
    await verifyToken(createJwt(), loader);
    expect(requests).toBe(1);

    currentTimeMs += 1;
    await verifyToken(createJwt(), loader);
    expect(requests).toBe(2);
  });

  it("refreshes once for an unknown kid and accepts a rotated key only from trusted JWKS", async () => {
    const rotatedPublicJwk = {
      ...otherSigningPair.publicKey.export({ format: "jwk" }),
      kid: "rotated-key",
      use: "sig",
      alg: "RS256",
    };
    let requests = 0;
    const loader = createLoader(async () => {
      requests += 1;
      return requests === 1
        ? jwksResponse([publicJwk])
        : jwksResponse([publicJwk, rotatedPublicJwk]);
    });
    const token = createJwt({
      header: { kid: "rotated-key" },
      privateKey: otherSigningPair.privateKey,
    });

    await expect(verifyToken(token, loader)).resolves.toMatchObject({
      sub: "admin-subject-123",
    });
    expect(requests).toBe(2);
  });

  it("refreshes once when the initial same-kid key is unusable and accepts a new eligible key", async () => {
    let requests = 0;
    const loader = createLoader(async () => {
      requests += 1;
      return requests === 1
        ? jwksResponse([{ ...publicJwk, use: "enc" }])
        : jwksResponse([publicJwk]);
    });

    await expect(verifyToken(createJwt(), loader)).resolves.toMatchObject({
      sub: "admin-subject-123",
    });
    expect(requests).toBe(2);
  });

  it("denies after exactly one refresh when no eligible same-kid key appears", async () => {
    let requests = 0;
    const loader = createLoader(async () => {
      requests += 1;
      return jwksResponse([{ ...publicJwk, use: "enc" }]);
    });

    await expect(verifyToken(createJwt(), loader)).rejects.toThrow(
      /verification failed/i,
    );
    expect(requests).toBe(2);
  });

  it("denies an unknown kid after exactly one refresh", async () => {
    let requests = 0;
    const loader = createLoader(async () => {
      requests += 1;
      return jwksResponse();
    });

    await expect(
      verifyToken(createJwt({ header: { kid: "still-unknown" } }), loader),
    ).rejects.toThrow(/verification failed/i);
    expect(requests).toBe(2);
  });
});

describe("ID Token trust-source and UTF-8 isolation", () => {
  it("never fetches token jku or x5u and never trusts an embedded jwk", async () => {
    const embeddedJwk = {
      ...otherSigningPair.publicKey.export({ format: "jwk" }),
      kid: "embedded-attacker-key",
      use: "sig",
      alg: "RS256",
    };
    const requestedUrls: string[] = [];
    const loader = createLoader(async (url) => {
      requestedUrls.push(String(url));
      return jwksResponse();
    });
    const token = createJwt({
      header: {
        kid: "embedded-attacker-key",
        jku: "https://attacker.example/jwks.json",
        x5u: "https://attacker.example/certificate.pem",
        jwk: embeddedJwk,
      },
      privateKey: otherSigningPair.privateKey,
    });

    await expect(verifyToken(token, loader)).rejects.toThrow(
      /verification failed/i,
    );
    expect(requestedUrls).toEqual([jwksUri, jwksUri]);
  });

  it.each([
    [
      "protected header",
      Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]).toString("base64url"),
      encodeJson(validClaims),
    ],
    [
      "payload",
      encodeJson({ alg: "RS256", kid: "primary-key" }),
      Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]).toString("base64url"),
    ],
  ])(
    "rejects malformed UTF-8 in the JWT %s",
    async (_case, header, payload) => {
      let requests = 0;
      const loader = createLoader(async () => {
        requests += 1;
        return jwksResponse();
      });
      const token = signEncodedJwt(header, payload);

      await expect(verifyToken(token, loader)).rejects.toThrow(
        /verification failed/i,
      );
      expect(requests).toBe(0);
    },
  );
});
