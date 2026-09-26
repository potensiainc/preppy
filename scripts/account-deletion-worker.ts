import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "../src/infrastructure/db/runtime.server";
import { isAccountDeletionEnabled } from "../src/modules/account-deletion/runtime.server";
import {
  cleanupExpiredPendingAccounts,
  runDeletionWorker,
  processKakaoUnlinkInbox,
} from "../src/modules/account-deletion/worker.server";
import { deletionKey } from "../src/modules/account-deletion/crypto.server";
import { unlinkKakao } from "../src/modules/account-deletion/kakao.server";
async function main() {
  if (!isAccountDeletionEnabled()) throw new Error("ACCOUNT_DELETION_DISABLED");
  const secret = process.env.ACCOUNT_DELETION_KEY ?? "";
  deletionKey(secret);
  const adminKey = process.env.KAKAO_ADMIN_KEY;
  if (!adminKey) throw new Error("KAKAO_ADMIN_KEY_REQUIRED");
  const db = getRuntimeDatabase();
  try {
    const webhook = await processKakaoUnlinkInbox(db, secret);
    const cleanup = await cleanupExpiredPendingAccounts(db, secret);
    const result = await runDeletionWorker(db, secret, (subject) =>
      unlinkKakao(subject, adminKey),
    );
    console.log(JSON.stringify({ webhook, cleanup, ...result }));
  } finally {
    await closeRuntimeDatabase();
  }
}
main().catch(() => {
  console.error("ACCOUNT_DELETION_WORKER_FAILED");
  process.exitCode = 1;
});
