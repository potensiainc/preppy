import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DeletionDatabase } from "./repository.server";
import {
  eraseLocalAccount,
  requestAccountDeletion,
  requestAccountDeletionInTransaction,
  eraseRequestedLocalAccount,
} from "./repository.server";
import { decryptSubject } from "./crypto.server";
export async function runDeletionWorker(
  db: DeletionDatabase,
  secret: string,
  unlink: (subject: string) => Promise<void>,
) {
  const leaseToken = randomUUID();
  const job = await db.transactionManager.run(async (tx) => {
    const [row] = (await tx.raw(
      sql`select id,user_id,encrypted_subject,local_deleted_at,attempts from account_deletion_jobs where status='PENDING' and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by requested_at for update skip locked limit 1`,
    )) as unknown as {
      id: string;
      user_id: string | null;
      encrypted_subject: string;
      local_deleted_at: Date | null;
      attempts: number;
    }[];
    if (!row) return null;
    await tx.raw(
      sql`update account_deletion_jobs set lease_token=${leaseToken},lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=${row.id}`,
    );
    return row;
  });
  if (!job) return { processed: false };
  try {
    if (!job.local_deleted_at)
      await db.transactionManager.run(async (tx) => {
        const [owned] = (await tx.raw(
          sql`select id from account_deletion_jobs where id=${job.id} and lease_token=${leaseToken} for update`,
        )) as unknown as { id: string }[];
        if (!owned || !job.user_id) throw new Error("DELETION_LEASE_LOST");
        await eraseLocalAccount(tx, job.user_id);
        await tx.raw(
          sql`update account_deletion_jobs set local_deleted_at=now() where id=${job.id}`,
        );
      });
    // External provider work is outside all DB transactions; crash-safe retries accept only -101 as already unlinked.
    await unlink(decryptSubject(job.encrypted_subject, secret));
    await db.transactionManager.run(async (tx) => {
      await tx.raw(
        sql`update account_deletion_jobs set unlinked_at=now(),encrypted_subject=null,status='EXTERNAL_REVIEW',lease_until=null,lease_token=null,safe_error_code=null where id=${job.id} and lease_token=${leaseToken}`,
      );
    });
    return { processed: true, status: "EXTERNAL_REVIEW" };
  } catch (error) {
    const needsReview =
      error instanceof Error && error.message === "LEGACY_OWNERSHIP_REVIEW";
    await db.transactionManager.run(async (tx) => {
      await tx.raw(
        sql`update account_deletion_jobs set status=${needsReview || job.attempts >= 7 ? "ATTENTION_REQUIRED" : "PENDING"},safe_error_code=${needsReview ? "LEGACY_OWNERSHIP_REVIEW" : "DELETION_RETRY_REQUIRED"},next_attempt_at=now()+interval '5 minutes',lease_until=null,lease_token=null where id=${job.id} and lease_token=${leaseToken}`,
      );
    });
    return {
      processed: true,
      status:
        needsReview || job.attempts >= 7 ? "ATTENTION_REQUIRED" : "PENDING",
    };
  }
}
export async function cleanupExpiredPendingAccounts(
  db: DeletionDatabase,
  secret: string,
) {
  const rows = (await db.executor.raw(
    sql`select id from users where status='PENDING' and created_at<=now()-interval '23 hours' order by created_at limit 100`,
  )) as unknown as { id: string }[];
  let accepted = 0;
  for (const row of rows) {
    try {
      const job = await requestAccountDeletion(db, row.id, secret, "EXPIRED");
      await eraseRequestedLocalAccount(db, job.receiptId);
      accepted++;
    } catch {
      /* Race with completed signup leaves that account intact; next run retries other failures. */
    }
  }
  return { examined: rows.length, accepted };
}

export async function processKakaoUnlinkInbox(
  db: DeletionDatabase,
  secret: string,
) {
  const rows = (await db.executor.raw(
    sql`select subject_fingerprint,encrypted_subject from kakao_unlink_inbox where status='RECEIVED' order by received_at limit 100`,
  )) as unknown as { subject_fingerprint: string; encrypted_subject: string }[];
  let processed = 0;
  for (const row of rows) {
    const subject = decryptSubject(row.encrypted_subject, secret);
    await db.transactionManager.run(async (tx) => {
      await tx.raw(
        sql`select pg_advisory_xact_lock(hashtextextended(${"preppy-kakao:" + row.subject_fingerprint},0))`,
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
      await tx.raw(
        sql`update kakao_unlink_inbox set status='APPLIED',encrypted_subject=null,processed_at=now() where subject_fingerprint=${row.subject_fingerprint}`,
      );
    });
    processed++;
  }
  return { processed };
}
