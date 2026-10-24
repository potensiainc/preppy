// Test-only Node preload: answers Kakao token and user/me calls in-process so
// the real start/callback/onboarding code can run end to end without Kakao.
// Load with NODE_OPTIONS="--import ./tests/browser/kakao/fake-kakao-fetch.mjs".
// Authorization codes encode the scenario: e2e.<numeric subject>.<email mode>.<nonce>
// where email mode is verified | unverified | none, or subject "5000" makes
// the token endpoint fail with HTTP 500.
import { appendFileSync } from "node:fs";

if (process.env.NODE_ENV === "production" && !process.env.KAKAO_FAKE_ALLOWED) {
  throw new Error("fake Kakao preload refused outside the local E2E runner");
}

const TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const USER_URL = "https://kapi.kakao.com/v2/user/me";
const usedCodes = new Set();
const realFetch = globalThis.fetch;

function log(entry) {
  if (process.env.KAKAO_FAKE_LOG)
    appendFileSync(process.env.KAKAO_FAKE_LOG, `${JSON.stringify(entry)}\n`);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json;charset=UTF-8" },
  });
}

async function token(init) {
  const form = new URLSearchParams(String(init?.body ?? ""));
  const code = form.get("code") ?? "";
  const clientOk =
    form.get("client_id") === process.env.KAKAO_CLIENT_ID &&
    (form.get("client_secret") ?? "") ===
      (process.env.KAKAO_CLIENT_SECRET ?? "");
  log({
    endpoint: "token",
    code,
    clientOk,
    redirectUri: form.get("redirect_uri"),
  });
  if (!clientOk)
    return json({ error: "invalid_client", error_code: "KOE010" }, 401);
  if (form.get("redirect_uri") !== process.env.KAKAO_REDIRECT_URI)
    return json({ error: "invalid_grant", error_code: "KOE303" }, 400);
  const match = /^e2e\.(\d+)\.(verified|unverified|none)\.[A-Za-z0-9]+$/.exec(
    code,
  );
  if (!match || usedCodes.has(code))
    return json({ error: "invalid_grant", error_code: "KOE320" }, 400);
  usedCodes.add(code);
  if (match[1] === "5000")
    return new Response("upstream error", { status: 500 });
  return json({
    token_type: "bearer",
    access_token: `at.${match[1]}.${match[2]}`,
    expires_in: 21599,
    refresh_token: "e2e-refresh",
    refresh_token_expires_in: 5183999,
    scope: "account_email",
  });
}

function user(init) {
  const auth = new Headers(init?.headers).get("authorization") ?? "";
  const match = /^Bearer at\.(\d+)\.(verified|unverified|none)$/.exec(auth);
  log({ endpoint: "user", ok: Boolean(match) });
  if (!match)
    return json({ msg: "this access token does not exist", code: -401 }, 401);
  const [, subject, mode] = match;
  const kakao_account =
    mode === "none"
      ? { has_email: true, email_needs_agreement: true }
      : {
          has_email: true,
          email_needs_agreement: false,
          is_email_valid: true,
          is_email_verified: mode === "verified",
          email: `kakao${subject}@example.test`,
        };
  return json({
    id: Number(subject),
    connected_at: new Date().toISOString(),
    kakao_account,
  });
}

globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url === TOKEN_URL) return token(init);
  if (url === USER_URL) return user(init);
  return realFetch(input, init);
};
