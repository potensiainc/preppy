# PREPPY WP-15B Final Production Readiness Checklist

Evidence date: 2026-08-26

Code baseline: `4e9e36c1dd99de7d78250cc75adb653952b70e5b`

Allowed checklist statuses are `PASS`, `FAIL`, `NOT EXECUTED`, `OWNER APPROVAL REQUIRED`, and `NOT APPLICABLE`.

This is the canonical technical companion to `docs/15B_FINAL_OWNER_DECISIONS.md`. It separates repository/Preview evidence from production facts. `PASS` never implies owner approval or production-write authorization.

## Platform

| Check                                                                  | Status                  | Evidence / next proof                             |
| ---------------------------------------------------------------------- | ----------------------- | ------------------------------------------------- |
| Railway Preview build, HTTPS runtime, and synthetic Preview PostgreSQL | PASS                    | existing `preppy-ui-preview` Preview only         |
| Railway production platform selection                                  | OWNER APPROVAL REQUIRED | D1; Railway is recommended, not approved          |
| Railway production project/environment provisioned                     | NOT EXECUTED            | requires later bounded provisioning authorization |
| production source is `main` with autodeploy disabled/manual promotion  | NOT EXECUTED            | verify in the provisioned Railway environment     |
| production deployment                                                  | NOT EXECUTED            | explicitly outside this phase                     |

## Origin and domain

| Check                                                                      | Status                  | Evidence / next proof                          |
| -------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------- |
| final owner-controlled production HTTPS domain selected                    | OWNER APPROVAL REQUIRED | D3; exact domain remains unresolved            |
| Preview URL excluded from production canonical configuration               | PASS                    | Preview URL is documented as Preview-only      |
| Railway-generated production URL limited to temporary infrastructure smoke | PASS                    | must not become the SEO/provider launch origin |
| production `APP_BASE_URL` and canonical host configured                    | NOT EXECUTED            | configure only after D3                        |
| Kakao, Admin OIDC, Resend, Cache, sitemap, GA4, and GSC origins aligned    | NOT EXECUTED            | use the same final approved HTTPS origin       |

## Topology

| Check                                                                 | Status                  | Evidence / next proof                   |
| --------------------------------------------------------------------- | ----------------------- | --------------------------------------- |
| repository target defines one Web, one Worker, one PostgreSQL primary | PASS                    | `.railway/railway.ts`                   |
| one Web / one Worker / autoscaling off topology approved              | OWNER APPROVAL REQUIRED | D2                                      |
| actual Web replicas exactly one                                       | NOT EXECUTED            | prove after provisioning                |
| actual Worker execution target exactly one                            | NOT EXECUTED            | prove after provisioning                |
| second Web blocked until distributed replay/rate-limit controls exist | PASS                    | process-local hardening gate documented |

## Scheduler

| Check                                                   | Status                  | Evidence / next proof                           |
| ------------------------------------------------------- | ----------------------- | ----------------------------------------------- |
| bounded run-once Worker command                         | PASS                    | `npm run worker:once`; 240-second hard timeout  |
| five-minute Railway Cron cadence approved               | OWNER APPROVAL REQUIRED | D2; recommended `*/5 * * * *` UTC               |
| Railway Cron configured as the only scheduler authority | NOT EXECUTED            | no always-on Worker or second trigger permitted |
| scheduled service restart policy `NEVER` verified       | NOT EXECUTED            | provider-side configuration proof required      |

## Database roles

| Check                                                           | Status                  | Evidence / next proof                                    |
| --------------------------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| capability-separated role model documented                      | PASS                    | preflight, migration, runtime, Worker boundaries         |
| role model or bounded Web/Worker shared-role exception approved | OWNER APPROVAL REQUIRED | D7                                                       |
| dedicated read-only preflight role provisioned                  | NOT EXECUTED            | must enforce transaction read-only without a write probe |
| migration role provisioned and excluded from Web/Worker         | NOT EXECUTED            | operator-only capability                                 |
| runtime role cannot migrate schema                              | NOT EXECUTED            | privilege proof required                                 |
| Worker role has bounded DML and no schema DDL                   | NOT EXECUTED            | privilege proof required                                 |

## Backups

| Check                                                     | Status                  | Evidence / next proof                                        |
| --------------------------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| WP-16A non-production logical backup/restore drill        | PASS                    | ledger/count/invariant/read-smoke evidence through `0010`    |
| Railway native PITR/backup capability documented          | PASS                    | capability only; not enabled or proven for production        |
| RPO, RTO, and retention policy approved                   | OWNER APPROVAL REQUIRED | D4–D6                                                        |
| Railway retention gap resolution selected                 | OWNER APPROVAL REQUIRED | D6 option A, B, or C                                         |
| production PITR/base backup/restore-to-sibling proven     | NOT EXECUTED            | provisioning-time evidence required                          |
| fresh recovery point immediately before production writes | NOT EXECUTED            | execution-time WP-15B gate; WP-16A drill does not satisfy it |

## Production preflight

