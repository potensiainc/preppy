import "server-only";

import { z } from "zod";

const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_IDENTITY_URL = "https://kapi.kakao.com/v2/user/me";
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1_024;

const authorizationValue = z
  .string()
  .min(1)
  .max(2_048)
  .regex(/^[A-Za-z0-9._~-]+$/);

const tokenResponseSchema = z.object({
  token_type: z.literal("bearer"),
  access_token: z.string().min(1).max(4_096),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).max(4_096),
  refresh_token_expires_in: z.number().int().positive(),
});

const providerSubject = z.union([
  z.number().int().safe().positive().transform(String),
  z.string().regex(/^\d{1,64}$/),
]);

const identityResponseSchema = z.object({
  id: providerSubject,
  kakao_account: z
    .object({
      email_needs_agreement: z.boolean().optional(),
      is_email_valid: z.boolean().optional(),
      is_email_verified: z.boolean().optional(),
      email: z.email().max(320).optional(),
    })
    .optional(),
});

declare const kakaoGrantBrand: unique symbol;
export type KakaoAuthorizationGrant = {
  readonly [kakaoGrantBrand]: true;
};

export type KakaoProviderConfig = {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
};

export type KakaoIdentity = {
  subject: string;
  emailClaim?: {
    value: string;
    valid: boolean;
    verified: boolean;
  };
};

export interface KakaoAuthProvider {
  buildAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<KakaoAuthorizationGrant>;
  resolveIdentity(grant: KakaoAuthorizationGrant): Promise<KakaoIdentity>;
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The operation boundary below maps transport failures to generic errors.
  }
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      await cancelBody(response);
      throw new Error("Invalid provider content length");
    }
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length > MAX_PROVIDER_RESPONSE_BYTES) {
      await cancelBody(response);
      throw new Error("Provider response was too large");
    }
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PROVIDER_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Provider response was too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    totalBytes,
  ).toString("utf8");
}

async function parseProviderJson(response: Response): Promise<unknown> {
  const body = await readBoundedBody(response);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("Kakao provider returned malformed JSON");
  }
}

async function runProviderOperation<T>(
  errorMessage: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new Error(errorMessage);
  }
}

export function createKakaoProvider(
  config: KakaoProviderConfig,
  fetchImpl: typeof fetch = fetch,
): KakaoAuthProvider {
  if (!config.clientId || !config.redirectUri) {
    throw new Error("Kakao provider configuration is invalid");
  }
  const grants = new WeakMap<object, string>();

  return {
    buildAuthorizationUrl(state) {
      const parsedState = authorizationValue.parse(state);
      const url = new URL(KAKAO_AUTHORIZE_URL);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        state: parsedState,
        scope: "account_email",
      }).toString();
      return url.toString();
    },

    async exchangeCode(code) {
      return runProviderOperation("Kakao token exchange failed", async () => {
        const parsedCode = authorizationValue.parse(code);
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          code: parsedCode,
        });
        if (config.clientSecret) body.set("client_secret", config.clientSecret);

        const response = await fetchImpl(KAKAO_TOKEN_URL, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded;charset=utf-8",
          },
          body,
          redirect: "error",
        });
        if (!response.ok) {
          await cancelBody(response);
          throw new Error("Provider rejected token exchange");
        }
        const token = tokenResponseSchema.safeParse(
          await parseProviderJson(response),
        );
        if (!token.success) {
          throw new Error("Provider token response was invalid");
        }

        const grant = Object.freeze(
          Object.create(null),
        ) as KakaoAuthorizationGrant;
        grants.set(grant, token.data.access_token);
        return grant;
      });
    },

    async resolveIdentity(grant) {
      return runProviderOperation(
        "Kakao identity resolution failed",
        async () => {
          const accessToken = grants.get(grant);
          if (!accessToken) {
            throw new Error("Kakao authorization grant is invalid");
          }

          const response = await fetchImpl(KAKAO_IDENTITY_URL, {
            method: "GET",
            headers: {
              accept: "application/json",
              authorization: `Bearer ${accessToken}`,
            },
            redirect: "error",
          });
          if (!response.ok) {
            await cancelBody(response);
            throw new Error("Provider rejected identity request");
          }
          const identity = identityResponseSchema.safeParse(
            await parseProviderJson(response),
          );
          if (!identity.success) {
            throw new Error("Provider identity response was invalid");
          }

          const account = identity.data.kakao_account;
          const emailClaim =
            account?.email_needs_agreement === false && account.email
              ? {
                  value: account.email,
                  valid: account.is_email_valid === true,
                  verified: account.is_email_verified === true,
                }
              : undefined;
          return emailClaim
            ? { subject: identity.data.id, emailClaim }
            : { subject: identity.data.id };
        },
      );
    },
  };
}
