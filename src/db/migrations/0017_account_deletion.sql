CREATE TABLE "account_deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"subject_fingerprint" text NOT NULL,
	"encrypted_subject" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_token" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"local_deleted_at" timestamp with time zone,
	"unlinked_at" timestamp with time zone,
	"external_reviewed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"safe_error_code" text,
	"review_reference" text,
	CONSTRAINT "account_deletion_jobs_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "account_deletion_jobs_subject_fingerprint_unique" UNIQUE("subject_fingerprint"),
	CONSTRAINT "account_deletion_review_reference_check" CHECK ("account_deletion_jobs"."status" <> 'COMPLETED' or ("account_deletion_jobs"."review_reference" is not null and length("account_deletion_jobs"."review_reference") between 3 and 120)),
	CONSTRAINT "account_deletion_jobs_status_check" CHECK ("account_deletion_jobs"."status" in ('PENDING','EXTERNAL_REVIEW','COMPLETED','ATTENTION_REQUIRED')),
	CONSTRAINT "account_deletion_jobs_lease_check" CHECK (("account_deletion_jobs"."lease_until" is null) = ("account_deletion_jobs"."lease_token" is null)),
	CONSTRAINT "account_deletion_jobs_completion_check" CHECK ("account_deletion_jobs"."status" <> 'COMPLETED' or ("account_deletion_jobs"."local_deleted_at" is not null and "account_deletion_jobs"."unlinked_at" is not null and "account_deletion_jobs"."external_reviewed_at" is not null and "account_deletion_jobs"."encrypted_subject" is null and "account_deletion_jobs"."user_id" is null))
);

--> statement-breakpoint
CREATE TABLE "kakao_unlink_inbox" (
	"subject_fingerprint" text PRIMARY KEY NOT NULL,
	"encrypted_subject" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "kakao_unlink_inbox_status_check" CHECK ("kakao_unlink_inbox"."status" in ('RECEIVED','APPLIED','ATTENTION_REQUIRED'))
);

--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_status_check";
--> statement-breakpoint
ALTER TABLE "account_deletion_jobs" ADD CONSTRAINT "account_deletion_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "account_deletion_due_idx" ON "account_deletion_jobs" USING btree ("status","next_attempt_at");
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("users"."status" in ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED', 'DELETION_PENDING'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_consent_decision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' AND EXISTS (
  SELECT 1 FROM users u JOIN account_deletion_jobs j ON j.user_id=u.id
  WHERE u.id=OLD.user_id AND u.status='DELETION_PENDING'
 ) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'consent decisions are append-only outside account erasure' USING ERRCODE='23514';
END;
$$;
--> statement-breakpoint
CREATE FUNCTION block_deleting_kakao_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fingerprint text;
BEGIN
 fingerprint := encode(sha256(convert_to('kakao-deletion:' || NEW.provider_subject,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('preppy-kakao:' || fingerprint,0));
 IF NEW.provider='KAKAO' AND (EXISTS(SELECT 1 FROM account_deletion_jobs WHERE subject_fingerprint=fingerprint)
 OR EXISTS(SELECT 1 FROM kakao_unlink_inbox WHERE subject_fingerprint=fingerprint)) THEN
 RAISE EXCEPTION 'identity deletion requires review before relinking' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER block_deleting_kakao_identity_before_insert BEFORE INSERT ON auth_identities
FOR EACH ROW EXECUTE FUNCTION block_deleting_kakao_identity();
