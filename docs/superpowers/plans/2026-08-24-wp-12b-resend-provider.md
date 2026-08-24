# WP-12B Resend Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send transactional PREPPY notification email through Resend with stable provider idempotency, reconcile ambiguous results without blind resend, process signed/deduplicated webhooks conservatively, and expose only safe Admin Outbox commands.

**Architecture:** Keep WP-12A's provider-neutral `EmailSender` boundary and durable `Delivery`/`Attempt`/Outbox lifecycle. A native-fetch Resend adapter owns provider request construction and classification; the application layer persists a non-PII request identity before the provider call. A verified webhook adapter inserts one provider-neutral receipt and applies Delivery/UserEmail state in one transaction, while Admin routes call event-aware application commands through the existing WP-11 guard.

**Tech Stack:** Next.js 16 App Router, TypeScript 5.9, native `fetch`, Node `crypto`, Zod 4, Drizzle ORM 0.45, PostgreSQL 16, Vitest 4.1.

**Spec:** `C:/Users/USER/Downloads/CODEX_EXECUTION_PROMPT_WP_12B_RESEND.md`

## Global Constraints

- Provider is exactly `RESEND`; use native `fetch`; add no SDK or package.
- Provider key is exactly `preppy-delivery/{deliveryId}/v1`, stable across retries and at most 256 characters.
- Resend idempotency retention is 24 hours; ambiguous reconciliation is explicit and blocked at or after expiry.
- `RESULT_UNKNOWN` is never eligible for generic retry.
- Raw recipient email, API key, provider response body, and raw webhook body are never persisted or logged.
- Verify `svix-id`, `svix-timestamp`, and `svix-signature` over the raw body before strict UTF-8/JSON parsing; replay tolerance is five minutes.
- Add exactly one provider-neutral `email_provider_events` table in one additive migration; do not alter prior migrations.
- Admin mutations must pass ACTIVE Admin recheck, Origin validation, duplicate-member-rejecting JSON parsing, strict Zod validation, server-created `AdminCommandContext`, application command, and Audit.
- Do not implement CMS, full SEO runtime, GA4 transport, deployment, domain verification automation, or tracking enablement.
- Do not commit, push, merge, or deploy. The commit steps normally required by the planning skill are intentionally omitted because the execution prompt forbids them.

---

### Task 1: Resend Request Contract and Capability-scoped Configuration

**Files:**
- Create: `src/modules/notification/resend-config.server.ts`
- Create: `src/modules/notification/resend-request.ts`
- Create: `src/modules/notification/resend-email-sender.server.ts`
- Modify: `src/modules/notification/email-sender.ts`
- Modify: `src/config/runtime-env.ts`
- Modify: `.env.example`
- Test: `tests/unit/wp12b-resend-email-sender.test.ts`
- Test: `tests/unit/wp12b-resend-config.test.ts`

**Interfaces:**
- Produces: `parseResendSendConfig(environment)`, `parseResendWebhookConfig(environment)`, `getResendSendConfig()`, and `getResendWebhookConfig()`.
- Produces: `resendIdempotencyKey(deliveryId)`, `prepareResendRequest(message, config)`, and `ResendEmailSender`.
- Produces: a provider-neutral optional `describeRequest(message, context)` result containing `provider`, `idempotencyKey`, `payloadHash`, and `recipientHash`; none of these values contain raw email.

- [ ] Write failing tests proving missing Resend values fail only when the send/webhook capability parser is invoked, `EMAIL_FROM` is server-configured, and `.env.example` values are placeholders.
- [ ] Run `npx vitest run tests/unit/wp12b-resend-config.test.ts` and confirm failure because the capability parser does not exist.
- [ ] Implement strict bounded config parsers for `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`, canonical `APP_BASE_URL`, and existing `EMAIL_SEND_ENABLED` without widening unrelated startup schemas.
- [ ] Write failing native-fetch adapter tests using a local HTTP server for valid 2xx ID, malformed/oversized 2xx, 429 with bounded `Retry-After`, 5xx, 401/403, validation 4xx, `invalid_idempotency_key`, `invalid_idempotent_request`, `concurrent_idempotent_requests`, timeout, and connection failure.
- [ ] Run the adapter test and confirm the missing adapter/key/request builder is the failure.
- [ ] Implement canonical request JSON `{from,to:[normalizedRecipient],subject,text}`, fixed `POST /emails`, bearer auth, JSON content type, stable idempotency header, bounded timeout, bounded response stream, strict duplicate-member-rejecting response JSON, and provider-neutral result mapping.
- [ ] Classify `concurrent_idempotent_requests` as retryable with the same key; classify malformed success and network ambiguity as `RESULT_UNKNOWN`; expose only canonical safe error codes.
- [ ] Run both focused unit files and preserve the red-green evidence.

