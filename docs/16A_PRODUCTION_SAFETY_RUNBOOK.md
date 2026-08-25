# PREPPY Production Safety Runbook

Status: WP-16A operator contract. This document prepares a later WP-15B operation; it does not authorize production writes. READY_FOR_WP15B does not authorize a cutover without an explicit user approval.

## Prerequisites

1. All repository checks through WP-16A are green.
2. The actual WP-15A production read-only preflight has been executed with a demonstrably read-only role and has no BLOCKER.
3. Hosting provider, production topology, operator, change window, and escalation owner are recorded.
4. Provider-managed snapshot/PITR capability and a restore target are confirmed.
5. The logical PostgreSQL backup/restore drill has current evidence from a dedicated non-production source and target.
6. No production command begins while any checklist item is `FAIL` or a required item is `NOT EXECUTED`.

## Credentials and roles

Use separate credentials and processes. Do not paste values into this document, command history, logs, or evidence.

| Capability | Current config boundary | Intended production role | Minimum capability |
| --- | --- | --- | --- |
| Read-only preflight | `PRODUCTION_DATABASE_URL` | preflight reader | connect, metadata and SELECT only; transaction read-only enforced |
| Migration/cutover | `DATABASE_URL` in a bounded cutover process | cutover owner | additive migration and approved deterministic backfill only |
| Runtime web | `DATABASE_URL` in web runtime | web runtime | application reads and approved web command transactions |
| Worker | `DATABASE_URL` in worker runtime | worker runtime | Outbox claim/lease and approved handler transactions |
| Admin OIDC client | `ADMIN_AUTH_CLIENT_SECRET` | Admin authentication only | token exchange against the single trusted issuer |
| Admin session | `ADMIN_SESSION_SECRET` | Admin session only | Admin cookie authentication |
| OIDC flow | `ADMIN_OIDC_FLOW_SECRET` | OIDC flow only | state, nonce, and PKCE flow-cookie protection |
| Email send | `RESEND_API_KEY` | Email worker only | send API only |
| Email webhook | `RESEND_WEBHOOK_SECRET` | webhook verifier only | signature verification only |
| Server analytics | `GA4_API_SECRET` | analytics transport only | GA4 Measurement Protocol only |
| Cache revalidation | `CACHE_REVALIDATION_SECRET` | worker/web internal cache path | request signing and verification only |

The current runtime and Worker still share the `DATABASE_URL` config name. Production must supply least-privilege role credentials per process; WP-16A performs no privilege DDL. All configured cross-domain secrets must be distinct.

## Backup strategy

Preferred production method: provider-managed snapshot/PITR, if the selected provider proves it is available and restorable. Do not invent or assume a provider.

Secondary verification method: logical PostgreSQL custom-format backup and restore, proven against dedicated non-production databases with fixed `pg_dump`/`pg_restore` arguments, SHA-256 evidence, exact critical-table counts, migration ledger verification, canonical invariants, and read smoke.

The future production backup covers the full database. It excludes no application table and therefore includes the migration ledger, legacy admissions tables, canonical entities and bridges, versions/evidence/changes, identity/consent/follow data, Sources and observations, Outbox, Notifications/Deliveries/Attempts, Articles/relations/redirects, provider event receipts, audit logs, and Admin users.

Targets pending owner approval:

- RPO <= 24h — PROPOSED — OWNER APPROVAL REQUIRED.
- RTO <= 2h — PROPOSED — OWNER APPROVAL REQUIRED.
- Retain the pre-cutover snapshot for at least 30 days and until two verified post-cutover backups exist — PROPOSED — OWNER APPROVAL REQUIRED.
- Retain daily backups for 14 days and weekly backups for 8 weeks — PROPOSED — OWNER APPROVAL REQUIRED.

Observed rehearsal durations are evidence only; they are not a production SLA.

## Operational alert contract

The provider-neutral severity vocabulary is `CRITICAL`, `WARNING`, and `INFO`.
Architecture invariants are fixed; numerical operator thresholds that are not
yet approved remain proposals and must not be presented as facts.

