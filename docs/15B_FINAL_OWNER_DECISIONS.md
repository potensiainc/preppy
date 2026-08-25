# PREPPY WP-15B Final Owner Decisions

## 1. Owner decisions

### D1. Production platform

- Decision: Railway.
- Status: `OWNER APPROVED`.
- Evidence: owner instruction `WP-15B Railway Production Provisioning`, Section 0 D1, 2026-08-26.
- Boundary: approval covers the bounded Railway production infrastructure only; it does not permit application migration, backfill, cutover, or side-effect enablement.

### D2. Initial topology

- Decision: one Web instance, one scheduled run-once Worker, Railway Cron every five minutes as the only scheduler authority, one PostgreSQL primary, and horizontal autoscaling off.
- Status: `OWNER APPROVED`.
- Evidence: owner instruction `WP-15B Railway Production Provisioning`, Section 0 D2, 2026-08-26.
- Boundary: no second Web instance is allowed until distributed OAuth replay, distributed rate limiting, and distributed cache replay are implemented and verified.

### D3. Production domain

- Decision required: provide or select the exact owner-controlled HTTPS domain.
- Status: `UNRESOLVED`.
- Owner input: record the final domain without credentials or DNS secrets.
- Boundary: `https://preppy-web-preview-preview.up.railway.app` is Preview-only. A Railway-generated production URL may support temporary infrastructure smoke, but it is not the final SEO, canonical, Kakao, Resend, GA4, or GSC origin.

### D4. Recovery point objective

- Decision: RPO `<= 24 hours`.
- Status: `OWNER APPROVED`.
- Evidence: owner instruction `WP-15B Railway Production Provisioning`, Section 0 D4, 2026-08-26.

### D5. Recovery time objective

- Decision: RTO `<= 2 hours`.
- Status: `OWNER APPROVED`.
- Evidence: owner instruction `WP-15B Railway Production Provisioning`, Section 0 D5, 2026-08-26.

### D6. Backup and retention policy

- Decision: retain Railway Hobby for the pre-launch MVP and use a fresh portable PostgreSQL logical dump, SHA-256 manifest, and isolated PostgreSQL restore proof as the production-migration recovery gate. Retain the pre-write backup for at least 30 days. Retain the post-migration backup for at least 30 days and until two later production backups are restore-verified. After launch, target 14 days of daily logical backups and 8 weeks of weekly logical backups.
- Status: `OWNER APPROVED`.
- Evidence: owner instruction `WP-15B Hobby Logical Backup + Production Migration/Backfill`, Sections 1, 15–21, and 41–45, 2026-08-26.
- Boundary: Railway Pro and native PITR remain valuable future hardening but are deferred and were not enabled. The logical fallback is accepted because the database was fresh-empty and PREPPY remains pre-launch; it is not a general waiver for a live data-bearing system.
- Upgrade trigger: evaluate Railway Pro/PITR when active Monitoring Parents reach 100, live monitoring/email becomes operationally material, one daily-backup interval becomes unacceptable, meaningful user/follow/notification history exists, usage approaches the Pro minimum, or a second Web instance/higher SLA is required.

### D7. Database role model

- Decision: `preppy_preflight_ro` and `preppy_migration` remain separate; Web and Worker share the least-privilege `preppy_runtime` role for the initial MVP.
- Status: `OWNER APPROVED`.
- Evidence: owner instruction `WP-15B Railway Production Provisioning`, Section 0 D7, 2026-08-26.
- Boundary: `preppy_runtime` has no schema CREATE privilege. Runtime DML and preflight SELECT grants are supplied only through migration-role default privileges after a separately approved migration creates application objects.

### D8. Railway production provisioning

- Decision: bounded Railway production infrastructure provisioning.
- Status: `OWNER APPROVED`.
- Evidence: owner instruction `WP-15B Railway Production Provisioning`, Section 0 D8, 2026-08-26.
- Boundary: the approval covers one PostgreSQL primary, one Web service, one scheduled Worker, security-role DDL, temporary infrastructure smoke, and read-only verification. It is not application migration, backfill, cutover, or side-effect approval.

### D9. External provider configuration

- Decision: production readiness planning and configuration scope for Kakao, Admin OIDC, Resend, GA4, and GSC.
- Status: `OWNER APPROVED`.
- Evidence: owner instruction `WP-15B Railway Production Provisioning`, Section 0 D9, 2026-08-26.
- Boundary: the final custom domain is unresolved, so provider-console mutations, DNS, webhook registration, live email, live GA, login smoke, and GSC verification remain `NOT EXECUTED`.

