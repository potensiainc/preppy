# PREPPY WP-15B Railway Production Provisioning Result

Evidence date: 2026-08-26

Code baseline: `cfeb4677f76f35e88125d143e6c4563d2a7ac7a2`

## Scope and gate

This record covers bounded production infrastructure provisioning and a fresh-empty environment check only. It does not authorize or record an application migration, backfill, production cutover, customer-data load, final-domain launch, or side-effect enablement.

Final gate: `PRODUCTION_INFRA_READY_FOR_MIGRATION_APPROVAL`.

## Railway boundary

| Item | Result |
| --- | --- |
| Workspace | Potensia Inc project workspace |
| Project | `preppy-production` |
| Project ID | `de1e9ea9-f920-47a4-aedc-095252ee8e49` |
| Environment | `production` |
| Preview separation | PASS — `preppy-ui-preview` was read-only and was not reused or mutated |
| Billing/plan mutation | NONE |

The existing failed PREPPY production attempt was reused after read-only inspection showed one failed PREPPY Web service, no database, no domain, and no conflicting resources. The project and Web service were relabeled without deleting ambiguous resources.

## Resources

| Resource | Safe identifier | State / contract |
| --- | --- | --- |
| PostgreSQL primary | `Postgres` / `781a0b16-5a2c-46ea-9ca4-6c975827971d` | online; PostgreSQL 18.6; private networking; one provider volume |
| Web | `preppy-web` / `26c2ce4f-3214-426f-9bc5-f960b25ab7b7` | one replica; `npm run build`; `npm run start`; `/api/health` |
| Worker | `preppy-worker` / `35bfe5d0-2338-4c5e-85a5-4296710f0c15` | one scheduled run-once target; `npm run worker:once`; restart `NEVER` |
| Cron authority | Worker service | `*/5 * * * *` UTC; no scheduler service |

No Redis, extra cron service, duplicate Web/Worker, public database TCP proxy, or application volume was created.

## Temporary infrastructure origin

- URL: `https://preppy-web-production.up.railway.app`
- Classification: `TEMPORARY_INFRA_ORIGIN`.
- Permitted use: infrastructure smoke, liveness healthcheck, and technical callback/webhook template calculation.
- Final canonical launch origin: `UNRESOLVED`.
- Custom domain purchase, DNS mutation, and final provider registration: `NOT EXECUTED`.

The Web liveness endpoint returned HTTP 200 with the bounded health response. This does not establish Product-route or SEO launch readiness before the application schema exists.

## Build, deploy, and side-effect boundary

| Contract | Result |
| --- | --- |
| DB-less `npm run build` | PASS |
| migration in build/start | NONE |
| backfill in build/start | NONE |
| Web replicas | exactly 1 |
| Web horizontal autoscaling | OFF |
| Worker pattern | scheduled run-once only |
| Worker Cron | every five minutes UTC |
| second scheduler | NONE |

Initial production variables on both application services:

```text
WORKER_ENABLED=false
EMAIL_SEND_ENABLED=false
ANALYTICS_ENABLED=false
CACHE_REVALIDATION_ENABLED=false
```

The first scheduled Worker run exited successfully with `enabled=false`, `claimed=0`, `processed=0`, and `failed=0`. No recovery, claim, lease, handler dispatch, email, analytics, or cache operation occurred.

## Fresh-empty database baseline

| Check | Result |
| --- | --- |
| Database identity | Railway production PostgreSQL `railway` |
| Public application tables | 0 |
| Migration-ledger tables | 0 |
| Application migrations | NONE |
| Application schema DDL | NONE |
| Preview/demo data copied | NO |
| Customer data | NONE |
| Baseline classification | `FRESH_EMPTY_PRODUCTION_BASELINE` |

The full WP-15A application-schema preflight was intentionally not run against a database with no application schema. It remains required after a separately approved migration/backfill phase and before side-effect enablement.

## Database security roles

Security-role DDL only was applied:

| Role | Purpose | Verified boundary |
| --- | --- | --- |
| `preppy_preflight_ro` | production metadata/SELECT preflight | login; no superuser/createdb/createrole/bypass-RLS; database-scoped `default_transaction_read_only=on`; no public-schema CREATE |
| `preppy_migration` | later explicitly approved migration/backfill | login; no superuser/createdb/createrole/bypass-RLS; public-schema CREATE/USAGE only |
| `preppy_runtime` | shared Web/Worker MVP runtime | login; no superuser/createdb/createrole/bypass-RLS; no public-schema CREATE |

Future objects created by `preppy_migration` default-grant SELECT to the preflight role and bounded table/sequence DML to the runtime role. No application object exists yet. Role-specific URLs were stored as service-scoped Railway secrets; no secret, password, token, or DSN is present in this document or Git.

## Backup and PITR

- Owner-approved strategy: Railway provider-native recovery plus a fresh pre-cutover recovery point and portable logical PostgreSQL dump.
- Railway dashboard result: Backups/PITR requires the Pro plan.
- Current status: `OWNER_BILLING_ACTION_REQUIRED`.
- Automatic plan upgrade or purchase: NO.
- Fresh pre-cutover backup: `NOT EXECUTED` by design.
- Retention gap: native capability must be combined with the approved supplemental logical retention plan to meet 30-day pre-cutover, 14-day daily, and 8-week weekly retention.

The next production-write phase must not start until the billing/capability gate or a separately approved bounded fallback is recorded and a fresh recovery point is created immediately before writes.

## Deferred providers and domain work

- Resend API key, webhook secret, `EMAIL_FROM`, sending-domain verification, webhook registration, and live send: `NOT EXECUTED`.
- GA4 Measurement ID/API secret, property/stream work, and live event: `NOT EXECUTED`; Analytics remains false.
- GSC verification, sitemap submission, and DNS: `NOT EXECUTED`.
- Kakao/Admin OIDC provider-console mutation: `NOT EXECUTED`.
- Final callback templates remain:
  - `https://<FINAL_DOMAIN>/auth/kakao/callback`
  - `https://<FINAL_DOMAIN>/admin/auth/callback`
  - `https://<FINAL_DOMAIN>/api/webhooks/resend`
  - `https://<FINAL_DOMAIN>/api/internal/cache/revalidate`

## Explicitly not executed

- production application migration;
- Institution, Opportunity, or Source Binding backfill;
- production cutover;
- Preview seed or fixture load;
- real user/content import;
- Worker, Email, Analytics, or Cache enablement;
- live Resend or GA4 calls;
- final-domain purchase, DNS, GSC, or provider-console changes;
- fresh pre-cutover backup.

## Remaining gates before migration approval

1. Resolve the Pro-plan Backups/PITR billing action or approve and record the runbook's bounded logical fallback.
2. Preserve the final custom domain as unresolved; it does not block schema migration but blocks canonical/provider launch readiness.
3. Grant a separate, explicit D10 production migration/backfill/cutover authorization.
4. Immediately before the first authorized production write, create and record the fresh recovery point required by the runbook.
