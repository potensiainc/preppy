# WP-12A Notification Worker Core Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, and superpowers:test-driven-development for every behavior change.

**Goal:** Consume canonical OpportunityChange signals through the existing PostgreSQL Outbox, materialize historically eligible email deliveries exactly once, and settle fake/test email outcomes without blind resend or PII persistence.

**Architecture:** Add typed, transition-aware Outbox services over `outbox_events`; a transaction-owned resolver for `OPPORTUNITY_CHANGE_PUBLISHED`; a two-phase send command that commits eligibility and `STARTED` Attempt before calling a provider-neutral sender; and a bounded dispatcher/run-once worker. The database remains the only queue, all provider calls occur outside transactions, and `RESULT_UNKNOWN` is quarantined as `FAILED` with an unresolved `STARTED` Attempt.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL 16, postgres.js, Vitest, existing analytics and runtime-env contracts.

**Authoritative scope:** `C:/Users/USER/Downloads/CODEX_EXECUTION_PROMPT_WP_12A.md`, validated by `docs/04*` through `docs/12A*`. No package, schema, migration, Admin mutation, webhook, live provider, CMS, or GA4 transport changes.

---

### Task 1: Lock typed events, inputs, and Outbox transition semantics

**Files:**
- Create: `src/modules/outbox/events.ts`
- Create: `src/modules/outbox/transitions.server.ts`
- Test: `tests/unit/wp12a-outbox-contracts.test.ts`
- Test: `tests/integration/wp12a-outbox-transitions.test.ts`

**Steps:**
1. Write failing unit tests for the closed event registry (`OPPORTUNITY_CHANGE_PUBLISHED`, `DELIVERY_EMAIL_SEND`), bounded worker ID/batch/error inputs, and unknown-event rejection.
2. Write failing integration tests for due-only ordered claim, `SKIP LOCKED` two-client exclusion with deterministic barriers, attempt increment, owner-aware complete/reschedule/fail/dead-letter, invalid transition rejection, and lock clearing.
3. Implement `claimOutboxBatch`, `completeOutboxEvent`, `rescheduleOutboxEvent`, `failOutboxEvent`, and `deadLetterOutboxEvent` as narrow commands with no arbitrary status setter.
4. Run the focused tests and preserve existing schema states exactly.

### Task 2: Implement stale lease recovery with send ambiguity quarantine

**Files:**
- Modify: `src/modules/outbox/transitions.server.ts`
- Test: `tests/integration/wp12a-outbox-transitions.test.ts`

**Steps:**
1. Add failing tests proving stale DB-only signal work returns to `PENDING`, while a stale `DELIVERY_EMAIL_SEND` with unresolved `STARTED / PROVIDER_RESULT_UNKNOWN` never does.
2. Implement `recoverStaleOutboxLeases` with a lease cutoff, bounded batch, row locking, and event-specific unresolved-attempt exclusion.
3. Verify fresh leases, terminal rows, and non-owned rows remain unchanged.

### Task 3: Materialize canonical Notification and historically eligible Deliveries

**Files:**
- Expand: `src/modules/notification/repository.server.ts`
- Create: `src/modules/notification/policy.ts`
- Create: `src/modules/notification/resolver.server.ts`
- Test: `tests/integration/wp12a-notification-resolver.test.ts`

**Steps:**
1. Seed minimal Institution/Opportunity/OpportunityChange/User/Follow/FollowEpisode fixtures.
2. Write failing tests for follow before/at/after signal, unfollow before signal, multiple users, and Opportunity→Institution targeting.
3. Implement the stable `OPPORTUNITY_NOTIFICATION_V1` policy, safe title/body/deep-link snapshot, structural Notification upsert, historical episode query using an inclusive start/exclusive end, Delivery upsert, and `DELIVERY_EMAIL_SEND` enqueue with `delivery-send:{deliveryId}:v1`.
4. Make source event completion part of the same root transaction; add rollback injection and repeat-run tests proving Notification/Delivery/send-work dedupe.
5. Assert no raw email exists in Notification, Delivery, Attempt, or Outbox payloads.

### Task 4: Add current send-time eligibility and deterministic renderer/sender ports

