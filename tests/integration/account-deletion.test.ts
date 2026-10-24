import { recordKakaoUnlink } from "@/src/modules/account-deletion/webhook.server";
import { eraseRequestedLocalAccount } from "@/src/modules/account-deletion/repository.server";
import { subjectFingerprint } from "@/src/modules/account-deletion/crypto.server";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { migrateDatabase } from "@/src/db/migrate";
import {
  getRuntimeDatabase,
  closeRuntimeDatabase,
} from "@/src/infrastructure/db/runtime.server";
import {
  requestAccountDeletion,
  accountDeletionStatus,
} from "@/src/modules/account-deletion/repository.server";
import { completeReviewedDeletion } from "@/src/modules/account-deletion/review.server";
import { runDeletionWorker } from "@/src/modules/account-deletion/worker.server";
import { assertDedicatedTestDatabaseUrl } from "@/tests/support/test-database";
const url = process.env.TEST_DATABASE_URL;
const key = "ab".repeat(32);
describe.skipIf(!url)(
  "account deletion persistence (dedicated test DB only)",
  () => {
    let db: ReturnType<typeof getRuntimeDatabase>;
    beforeAll(async () => {
      assertDedicatedTestDatabaseUrl(url!);
      db = getRuntimeDatabase({
        DATABASE_URL: url!,
        DATABASE_MAX_CONNECTIONS: 4,
        NODE_ENV: "test",
      });
      await migrateDatabase(url!);
    });
    afterAll(async () => {
      await closeRuntimeDatabase();
    });
    it("serializes unlink intake with an OAuth identity insert that has not committed", async () => {
      const id = randomUUID();
      const subject = `8${Date.now()}`;
      let release!: () => void;
      let inserted!: () => void;
      const releaseInsert = new Promise<void>((resolve) => {
        release = resolve;
      });
      const sawInsert = new Promise<void>((resolve) => {
        inserted = resolve;
      });
      const signup = db.transactionManager.run(async (tx) => {
        await tx.raw(sql`insert into users(id,status) values(${id},'PENDING')`);
        await tx.raw(
          sql`insert into auth_identities(user_id,provider,provider_subject,status) values(${id},'KAKAO',${subject},'ACTIVE')`,
        );
        inserted();
        await releaseInsert;
      });
      await sawInsert;
      const callback = recordKakaoUnlink(db, subject, key);
      release();
      await Promise.all([signup, callback]);
      const [user] = await db.executor.raw(
        sql`select status from users where id=${id}`,
      );
      expect(user.status).toBe("DELETION_PENDING");
      const [job] = await db.executor.raw(
        sql`select id from account_deletion_jobs where user_id=${id}`,
      );
      expect(job).toBeDefined();
      await eraseRequestedLocalAccount(db, String(job.id));
      await db.executor.raw(
        sql`delete from account_deletion_jobs where id=${job.id}`,
      );
      await db.executor.raw(
        sql`delete from kakao_unlink_inbox where subject_fingerprint=${subjectFingerprint(subject)}`,
      );
    });

    it("persists revocation, deletes PII, retries provider failure, and never claims external cleanup is complete", async () => {
      const id = randomUUID();
      const subject = `9${Date.now()}`;
      await db.executor.raw(
        sql`insert into users(id,status) values(${id},'ACTIVE')`,
      );
      await db.executor.raw(
        sql`insert into auth_identities(user_id,provider,provider_subject,status) values(${id},'KAKAO',${subject},'ACTIVE')`,
      );
      await db.executor.raw(
        sql`insert into user_profiles(user_id,child_birth_year) values(${id},2020)`,
      );
      await db.executor.raw(
        sql`insert into consent_decisions(user_id,consent_type,policy_version,decision,decided_at) values(${id},'TERMS_OF_SERVICE','test','GRANTED',now())`,
      );
      await expect(
        db.executor.raw(sql`delete from consent_decisions where user_id=${id}`),
      ).rejects.toThrow();
      const [a, b] = await Promise.all([
        requestAccountDeletion(db, id, key),
        requestAccountDeletion(db, id, key),
      ]);
      expect(a.receiptId).toBe(b.receiptId);
      const [user] = await db.executor.raw(
        sql`select status from users where id=${id}`,
      );
      expect(user.status).toBe("DELETION_PENDING");
      await runDeletionWorker(db, key, async () => {
        throw new Error("provider timeout");
      });
      expect(
        await db.executor.raw(sql`select id from users where id=${id}`),
      ).toHaveLength(0);
      expect(
        await db.executor.raw(
          sql`select user_id from user_profiles where user_id=${id}`,
        ),
      ).toHaveLength(0);
      expect(
        await db.executor.raw(
          sql`select id from consent_decisions where user_id=${id}`,
        ),
      ).toHaveLength(0);
      expect(await accountDeletionStatus(db, a.receiptId)).toBe("PENDING");
      await db.executor.raw(
        sql`update account_deletion_jobs set next_attempt_at=now() where id=${a.receiptId}`,
      );
      await runDeletionWorker(db, key, async (received) => {
        expect(received).toBe(subject);
      });
      const [job] = await db.executor.raw(
        sql`select encrypted_subject,status from account_deletion_jobs where id=${a.receiptId}`,
      );
      expect(job.encrypted_subject).toBeNull();
      expect(job.status).toBe("EXTERNAL_REVIEW");
      expect(await accountDeletionStatus(db, a.receiptId)).toBe("PENDING");
      await completeReviewedDeletion(db, {
        receiptId: a.receiptId,
        reference: "OPS-TEST-ERASURE",
        externalErasureConfirmed: true,
        backupErasureConfirmed: true,
        logErasureConfirmed: true,
      });
      expect(await accountDeletionStatus(db, a.receiptId)).toBe("COMPLETED");
      const attemptedRejoin = randomUUID();
      await expect(
        db.transactionManager.run(async (tx) => {
          await tx.raw(
            sql`insert into users(id,status) values(${attemptedRejoin},'PENDING')`,
          );
          await tx.raw(
            sql`insert into auth_identities(user_id,provider,provider_subject,status) values(${attemptedRejoin},'KAKAO',${subject},'ACTIVE')`,
          );
        }),
      ).rejects.toThrow();
      expect(
        await db.executor.raw(
          sql`select id from users where id=${attemptedRejoin}`,
        ),
      ).toHaveLength(0);
      await db.executor.raw(
        sql`delete from account_deletion_jobs where id=${a.receiptId}`,
      );
    });
  },
);
