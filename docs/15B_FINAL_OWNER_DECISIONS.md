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

- Decision: Railway PITR/provider-native recovery plus a fresh pre-cutover recovery point and a portable PostgreSQL logical dump. Retain the pre-cutover recovery point for 30 days and until two verified post-cutover backups exist; retain daily backups for 14 days and weekly backups for 8 weeks.
- Status: `OWNER APPROVED`.
- Evidence: owner instruction `WP-15B Railway Production Provisioning`, Sections 0 D6 and 34, 2026-08-26.
- Boundary: Railway Backups/PITR currently requires a Pro-plan billing action. No upgrade was purchased. Native recovery and supplemental logical retention remain separate operational proofs, and the fresh cutover backup remains `NOT EXECUTED` until immediately before the first separately authorized production write.

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

- Decision required later: grant a separate, time-bounded production-write authorization only after provisioning, provider readiness, the real read-only production preflight, and the fresh-backup gate pass.
- Status: `NOT EXECUTED` / `NOT APPROVED`.
- Owner input: a later explicit, time-bounded production-write authorization remains mandatory.
- Boundary: no current approval permits production migration, backfill, Worker enablement, Email enablement, Analytics enablement, Cache enablement, or deploy.

Automatically approved decisions: `NONE`; D1, D2, D4–D9 are approved only by the explicit 2026-08-26 owner instruction cited above.

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
- Security-role DDL only was applied to the fresh empty database. Application tables and migration ledger tables both remain absent.
- The environment-level fresh-empty baseline was verified. The full application-schema WP-15A production preflight remains `NOT EXECUTED` until an application schema exists.
- Railway Backups/PITR is blocked by a Pro-plan billing action; no purchase or automatic upgrade occurred.
- Fresh production backup: `NOT EXECUTED`; it is an execution-time gate immediately before the first separately authorized production write.
- Application migration, backfill, cutover, Worker enablement, Email, Analytics, Cache, provider-console mutation, DNS, and customer-data loading: none.

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

Final gate: `PRODUCTION_INFRA_READY_FOR_MIGRATION_APPROVAL`.

The bounded Railway infrastructure and fresh-empty database baseline are ready for a later migration-approval decision. Before any production write, the owner must resolve Railway Pro billing for Backups/PITR (or explicitly approve the runbook's bounded logical fallback), create and record a fresh recovery point, and issue a separate D10 production-write authorization. The final custom domain and all final-domain provider work remain deferred.
