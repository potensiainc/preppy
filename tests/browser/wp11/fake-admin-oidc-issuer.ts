import {
  constants,
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const fakeAdminOidcModes = [
  "NORMAL",
  "UNKNOWN_SUBJECT",
  "DISABLED_SUBJECT",
  "INVALID_SIGNATURE",
  "INVALID_ISSUER",
  "INVALID_AUDIENCE",
  "INVALID_NONCE",
  "EXPIRED",
  "DUPLICATE_DISCOVERY_JSON",
  "DUPLICATE_TOKEN_JSON",
  "DUPLICATE_JWKS_JSON",
  "DUPLICATE_JWT_HEADER_JSON",
  "DUPLICATE_JWT_CLAIMS_JSON",
  "DISCOVERY_UNSUPPORTED_CODE",
  "DISCOVERY_UNSUPPORTED_RS256",
  "DISCOVERY_UNSUPPORTED_GRANT",
  "DISCOVERY_UNSUPPORTED_BASIC",
  "DISCOVERY_UNSUPPORTED_S256",
  "DISCOVERY_UNSUPPORTED_QUERY",
] as const;

export type FakeAdminOidcMode = (typeof fakeAdminOidcModes)[number];

export type FakeAdminOidcIssuerOptions = Readonly<{
  hostname: "127.0.0.1";
  port: number;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  activeSubject: string;
  disabledSubject: string;
}>;

export type FakeAdminOidcIssuer = Readonly<{
  issuer: string;
  port: number;
  kid: string;
  setMode(mode: FakeAdminOidcMode): void;
  close(): Promise<void>;
}>;

type AuthorizationGrant = {
  redirectUri: string;
  nonce: string;
  codeChallenge: string;
  mode: FakeAdminOidcMode;
  consumed: boolean;
};

const canonicalPkce = /^[A-Za-z0-9_-]{43}$/;
const canonicalVerifier = /^[A-Za-z0-9._~-]{43,128}$/;
const maxRequestBodyBytes = 8 * 1_024;

function json(response: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json;charset=UTF-8",
    "content-length": Buffer.byteLength(encoded),
  });
  response.end(encoded);
}

function rawJson(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json;charset=UTF-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function badRequest(response: ServerResponse): void {
  json(response, 400, { error: "invalid_request" });
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maxRequestBodyBytes) throw new Error("request too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function decodeFormCredential(value: string): string {
  const decoded = new URLSearchParams(`credential=${value}`).get("credential");
  if (decoded === null) throw new Error("invalid credential");
  return decoded;
}

function readClientSecretBasic(
  authorization: string | undefined,
): { clientId: string; clientSecret: string } | null {
  if (!authorization?.startsWith("Basic ")) return null;
  const encoded = authorization.slice("Basic ".length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const decodedBytes = Buffer.from(encoded, "base64");
  if (
    decodedBytes.toString("base64").replace(/=+$/u, "") !==
    encoded.replace(/=+$/u, "")
  ) {
    return null;
  }
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
    decodedBytes,
  );
  const delimiter = decoded.indexOf(":");
  if (delimiter < 0) return null;
  try {
    return {
      clientId: decodeFormCredential(decoded.slice(0, delimiter)),
      clientSecret: decodeFormCredential(decoded.slice(delimiter + 1)),
    };
  } catch {
    return null;
  }
}

function createDiscovery(issuer: string, mode: FakeAdminOidcMode) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    response_types_supported:
      mode === "DISCOVERY_UNSUPPORTED_CODE" ? ["token"] : ["code"],
    response_modes_supported:
      mode === "DISCOVERY_UNSUPPORTED_QUERY" ? ["form_post"] : ["query"],
    grant_types_supported:
      mode === "DISCOVERY_UNSUPPORTED_GRANT"
        ? ["client_credentials"]
        : ["authorization_code"],
    token_endpoint_auth_methods_supported:
      mode === "DISCOVERY_UNSUPPORTED_BASIC"
        ? ["client_secret_post"]
        : ["client_secret_basic"],
    id_token_signing_alg_values_supported:
      mode === "DISCOVERY_UNSUPPORTED_RS256" ? ["ES256"] : ["RS256"],
    code_challenge_methods_supported:
      mode === "DISCOVERY_UNSUPPORTED_S256" ? ["plain"] : ["S256"],
  };
}

