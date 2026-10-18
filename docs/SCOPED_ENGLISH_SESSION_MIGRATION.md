# Guarded English-session identity migration

This procedure changes only `0018_english_session_identity`. It never executes account-erasure migration `0017`, creates a fake applied record, changes a historical migration or updates/deletes old ledger rows. There is no new login UI or OAuth behavior.

## Full runner now fails closed

`npm run db:migrate` uses the checked-in journal, canonical LF SQL hashes and static runtime manifest. In one serialized transaction it locks the migration ledger and validates every applied row by hash, original journal timestamp and actual append order. Unknown/duplicate/out-of-order rows and an earlier missing migration stop **before any DDL**. Only a valid complete prefix may advance in ordinary journal order. All DDL and canonical ledger inserts commit together or roll back together. A missing ledger with existing domain tables also stops; it is not treated as a fresh database.

Consequently, after a deliberate scoped 0018 application leaves 0017 pending, the full runner reports `MIGRATION_GAP_REQUIRES_REVIEW`, including when a later migration exists. It never silently skips 0017 and never automatically executes the excluded feature to fill that gap. Future migration work needs its own reviewed scope. Do not call old images or raw Drizzle as an alternative supported runner.

The full operational readiness manifest remains unchanged: missing 0017 remains a mismatch, never a fabricated MATCH. A successful English-only operation reports `deferred0017: true` and `fullLedgerReady: false`; this is not approval to bypass the separate global release gate.

## Explicit scoped command

The command is dry-run by default:

```sh
npm run db:migrate:english-session-identity -- \
  --target production \
  --backup-receipt /private/verified-backup-receipt.json \
  --expected-sql-checksum 6782c831e6d28b646aca6edc92e7b086406f7b973e29621bac4d77d303e6fcf8 \
  --leave-0017-unapplied
```

An authorized operator adds `--apply` only after reviewing the dry-run and its scope. This documentation does not authorize a production execution.

The exact target is the existing production Postgres service `781a0b16-5a2c-46ea-9ca4-6c975827971d` in environment `f3eb0933-6bef-4947-98f0-2b1bff9bea73`, database `railway`. The alternate staging target is Postgres `6561a868-281c-42a6-ac52-b93de463fb66`, environment `94d9b877-5fb2-49f1-87d9-4e939a3db7d2`, database `preppy_staging`. Both Railway environment and service ids must match the selected native DB management environment. A regular web container is deliberately not an accepted target. The execution environment needs trusted Node 22, PostgreSQL tools and the checked exact source; there is no deploy hook installing or invoking it.

The command uses an already-authenticated management `DATABASE_URL` without printing it. The DB session must be able to use the existing `preppy_migration` role. No role, membership, credential, HMAC key or GRANT is created. Existing production default ACLs must already provide the runtime table privileges; otherwise the transaction fails. A management runtime/credential that cannot meet these checks is a blocker, not a reason to extract tokens or widen web permissions.

## Required backup receipt

A trusted operator first creates a consistent full backup and validates its isolated restore. The receipt below records that completed work; never set `schemaEquivalent` merely to make the command pass.

```json
{
  "version": 1,
  "target": {
    "environmentId": "f3eb0933-6bef-4947-98f0-2b1bff9bea73",
    "databaseServiceId": "781a0b16-5a2c-46ea-9ca4-6c975827971d",
    "database": "railway"
  },
  "capturedAt": "<UTC ISO snapshot time>",
  "verifiedAt": "<UTC ISO restore verification time>",
  "dumpPath": "<absolute private custom-format pg_dump path>",
  "dumpSha256": "<64 lowercase hex characters>",
  "beforeTablesPath": "<absolute original snapshot whole-table fingerprint JSONL>",
  "restoredTablesPath": "<different absolute restored whole-table fingerprint JSONL>",
  "tablesSha256": "<common verified fingerprint-file SHA256>",
  "ledgerSha256": "<source ledger fingerprint described below>",
  "schemaEquivalent": true
}
```

The command requires regular, non-symlink artifact files, hashes the actual dump and both distinct fingerprint files, checks matching restored-table evidence, decodes the archive with `pg_restore`, and checks its actual database name from the TOC. The snapshot must be at most six hours old; refresh immediately before an approved change window when needed. Fingerprint JSONL has one object per table: `kind: "table"`, schema-qualified `table`, integer `count`, and whole-row `sha256`; it includes `drizzle.__drizzle_migrations`. Keep personal rows, credentials and the dump inside the private backup boundary. The receipt is a trusted restore attestation, not an instruction to restore over production; this CLI validates the bound artifacts but does not itself perform that earlier restore drill.

