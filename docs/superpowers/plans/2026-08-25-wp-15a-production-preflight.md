# WP-15A Production Read-only Preflight / Non-production Rehearsal Plan

> **For Codex:** Execute inline with strict RED → GREEN → REFACTOR checkpoints. WP-14 is already locally committed at `5e7bab283a324d3ea16a3ba35f42af8c5de78ae6`; keep WP-15A uncommitted and never push, fetch, pull, merge, migrate production, or deploy.

**Goal:** Provide a machine-verifiable, PII-safe production inventory that cannot pass a writable connection, plus a repeatable migration/backfill rehearsal that can write only to a clearly dedicated non-production database and returns `READY_FOR_WP16A` or `BLOCKED`.

**Architecture:** Production and rehearsal are separate entry points. Production uses an explicit `PRODUCTION_DATABASE_URL`, verifies both session/default read-only state before inventory, then runs fixed aggregate/introspection queries inside one bounded repeatable-read read-only transaction. Rehearsal uses an explicit `REHEARSAL_DATABASE_URL`, rejects unsafe/equal URLs, runs the existing migration order and approved backfills, and verifies a post-run read model. Reports contain only allowlisted aggregate metadata, canonical IDs for blockers, safe reason codes, and configuration booleans.

**Tech Stack:** TypeScript, Zod 4, PostgreSQL/postgres.js, Drizzle, Node built-ins, Vitest, existing migrations `0000`–`0010`, and existing Institution/Opportunity/Source Binding backfills. No package, migration, or schema change.

---

## Task 1: Lock report, severity, exit-code, and redaction contracts

**Files:**
- Create: `src/modules/production-preflight/contracts.ts`
- Create: `src/modules/production-preflight/report.ts`
- Create: `tests/unit/wp15a-report.test.ts`

1. Add RED tests for report version/mode, `BLOCKER | WARNING | INFO`, deterministic summaries, gate vocabulary, exit codes `0/2/3/4`, prohibited key families, URL credential redaction, PII-like values, and secret-free configuration booleans.
2. Run the focused test and confirm RED because the module does not exist.
3. Implement strict report construction and recursive safe-report assertion. Never accept arbitrary metadata/payload spreads.
4. Run focused tests and typecheck GREEN.

## Task 2: Guard production and rehearsal database configuration

**Files:**
- Create: `src/modules/production-preflight/database-guard.ts`
- Create: `tests/unit/wp15a-database-guard.test.ts`

1. Add RED tests requiring `PRODUCTION_DATABASE_URL` for production, accepting only rehearsal names containing `_rehearsal`, `_verify`, `_test`, or `_staging`, rejecting production-looking/default database names, rejecting URL equality after canonical parsing, and ensuring error text never includes credentials.
2. Implement `assertDedicatedRehearsalDatabaseUrl` and safe database identity parsing with no network access.
3. Run focused tests GREEN.

## Task 3: Compare repository and database migration ledgers

**Files:**
- Create: `src/modules/production-preflight/migrations.ts`
- Create: `tests/unit/wp15a-migrations.test.ts`

1. Add RED tests for exact repository order `0000`–`0010`, missing expected migrations, unexpected DB-only entries, hash mismatch, prefix gaps, and latest-applied projection.
2. Implement manifest loading from the Drizzle journal/SQL files and deterministic comparison against `drizzle.__drizzle_migrations` identifiers/hashes without applying anything.
3. Run focused tests GREEN.

## Task 4: Build a production read-only connection boundary

**Files:**
- Create: `src/modules/production-preflight/read-only-database.server.ts`
- Create: `tests/unit/wp15a-read-only-boundary.test.ts`
- Create: `tests/integration/wp15a-read-only-gate.test.ts`

