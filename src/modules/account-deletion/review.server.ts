import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { DeletionDatabase } from "./repository.server";
const attestationSchema = z
  .object({
    receiptId: z.uuid(),
    reference: z.string().regex(/^[A-Z0-9][A-Z0-9_:/.-]{2,119}$/),
    externalErasureConfirmed: z.literal(true),
    backupErasureConfirmed: z.literal(true),
    logErasureConfirmed: z.literal(true),
  })
  .strict();
// Restricted operator command: reference must point to actual completed evidence,
// never a promise to erase later. No public endpoint exposes this transition.
export async function completeReviewedDeletion(
  db: DeletionDatabase,
  input: unknown,
) {
  const a = attestationSchema.parse(input);
  return db.transactionManager.run(async (tx) => {
    const rows = await tx.raw(
      sql`update account_deletion_jobs set status='COMPLETED',external_reviewed_at=now(),completed_at=now(),review_reference=${a.reference} where id=${a.receiptId} and status='EXTERNAL_REVIEW' and local_deleted_at is not null and unlinked_at is not null and user_id is null and encrypted_subject is null returning id`,
    );
    if (rows.length !== 1) throw new Error("DELETION_NOT_READY_FOR_COMPLETION");
    return { status: "COMPLETED" as const };
  });
}
