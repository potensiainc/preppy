import "server-only";
import type { DeletionDatabase } from "./repository.server";
import {
  cleanupExpiredPendingAccounts,
  processKakaoUnlinkInbox,
  runDeletionWorker,
} from "./worker.server";
import { deletionKey } from "./crypto.server";
import { unlinkKakao } from "./kakao.server";

// One bounded deletion pass: Kakao unlink webhooks, expired sign-ups, then
// one deletion job. Shared by `account-deletion:once` and the scheduled worker.
export async function runAccountDeletionPass(
  db: DeletionDatabase,
  environment: Record<string, string | undefined> = process.env,
  unlink: typeof unlinkKakao = unlinkKakao,
) {
  const secret = environment.ACCOUNT_DELETION_KEY ?? "";
  deletionKey(secret);
  const adminKey = environment.KAKAO_ADMIN_KEY;
  if (!adminKey) throw new Error("KAKAO_ADMIN_KEY_REQUIRED");
  const webhook = await processKakaoUnlinkInbox(db, secret);
  const cleanup = await cleanupExpiredPendingAccounts(db, secret);
  const result = await runDeletionWorker(db, secret, (subject) =>
    unlink(subject, adminKey),
  );
  return { webhook, cleanup, ...result };
}
