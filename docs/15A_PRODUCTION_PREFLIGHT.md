# WP-15A Production Preflight and Rehearsal

## Purpose and phase boundary

WP-15A verifies that the repository can inspect production safely and can rehearse the additive migration/backfill path on a dedicated non-production database. It does not create or acquire a production backup, migrate production, backfill production, claim production work, send Email, invalidate production cache, emit live analytics, deploy, or authorize cutover.

The only successful phase gate is `READY_FOR_WP16A`; this phase is never READY_FOR_PRODUCTION_CUTOVER.

```text
WP-15A: read-only preflight + non-production rehearsal
WP-16A: backup/restore + observability + runbook + secret isolation
WP-15B: fresh backup + actual cutover
WP-16B: post-cutover validation
```

Production migration: NOT APPROVED
Production cutover: NOT APPROVED

## Production read-only execution

The production CLI is:

```text
npm run db:preflight:production
```

It reads only `PRODUCTION_DATABASE_URL`; `DATABASE_URL` is not a fallback. Before inventory it executes the safe identity/session checks corresponding to:

```text
SHOW transaction_read_only;
SHOW default_transaction_read_only;
SELECT current_database(), current_user;
```

Both `transaction_read_only=on` and `default_transaction_read_only=on` are required. A writable connection exits with safety code `3` before the inventory callback. No test write is issued. Inventory runs in one bounded `REPEATABLE READ READ ONLY` transaction with a statement timeout, so snapshot consistency is claimed only for queries inside that transaction.

The production path exposes fixed inventory/introspection operations and a read-only backfill executor containing `select`/`execute` only. It has no Admin mutation, Audit writer, Outbox writer, worker claim, migration runner, apply-backfill, Email, GA, or cache client import.

If credentials are absent, execution returns `CREDENTIALS_UNAVAILABLE` with no fabricated database findings. Credential absence is not a tooling failure: static tests and the dedicated rehearsal still run and the completion report records that actual production preflight was not executed.

## Safe report contract

The versioned JSON report contains database identity without URL/credentials, migration identifiers/hashes status, aggregate counts, allowlisted distributions, safe canonical IDs when needed, reason codes, configuration booleans, and `BLOCKER | WARNING | INFO` checks.

It never contains Email addresses, names, OAuth/Kakao subjects, child data, phone numbers, raw Source content, raw Article HTML, webhook payloads, database URLs, or secret values. Reports are emitted to stdout and are not stored in production or committed to source.

Exit codes:

- `0`: no blockers or explicit credential-unavailable skip
- `2`: blockers
- `3`: unsafe/writable production connection
- `4`: invalid configuration or tooling

## Inventory and dry-run

The preflight compares the Drizzle ledger and repository SQL hashes for migrations `0000` through `0010`, then checks critical tables, columns, indexes, and constraints. It reports legacy/canonical row counts; Institution/Opportunity publication and ownership; Source binding coverage; User/Follow/consent/preference state; Outbox/Notification/Delivery/Attempt state; Article/redirect state; and provider receipt state without selecting PII or body fields.

Backfill dry-run uses the approved deterministic read functions in this order:

```text
Institution → Opportunity → Source Bindings
```

Each reports `wouldInsert`, `wouldReuse`, `wouldSkip`, `wouldBlock`, blocker codes, and Source Binding `NOT_IMPORTED` codes. Dry-run creates no advisory lock and performs no write. Product signals = 0.

Invariant checks cover bridge composite ownership, native/legacy classification, active-primary binding uniqueness, FollowEpisode intervals, latest consent/preferences, stale leases, failures/dead letters, provider result ambiguity, Delivery/Attempt/provider receipt consistency, unsafe historical Article candidates, redirect chains/collisions/nonpublic targets, and same-origin canonical mismatches.

## Dedicated non-production rehearsal

The rehearsal CLI is:

```text
npm run db:rehearsal
```

It requires `REHEARSAL_DATABASE_URL`. `assertDedicatedRehearsalDatabaseUrl` accepts only names containing `_rehearsal`, `_verify`, `_test`, or `_staging`, rejects production-looking/default names, and rejects equality with `PRODUCTION_DATABASE_URL` after safe target normalization. This guard runs before migration or connection-driven mutation.

The sequence is:

```text
baseline ledger
→ repository migration runner through 0010
→ Product signal baseline
→ Institution → Opportunity → Source Bindings
→ second pass of the same three backfills
→ Product signal comparison
→ canonical read/query smoke
→ bounded read-only report
```

The second pass must create/link/insert zero rows. Product signal counts for OpportunityChange, Notification, Delivery, and customer Outbox must remain unchanged. A failing backfill keeps its existing root-transaction rollback semantics and returns `BLOCKED`.

Rehearsal uses repository legacy/upgrade fixtures or an already-authorized sanitized copy. WP-15A acquires no new production dump. No production backup, `pg_dump`, snapshot API, or cloud backup is permitted.

External effects are isolated: Fake Email only, Noop/Test Analytics only, fake OIDC only, and local/fake cache behavior only. No live Resend, GA, production webhook, production cache, or worker claim is used.

Read/query smoke covers Home, Institution list/detail when a fixture exists, Opportunity detail when a fixture exists, Article detail when a fixture exists, My Preppy with a fake rehearsal session, Admin Dashboard, Monitoring queue, Operations reads, PostgreSQL KPI, and sitemap.

## Dry-run cutover simulation

WP-15A reports which repository migrations and backfills would run, expected row effects, schema/data gates, smoke checks, and stop points. It does not execute production migration or backfill. A migration mismatch, schema incompatibility, unsafe deterministic backfill, composite ownership contradiction, multiple active primary, or canonical invariant failure is a `BLOCKER` and stops the next gate.

Warnings such as stale leases, dead-letter rows, optional GA configuration, unsafe historical Article candidates, and nonpublic redirect targets require operations review but do not silently mutate data.

## WP-16A handoff

WP-16A must operationalize, and not merely document:

- backup scope for every critical legacy/canonical table and migration ledger;
- an isolated restore drill with measured RPO/RTO assumptions;
- observability for migration duration/errors, bridge/backfill counts, Outbox age/states, worker leases, notification failures, and application health;
- a stepwise runbook with preconditions, stop points, ownership, evidence capture, and rollback/restore decisions;
- secret isolation for production DB, OIDC, Resend, webhook, cache HMAC, GA4, and GSC capabilities;
- kill switches for workers, Email send, analytics, and cache processing;
- production worker topology, pool sizing, lease recovery, and deployment sequencing;
- distributed OAuth replay enforcement;
- distributed rate limits;
- distributed cache replay enforcement;
- Resend live smoke under explicit production authorization;
- GA4/GSC production config validation without printing credentials.

Only after WP-16A evidence passes may a separate WP-15B authorization consider a fresh production backup and cutover.