### D10. Production migration, backfill, and cutover

#### D10A. Production migration and deterministic backfill

- Decision: apply repository migrations through `0010_colorful_randall_flagg`, then run the approved Institution, Opportunity, and Source Binding backfills twice with every side-effect capability disabled.
- Status: `OWNER APPROVED` and `EXECUTED` on 2026-08-26.
- Evidence: owner instruction `WP-15B Hobby Logical Backup + Production Migration/Backfill`, production-write authorization and Sections 21–42, 2026-08-26; execution evidence is recorded in `docs/15B_PRODUCTION_MIGRATION_RESULT.md`.
- Boundary: the approval was conditioned on a fresh logical backup, SHA-256, and isolated restore proof before the first application write. It did not authorize Product data, seed data, capability enablement, or provider actions.

#### D10B. Product cutover and capability enablement

- Decision required later: separately authorize Product cutover and the staged enablement of Cache, Worker, Email, and Analytics after the final origin/provider gates are resolved.
- Status: `NOT APPROVED` / `NOT EXECUTED`.
- Owner input: a later explicit cutover authorization remains mandatory.
- Boundary: Worker, Email, Analytics, and Cache remain disabled. No live provider call, custom-domain/DNS mutation, deploy, demo/customer import, or public launch is permitted by D10A.

Automatically approved decisions: `NONE`; D1, D2, D4–D9, and D10A are approved only by the explicit 2026-08-26 owner instructions cited above.

## 2. Decision status contract

Only these values are valid in this document:

- `RECOMMENDED`: repository-backed candidate awaiting an owner decision.
- `OWNER APPROVED`: explicit owner approval with a non-secret evidence reference, date, and accountable owner.
- `OWNER REJECTED`: explicit owner rejection with a replacement decision or follow-up owner action.
- `UNRESOLVED`: the owner choice or required fact is not available.
- `NOT EXECUTED`: an operational decision or action deliberately has not occurred.
- `BLOCKED`: a prerequisite prevents a safe decision or next action.

No repository capability, Preview result, proposal, example, or non-production rehearsal may be converted automatically into `OWNER APPROVED`.

## 3. Evidence baseline and phase boundary

- Provisioning code baseline: `cfeb4677f76f35e88125d143e6c4563d2a7ac7a2`.
- Remote `main` and `wp-15b-railway-production-provision` were clean at that baseline before provisioning work.
- Railway Preview evidence confirms build, HTTPS Preview runtime, synthetic Preview PostgreSQL, public routes, dynamic sitemap, and the accepted UI baseline.
- Railway Production now contains one PostgreSQL primary, one Web service, and one scheduled run-once Worker. It remains isolated from `preppy-ui-preview`.
- The temporary Railway production URL is infrastructure-smoke-only; `/api/health` returned HTTP 200.
- The fresh-empty baseline was reverified immediately before the first application write: zero public application tables, zero migration-ledger tables, zero customer rows, and no Preview/demo data.
- A fresh pre-write logical backup and a post-migration logical backup were stored outside Git, hashed with SHA-256, and restored into an isolated local PostgreSQL 18 target. Both restore gates passed.
- Repository migrations through `0010_colorful_randall_flagg` and the three approved deterministic backfills completed under `preppy_migration`. The second backfill pass produced no additional mutation.
- The full application-schema WP-15A production preflight ran under `preppy_preflight_ro` in a repeatable-read, read-only transaction and returned `BLOCKER=0`.
- Railway remains on Hobby. Railway Pro and native PITR were not enabled; the owner-approved logical recovery fallback replaced PITR as the bounded MVP migration gate.
- Application cutover, Worker enablement, Email, Analytics, Cache, provider-console mutation, DNS, customer/demo data loading, and public launch did not occur.

## 4. Required owner record

For every future `OWNER APPROVED` or `OWNER REJECTED` transition, record:

- decision identifier D1–D10;
- decision value;
- accountable owner;
- decision date;
- non-secret evidence reference;
- any expiry, exception, or follow-up condition.

Secrets, DSNs, tokens, provider payloads, PII, and raw production data are forbidden in the decision record.

## 5. Current gate

Final gate: `PRODUCTION_MIGRATION_COMPLETE_CAPABILITIES_DISABLED`.

D10A is complete: schema migration, zero-row deterministic backfill, idempotency, least-privilege grants, full read-only preflight, public read smoke, and both logical restore gates passed. D10B remains unapproved. The final custom domain, provider configuration, launch authorization, and staged capability enablement remain deferred.