**Files:**
- Create: `src/modules/notification/eligibility.server.ts`
- Create: `src/modules/notification/email-renderer.server.ts`
- Create: `src/modules/notification/email-sender.ts`
- Create: `src/modules/notification/fake-email-sender.server.ts`
- Test: `tests/unit/wp12a-email-foundation.test.ts`
- Test: `tests/integration/wp12a-send-eligibility.test.ts`

**Steps:**
1. Write failing contract tests for all four sender outcomes and deterministic fake call capture.
2. Write failing database tests for ACTIVE User, current ACTIVE Follow, VERIFIED+USABLE+not-removed Email, latest consent ordered by `(decided_at DESC, id DESC)`, and ENABLED EMAIL preference.
3. Implement a single-snapshot eligibility query with canonical suppression precedence: `USER_INACTIVE`, `FOLLOW_INACTIVE`, `EMAIL_UNAVAILABLE`/`EMAIL_SUPPRESSED`, `CONSENT_REVOKED`, `PREFERENCE_DISABLED`.
4. Implement a public-safe renderer with Institution, Opportunity, verified change summary, and canonical PREPPY links only.

### Task 5: Implement crash-safe delivery sending and outcome settlement

**Files:**
- Create: `src/modules/notification/send-delivery.server.ts`
- Test: `tests/integration/wp12a-send-delivery.test.ts`

**Steps:**
1. Write failing tests that suppressed work creates no Attempt and makes zero sender calls.
2. Write failing outcome tests for `ACCEPTED`, `RETRYABLE_FAILURE`, `TERMINAL_FAILURE`, and `RESULT_UNKNOWN`, including persisted Attempt/Delivery/Outbox timestamps and safe error codes.
3. Implement prepare transaction: validate owned PROCESSING event, lock Delivery, reject existing unresolved/accepted Attempt, recheck eligibility, either suppress+complete or append `STARTED` and return the transient address/message.
4. Call `EmailSender.send` after the prepare transaction commits.
5. Implement settlement transaction: accepted→Attempt `ACCEPTED`, Delivery `SENT`, Outbox `PROCESSED`; retryable→Attempt `FAILED_RETRYABLE` and deterministic backoff to `PENDING` until max then dead-letter+Delivery `FAILED`; terminal→Attempt `FAILED_TERMINAL`, Delivery `FAILED`, Outbox `DEAD_LETTER`; unknown→keep Attempt `STARTED` with `PROVIDER_RESULT_UNKNOWN`, Outbox `FAILED`, no auto-retry.
6. Add crash-window tests for pre-attempt, post-STARTED/pre-call, provider ambiguity, and accepted-before-settlement. All unresolved `STARTED` paths must fail closed against a second provider call.
7. Emit best-effort `notification_sent` only after accepted settlement commits.

### Task 6: Add bounded dispatcher and `--once` worker entrypoint

**Files:**
- Create: `src/modules/worker/dispatcher.server.ts`
- Create: `src/modules/worker/run-once.server.ts`
- Create: `scripts/worker.ts`
- Create: `tests/unit/wp12a-worker-runner.test.ts`
- Create: `tests/integration/wp12a-worker-concurrency.test.ts`

**Steps:**
1. Write failing tests for `WORKER_ENABLED`, bounded batch/lease/worker ID, closed dispatch, unknown-event safe failure, and CLI `--once`/invalid arguments.
2. Implement run-once as recover stale→claim known event types→dispatch each claimed row, with resolver and sender dependencies injected for tests.
3. Prove two worker instances cannot claim/process the same resolver or send event using explicit transaction barriers, never sleeps.
4. Keep the script bounded; no uncontrolled loop and no live sender wiring.

### Task 7: Verify scope, privacy, and repository health

**Files:**
- Modify only if required by implementation: `.env.example`, `src/config/runtime-env.ts`
- Review: all changed files

**Steps:**
1. Run all WP-12A unit/integration/concurrency/CLI tests on the dedicated PostgreSQL test DB.
2. Search changed paths and test rows for raw email in Outbox/Audit/Notification/Delivery/Attempt; verify no `console` leakage.
3. Run controlled full suite with `--hookTimeout=60000 --no-file-parallelism`.
4. Run typecheck, lint, `prettier --check`, and production build.
5. Review `git diff --check`, changed-file scope, package lock, migrations, schema, Admin routes/UI, webhook, CMS, and analytics transport.
6. Report exact retry/backoff, stale recovery, re-follow behavior, test evidence, and carry-forward items. Do not commit or push.
