import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "drizzle-orm";
import {
  requestAccountDeletionInTransaction,
  type DeletionDatabase,
} from "./repository.server";
import { encryptSubject, subjectFingerprint } from "./crypto.server";
const webhookSchema = z.object({
  app_id: z.string().regex(/^[1-9][0-9]*$/),
  user_id: z.string().regex(/^[1-9][0-9]*$/),
  referrer_type: z.enum([
    "ACCOUNT_DELETE",
    "FORCED_ACCOUNT_DELETE",
    "UNLINK_FROM_ADMIN",
    "UNLINK_FROM_APPS",
    "INCOMPLETE_SIGN_UP",
  ]),
});
export function createKakaoUnlinkWebhook(deps: {
  adminKey: string;
  appId: string;
  accept: (subject: string) => Promise<void>;
}) {
  return async (request: Request) => {
    const expected = `KakaoAK ${deps.adminKey}`;
    const auth = request.headers.get("authorization") ?? "";
    const hash = (s: string) => createHash("sha256").update(s).digest();
    if (!deps.adminKey || !timingSafeEqual(hash(auth), hash(expected)))
      return new Response(null, { status: 401 });
    if (
      !request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    )
      return new Response(null, { status: 415 });
    const raw = await request.text();
    if (raw.length > 2048) return new Response(null, { status: 413 });
    const params = new URLSearchParams(raw);
    if (
      ["app_id", "user_id", "referrer_type"].some(
        (key) => params.getAll(key).length !== 1,
      )
    )
      return new Response(null, { status: 400 });
    const parsed = webhookSchema.safeParse(Object.fromEntries(params));
    if (!parsed.success || parsed.data.app_id !== deps.appId)
      return new Response(null, { status: 400 });
    try {
      await deps.accept(parsed.data.user_id);
      return new Response(null, { status: 200 });
    } catch {
      return new Response(null, { status: 503 });
    }
  };
}
export async function recordKakaoUnlink(
  db: DeletionDatabase,
  subject: string,
  secret: string,
) {
  const fingerprint = subjectFingerprint(subject);
  await db.transactionManager.run(async (tx) => {
    await tx.raw(
      sql`select pg_advisory_xact_lock(hashtextextended(${"preppy-kakao:" + fingerprint},0))`,
    );
    await tx.raw(
      sql`insert into kakao_unlink_inbox(subject_fingerprint,encrypted_subject) values(${fingerprint},${encryptSubject(subject, secret)}) on conflict(subject_fingerprint) do nothing`,
    );
    const [identity] = (await tx.raw(
      sql`select user_id from auth_identities where provider='KAKAO' and provider_subject=${subject}`,
    )) as unknown as { user_id: string }[];
    if (identity)
      await requestAccountDeletionInTransaction(
        tx,
        identity.user_id,
        secret,
        "WEBHOOK",
      );
  });
}
