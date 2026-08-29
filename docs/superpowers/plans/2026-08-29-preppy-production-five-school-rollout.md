# PREPPY Production Five-School Rollout Implementation Plan

**Goal:** Add a one-time, explicitly acknowledged production runner that bootstraps only the five approved schools through the existing collection, extraction, draft, operator-review, and publication flow without weakening the local-only runner or contacting production during implementation.

**Constraints:** No schema or migration changes, no generic rollout framework, no production credentials in tests or output, no automatic verification/publication, and no commit/push/deploy. Production migration and seed operations remain separate operator commands.

## Task 1: Lock the production contract with failing unit tests

**Files:**
- Create: `tests/unit/preppy-production-live-admission-cli.test.ts`
- Create: `src/modules/live-admissions/production-contract.ts`

Cover the exact five-school allowlist, `NODE_ENV=production`, `DATABASE_URL`, `--production`, the exact acknowledgement token, mutually exclusive `--inspect`/`--prepare --slug=<allowlisted-school>`/`--review`, review-file requirements, and redacted failures. Confirm the existing local database guard remains unchanged.

## Task 2: Add repository-state inspection and migration readiness checks

**Files:**
- Create: `src/modules/live-admissions/production-rollout.server.ts`
- Test: `tests/integration/preppy-production-live-admission-rollout.test.ts`

Use the repository migration manifest to require an exact current ledger before writes. Inspect only the deterministic Institution IDs/slugs, their canonical root sources, and Institution-scoped `live-admissions-${institutionId}-` Opportunity namespace. Classify each target as `ALREADY_PUBLISHED`, `READY` (prepare or review), `CONFLICT`, or `BLOCKED`; `--inspect` must not mutate the database.

## Task 3: Reuse the canonical live-admission flow

**Files:**
- Modify: `src/modules/live-admissions/cli.server.ts`
- Modify: `src/modules/live-admissions/production-rollout.server.ts`
- Test: `tests/integration/preppy-production-live-admission-rollout.test.ts`

Export the existing collected-HTML loader and bounded proposal reporter. For `--prepare --slug=<allowlisted-school>`, gate, collect, and extract only that one selected target, then call `prepareLiveAdmissionDraft`. For `--review`, require one explicit approved manifest and call `reviewAndPublishLiveAdmissionDraft`. Reuse an identical prepared target, skip an identical already-published target safely, and reject mismatched or ambiguous selected-target state before writes.

## Task 4: Enforce the complete product-side-effect gate

**Files:**
- Modify: `src/modules/live-admissions/review.server.ts`
- Modify: `tests/integration/preppy-live-admission-persistence.test.ts`
- Test: `tests/integration/preppy-production-live-admission-rollout.test.ts`

Count outbox events, notifications, deliveries, delivery attempts, meaningful changes, and opportunity changes inside the same review transaction. Require all six deltas to remain zero. Prove that an induced side effect aborts and rolls back the full publication transaction.

## Task 5: Add the one-time CLI entrypoint

**Files:**
- Create: `scripts/data/run-five-school-production-rollout.ts`
- Modify: `package.json`
- Test: `tests/unit/preppy-production-live-admission-cli.test.ts`

Open only `DATABASE_URL`, run the validated mode, print bounded JSON without connection strings, and map unexpected failures to safe operator-facing error codes. Keep production preflight, migration, and seed import as separate existing commands.

## Task 6: Verify without production access

Run focused unit and disposable-PostgreSQL integration tests first, then the requested full unit suite, full integration suite, TypeScript check, `npm audit --omit=dev`, production build, and `git diff --check`. Review the final diff for schema/migration changes, credentials, production URLs in output paths, and unrelated files. Produce exact Railway-only commands but do not execute them.

No commit steps are included because this work package explicitly stops before commit, push, deployment, or production execution.
