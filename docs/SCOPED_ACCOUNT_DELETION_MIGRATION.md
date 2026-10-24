# Guarded account-deletion migration (0017)

Owner decision (2026-10-21): apply the deferred `0017_account_deletion` to production. This document describes the command that does it. It does not itself authorize a run; an operator with the production database management credentials runs it after reviewing the dry-run.

## Why a separate command

Production applied `0018_english_session_identity` with its scoped command while 0017 was deferred, so its ledger is `0000…0016, 0018`. The full runner stops on that gap (`MIGRATION_GAP_REQUIRES_REVIEW`) and must not be bypassed.

`npm run db:migrate:account-deletion` applies only 0017 and appends its ledger row after 0018 with the original journal timestamp `1790298000000`. The runners accept exactly one out-of-order append: 0017 directly after 0018 (`APPROVED_OUT_OF_ORDER_APPENDS` in `src/db/migration-plan.ts`). Any other reversal is still `MIGRATION_LEDGER_ORDER_MISMATCH`. Readers that order by journal time (admin snapshot, preflight, restore drill, live-admissions rollout) then see the canonical order and report `MATCH`.

Where 0018 was never applied, the command refuses with `SCOPED_USE_FULL_RUNNER`: the ordinary full runner applies 0017 there in journal order.

## Command

The command is dry-run by default:

```sh
npm run db:migrate:account-deletion -- \
  --target production \
  --backup-receipt /private/verified-backup-receipt.json \
  --expected-sql-checksum e4ad10ea39af39346176bcbdaa0340ef3b1a71664106be2c3e6cf16762bca6c1
```

Review the dry-run (`{"mode":"DRY_RUN","applied":false,...}`), then add `--apply` in the approved change window.

The target ids, management `DATABASE_URL`, `preppy_migration` role and backup receipt rules are the same as for the scoped 0018 command; see [SCOPED_ENGLISH_SESSION_MIGRATION.md](SCOPED_ENGLISH_SESSION_MIGRATION.md#required-backup-receipt). The receipt's `ledgerSha256` must match the current ledger (`0000…0016, 0018`) and the backup must be at most six hours old.

## Guards

All checks run in one transaction that holds the migration advisory lock and the ledger lock. Any failure rolls back every statement and the ledger row.

- Environment ids, database name, backup receipt and SQL checksum must match.
- Ledger: every hash through 0016 plus 0018 present with original timestamps, no later history, 0017 absent (apply) or present (no-op).
- Dependencies: `users`, `auth_identities`, `consent_decisions` and `prevent_consent_decision_mutation()` exist.
- Schema state is either fully absent or exactly the 0017 result. Exact means both tables owned by `preppy_migration`, the ten named constraints, `account_deletion_due_idx`, `users_status_check` allowing `DELETION_PENDING`, the updated consent function, the enabled relink trigger and existing runtime privileges for `preppy_runtime`. A partial state stops with `SCOPED_SCHEMA_DRIFT` and is never repaired by this command.
- After the DDL the schema is read back; the old ledger rows must be unchanged.
- A matching repeat is `NO_OP`.

## After applying

1. Confirm `/admin/operations/health` shows migration `MATCH` and no `ACCOUNT_DELETION_SCHEMA_MISSING`.
2. Account deletion stays off until `ACCOUNT_DELETION_ENABLED=true`, `ACCOUNT_DELETION_READINESS=verified`, `ACCOUNT_DELETION_KEY`, `ACCOUNT_DELETION_RECEIPT_SECRET`, `KAKAO_ADMIN_KEY` and `KAKAO_APP_ID` are set. The IaC pins `ACCOUNT_DELETION_ENABLED` to `false`; turning it on is a separate Owner decision.
3. The scheduled `worker:once` cron runs one deletion pass after the Outbox pass whenever account deletion is enabled, so no separate cron service is needed. The worker service needs `KAKAO_ADMIN_KEY`, `ACCOUNT_DELETION_KEY`, `ACCOUNT_DELETION_ENABLED` and `ACCOUNT_DELETION_READINESS`. `npm run account-deletion:once` runs a single pass by hand.

## Validation

`tests/integration/scoped-account-deletion-migration.test.ts` reproduces the production ledger shape on an isolated database with real `pg_dump`/`pg_restore` and covers dry-run, apply, repeat, the full runner afterwards, admin snapshot `MATCH`, deletion readiness, checksum/environment/backup/ledger mismatches, partial schema drift, missing runtime privileges (full rollback), later history and the staging article-tags shape. This proves the command on isolated databases, not a production run.

UX Writing: N/A — management command and documentation only. User-facing deletion screens are unchanged; they stay behind the readiness gate until the Owner enables the feature.