### Task 2: Persisted Request Identity and WP-12A Send Integration

**Files:**
- Modify: `src/modules/notification/eligibility.server.ts`
- Modify: `src/modules/notification/send-delivery.server.ts`
- Modify: `src/modules/outbox/events.ts`
- Modify: `src/modules/notification/fake-email-sender.server.ts`
- Test: `tests/integration/wp12b-resend-send.test.ts`
- Test: `tests/unit/wp12a-email-foundation.test.ts`
- Test: `tests/integration/wp12a-send-delivery.test.ts`

**Interfaces:**
- `evaluateDeliveryEligibility` returns `emailNormalized`; outbound `to` uses that canonical value.
- `DELIVERY_EMAIL_SEND` payload may carry a strict safe `providerRequest` identity: `{provider:'RESEND',version:1,idempotencyKey,payloadHash}`.
- `notification_deliveries.recipient_hash` is SHA-256 of the exact canonical recipient used for the send.

- [ ] Write a failing integration test proving the initial Resend send commits `STARTED`, `recipient_hash`, and safe request identity before the HTTP call and never stores raw recipient or response body.
- [ ] Run the focused test and confirm the new persisted identity is absent.
- [ ] Extend the strict Outbox payload parser with the bounded Resend request identity while retaining legacy `{deliveryId}` support for FAKE/WP-12A rows.
- [ ] Before the provider call, derive the identity through the sender boundary and persist it in the same transaction that creates `STARTED`; block an existing same-key/different-hash invariant instead of changing the key.
- [ ] Keep all WP-12A result transitions and `notification_sent` after-commit behavior unchanged.
- [ ] Run WP-12A email foundation/send tests and the new Resend send integration test.

### Task 3: Explicit Ambiguous Resend Reconciliation

**Files:**
- Create: `src/modules/notification/reconcile-resend.server.ts`
- Create: `src/modules/operations/audit.server.ts`
- Test: `tests/integration/wp12b-resend-reconciliation.test.ts`

**Interfaces:**
- Produces: `reconcileUnknownResendAttempt(context, {deliveryId, expectedAttemptId, now}, dependencies)`.
- Safe window predicate is `now < attempted_at + 24 hours`.
- Settlement updates the existing unresolved Attempt; it never inserts a second logical Attempt.

- [ ] Write failing tests for a lost accepted response, no automatic resend, explicit same-key/same-payload reconciliation returning the same provider message ID, single settlement, repeated command conflict, and expiry at 24 hours.
- [ ] Add failing guards for non-RESEND, non-STARTED, wrong error code, missing/mismatched request identity, changed current recipient, changed rendered payload, ineligible current recipient, and non-FAILED Outbox work.
- [ ] Run the focused test and verify failures are caused by the absent command.
- [ ] Implement preflight transaction locks over Delivery, unresolved Attempt, and matching send Outbox; reconstruct the message, compare provider/key/payload/recipient hashes, and commit no mutation before the provider call.
- [ ] Reissue only the exact same request/key through `ResendEmailSender`. On accepted response, atomically settle the existing Attempt, Delivery, and Outbox; on ambiguity retain operator-review state; on definitive failure retain the unresolved attempt and record only safe Audit outcome.
- [ ] Write one safe Audit record per operator reconciliation execution, with IDs/outcome only and no PII/provider body.
- [ ] Run the focused reconciliation suite.

### Task 4: Provider Event Receipt Migration

**Files:**
- Modify: `src/db/schema/index.ts`
- Create: `src/db/migrations/0010_*.sql` through Drizzle generation
- Create: `src/db/migrations/meta/0010_snapshot.json` through Drizzle generation
- Modify: `src/db/migrations/meta/_journal.json` through Drizzle generation
- Test: `tests/integration/wp12b-provider-event-migration.test.ts`

**Interfaces:**
- Produces table `email_provider_events` with UUID `id`, provider, provider event ID, nullable provider message ID, event type, nullable provider timestamp, received timestamp, `RECEIVED|PROCESSED|IGNORED|FAILED`, nullable processed timestamp, SHA-256 payload hash, nullable safe error code, and created timestamp.
- Enforces `UNIQUE(provider, provider_event_id)` and bounded canonical values without storing raw payload.