| Check                                                                    | Status       | Evidence / next proof                                            |
| ------------------------------------------------------------------------ | ------------ | ---------------------------------------------------------------- |
| bounded read-only WP-15A tooling                                         | PASS         | fixed query surface, redacted report, no `DATABASE_URL` fallback |
| dedicated `PRODUCTION_DATABASE_URL` available                            | NOT EXECUTED | production credential is not present in this phase               |
| `transaction_read_only=on` and `default_transaction_read_only=on` proven | NOT EXECUTED | no write probe allowed                                           |
| actual production preflight executed                                     | NOT EXECUTED | must run before any production write                             |
| actual production result has `BLOCKER=0`                                 | NOT EXECUTED | warning acknowledgment also required                             |

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

| Check                                                     | Status       | Evidence / next proof                                       |
| --------------------------------------------------------- | ------------ | ----------------------------------------------------------- |
| repository defaults all four capabilities to false        | PASS         | runtime config and Railway IaC                              |
| Worker false means no recovery, claim, lease, or dispatch | PASS         | unit contract                                               |
| Email false means no provider call                        | PASS         | unit contract                                               |
| Analytics false selects Noop/no GA request                | PASS         | unit contract                                               |
| Cache false means no cache claim/request/false processing | PASS         | unit contract                                               |
| production starts with all four values false              | NOT EXECUTED | verify in the provisioned environment before deploy/cutover |

Required starting state:

```text
WORKER_ENABLED=false
EMAIL_SEND_ENABLED=false
ANALYTICS_ENABLED=false
CACHE_REVALIDATION_ENABLED=false
```

## Migration and backfill

| Check                                                             | Status       | Evidence / next proof                             |
| ----------------------------------------------------------------- | ------------ | ------------------------------------------------- |
| repository migration ledger through `0010_colorful_randall_flagg` | PASS         | no UI-02 migration/schema change                  |
| migration absent from build/start/deploy commands                 | PASS         | explicit operator-only boundary                   |
| deterministic Institution, Opportunity, Source Binding backfills  | PASS         | existing rehearsal/idempotency contracts          |
| production migration                                              | NOT EXECUTED | later explicit production-write approval required |
| production backfill and second-pass idempotency                   | NOT EXECUTED | later explicit production-write approval required |

## Smoke tests

| Check                                                                | Status       | Evidence / next proof                                         |
| -------------------------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| accepted UI-02 Preview Home/List/Institution/Opportunity/Article     | PASS         | HTTP 200, no console/page errors, no overflow                 |
| pathname scroll-to-top and query/hash preservation                   | PASS         | focused tests and real Preview browser evidence               |
| DB-less production build                                             | PASS         | no runtime/test/production DB URL during build                |
| production public/Admin/auth/Monitoring/Operations/KPI/sitemap smoke | NOT EXECUTED | after provisioning and pre-write gates, with side effects off |
| Cache, bounded Worker, Resend, and GA staged smoke                   | NOT EXECUTED | follow the runbook enable order under later authorization     |

## Owner approvals

| Decision                                         | Status                  |
| ------------------------------------------------ | ----------------------- |
| D1 Railway production platform                   | OWNER APPROVAL REQUIRED |
| D2 initial topology and five-minute scheduler    | OWNER APPROVAL REQUIRED |
| D3 exact production HTTPS domain                 | OWNER APPROVAL REQUIRED |
| D4 RPO `<=24h`                                   | OWNER APPROVAL REQUIRED |
| D5 RTO `<=2h`                                    | OWNER APPROVAL REQUIRED |
| D6 backup/retention and Railway gap resolution   | OWNER APPROVAL REQUIRED |
| D7 DB role model or bounded exception            | OWNER APPROVAL REQUIRED |
| D8 Railway production provisioning               | OWNER APPROVAL REQUIRED |
| D9 Kakao/Admin OIDC/Resend/GA4/GSC configuration | OWNER APPROVAL REQUIRED |
| D10 later production migration/backfill/cutover  | OWNER APPROVAL REQUIRED |

Automatically approved decisions: `NONE`.

## Current result and next technical prerequisites

Final gate: `READY_FOR_OWNER_APPROVAL`.

After D1–D9 are explicitly resolved, the separately authorized provisioning phase must:

1. create an isolated Railway production environment without autodeploy or side effects;
2. configure exactly one Web, one scheduled run-once Worker, one five-minute Railway Cron authority, and one PostgreSQL primary;
3. attach the final HTTPS domain and align Kakao, Admin OIDC, Resend, Cache, GA4, sitemap, and GSC origins;
4. provision and prove the DB roles or the approved bounded Web/Worker exception;
5. enable and verify PITR/backup/restore capability and implement the owner-selected retention-gap resolution;
6. inject domain-separated capability secrets without exposing values;
7. prove all four kill switches are false;
8. run the real production read-only preflight and require `BLOCKER=0`;
9. request a separate D10 production-write approval;
10. create the fresh production recovery point immediately before the first authorized migration/backfill write.

No production provisioning, deployment, provider mutation, backup, migration, backfill, Worker enablement, email, analytics event, or DNS/GSC action occurred in this finalization phase.