function jwtPart(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signIdToken(input: {
  mode: FakeAdminOidcMode;
  issuer: string;
  clientId: string;
  nonce: string;
  subject: string;
  kid: string;
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
  attackerPrivateKey: ReturnType<typeof generateKeyPairSync>["privateKey"];
}): string {
  const now = Math.floor(Date.now() / 1_000);
  const header =
    input.mode === "DUPLICATE_JWT_HEADER_JSON"
      ? `{"alg":"RS256","alg":"RS256","kid":${JSON.stringify(input.kid)},"typ":"JWT"}`
      : JSON.stringify({ alg: "RS256", kid: input.kid, typ: "JWT" });
  const claimsObject = {
    iss:
      input.mode === "INVALID_ISSUER"
        ? `${input.issuer}/untrusted`
        : input.issuer,
    sub: input.subject,
    aud:
      input.mode === "INVALID_AUDIENCE"
        ? `${input.clientId}-untrusted`
        : input.clientId,
    iat: input.mode === "EXPIRED" ? now - 600 : now,
    exp: input.mode === "EXPIRED" ? now - 300 : now + 300,
    nonce:
      input.mode === "INVALID_NONCE" ? `${input.nonce}-wrong` : input.nonce,
  };
  const claims =
    input.mode === "DUPLICATE_JWT_CLAIMS_JSON"
      ? `{"iss":${JSON.stringify(claimsObject.iss)},"sub":${JSON.stringify(
          claimsObject.sub,
        )},"aud":${JSON.stringify(claimsObject.aud)},"iat":${claimsObject.iat},"exp":${claimsObject.exp},"nonce":${JSON.stringify(
          claimsObject.nonce,
        )},"nonce":${JSON.stringify(claimsObject.nonce)}}`
      : JSON.stringify(claimsObject);
  const encodedHeader = jwtPart(header);
  const encodedClaims = jwtPart(claims);
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput, "ascii"), {
    key:
      input.mode === "INVALID_SIGNATURE"
        ? input.attackerPrivateKey
        : input.privateKey,
    padding: constants.RSA_PKCS1_PADDING,
  }).toString("base64url");
  return `${signingInput}.${signature}`;
}

function subjectForMode(
  mode: FakeAdminOidcMode,
  options: FakeAdminOidcIssuerOptions,
): string {
  if (mode === "UNKNOWN_SUBJECT") return "wp11-browser-unknown";
  if (mode === "DISABLED_SUBJECT") return options.disabledSubject;
  return options.activeSubject;
}

