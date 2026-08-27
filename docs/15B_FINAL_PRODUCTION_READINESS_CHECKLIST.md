# PREPPY WP-15B Final Production Readiness Checklist

Evidence date: 2026-08-26

Production-migration checkpoint baseline: `bea26170bfa2e8a8ea635e32cc2069b6e36b9cd0`

Deployed Web/Worker application baseline during the bounded migration: `cfeb4677f76f35e88125d143e6c4563d2a7ac7a2`

Allowed checklist statuses are `PASS`, `FAIL`, `NOT EXECUTED`, `OWNER APPROVED`, `OWNER APPROVAL REQUIRED`, `BLOCKED`, and `NOT APPLICABLE`.

This is the canonical technical companion to `docs/15B_FINAL_OWNER_DECISIONS.md`. It separates repository/Preview evidence from production facts. `PASS` never implies owner approval or production-write authorization.

## Platform

| Check                                                                  | Status         | Evidence / next proof                           |
| ---------------------------------------------------------------------- | -------------- | ----------------------------------------------- |
| Railway Preview build, HTTPS runtime, and synthetic Preview PostgreSQL | PASS           | existing `preppy-ui-preview` Preview only       |
| Railway production platform selection                                  | OWNER APPROVED | D1; explicit owner instruction dated 2026-08-26 |
| Railway production project/environment provisioned                     | PASS           | isolated `preppy-production` / `production`     |
| production source is `main` with autodeploy disabled/manual promotion  | PASS           | Web source verified; autodeploy disabled        |
| bounded infrastructure deployment                                      | PASS           | Web health and disabled scheduled Worker only   |

## Origin and domain

| Check                                                                      | Status                  | Evidence / next proof                          |
| -------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------- |
| final owner-controlled production HTTPS domain selected                    | OWNER APPROVAL REQUIRED | D3; exact domain remains unresolved            |
| Preview URL excluded from production canonical configuration               | PASS                    | Preview URL is documented as Preview-only      |
| Railway-generated production URL limited to temporary infrastructure smoke | PASS                    | must not become the SEO/provider launch origin |
| production `APP_BASE_URL` and canonical host configured                    | NOT EXECUTED            | configure only after D3                        |
| Kakao, Admin OIDC, Resend, Cache, sitemap, GA4, and GSC origins aligned    | NOT EXECUTED            | use the same final approved HTTPS origin       |

## Topology

| Check                                                                 | Status         | Evidence / next proof                     |
| --------------------------------------------------------------------- | -------------- | ----------------------------------------- |
| repository target defines one Web, one Worker, one PostgreSQL primary | PASS           | `.railway/railway.ts`                     |
| one Web / one Worker / autoscaling off topology approved              | OWNER APPROVED | D2; explicit owner instruction            |
| actual Web replicas exactly one                                       | PASS           | Railway deployment manifest               |
| actual Worker execution target exactly one                            | PASS           | one scheduled service; no extra scheduler |
| second Web blocked until distributed replay/rate-limit controls exist | PASS           | process-local hardening gate documented   |

## Scheduler

| Check                                                   | Status         | Evidence / next proof                          |
| ------------------------------------------------------- | -------------- | ---------------------------------------------- |
| bounded run-once Worker command                         | PASS           | `npm run worker:once`; 240-second hard timeout |
| five-minute Railway Cron cadence approved               | OWNER APPROVED | D2; `*/5 * * * *` UTC                          |
| Railway Cron configured as the only scheduler authority | PASS           | Worker service schedule; no scheduler service  |
| scheduled service restart policy `NEVER` verified       | PASS           | Railway deployment manifest                    |

## Database roles

| Check                                                           | Status         | Evidence / next proof                                   |
| --------------------------------------------------------------- | -------------- | ------------------------------------------------------- |
| capability-separated role model documented                      | PASS           | preflight, migration, runtime, Worker boundaries        |
| role model or bounded Web/Worker shared-role exception approved | OWNER APPROVED | D7; shared `preppy_runtime` bounded exception           |
| dedicated read-only preflight role provisioned                  | PASS           | DB role config has transaction read-only and no CREATE  |
| migration role provisioned and excluded from Web/Worker         | PASS           | operator URL retained only on Postgres service          |
| runtime role cannot migrate schema                              | PASS           | no public-schema CREATE privilege                       |
| Worker role has bounded DML and no schema DDL                   | PASS           | Worker uses shared `preppy_runtime`; future grants only |

## Backups

