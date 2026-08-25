# PREPPY WP-15B Production Cutover Decision

Status: `BLOCKED`
Decision date: 2026-08-25
Code baseline: `6c360f0d931d452977fd1e297e3f3890bda3d275`

This document is the single operator decision artifact for a later WP-15B cutover. It records repository evidence, proposed owner decisions, and production facts that remain unresolved. It does not authorize or execute a production backup, migration, backfill, cutover, provider call, deployment, DNS change, or worker action.

Status vocabulary:

- `CONFIRMED`: supported by current repository or production evidence.
- `PROPOSED`: recommended but not owner-approved.
- `UNRESOLVED`: no trustworthy production evidence is available.
- `NOT EXECUTED`: an operational check or action has not run.

## 1. Current code baseline

| Item | Status | Evidence |
| --- | --- | --- |
| WP-16A commit | CONFIRMED | `6c360f0d931d452977fd1e297e3f3890bda3d275` |
| Repository latest migration | CONFIRMED | `0010_colorful_randall_flagg` |
| WP-16A non-production restore drill | CONFIRMED | PostgreSQL 16 logical backup/restore, ledger/count/invariant/read-smoke PASS |
| WP-16A production gate | BLOCKED | production topology and production prerequisites remain unresolved or not executed |

The WP-16A tooling, observability, kill-switch, secret-separation, and non-production restore evidence passed. A successful rehearsal is not a production recovery artifact and cannot replace the fresh WP-15B backup gate.

## 2. Production topology decision

### Current evidence

| Field | Classification | Value |
| --- | --- | --- |
| Deployment platform | UNRESOLVED | no production provider configuration is present |
| Web instance count | UNRESOLVED | no production deployment evidence |
| Worker instance count | UNRESOLVED | no production deployment evidence |
| Scheduler source | UNRESOLVED | repository exposes a bounded `--once` Worker CLI but no production scheduler authority |
| Database topology | UNRESOLVED | local Docker PostgreSQL is development evidence only |
| Horizontal autoscaling | UNRESOLVED | no production deployment policy |

`docker-compose.yml` is a local development topology and is not production evidence.

### Initial MVP production topology — PROPOSED — OWNER APPROVAL REQUIRED

- Web: exactly one active application/web instance.
- Worker: exactly one active Worker instance.
- Scheduler: exactly one scheduler or trigger source, with no duplicate invocation authority.
- Database: one production PostgreSQL primary managed by the selected provider.
- Email: Resend.
- Analytics: GA4 remains disabled until Product and Email smoke gates pass.
- Cache revalidation: the internal HMAC endpoint runs in the same single web runtime.
- Horizontal autoscaling: disabled for the initial MVP.

This proposal keeps the current process-local OAuth replay, rate-limit, and cache replay controls inside their tested single-runtime assumptions. PostgreSQL `SKIP LOCKED` and lease ownership support future Worker scale-out but do not solve web-level replay or rate-limit coordination.

### Scale-out hard gate

Record this only after the owner approves the single-web proposal:

```text
PROCESS-LOCAL CONTROLS ACCEPTED FOR INITIAL SINGLE-WEB MVP ONLY
```

No second web instance is allowed until all of these are implemented and verified:

1. distributed OAuth replay enforcement;
2. distributed rate limiting;
3. distributed cache replay enforcement.

If more than one Worker is selected, its instance count, single scheduler authority, `SKIP LOCKED` behavior, lease ownership, and stale-recovery procedure must be explicitly approved and verified.

## 3. RPO, RTO, and retention decisions

These are unchanged from WP-16A and are not automatically approved:

| Decision | Recommended MVP value | Status |
| --- | --- | --- |
| RPO | `<= 24 hours` | PROPOSED — OWNER APPROVAL REQUIRED |
| RTO | `<= 2 hours` | PROPOSED — OWNER APPROVAL REQUIRED |
| Pre-cutover recovery point | retain at least 30 days and until two verified post-cutover backups exist | PROPOSED — OWNER APPROVAL REQUIRED |
| Daily retention | 14 days | PROPOSED — OWNER APPROVAL REQUIRED |
| Weekly retention | 8 weeks | PROPOSED — OWNER APPROVAL REQUIRED |

