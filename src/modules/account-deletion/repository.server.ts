import "server-only";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type {
  DatabaseExecutor,
  TransactionManager,
  TransactionExecutor,
} from "@/src/infrastructure/db/runtime.server";
import { encryptSubject, subjectFingerprint } from "./crypto.server";
export type DeletionDatabase = {
  executor: DatabaseExecutor;
  transactionManager: Pick<TransactionManager, "run">;
};
export async function requestAccountDeletion(
  db: DeletionDatabase,
  userId: string,
  secret: string,
  pendingMode?: "EXPIRED" | "CANCEL" | "WEBHOOK",
) {
  return db.transactionManager.run((tx) =>
    requestAccountDeletionInTransaction(tx, userId, secret, pendingMode),
  );
}
export async function requestAccountDeletionInTransaction(
  tx: TransactionExecutor,
  userId: string,
  secret: string,
  pendingMode?: "EXPIRED" | "CANCEL" | "WEBHOOK",
) {
  const [user] = (await tx.raw(
    sql`select id,status,created_at from users where id=${userId} for update`,
  )) as unknown as { id: string; status: string; created_at: Date }[];
  const [existing] = (await tx.raw(
    sql`select id from account_deletion_jobs where user_id=${userId}`,
  )) as unknown as { id: string }[];
  if (existing) return { receiptId: existing.id, status: "PENDING" as const };
  if (
    !user ||
    !(
      pendingMode === "WEBHOOK"
        ? ["ACTIVE", "PENDING", "SUSPENDED"]
        : ["ACTIVE", "PENDING"]
    ).includes(user.status)
  )
    throw new Error("ACCOUNT_NOT_AVAILABLE");
  if (
    pendingMode &&
    pendingMode !== "WEBHOOK" &&
    (user.status !== "PENDING" ||
      (pendingMode === "EXPIRED" &&
        new Date(user.created_at).getTime() > Date.now() - 82800000))
  )
    throw new Error("PENDING_NOT_EXPIRED");
  const [identity] = (await tx.raw(
    sql`select provider_subject from auth_identities where user_id=${userId} and provider='KAKAO' for update`,
  )) as unknown as { provider_subject: string }[];
  if (!identity || !/^[1-9][0-9]*$/.test(identity.provider_subject))
    throw new Error("IDENTITY_NOT_AVAILABLE");
  const id = randomUUID();
  const fingerprint = subjectFingerprint(identity.provider_subject);
  await tx.raw(
    sql`insert into account_deletion_jobs (id,user_id,subject_fingerprint,encrypted_subject) values (${id},${userId},${fingerprint},${encryptSubject(identity.provider_subject, secret)})`,
  );
  await tx.raw(
    sql`update users set status='DELETION_PENDING',updated_at=now() where id=${userId}`,
  );
  await tx.raw(
    sql`update auth_identities set status='REVOKED',revoked_at=now(),provider_subject=${`deletion:${fingerprint}`} where user_id=${userId}`,
  );
  await tx.raw(
    sql`update notification_preferences set state='DISABLED',updated_at=now() where user_id=${userId}`,
  );
  await tx.raw(
    sql`update user_emails set delivery_state='SUPPRESSED',updated_at=now() where user_id=${userId}`,
  );
  await tx.raw(
    sql`update outbox_events set status='CANCELLED',locked_at=null,locked_by=null,payload='{}'::jsonb where aggregate_id in (select id from notification_deliveries where user_id=${userId}) and status in ('PENDING','PROCESSING','FAILED')`,
  );
  await tx.raw(
    sql`update notification_deliveries set status='SUPPRESSED',suppress_reason='USER_INACTIVE',suppressed_at=now() where user_id=${userId} and status='QUEUED'`,
  );
  return { receiptId: id, status: "PENDING" as const };
}
export async function eraseLocalAccount(
  tx: TransactionExecutor,
  userId: string,
) {
  // Shared school, opportunity and notification content is intentionally retained.
  // Legacy email-only ownership is ambiguous: fail closed for manual review, never erase another account by email.
  const [legacy] = (await tx.raw(
    sql`select s.id from subscribers s join user_emails e on e.email_normalized=s.email_normalized where e.user_id=${userId} limit 1`,
  )) as unknown as { id: string }[];
  if (legacy) throw new Error("LEGACY_OWNERSHIP_REVIEW");
  await tx.raw(
    sql`delete from outbox_events where aggregate_id in (select id from email_provider_events where exists (select 1 from notification_delivery_attempts a join notification_deliveries d on d.id=a.notification_delivery_id where d.user_id=${userId} and a.provider=email_provider_events.provider and a.provider_message_id=email_provider_events.provider_message_id)) or aggregate_id in (select id from follows where user_id=${userId})`,
  );
  await tx.raw(
    sql`delete from email_provider_events where exists (select 1 from notification_delivery_attempts a join notification_deliveries d on d.id=a.notification_delivery_id where d.user_id=${userId} and a.provider=email_provider_events.provider and a.provider_message_id=email_provider_events.provider_message_id)`,
  );
  await tx.raw(
    sql`delete from outbox_events where aggregate_id in (select id from notification_deliveries where user_id=${userId}) or aggregate_id=${userId}`,
  );
  await tx.raw(
    sql`delete from notification_delivery_attempts where notification_delivery_id in (select id from notification_deliveries where user_id=${userId})`,
  );
  await tx.raw(
    sql`delete from notification_deliveries where user_id=${userId}`,
  );
  await tx.raw(
    sql`delete from follow_episodes where follow_id in (select id from follows where user_id=${userId})`,
  );
  for (const table of [
    "follows",
    "notification_preferences",
    "consent_decisions",
    "user_profiles",
    "user_interest_regions",
    "user_interest_categories",
    "user_emails",
    "auth_identities",
  ])
    await tx.raw(
      sql`delete from ${sql.identifier(table)} where user_id=${userId}`,
    );
  await tx.raw(sql`delete from audit_logs where entity_id=${userId}`);
  await tx.raw(
    sql`delete from users where id=${userId} and status='DELETION_PENDING'`,
  );
}
export async function accountDeletionStatus(db: DeletionDatabase, id: string) {
  const [job] = (await db.executor.raw(
    sql`select status from account_deletion_jobs where id=${id}`,
  )) as unknown as { status: string }[];
  return job
    ? job.status === "COMPLETED"
      ? ("COMPLETED" as const)
      : ("PENDING" as const)
    : null;
}

export async function eraseRequestedLocalAccount(
  db: DeletionDatabase,
  receiptId: string,
) {
  await db.transactionManager.run(async (tx) => {
    const [job] = (await tx.raw(
      sql`select user_id,local_deleted_at from account_deletion_jobs where id=${receiptId} for update`,
    )) as unknown as {
      user_id: string | null;
      local_deleted_at: Date | null;
    }[];
    if (!job || job.local_deleted_at) return;
    if (!job.user_id) throw new Error("DELETION_LOCAL_STATE_INVALID");
    await tx.raw(sql`select id from users where id=${job.user_id} for update`);
    await eraseLocalAccount(tx, job.user_id);
    await tx.raw(
      sql`update account_deletion_jobs set local_deleted_at=now() where id=${receiptId}`,
    );
  });
}