Ledger fingerprint SQL is SHA256 of UTF-8 `jsonb_agg(jsonb_build_object('id',id,'hash',hash,'created_at',created_at) order by id)::text`, using `[]` for an empty ledger. It must match the actual current ledger before first application. Exact repeat may use the original pre-0018 backup or a fresh backup of the current already-applied ledger.

## Atomic guards and readback

All hashes through 0016 must be present with their original timestamps. 0017 is the only allowed missing predecessor and requires explicit `--leave-0017-unapplied`. Unknown hashes remain blocked in both commands. Existing `institutions.id` and `opportunities.id` must be UUID primary keys. The command does not call the generic full migrator.

Before a first application all three target tables must be absent. An existing canonical 0018 ledger row requires the exact live seven columns, null/default/type settings, three primary keys, three validated RESTRICT foreign keys, no extra indexes/triggers, approved migration-role ownership and existing runtime privileges. Partial schemas, unrecorded existing tables, modified SQL, stale/wrong backup or wrong environment stop without reconciliation writes.

The command acquires the same transaction advisory lock as the full runner plus an exclusive ledger-write lock. It executes the immutable three CREATE TABLE statements, reads their schema back, appends only the actual 0018 hash and original journal `when=1792300000000`, and proves every old ledger row is unchanged. Existing sequences are not reset. Any failure rolls back the entire DDL/ledger transaction. A matching repeat is NO_OP and does not rewrite audit dates or record 0017.

## Existing staging lineage (read-only finding)

Historical Git commit `1a3d850a9c694e2c2d192f646b4bbee98eb2a970` contains `src/db/migrations/0018_article_tags.sql`, blob `1c7ba3c35ccbdff596501bba3c0d1fa556ecd807`. Its exact SHA256 is `c15754b2f47e236cf7f308f5e7a5d7c279eba015369efc4f5ef51c8b1d1120c6`, journal timestamp `1790477016170`. It adds `articles.tags text[] NOT NULL DEFAULT '{}'` and a cardinality-at-most-10 CHECK. Both the source hash and the live staging column/validated CHECK match. This is a different historical 0018 line, not the English identity migration.

Staging already had canonical 0017 before its manual English 0018 application. That application used canonical hash `6782...` and the original timestamp, so it introduced no earlier known gap and does not replay. However c157 is not in the current authoritative manifest. Its row and article schema are preserved; neither command auto-adopts or whitelists it. Full/scoped execution there remains blocked by UNKNOWN_MIGRATION_HASH pending a separately reviewed lineage decision. Do not delete that row, rename historical migrations or fake an approval to obtain a green result.

## Validation and boundaries

Regression coverage uses dedicated isolated databases and real pg_dump/pg_restore. It covers an ordinary full prefix, earlier-gap and unknown-hash rejection before DDL, scoped 0018 without 0017, exact repeats, transaction rollback after a forced ledger failure, future full-run gap rejection, schema drift and concurrent scoped attempts. Production backup restore validation is performed in a private no-network temporary cluster; no raw rows or credentials are printed or copied out.

The changed runner was also bundled and tested against the actual production backup in a separate PostgreSQL 18 cluster bound only to a private Unix socket. All seven scenarios above passed; the restored ledger returned to its original 17 rows and all three target tables were absent after the final reset. The cluster was stopped and the temporary cluster/runtime/transfer files removed. The original private backup was retained. This proves the isolated rehearsal, not a production migration or a staging-lineage reconciliation.

Production migrations, service settings, main merges and HMAC provisioning are separate approvals and are not performed by this change. Web/worker startup does not call the full runner: Docker CMD is `npm run start`, worker starts `worker:once`, and the inspected last-applied staging/production deploy manifests have no pre-deploy command. Recheck applied hooks before a future release rather than assuming configurations cannot change.

UX Writing: N/A for this implementation: internal management commands/errors and documentation only; no public labels, eligibility, booking states, login controls or notification content changes. The receipt and output explicitly distinguish a deferred migration from an applied one and full readiness from a successful scoped action.