| Signal | Severity contract |
| --- | --- |
| Database unavailable | `CRITICAL` |
| Repository/DB migration mismatch | `CRITICAL` |
| Delivery `RESULT_UNKNOWN > 0` | `CRITICAL` |
| Restore drill or restore verification failure | `CRITICAL` |
| Outbox dead letter, stale lease, failed Delivery, provider-event failure/orphan, cache dead letter, or Monitoring overdue | `WARNING` at any non-zero count; incident owner may escalate by event/customer impact |
| Healthy/zero state and informational inventory | `INFO` |
| Analytics transport degradation | best-effort `INFO`/`WARNING`; never a Product-readiness blocker by itself |

Worker lag is calculated from the oldest due `PENDING.available_at`, excluding
future-scheduled events. A concrete lag threshold `N` is **PROPOSED — OWNER
APPROVAL REQUIRED**. Until it is approved, operators inspect the exact lag value
without silently converting it into a hard readiness threshold. Stale processing
uses the existing Worker lease duration; the snapshot observes it and never
recovers work.

## Fresh backup gate

WP-15B must create and verify a **NEW backup** immediately before the first production write. A WP-16A rehearsal artifact, an old snapshot, or a preflight report cannot satisfy this gate.

Record only safe metadata: provider backup identifier, start/completion time, backup class, encryption/configured boolean, and verification status. Never record a DSN or secret. Stop if the provider cannot demonstrate snapshot/PITR or if a restorable backup cannot be confirmed.

## Restore evidence

Required evidence before WP-15B:

- dedicated source and target guards passed;
- source and target differ and neither equals production;
- backup SHA-256 recorded without artifact contents;
- migration ledger and critical counts match exactly;
- bridge, Source-binding, Follow, Notification, Outbox, Article redirect, and provider-event invariants pass;
- Home, Institution, Opportunity, Article, My PREPPY fixture, Admin, Monitoring, Operations, KPI, and sitemap reads pass;
- Worker, Email, Analytics, and Cache remain disabled throughout;
- backup, restore, and verification durations are recorded separately.

The WP-16A logical artifact uses synthetic/local non-production data and is deleted after the drill. It is never a production recovery artifact.

## Kill-switch state

Before any migration or backfill, verify in the actual cutover environment:

```text
WORKER_ENABLED=false
EMAIL_SEND_ENABLED=false
ANALYTICS_ENABLED=false
CACHE_REVALIDATION_ENABLED=false
```

Worker disabled means no recovery, claim, lease mutation, or dispatch. Cache disabled means cache events are excluded from recovery and claim and are not falsely processed. Email disabled permits no provider call. Analytics disabled selects the Noop transport.

## Migration sequence

1. Verify the recorded repository migration ledger and exact next additive migrations.
2. Enter the approved change window with all kill switches off.
3. Execute the repository migration runner in its fixed order with the migration/cutover role.
4. Stop immediately on non-zero exit, ledger mismatch, unexpected schema change, or lock/timeout outside the approved bound.
5. Re-read the migration ledger before any backfill.

WP-16A does not execute this production sequence. Additive migration plus forward repair is preferred; destructive down migrations are not introduced.

## Backfill sequence

Run only the approved deterministic commands, in this order:

1. Institution backfill.
2. Opportunity root/bridge backfill.
3. Canonical Source-binding backfill.
4. Repeat each idempotency check without creating new rows or relationship drift.

Any `BLOCKING` result stops the cutover. Never infer an Opportunity from an entire Cycle or broaden Evidence provenance.

## Cutover gates

The documented WP-15B order is:

1. Confirm actual production WP-15A read-only preflight green.
2. Create and verify the fresh production snapshot/backup.
3. Record safe backup metadata and restore capability.
4. Confirm all four kill switches off.
5. Apply additive migrations in repository order.
6. Run deterministic backfills and second-pass idempotency.
7. Run canonical invariant and row-count checks.
8. Run public and Admin read smoke.
9. Follow the Cache, Worker, Email, and Analytics enable sections below.
10. Validate metrics/logs and hand off to WP-16B.

