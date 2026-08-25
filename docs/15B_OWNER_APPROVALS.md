# PREPPY WP-15B Owner Approvals

Status: `UNAPPROVED — BLOCKED`
Evidence date: 2026-08-25
Repository baseline: `76c552c5e1704daf0662bcb09909c8de01310de1`

This sheet records owner decisions and production prerequisites for PREPPY. Every checkbox is intentionally unchecked. Repository capability, example values, proposals, and non-production rehearsal evidence do not constitute approval.

Checking this sheet in a future change still does not by itself authorize production writes. WP-15B migration, backfill, cutover, Worker enablement, and provider smoke require a separate explicit user authorization after the real production read-only preflight passes.

## Approval rules

- The approver records a non-secret evidence reference, date, and accountable owner.
- `PROPOSED`, `UNRESOLVED`, or `NOT EXECUTED` cannot be converted to approved without evidence.
- No secret, DSN, token, provider payload, PII, or raw production record belongs here.
- An actual production read-only preflight must report `BLOCKER=0`; absence of credentials is not a pass.
- A fresh backup is executed only in the separately authorized cutover phase, immediately before the first production write.

## Required decisions and prerequisites

- [ ] Initial topology of exactly one web instance, one Worker instance, and one scheduler authority approved.
  - Status: PROPOSED — OWNER APPROVAL REQUIRED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED
  - Evidence: `docs/15B_PRODUCTION_ENVIRONMENT_BOOTSTRAP.md`

- [ ] Horizontal autoscaling disabled for the initial MVP.
  - Status: PROPOSED — OWNER APPROVAL REQUIRED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED
  - Scale-out gate: distributed OAuth replay, distributed rate limiting, and distributed cache replay must all pass before a second web instance.

- [ ] `RPO <= 24 hours` approved.
  - Status: PROPOSED — OWNER APPROVAL REQUIRED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED

- [ ] `RTO <= 2 hours` approved.
  - Status: PROPOSED — OWNER APPROVAL REQUIRED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED

- [ ] Retention policy approved: pre-cutover backup for 30 days and until two verified post-cutover backups exist; daily backups for 14 days; weekly backups for 8 weeks.
  - Status: PROPOSED — OWNER APPROVAL REQUIRED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED

- [ ] Production deployment platform approved.
  - Status: UNRESOLVED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED
  - Evidence required: provider/project reference without credentials, process topology, secret injection mechanism, domain capability, and database/backup capability.

- [ ] Production `APP_BASE_URL`, canonical host, and HTTPS approved.
  - Status: UNRESOLVED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED
  - Evidence required: exact credential-free HTTPS origin and callback/canonical/provider alignment.

- [ ] Exactly one production scheduler authority approved.
  - Status: UNRESOLVED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED
  - Evidence required: named scheduling source, Worker command, cadence/trigger, concurrency policy, and disabled-state procedure.

- [ ] Production backup method approved.
  - Status: UNRESOLVED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED
  - Evidence required: provider snapshot/PITR and separate-target restore capability, or explicitly approved logical PostgreSQL fallback.

- [ ] Database role model or bounded MVP exception approved.
  - Status: UNRESOLVED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED
  - Required invariant: the preflight role is read-only and the migration role is absent from normal web/Worker runtime.
  - Optional exception candidate: web and Worker share one least-privilege runtime role; this never includes migration or preflight credentials.

- [ ] Resend production readiness approved.
  - Status: NOT EXECUTED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED
  - Evidence required: configured booleans, verified sending domain/sender, canonical webhook URL, and provider-side registration status. No values.

- [ ] GA4 production readiness approved.
  - Status: NOT EXECUTED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED
  - Evidence required: configured booleans, property/stream, bounded dimensions, and internal-traffic exclusion.

- [ ] Google Search Console readiness plan approved.
  - Status: NOT EXECUTED
  - Owner: UNASSIGNED
  - Approval date: NOT EXECUTED
  - Evidence required: canonical domain, DNS/domain verification status, full sitemap URL, and submission status.

- [ ] Actual production read-only preflight passed.
  - Status: NOT EXECUTED — `PRODUCTION_DATABASE_URL` unavailable
  - Owner: UNASSIGNED
  - Execution date: NOT EXECUTED
  - Required result: dedicated read-only role proven, `BLOCKER=0`, warnings acknowledged, production writes zero.

- [ ] Explicit authorization for WP-15B production writes granted in a later turn.
  - Status: NOT GRANTED
  - Owner: UNASSIGNED
  - Authorization date: NOT EXECUTED
  - Scope required: fresh backup, exact migration/backfill commands, cutover window, smoke plan, abort owner, and restore authority.

## Current readiness summary

| Gate | Status |
| --- | --- |
| Technical production environment | BLOCKED |
| Owner policy decisions | UNAPPROVED |
| Production read-only preflight | NOT EXECUTED |
| Fresh pre-cutover backup | NOT EXECUTED — later cutover phase only |
| Production-write authorization | NOT GRANTED |

Final gate: `BLOCKED`