1. Add RED source-boundary tests that prohibit Admin/Audit/Outbox/worker/migration/apply-backfill imports and expose no mutation method.
2. Add integration RED tests showing writable/default-read-write sessions stop before inventory and demonstrably read-only sessions can execute bounded queries; never issue a test write.
3. Implement a max-one connection with bounded connect/statement timeouts, `SHOW transaction_read_only`, `SHOW default_transaction_read_only`, database/user identity, and a repeatable-read read-only transaction. Require both read-only settings to be `on` before inventory.
4. Expose only fixed read/introspection operations; keep a defensive SQL classifier private.
5. Run focused unit/integration tests GREEN.

## Task 5: Inventory migration/schema/data state without PII

**Files:**
- Create: `src/modules/production-preflight/inventory.server.ts`
- Create: `tests/integration/wp15a-inventory.test.ts`

1. Add RED legacy, partially migrated, and fully canonical fixtures.
2. Implement allowlisted table/column/index/constraint introspection, aggregate row counts, and safe status distributions for legacy/canonical, Source bindings, User/Follow, Outbox/Notification, Article/redirect, and provider receipt graphs.
3. Return `PRESENT | MISSING | INCOMPATIBLE | UNKNOWN` compatibility without selecting PII, HTML, Source bodies, or webhook payloads.
4. State snapshot semantics explicitly as one bounded repeatable-read read-only snapshot.
5. Run focused integration tests GREEN.

## Task 6: Add exact deterministic backfill dry-runs and bridge checks

**Files:**
- Create: `src/modules/production-preflight/backfill-dry-run.server.ts`
- Create: `src/modules/production-preflight/invariant-checks.server.ts`
- Create: `tests/integration/wp15a-backfill-dry-run.test.ts`
- Create: `tests/integration/wp15a-conflicts.test.ts`

1. Add RED fixtures for Institution/Opportunity/Source Binding insert/reuse/skip/not-import/block counts, orphan/cross-owner bridges, ambiguous Cycle scope, unsafe role/evidence, multiple active primary, and native Institution classification.
2. Reuse only the existing read-only `preflight*Backfill` functions after their required tables are confirmed; never import or invoke `apply*` from production preflight code.
3. Map exact WP-10A blocking/not-import reason codes to the shared taxonomy. Add aggregate bridge/native ownership checks with fixed SQL.
4. Run focused integration tests GREEN.

## Task 7: Add identity, notification, Article, and analytics checks

**Files:**
- Modify: `src/modules/production-preflight/invariant-checks.server.ts`
- Create: `tests/integration/wp15a-domain-invariants.test.ts`

1. Add RED fixtures for AuthIdentity/UserEmail/consent/preference/FollowEpisode defects, stale Outbox leases, failed/dead-letter/result-unknown attempts, Delivery parent/provider-message/orphan-event defects, unsafe Article/redirect states, and config booleans.
2. Implement aggregate-only checks. Use canonical entity IDs only where a blocker requires identification; never include User/Admin/recipient identities.
3. Treat stale leases, dead letters, unsafe historical Article candidates, nonpublic redirect targets, and optional analytics config as warnings unless a locked data invariant is contradicted.
4. Run focused tests GREEN.

## Task 8: Assemble the production preflight service and CLI

**Files:**
- Create: `src/modules/production-preflight/run-production-preflight.server.ts`
- Create: `scripts/production-preflight.ts`
- Modify: `package.json`
- Create: `tests/unit/wp15a-cli.test.ts`

1. Add RED tests for missing credentials (safe skip/config outcome), writable gate exit `3`, invalid tooling exit `4`, blockers exit `2`, clean exit `0`, stdout JSON, and no tracked report persistence.
2. Implement an explicit production CLI with no generic SQL input. Run actual production only when credentials exist and the read-only gate passes.
3. Include repository/DB migration comparison, inventory, exact backfill dry-runs, invariant checks, config booleans, and final gate; never emit `READY_FOR_PRODUCTION_CUTOVER`.
4. Run focused tests GREEN.

## Task 9: Build the dedicated non-production rehearsal orchestrator