Every gate uses `PASS`, `FAIL`, `NOT EXECUTED`, or `NOT APPLICABLE`. No “looks good” status is allowed.

## Smoke checks

Before enabling side effects, verify:

- Home and Institution list;
- representative Institution, Opportunity, and Article detail;
- redirects expose only currently public Article targets;
- consumer authentication and My PREPPY;
- Admin authentication and protected read projections;
- Monitoring queue and operational health;
- Outbox/Notification read integrity and KPI snapshot;
- sitemap and liveness-only `/api/health`.

Use safe entity identifiers and reason codes. Do not copy PII, raw HTML, payloads, provider messages, or secrets into evidence.

## Cache enable order

1. Confirm migration/backfill/invariants and public/Admin read smoke are green.
2. With Worker and Email still off, set `CACHE_REVALIDATION_ENABLED=true` for the bounded worker runtime; this arms Cache but cannot claim work yet.
3. Confirm the cache queue remains untouched while `WORKER_ENABLED=false`.
4. Proceed to the Worker gate below. After its bounded batch starts, verify cache events are claimable only while Cache is armed and that failures remain retryable/dead-letter visible.
5. Disable Cache immediately if cache requests fail repeatedly or canonical paths diverge.

## Worker enable order

1. Keep Email off.
2. Confirm PostgreSQL `SKIP LOCKED`, lease ownership, stale recovery threshold, and scheduler topology.
3. Set `WORKER_ENABLED=true` for one explicitly recorded worker topology.
4. **Enable Worker** for a bounded batch.
5. Inspect pending, processing, failed, dead-letter, stale processing, lag, cache-handler results, and other enabled handlers.
6. Stop the Worker before the Email gate if any invariant or unknown provider-side effect appears.

## Email enable order

1. Require migration/backfill/invariants green and verified Worker processing with Email still off.
2. Confirm consent/preference and recipient eligibility checks.
3. Obtain explicit authorization for one real provider smoke.
4. Set `EMAIL_SEND_ENABLED=true` and **Enable Email** only for the bounded smoke.
5. Inspect Delivery Attempt, provider message identity, webhook receipt, and `RESULT_UNKNOWN`.
6. Disable Email on ambiguous acceptance, reconciliation failure, or unexpected recipient scope.

## Analytics enable order

1. Product correctness and Email gates take priority.
2. Confirm Measurement ID/API-secret configured booleans without printing values.
3. Set `ANALYTICS_ENABLED=true` and **Enable Analytics**.
4. Verify safe event names and no PII. Analytics degradation remains best-effort and does not block Product reads.

## Abort conditions

Abort immediately on any of the following:

- migration failure;
- backfill BLOCKER;
- bridge invariant violation;
- unexpected row-count delta;
- multiple active primary bindings;
- Outbox invariant violation;
- public detail failure;
- auth failure;
- restore capability unavailable;
- unknown or ambiguous provider-side effects.

Abort means stop, keep Worker and Email disabled, capture safe evidence, and evaluate forward repair versus restore. Do not continue to “see if it recovers.”

## Rollback and restore decision tree

```text
Failure before database writes
  -> stop; no rollback required

Failure after additive writes but before external side effects
  -> keep Worker/Email off
  -> prefer bounded forward repair when correctness is provable
  -> otherwise restore from the fresh pre-cutover recovery point

Failure after email/customer side effects
  -> stop new Worker/Email work
  -> reconcile provider results and customer impact
  -> forward repair database state where possible
  -> restore only with incident-owner approval
```

DB rollback cannot undo sent emails or other irreversible provider-side effects. Never promise a perfect rollback after external effects. Restore is the hard rollback boundary; additive forward repair is the normal migration philosophy.

## WP-16B handoff

Hand off the fresh backup metadata, exact migration/backfill output, invariant and smoke results, kill-switch transitions, operational snapshot, provider reconciliation status, topology, and unresolved warnings. WP-16B performs post-cutover validation only after a separately authorized WP-15B.