- [ ] Write failing schema/migration tests for the table, columns, checks, indexes, uniqueness, no raw-body column, fresh chain, current-latest upgrade, and migration ledger rerun no-op.
- [ ] Run the focused migration test and confirm the table is absent.
- [ ] Add the Drizzle schema declaration and generate exactly migration `0010`; inspect generated SQL to ensure it only creates the provider receipt table/indexes.
- [ ] Run the migration test against fresh and upgraded dedicated databases.

### Task 5: Svix Verification and Strict Resend Event Parsing

**Files:**
- Create: `src/modules/notification/resend-webhook-signature.server.ts`
- Create: `src/modules/notification/resend-webhook-parser.server.ts`
- Test: `tests/unit/wp12b-resend-webhook-security.test.ts`

**Interfaces:**
- Produces `verifyResendWebhookSignature({body,svixId,svixTimestamp,svixSignature,secret,now})`.
- Produces `parseResendWebhookEvent(text)` returning a closed supported-event union or a bounded unknown event.

- [ ] Write deterministic failing signature fixtures covering valid signature, wrong secret, body mutation, missing/malformed headers, multiple signatures, old timestamp, future timestamp, and malformed secret/base64.
- [ ] Implement the official symmetric Svix contract: strip `whsec_`, strictly base64-decode the secret, HMAC-SHA256 over `svix-id + '.' + timestamp + '.' + rawBody`, base64 output, accept a matching space-separated `v1` signature with constant-time byte comparison, and enforce ±300 seconds.
- [ ] Write failing parser tests for strict UTF-8, duplicate object members, depth/member/string limits, supported event shapes, hard/transient/undetermined bounce metadata, complaint/suppression, and an unknown signed event.
- [ ] Reuse `parseSecurityJson` with webhook-specific stricter limits and Zod schemas; do not dispatch arbitrary event names or inspect `to` for identity.
- [ ] Run the security/parser unit suite.

### Task 6: Transactional Webhook Reconciliation and Route

**Files:**
- Create: `src/modules/notification/reconcile-webhook.server.ts`
- Create: `src/modules/notification/resend-webhook-http.server.ts`
- Create: `app/api/webhooks/email/resend/route.ts`
- Test: `tests/integration/wp12b-resend-webhook.test.ts`
- Test: `tests/unit/wp12b-resend-webhook-http.test.ts`

**Interfaces:**
- Produces `processResendProviderEvent(event, receiptIdentity, dependencies)` returning `PROCESSED|IGNORED|DUPLICATE` plus an optional after-commit analytics event.
- Route is POST-only, `force-dynamic`, no-store, bounded-body, signature-authenticated, and session/Origin independent.

- [ ] Write failing HTTP tests proving signature verification occurs before parsing and enforcing content length/body stream limits, strict UTF-8, generic invalid-signature response, duplicate 2xx, and retryable processing non-2xx.
- [ ] Write failing DB tests for durable dedupe, orphan receipts, `SENT < DELIVERED < OPENED < CLICKED`, `CLICKED -> DELIVERED`, `OPENED -> DELIVERED`, delivery delay no-op, older failure after delivery, bounce after delivery, complaint after click, and duplicate analytics suppression.
- [ ] Add failing UserEmail tests proving permanent versus transient bounce, safely correlated complaint/suppression, future eligibility false, no consent rewrite, and historical-address mismatch protection.
- [ ] Implement one root transaction that inserts/locks the receipt, correlates only `(RESEND, provider_message_id)` to Attempt/Delivery/User, applies non-regressive state and timestamps, compares Delivery recipient hash with current normalized email before UserEmail mutation, then marks the receipt `PROCESSED` or `IGNORED`.
- [ ] Emit `notification_open`/`notification_click` best-effort only after commit and once per newly inserted durable event.
- [ ] Implement the route's bounded raw byte reader, signature-before-decode ordering, safe status responses, and no raw body persistence.
- [ ] Run focused webhook HTTP and integration suites.

### Task 7: Event-aware Admin Retry, Cancel, and Reconcile Boundary