export async function startFakeAdminOidcIssuer(
  options: FakeAdminOidcIssuerOptions,
): Promise<FakeAdminOidcIssuer> {
  const signingKeys = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  const attackerKeys = generateKeyPairSync("rsa", { modulusLength: 2_048 });
  const kid = randomBytes(16).toString("base64url");
  const publicJwk = signingKeys.publicKey.export({ format: "jwk" });
  const grants = new Map<string, AuthorizationGrant>();
  let mode: FakeAdminOidcMode = "NORMAL";
  let issuer = "";

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", issuer);

      if (
        request.method === "GET" &&
        requestUrl.pathname === "/.well-known/openid-configuration"
      ) {
        const discovery = createDiscovery(issuer, mode);
        if (mode === "DUPLICATE_DISCOVERY_JSON") {
          const body = JSON.stringify(discovery);
          rawJson(
            response,
            200,
            body.replace("{", `{"issuer":${JSON.stringify(issuer)},`),
          );
          return;
        }
        json(response, 200, discovery);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/jwks") {
        const key = {
          ...publicJwk,
          kid,
          alg: "RS256",
          use: "sig",
        };
        if (mode === "DUPLICATE_JWKS_JSON") {
          rawJson(response, 200, `{"keys":[],"keys":[${JSON.stringify(key)}]}`);
          return;
        }
        json(response, 200, { keys: [key] });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/authorize") {
        const parameters = requestUrl.searchParams;
        const scope = parameters.get("scope")?.split(" ") ?? [];
        const codeChallenge = parameters.get("code_challenge") ?? "";
        if (
          parameters.get("client_id") !== options.clientId ||
          parameters.get("redirect_uri") !== options.redirectUri ||
          parameters.get("response_type") !== "code" ||
          parameters.get("response_mode") !== "query" ||
          !scope.includes("openid") ||
          parameters.get("state") === null ||
          parameters.get("state") === "" ||
          parameters.get("nonce") === null ||
          parameters.get("nonce") === "" ||
          parameters.get("code_challenge_method") !== "S256" ||
          !canonicalPkce.test(codeChallenge)
        ) {
          badRequest(response);
          return;
        }
        const code = randomBytes(32).toString("base64url");
        grants.set(code, {
          redirectUri: options.redirectUri,
          nonce: parameters.get("nonce")!,
          codeChallenge,
          mode,
          consumed: false,
        });
        const callback = new URL(options.redirectUri);
        callback.searchParams.set("code", code);
        callback.searchParams.set("state", parameters.get("state")!);
        response.writeHead(302, {
          "cache-control": "no-store",
          location: callback.toString(),
        });
        response.end();
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/token") {
        if (
          !request.headers["content-type"]
            ?.toLowerCase()
            .startsWith("application/x-www-form-urlencoded")
        ) {
          badRequest(response);
          return;
        }
        const credentials = readClientSecretBasic(
          request.headers.authorization,
        );
        if (
          credentials?.clientId !== options.clientId ||
          credentials.clientSecret !== options.clientSecret
        ) {
          response.setHeader("www-authenticate", "Basic");
          json(response, 401, { error: "invalid_client" });
          return;
        }
        const parameters = new URLSearchParams(await readBody(request));
        const code = parameters.get("code") ?? "";
        const verifier = parameters.get("code_verifier") ?? "";
        const grant = grants.get(code);
        if (!grant || grant.consumed) {
          badRequest(response);
          return;
        }
        grant.consumed = true;
        if (
          parameters.get("grant_type") !== "authorization_code" ||
          parameters.get("redirect_uri") !== options.redirectUri ||
          !canonicalVerifier.test(verifier) ||
          grant.redirectUri !== options.redirectUri ||
          createHash("sha256").update(verifier, "ascii").digest("base64url") !==
            grant.codeChallenge
        ) {
          badRequest(response);
          return;
        }
        const idToken = signIdToken({
          mode: grant.mode,
          issuer,
          clientId: options.clientId,
          nonce: grant.nonce,
          subject: subjectForMode(grant.mode, options),
          kid,
          privateKey: signingKeys.privateKey,
          attackerPrivateKey: attackerKeys.privateKey,
        });
        if (grant.mode === "DUPLICATE_TOKEN_JSON") {
          rawJson(
            response,
            200,
            `{"token_type":"Bearer","expires_in":300,"id_token":${JSON.stringify(
              idToken,
            )},"id_token":${JSON.stringify(idToken)}}`,
          );
          return;
        }
        json(response, 200, {
          token_type: "Bearer",
          expires_in: 300,
          id_token: idToken,
        });
        return;
      }

      if (
        request.method === "POST" &&
        requestUrl.pathname === "/__fixture__/mode"
      ) {
        const parsed = JSON.parse(await readBody(request)) as {
          mode?: unknown;
        };
        if (
          typeof parsed.mode !== "string" ||
          !fakeAdminOidcModes.includes(parsed.mode as FakeAdminOidcMode)
        ) {
          badRequest(response);
          return;
        }
        mode = parsed.mode as FakeAdminOidcMode;
        json(response, 200, { mode });
        return;
      }

      if (
        request.method === "GET" &&
        requestUrl.pathname === "/__fixture__/status"
      ) {
        json(response, 200, { mode, issuer, kid, pid: process.pid });
        return;
      }

      json(response, 404, { error: "not_found" });
    } catch {
      json(response, 400, { error: "invalid_request" });
    }
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.hostname, () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Fake Admin OIDC issuer did not bind a TCP port");
  }
  issuer = `http://${options.hostname}:${address.port}`;

  return {
    issuer,
    port: address.port,
    kid,
    setMode(nextMode) {
      mode = nextMode;
    },
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
  };
}

async function runStandalone(): Promise<void> {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const port = Number(required("FAKE_ADMIN_OIDC_PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("FAKE_ADMIN_OIDC_PORT must be a valid TCP port");
  }
  const fixture = await startFakeAdminOidcIssuer({
    hostname: "127.0.0.1",
    port,
    clientId: required("FAKE_ADMIN_OIDC_CLIENT_ID"),
    clientSecret: required("FAKE_ADMIN_OIDC_CLIENT_SECRET"),
    redirectUri: required("FAKE_ADMIN_OIDC_REDIRECT_URI"),
    activeSubject: required("FAKE_ADMIN_OIDC_ACTIVE_SUBJECT"),
    disabledSubject: required("FAKE_ADMIN_OIDC_DISABLED_SUBJECT"),
  });
  process.stdout.write(
    `${JSON.stringify({ type: "READY", issuer: fixture.issuer, port: fixture.port, pid: process.pid })}\n`,
  );
  const close = async () => {
    await fixture.close();
    process.exit(0);
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  runStandalone().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Fake issuer failed"}\n`,
    );
    process.exit(1);
  });
}