**Files:**
- Create: `src/modules/production-preflight/rehearsal.server.ts`
- Create: `scripts/rehearsal.ts`
- Modify: `package.json`
- Create: `tests/unit/wp15a-rehearsal.test.ts`

1. Add RED tests showing the guard runs before connection/migration, only existing migration/backfill functions are invoked in exact order, each backfill runs twice, first/second effects are recorded, and production URL equality is rejected.
2. Implement baseline → migrations → Institution → Opportunity → Source Binding → second pass → read-only invariant/smoke report.
3. Capture product-signal counts around the backfills and fail if customer Notification/Delivery/customer Outbox drift occurs.
4. Keep EmailSender fake, Analytics Noop/Test, OIDC fake, and cache revalidation local/fake by construction; the rehearsal orchestrator performs no external send.
5. Run focused tests GREEN.

## Task 10: Exercise fresh/upgrade/conflict rehearsal databases

**Files:**
- Create: `tests/integration/wp15a-rehearsal.test.ts`
- Create: `tests/integration/wp15a-rehearsal-smoke.test.ts`

1. Create uniquely named `_rehearsal` databases through the existing maintenance pattern and schema-test advisory lock.
2. Verify fresh migration through `0010`, legacy upgrade fixture, first-pass backfill effects, second-pass zero relationship drift, and conflict fixture `BLOCKED` with full backfill transaction rollback.
3. Verify Institution/Opportunity bridges, current-version/evidence ownership, active primary bindings, User/Follow uniqueness/episodes, Notification/Delivery/Outbox constraints, Article redirects, and provider receipts.
4. Exercise public query services, My Preppy fixture query, Admin read projections, monitoring queue, operations reads, KPI query, and sitemap against rehearsal fixtures.
5. Drop only the exact verified temporary rehearsal databases in cleanup.

## Task 11: Document dry-run cutover and WP-16A handoff

**Files:**
- Create: `docs/15A_PRODUCTION_PREFLIGHT.md`
- Create: `tests/unit/wp15a-docs.test.ts`

1. Add RED doc tests for read-only production rules, migration/backfill order, dry-run effects, gates/stops, report interpretation, credential absence, rehearsal guard, no side effects, and `READY_FOR_WP16A` semantics.
2. Document WP-16A-only backup scope, restore target/RPO/RTO assumptions, observability, runbook, secrets, kill switches, worker topology, and deferred distributed replay/rate-limit/cache guards without implementing them.
3. Run focused tests GREEN.

## Task 12: Controlled verification and hostile review

**Files:**
- Modify only files needed to fix Critical/Important findings.

1. Run all WP-15A unit/integration tests and both fresh/upgrade rehearsal paths.
2. Run the full controlled suite with `--hookTimeout=60000 --no-file-parallelism`, typecheck, lint, changed-file/global format check as appropriate, build, and `git diff --check`.
3. Hostile-review accidental production writes, writable-session bypass, mutation imports, migration/backfill/worker execution on production, PII/secrets, unbounded reads, live Email/GA/cache, and false cutover wording.
4. Rerun every impacted check after fixes.
5. Review final branch/status/diff. Keep WP-15A uncommitted; no push/fetch/pull/merge/deploy.

## Locked adjustments

- This environment has no production credentials, so actual production findings will remain explicitly `NOT_EXECUTED`; this is not a tooling blocker.
- A production run requires both `transaction_read_only=on` and `default_transaction_read_only=on`; it never probes safety with a write.
- Production inventory runs in one bounded `REPEATABLE READ READ ONLY` transaction and may claim that snapshot only for queries inside it.
- The preflight CLI accepts no arbitrary SQL/table/path arguments and writes JSON to stdout only.
- Rehearsal uses repository fixtures because WP-15A may not acquire a new production dump or backup.
- Packages, migrations, schema changes, deployment, and external side effects remain zero.