**Files:**
- Create: `src/modules/operations/outbox-admin-commands.server.ts`
- Create: `src/modules/admin/http/operations-commands.server.ts`
- Create: `app/api/admin/operations/outbox/[eventId]/retry/route.ts`
- Create: `app/api/admin/operations/outbox/[eventId]/cancel/route.ts`
- Create: `app/api/admin/operations/deliveries/[deliveryId]/reconcile-resend/route.ts`
- Modify: `src/modules/admin/read-model/operations-query.server.ts`
- Modify: `src/modules/admin/read-model/contracts.ts`
- Create: `app/admin/_components/operations-actions.tsx`
- Modify: `app/admin/(protected)/operations/outbox/page.tsx`
- Modify: `app/admin/(protected)/operations/deliveries/page.tsx`
- Modify: `app/admin/(protected)/operations/page.tsx`
- Test: `tests/integration/wp12b-admin-operations.test.ts`
- Test: `tests/unit/wp12b-admin-operations-http.test.ts`
- Test: `tests/unit/wp12b-admin-operations-ui.test.ts`

**Interfaces:**
- Produces `retryOutboxEvent`, `cancelOutboxEvent`, and the existing explicit Resend reconciliation command adapter.
- Projection exposes only safe Attempt/provider/message/error fields and server-computed `canRetry`, `canCancel`, `canReconcileResend` flags.

- [ ] Write failing command tests for safe resolver retry, definitive email retry, ambiguous generic retry rejection, safe cancel, active lease and processed immutability, dead-letter handling, stale expected-status conflict, and Audit generation.
- [ ] Implement root-transaction event locks and event-aware transition matrices; never expose generic `setStatus`, never retry/cancel an unresolved `STARTED` send, and never mutate Outbox payload from Admin input.
- [ ] Write failing route tests for ACTIVE Admin, Origin, strict empty JSON body, UUID/status validation, server context, safe envelope, and command delegation.
- [ ] Implement handlers through `runAdminCommandRequest` and application commands only.
- [ ] Write failing projection/UI tests proving raw recipient/payload/secret absence, reconcile label distinct from Retry, and unsafe buttons absent.
- [ ] Extend the read projection and Operations pages with the server-computed actions and a small client action component; refresh after a successful safe command.
- [ ] Run focused Admin command, route, projection, and UI suites.

### Task 8: Live Worker Wiring and Regression Verification

**Files:**
- Modify: `src/modules/worker/cli.ts`
- Modify: `scripts/worker.ts`
- Modify: `tests/unit/wp12a-worker-runner.test.ts`
- Create: `tests/unit/wp12b-worker-resend.test.ts`

**Interfaces:**
- Non-production retains explicit FAKE mode; RESEND mode constructs `ResendEmailSender` lazily from capability config.
- Production rejects FAKE mode and requires configured RESEND only when worker send capability runs.

- [ ] Write failing CLI/runtime tests for explicit Resend mode, production FAKE rejection, lazy missing-config failure, and kill-switch behavior with zero network calls.
- [ ] Wire the live sender without loading secrets in public/Admin page modules and without changing package dependencies.
- [ ] Run WP-12A worker tests and the focused WP-12B worker test.
- [ ] Run all focused WP-12B tests with `--hookTimeout=60000 --no-file-parallelism`.
- [ ] Recreate the dedicated test database and run the full 0000→0010 migration chain and complete controlled suite.
- [ ] Run `npm run typecheck`, `npm run lint`, changed-file Prettier check, repository format check, and `npm run build`.
- [ ] Run browser verification: fake OIDC login, Operations, inspect unknown send, verify Reconcile is shown, verify generic Retry is absent, then public/My PREPPY smoke navigation.
- [ ] Audit `git diff`, package hashes, prior migration hashes, raw-PII/security terms, and forbidden scope; report any repository-wide pre-existing format baseline separately.

## Self-review Record

- Spec coverage: all WP-12B completion checklist items map to Tasks 1-8.
- Schema scope: only `email_provider_events` is added; request identity uses existing Delivery recipient hash and Outbox JSON.
- Ambiguity safety: generic retry remains forbidden; explicit reissue requires provider, status, error, key, payload hash, recipient hash, eligibility, and 24-hour window.
- Crypto contract: official Svix HMAC-SHA256 construction and five-minute tolerance are implementable with built-in Node crypto; no package blocker exists.
- PII boundary: webhook `to` is parsed only as untrusted provider data and is never used for lookup, persistence, or logs; current-email mutation requires canonical message-ID correlation plus recipient hash equality.
- Placeholder scan: no incomplete implementation placeholders remain in this plan.
- Type consistency: request identity, reconciliation command, receipt states, and Admin capability flags use one name throughout.
