import {
  closeRuntimeDatabase,
  getRuntimeDatabase,
} from "../src/infrastructure/db/runtime.server";
import { completeReviewedDeletion } from "../src/modules/account-deletion/review.server";
async function main() {
  const [receiptId, reference, ...flags] = process.argv.slice(2);
  if (
    flags.length !== 3 ||
    !flags.includes("--external-erased") ||
    !flags.includes("--backups-erased") ||
    !flags.includes("--logs-erased")
  )
    throw new Error("ACTUAL_ERASURE_ATTESTATION_REQUIRED");
  if (process.env.ACCOUNT_DELETION_READINESS !== "verified")
    throw new Error("DELETION_READINESS_REQUIRED");
  try {
    const result = await completeReviewedDeletion(getRuntimeDatabase(), {
      receiptId,
      reference,
      externalErasureConfirmed: true,
      backupErasureConfirmed: true,
      logErasureConfirmed: true,
    });
    console.log(JSON.stringify(result));
  } finally {
    await closeRuntimeDatabase();
  }
}
main().catch(() => {
  console.error("DELETION_REVIEW_NOT_APPLIED");
  process.exitCode = 1;
});