Observed non-production restore duration is evidence only and is not a guaranteed production RTO.

## 4. Production origin and canonical host

| Requirement | Status | Current evidence |
| --- | --- | --- |
| Exact `APP_BASE_URL` | UNRESOLVED | not configured in the current operational environment |
| Canonical production host | UNRESOLVED | no deployment/domain evidence |
| HTTPS | UNRESOLVED | no production origin evidence |
| OIDC callback origin | UNRESOLVED | depends on exact `APP_BASE_URL` |
| Email/canonical/cache/webhook origin | UNRESOLVED | depends on exact `APP_BASE_URL` |

The example localhost origin is not production evidence. WP-15B remains blocked until one credential-free HTTPS origin and canonical host are recorded and validated across OIDC callbacks, public canonical URLs, email links, GA4, cache revalidation, and webhooks.

## 5. Actual production WP-15A preflight

```text
ACTUAL_PRODUCTION_PREFLIGHT = NOT_EXECUTED
reason = credentials unavailable
```

- `PRODUCTION_DATABASE_URL` is not configured in the current operational environment.
- No production connection was attempted.
- A dedicated read-only role was not proven.
- No production counts or findings are claimed.
- Production writes: none.

Before any WP-15B write, the exact approved CLI must run with no fallback to `DATABASE_URL`, and both `transaction_read_only=on` and `default_transaction_read_only=on` must be proven without a write probe. The resulting report must contain `BLOCKER=0`; warnings require operator acknowledgment.

## 6. Fresh production backup method

| Item | Status |
| --- | --- |
| Hosting provider backup capability | UNRESOLVED |
| Provider snapshot/PITR support | NOT EXECUTED |
| Provider restore capability | NOT EXECUTED |
| Logical PostgreSQL fallback tooling | CONFIRMED in non-production only |
| Production backup method selected | UNRESOLVED |
| Fresh production backup | NOT EXECUTED |

Preferred method: provider-managed snapshot/PITR when the selected provider proves it is available and restorable.

Fallback: an explicitly owner-approved logical PostgreSQL backup procedure using the bounded, non-shell-interpolated tooling contract. The fallback must define encryption, storage, retention, restore target, verification, and operator ownership before use.

WP-15B must create and verify a new recovery point immediately before the first production write. The WP-16A rehearsal artifact cannot satisfy this gate.

## 7. Production credential and role matrix

No credential values belong in this document.

| Capability | Config boundary | Required production proof | Current status |
| --- | --- | --- | --- |
| Read-only preflight | `PRODUCTION_DATABASE_URL` | metadata/SELECT only; transaction read-only enforced | NOT EXECUTED |
| Migration/cutover | `DATABASE_URL` in bounded cutover process | additive DDL and approved deterministic backfill only | NOT EXECUTED |
| Web runtime DB | `DATABASE_URL` in web process | application reads and approved web transactions; no schema migration | NOT EXECUTED |
| Worker DB | `DATABASE_URL` in Worker process | Outbox claim/lease and handler transactions only | NOT EXECUTED |
| Admin OIDC | `ADMIN_AUTH_ISSUER`, client ID/secret | single trusted issuer; fixed callback and domain-separated secret | NOT EXECUTED |
| Admin session | `ADMIN_SESSION_SECRET` | Admin-only session domain | NOT EXECUTED |
| OIDC flow | `ADMIN_OIDC_FLOW_SECRET` | state/nonce/PKCE flow-cookie domain | NOT EXECUTED |
| Resend send | `RESEND_API_KEY`, `EMAIL_FROM` | sending-domain/API capability only | NOT EXECUTED |
| Resend webhook | `RESEND_WEBHOOK_SECRET` | webhook verification only | NOT EXECUTED |
| GA4 server | `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` | Measurement Protocol only | NOT EXECUTED |
| Cache HMAC | `CACHE_REVALIDATION_SECRET` | internal request signing/verification only | NOT EXECUTED |

The current code uses the same config name, `DATABASE_URL`, in the cutover, web, and Worker processes. Distinct values can still be injected per process. Before production execution confirm:

- the read-only role cannot write;
- the runtime role cannot migrate schema;
- the migration credential is not used by normal web runtime;
- Worker capability is limited to its approved database operations.

If distinct web and Worker DB roles cannot be provisioned for the initial MVP, document the exact shared-role exception and obtain explicit owner approval. That exception must never include the migration role or weaken the dedicated read-only preflight role.

## 8. Provider readiness

### Resend

| Check | Status |
| --- | --- |
| Sending domain verified | NOT EXECUTED |
| API key configured in current operational environment | false |
| Webhook endpoint registered | NOT EXECUTED |
| Webhook secret configured in current operational environment | false |
| Live send | NOT EXECUTED |

No live Resend call or webhook registration is allowed in this gate-resolution task.

### GA4

| Check | Status |
| --- | --- |
| Property exists | NOT EXECUTED |
| Web stream exists | NOT EXECUTED |
| Measurement ID configured in current operational environment | false |
| Server API secret configured in current operational environment | false |
| Required bounded custom dimensions configured | NOT EXECUTED |
| Internal traffic exclusion configured | NOT EXECUTED |
| Live event | NOT EXECUTED |

### Google Search Console

| Check | Status |
| --- | --- |
| Domain/DNS verification | NOT EXECUTED |
| Sitemap submission procedure | CONFIRMED in `docs/14_ANALYTICS_MEASUREMENT.md` |
| Exact canonical production host | UNRESOLVED |
| Verification action | NOT EXECUTED |

## 9. Required initial kill-switch state

All side effects start off:

```text
WORKER_ENABLED=false
EMAIL_SEND_ENABLED=false
ANALYTICS_ENABLED=false
CACHE_REVALIDATION_ENABLED=false
```

Do not claim work and then skip it. Worker disabled means no recovery, claim, lease mutation, or dispatch. Email disabled means no provider call. Analytics disabled means Noop/no GA network. Cache disabled means no cache claim, request, or false processing.

## 10. Cutover sequence — DOCUMENTED ONLY

1. Confirm every owner decision and operational prerequisite below is checked.
2. Run the actual production WP-15A preflight with the dedicated read-only role; require `BLOCKER=0`.
3. Create and verify the fresh production backup/recovery point.
4. Record safe backup metadata and confirmed restore capability.
5. Confirm all four kill switches are false.
6. Apply additive migrations in repository order with the migration role.
7. Re-read and verify the migration ledger.
8. Run Institution, Opportunity, and Source Binding deterministic backfills in approved order.
9. Run second-pass idempotency and confirm Product signals remain zero.
10. Run bridge, lineage, binding, identity/follow, Outbox/Notification, Article/redirect, and provider-event invariants.
11. Run public and Admin read smoke with all side effects off.
12. Arm Cache while Worker remains off; confirm the queue remains untouched.
13. Enable Worker for a bounded batch with Email still off.
14. Observe Outbox, leases, lag, dead letter, `RESULT_UNKNOWN`, and cache results.
15. Enable Email only after Worker behavior is verified and separately authorize one Resend smoke.
16. Reconcile Delivery Attempt, provider message, webhook, and ambiguity state.
17. Enable Analytics only after Product and Email gates pass.
18. Verify safe GA events/configuration and hand off to WP-16B.

This sequence is not executable authorization. WP-15B requires a later, separate, explicit user approval.

## 11. Required enable order

```text
Migrate/backfill with all side effects OFF
→ integrity checks
→ public/Admin read smoke
→ Cache ON
→ Worker ON with Email OFF
→ observe Outbox/Worker
→ Email ON
→ explicitly authorized Resend live smoke
→ Analytics ON
→ GA verification
→ WP-16B validation
```

Analytics never takes priority over Product correctness. Email must not be enabled before verified Worker processing.

## 12. Abort conditions

Abort immediately on any of these:

