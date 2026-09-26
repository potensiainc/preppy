import { getRuntimeDatabase } from "@/src/infrastructure/db/runtime.server";
import { isAccountDeletionEnabled } from "@/src/modules/account-deletion/runtime.server";
import {
  createKakaoUnlinkWebhook,
  recordKakaoUnlink,
} from "@/src/modules/account-deletion/webhook.server";
import { deletionKey } from "@/src/modules/account-deletion/crypto.server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!isAccountDeletionEnabled()) return new Response(null, { status: 503 });
  try {
    const secret = process.env.ACCOUNT_DELETION_KEY ?? "";
    deletionKey(secret);
    const adminKey = process.env.KAKAO_ADMIN_KEY ?? "";
    const appId = process.env.KAKAO_APP_ID ?? "";
    return await createKakaoUnlinkWebhook({
      adminKey,
      appId,
      accept: (subject) =>
        recordKakaoUnlink(getRuntimeDatabase(), subject, secret),
    })(request);
  } catch {
    return new Response(null, { status: 503 });
  }
}