| Check                                                       | Status         | Evidence / next proof                                                 |
| ----------------------------------------------------------- | -------------- | --------------------------------------------------------------------- |
| WP-16A non-production logical backup/restore drill          | PASS           | ledger/count/invariant/read-smoke evidence through `0010`             |
| Railway native PITR/backup capability documented            | PASS           | future hardening capability; not enabled on Hobby                     |
| RPO, RTO, and retention policy approved                     | OWNER APPROVED | D4–D6; explicit owner instructions                                    |
| MVP recovery method selected                                | OWNER APPROVED | fresh logical dump + SHA-256 + isolated restore                       |
| Railway Pro/native PITR                                     | NOT EXECUTED   | deliberately deferred for the pre-launch MVP                          |
| fresh logical recovery point before first application write | PASS           | custom/no-owner/no-acl dump; isolated PostgreSQL 18 restore           |
| post-migration logical backup and restore                   | PASS           | exact ledger, aggregates, and catalog object counts                   |
| recurring daily/weekly logical backup automation            | NOT EXECUTED   | owner execution/storage decision and monitored restore proof required |

## Production preflight

| Check                                                        | Status | Evidence / next proof                                            |
| ------------------------------------------------------------ | ------ | ---------------------------------------------------------------- |
| bounded read-only WP-15A tooling                             | PASS   | fixed query surface, redacted report, no `DATABASE_URL` fallback |
| dedicated read-only credential available                     | PASS   | role URL stored as a service-scoped Railway secret               |
| read-only role default and privileges proven                 | PASS   | catalog introspection; no application-table write probe          |
| fresh-empty environment preflight executed                   | PASS   | reachable DB, distinct roles, zero public/application tables     |
| full WP-15A application-schema production preflight executed | PASS   | `preppy_preflight_ro`; repeatable-read/read-only                 |
| actual production result has `BLOCKER=0`                     | PASS   | one optional GA4 configuration warning acknowledged              |

## Kakao

| Check                                                                | Status       | Evidence / next proof                |
| -------------------------------------------------------------------- | ------------ | ------------------------------------ |
| callback path `/auth/kakao/callback`                                 | PASS         | repository route/config contract     |
| final callback `https://<FINAL_DOMAIN>/auth/kakao/callback` approved | NOT EXECUTED | depends on D3                        |
| Kakao production application Web domain/origin registered            | NOT EXECUTED | provider console action              |
| production client credentials configured                             | NOT EXECUTED | configured booleans only in evidence |
| login and Follow-intent restoration smoke                            | NOT EXECUTED | later explicitly authorized smoke    |

## Admin OIDC

| Check                                                                  | Status       | Evidence / next proof                  |
| ---------------------------------------------------------------------- | ------------ | -------------------------------------- |
| single trusted issuer and callback path `/admin/auth/callback`         | PASS         | repository OIDC contract               |
| trusted discovery/JWKS and production client configured                | NOT EXECUTED | provider/secret configuration required |
| final callback `https://<FINAL_DOMAIN>/admin/auth/callback` registered | NOT EXECUTED | depends on D3                          |
| allowed Admin subjects provisioned without auto-linking                | NOT EXECUTED | safe operator evidence only            |
| production Admin login smoke                                           | NOT EXECUTED | later explicitly authorized smoke      |

## Resend

| Check                                               | Status                  | Evidence / next proof             |
| --------------------------------------------------- | ----------------------- | --------------------------------- |
| webhook route `/api/webhooks/resend`                | PASS                    | repository route contract         |
| production sending domain and `EMAIL_FROM` approved | OWNER APPROVAL REQUIRED | D9 plus final domain              |
| API and webhook secrets configured                  | NOT EXECUTED            | values must never enter evidence  |
| exact production webhook registered                 | NOT EXECUTED            | final-domain URL required         |
| live email and webhook reconciliation smoke         | NOT EXECUTED            | later separate authorization only |

## GA4

| Check                                                       | Status       | Evidence / next proof                                |
| ----------------------------------------------------------- | ------------ | ---------------------------------------------------- |
| bounded client/server analytics transport and PII guard     | PASS         | repository implementation/tests                      |
| production property and exact-host Web stream               | NOT EXECUTED | provider configuration                               |
| measurement ID and API secret configured                    | NOT EXECUTED | configured booleans only                             |
| custom dimensions and internal-traffic exclusion configured | NOT EXECUTED | dashboard proof required                             |
| production live event                                       | NOT EXECUTED | Analytics remains off until Product/Email gates pass |

## GSC

| Check                                          | Status                  | Evidence / next proof                         |
| ---------------------------------------------- | ----------------------- | --------------------------------------------- |
| dynamic canonical sitemap route `/sitemap.xml` | PASS                    | DB-less build plus runtime DB-backed contract |
| final domain approved                          | OWNER APPROVAL REQUIRED | D3                                            |
| DNS/domain verification                        | NOT EXECUTED            | no DNS mutation in this phase                 |
| final sitemap URL verified and submitted       | NOT EXECUTED            | use `https://<FINAL_DOMAIN>/sitemap.xml`      |

## Kill switches