- migration failure or ledger mismatch;
- deterministic backfill `BLOCKER`;
- bridge, lineage, Evidence ownership, or FollowEpisode invariant violation;
- unexpected row-count delta;
- multiple active primary Source bindings;
- Outbox/Notification/Delivery/Attempt invariant violation;
- public detail, auth, Admin, Monitoring, KPI, sitemap, or liveness failure;
- unavailable restore capability;
- unknown or ambiguous provider-side effect, including `RESULT_UNKNOWN`;
- a kill switch that does not enforce its documented disabled behavior.

Abort means stop, keep Worker and Email disabled, capture PII-safe evidence, and evaluate bounded forward repair versus restore. Never continue merely to observe whether an invariant recovers.

## 13. Rollback and restore conditions

```text
Failure before database writes
  -> stop; no database rollback required

Failure after additive writes but before external side effects
  -> keep Worker and Email off
  -> prefer bounded forward repair when correctness is provable
  -> otherwise restore from the fresh pre-cutover recovery point

Failure after email/customer side effects
  -> stop new Worker and Email work
  -> reconcile provider results and customer impact
  -> forward-repair database state where possible
  -> restore only with incident-owner approval
```

A database restore cannot undo sent Email or other irreversible provider effects. No perfect rollback is promised after side effects begin.

## 14. Required production smoke sequence

Before side effects:

1. liveness-only `/api/health`;
2. Home and Institution list;
3. representative Institution, Opportunity, and PUBLIC Article detail;
4. redirect behavior with non-public targets returning 404;
5. consumer auth and My PREPPY;
6. Admin OIDC/session and protected reads;
7. Monitoring queue and operational snapshot;
8. Outbox/Notification reads and KPI query;
9. sitemap, canonical origin, and noindex boundaries.

After controlled enablement:

1. Cache event processing with canonical server-derived paths;
2. bounded Worker batch with Email disabled;
3. explicitly authorized single Resend smoke and webhook reconciliation;
4. GA4 safe-event verification after Analytics enablement;
5. WP-16B post-cutover operational validation.

Evidence contains only safe canonical IDs, aggregate counts, statuses, reason codes, and configured booleans—never PII, HTML, provider payloads, DSNs, tokens, or secret values.

## 15. Owner approval and production prerequisite checklist

- [ ] Initial production topology approved.
- [ ] `RPO <= 24h` approved.
- [ ] `RTO <= 2h` approved.
- [ ] Retention policy approved.
- [ ] Exact production `APP_BASE_URL`, canonical host, and HTTPS approved.
- [ ] Actual production read-only preflight passed with `BLOCKER=0`.
- [ ] Fresh-backup method and provider capability confirmed.
- [ ] Exactly one initial scheduler authority confirmed.
- [ ] Migration/cutover credential confirmed.
- [ ] Runtime DB credential and no-migration privilege confirmed.
- [ ] Worker credential and topology confirmed.
- [ ] Read-only, migration, runtime, and Worker role separation confirmed or a bounded MVP exception explicitly approved.
- [ ] Resend production domain, API, sender, webhook registration, and webhook secret readiness confirmed.
- [ ] GA4 property, stream, measurement ID, API secret, dimensions, and internal-traffic readiness confirmed.
- [ ] GSC domain verification and sitemap submission plan confirmed.
- [ ] Explicit approval to execute production WP-15B granted in a later turn.

No box is checked from a proposal, example value, repository capability, or non-production rehearsal alone.

## 16. Final gate and remaining blockers

Final gate: `BLOCKED`

The remaining items are not merely owner acceptance of already-proven facts. Production infrastructure and operational evidence are missing:

1. deployment platform, web/Worker counts, scheduler, and database topology are unresolved;
2. RPO, RTO, and retention remain proposed;
3. exact production HTTPS origin/canonical host is unresolved;
4. production read-only credentials are unavailable and the actual WP-15A preflight is not executed;
5. production backup/PITR method and restore capability are unconfirmed;
6. production DB roles are not provisioned or proven;
7. Resend, GA4, and GSC production readiness checks are not executed;
8. a separate explicit production-write approval has not been granted.

`READY_FOR_OWNER_APPROVAL` becomes appropriate only after the production facts and operational checks above are resolved and owner choices are the sole remaining items. `READY_FOR_WP15B` requires every mandatory decision and check to pass, but still does not authorize production writes.
