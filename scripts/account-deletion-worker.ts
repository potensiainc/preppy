import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "../src/infrastructure/db/runtime.server";
import { isAccountDeletionEnabled } from "../src/modules/account-deletion/runtime.server";
import { runAccountDeletionPass } from "../src/modules/account-deletion/scheduled-pass.server";
async function main() {
  if (!isAccountDeletionEnabled()) throw new Error("ACCOUNT_DELETION_DISABLED");
  try {
    const result = await runAccountDeletionPass(getRuntimeDatabase());
    console.log(JSON.stringify(result));
  } finally {
    await closeRuntimeDatabase();
  }
}
main().catch(() => {
  console.error("ACCOUNT_DELETION_WORKER_FAILED");
  process.exitCode = 1;
});