| Check                                                     | Status | Evidence / next proof                                         |
| --------------------------------------------------------- | ------ | ------------------------------------------------------------- |
| repository defaults all four capabilities to false        | PASS   | runtime config and Railway IaC                                |
| Worker false means no recovery, claim, lease, or dispatch | PASS   | unit contract                                                 |
| Email false means no provider call                        | PASS   | unit contract                                                 |
| Analytics false selects Noop/no GA request                | PASS   | unit contract                                                 |
| Cache false means no cache claim/request/false processing | PASS   | unit contract                                                 |
| production starts with all four values false              | PASS   | verified on Web and Worker; Worker run claimed/processed zero |

Required starting state:

```text
WORKER_ENABLED=false
EMAIL_SEND_ENABLED=false
ANALYTICS_ENABLED=false
CACHE_REVALIDATION_ENABLED=false
```

## Migration and backfill

| Check                                                             | Status       | Evidence / next proof                                        |
| ----------------------------------------------------------------- | ------------ | ------------------------------------------------------------ |
| repository migration ledger through `0010_colorful_randall_flagg` | PASS         | no UI-02 migration/schema change                             |
| migration absent from build/start/deploy commands                 | PASS         | explicit operator-only boundary                              |
| deterministic Institution, Opportunity, Source Binding backfills  | PASS         | existing rehearsal/idempotency contracts                     |
| D10A production migration                                         | PASS         | migrations `0000` through `0010_colorful_randall_flagg`      |
| D10A production backfill                                          | PASS         | Institution, Opportunity, and Source Binding; zero conflicts |
| second-pass idempotency                                           | PASS         | zero additional inserts, updates, duplicates, or conflicts   |
| D10B Product cutover and capability enablement                    | NOT EXECUTED | not owner-approved; all four capabilities remain false       |

## Post-cutover validation

| Check                                                      | Status       | Evidence / next proof                                                       |
| ---------------------------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| L1–L8 launch decisions and provider prerequisites resolved | NOT EXECUTED | final domain, recurring backup, providers, and D10B remain open             |
| staged Cache/Worker/Email/Analytics enablement             | NOT EXECUTED | execute only after D10B and in the documented order                         |
| WP-16B post-cutover validation                             | NOT EXECUTED | entry criteria are defined in `docs/15B_POST_MIGRATION_LAUNCH_READINESS.md` |

## Smoke tests

| Check                                                            | Status       | Evidence / next proof                                        |
| ---------------------------------------------------------------- | ------------ | ------------------------------------------------------------ |
| accepted UI-02 Preview Home/List/Institution/Opportunity/Article | PASS         | HTTP 200, no console/page errors, no overflow                |
| pathname scroll-to-top and query/hash preservation               | PASS         | focused tests and real Preview browser evidence              |
| DB-less production build                                         | PASS         | no runtime/test/production DB URL during build               |
| production public read smoke                                     | PASS         | health, Home, Institutions, sitemap, and robots returned 200 |
| production Admin/auth/provider live smoke                        | NOT EXECUTED | provider configuration and live auth remain deferred         |
| Cache, bounded Worker, Resend, and GA staged smoke               | NOT EXECUTED | follow the runbook enable order under later authorization    |

## Owner approvals

| Decision                                         | Status                  |
| ------------------------------------------------ | ----------------------- |
| D1 Railway production platform                   | OWNER APPROVED          |
| D2 initial topology and five-minute scheduler    | OWNER APPROVED          |
| D3 exact production HTTPS domain                 | OWNER APPROVAL REQUIRED |
| D4 RPO `<=24h`                                   | OWNER APPROVED          |
| D5 RTO `<=2h`                                    | OWNER APPROVED          |
| D6 backup/retention and Railway gap resolution   | OWNER APPROVED          |
| D7 DB role model or bounded exception            | OWNER APPROVED          |
| D8 Railway production provisioning               | OWNER APPROVED          |
| D9 Kakao/Admin OIDC/Resend/GA4/GSC configuration | OWNER APPROVED          |
| D10A production migration/backfill               | OWNER APPROVED          |
| D10B Product cutover/capability enablement       | OWNER APPROVAL REQUIRED |

Automatically approved decisions: `NONE`; approvals above cite explicit 2026-08-26 owner instructions.

## Current result and next technical prerequisites

Final gate: `READY_FOR_FINAL_DOMAIN_AND_BACKUP_DECISION`.

D10A completed under the owner-approved logical recovery boundary. Remaining launch prerequisites are:

1. resolve D3 and configure the exact owner-controlled HTTPS origin;
2. select and operationalize a dedicated recurring logical-backup execution/storage design;
3. configure and verify Kakao, Admin OIDC, Resend, GA4, and GSC without enabling Product side effects prematurely;
4. obtain explicit D10B Product cutover authorization;
5. follow the staged Cache → Worker-with-Email-off → Email → Analytics enable sequence and hand off to WP-16B.

No Product cutover, Worker claim, email, analytics event, cache revalidation, provider-console mutation, DNS/GSC action, demo/customer import, billing upgrade, or public launch occurred.
