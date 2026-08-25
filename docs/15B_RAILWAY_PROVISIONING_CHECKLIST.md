# PREPPY WP-15B Railway Provisioning Checklist

Evidence date: 2026-08-25

Allowed statuses: `OWNER APPROVAL REQUIRED`, `NOT EXECUTED`, `CONFIRMED`, `BLOCKED`.

No checkbox in this document authorizes a production migration, backfill, cutover, provider call, or deploy. Record a non-secret evidence reference, date, and owner for every future transition.

## Owner decisions

| Gate | Status |
| --- | --- |
| Railway selected as production platform | OWNER APPROVAL REQUIRED |
| Project name `PREPPY Production` | OWNER APPROVAL REQUIRED |
| exactly one web replica | OWNER APPROVAL REQUIRED |
| scheduled run-once Worker pattern | OWNER APPROVAL REQUIRED |
| proposed `*/5 * * * *` UTC cadence | OWNER APPROVAL REQUIRED |
| horizontal autoscaling OFF | OWNER APPROVAL REQUIRED |
| one PostgreSQL primary | OWNER APPROVAL REQUIRED |
| exact production HTTPS domain/origin | OWNER APPROVAL REQUIRED |
| RPO `<=24h` | OWNER APPROVAL REQUIRED |
| RTO `<=2h` | OWNER APPROVAL REQUIRED |
| retention and Railway native-retention gap plan | OWNER APPROVAL REQUIRED |
| database role model or bounded runtime/Worker exception | OWNER APPROVAL REQUIRED |

## Repository configuration

| Check | Status | Evidence |
| --- | --- | --- |
| current IaC entrypoint `.railway/railway.ts` | CONFIRMED | project-level current Railway format |
| legacy `railway.toml/json` absent | CONFIRMED | deprecated format intentionally unused |
| resources are one `web`, one `worker`, one `postgres` | CONFIRMED | focused contract test |
| separate scheduler service absent | CONFIRMED | Worker service is the sole cron target |
| service source omitted | CONFIRMED | no repository connection or autodeploy from IaC |
| domain omitted | CONFIRMED | owner-approved host still unresolved |
| web replicas exactly one | CONFIRMED | IaC contract test |
| Worker replicas/execution target exactly one | CONFIRMED | IaC contract test |
| install uses `npm ci` | CONFIRMED | Railpack install override |
| web build/start are `npm run build` / `npm run start` | CONFIRMED | IaC contract test |
| Worker start is `npm run worker:once` | CONFIRMED | IaC/package contract test |
| migration/backfill absent from build/start | CONFIRMED | focused contract test |
| original Railway DB-less build failure reproduced | CONFIRMED | `/sitemap.xml` prerender failed with `DATABASE_URL` undefined |
| previous DB-less PASS claim invalidated | CONFIRMED | remediation record in Railway configuration document |
| DB-less regression invokes real `npm run build` | CONFIRMED | test deletes runtime/test/production DB URLs; not a source-string-only test |
| build-time sitemap DB dependency removed | CONFIRMED | request-time dynamic sitemap plus DB-less build verification |
| build phase opens no PostgreSQL connection | CONFIRMED | build passes with all DB URLs absent; no fallback/dummy URL |
| runtime sitemap uses migrated DB truth | CONFIRMED | route function integration against dedicated `_test` PostgreSQL |
| runtime INDEX/NOINDEX/redirect filtering preserved | CONFIRMED | Institution, Opportunity, Article, robots and redirect cases |
| runtime web requires migrated `DATABASE_URL` | CONFIRMED | no empty sitemap or missing-DB fallback |
| local Railway CLI supports IaC `config` command | BLOCKED | installed CLI 4.11.0 lacks the command; upgrade later |
| `railway config plan` reviewed | NOT EXECUTED | requires linked owner-approved project/environment |

## Railway project and environment

| Check | Status |
| --- | --- |
| owner-approved Railway workspace/project selected | NOT EXECUTED |
| production environment exists | NOT EXECUTED |
| isolated staging/non-production environment exists | NOT EXECUTED |
| production source branch set to `main` | NOT EXECUTED |
| production GitHub autodeploy disabled | NOT EXECUTED |
| manual promotion/deploy control confirmed | NOT EXECUTED |
| no feature branch is the permanent production source | NOT EXECUTED |

## Web

| Check | Status |
| --- | --- |
| exactly one active replica | NOT EXECUTED |
| horizontal replicas/autoscaling disabled | NOT EXECUTED |
| public networking attached only to approved domain | NOT EXECUTED |
| HTTPS certificate valid | NOT EXECUTED |
| `/api/health` returns 200 and remains liveness-only | NOT EXECUTED |
| healthcheck timeout 120 seconds | NOT EXECUTED |
| restart policy `ON_FAILURE` | NOT EXECUTED |

## Scheduled Worker

| Check | Status |
| --- | --- |
| same `worker` service is the only cron target | NOT EXECUTED |
| no always-on Outbox Worker exists | NOT EXECUTED |
| no second scheduler/GitHub Action/external trigger exists | NOT EXECUTED |
| cron schedule approved and configured | NOT EXECUTED |
| command exits after one bounded pass | CONFIRMED in code/tests |
| hard timeout is 240 seconds and exits `124` | CONFIRMED in code/tests |
| runtime DB closes after normal completion | CONFIRMED in code |
| Worker public domain absent | NOT EXECUTED |
| scheduled-job restart policy `NEVER` | NOT EXECUTED |

## PostgreSQL, PITR, and backup

| Check | Status |
| --- | --- |
| one Railway PostgreSQL primary provisioned | NOT EXECUTED |
| connection budget and both max-connection values approved | OWNER APPROVAL REQUIRED |
| PITR enabled | NOT EXECUTED |
| first PITR base backup complete and archiver healthy | NOT EXECUTED |
| sibling restore workflow confirmed | NOT EXECUTED |
| fresh pre-cutover recovery point method approved | OWNER APPROVAL REQUIRED |
| fresh pre-cutover recovery point created | NOT EXECUTED — later cutover only |
| logical fallback storage/encryption/owner approved | OWNER APPROVAL REQUIRED |
| daily 14-day retention gap resolved | BLOCKED |
| weekly 8-week retention gap resolved | BLOCKED |
| pre-cutover preservation gap resolved | BLOCKED |

## Database roles

| Check | Status |
| --- | --- |
| dedicated `preppy_preflight_ro` provisioned | NOT EXECUTED |
| preflight role cannot write | NOT EXECUTED |
| `default_transaction_read_only=on` proven | NOT EXECUTED |
| migration role provisioned and operator-only | NOT EXECUTED |
| web runtime role cannot migrate schema | NOT EXECUTED |
| Worker role has bounded DML and no schema DDL | NOT EXECUTED |
| runtime/Worker shared-role exception, if used | OWNER APPROVAL REQUIRED |
| role DDL executed in this phase | CONFIRMED — NO |

## Origin and callbacks

| Check | Status |
| --- | --- |
| exact `APP_BASE_URL` recorded | OWNER APPROVAL REQUIRED |
| canonical host is HTTPS | NOT EXECUTED |
| Kakao callback matches `/auth/kakao/callback` | NOT EXECUTED |
| Admin callback matches `/admin/auth/callback` | NOT EXECUTED |
| cache URL matches `/api/internal/cache/revalidate` | NOT EXECUTED |
| Resend webhook matches `/api/webhooks/resend` | NOT EXECUTED |
| sitemap matches `/sitemap.xml` | NOT EXECUTED |
| placeholder treated as a real domain | CONFIRMED — NO |

## Variables and kill switches

| Check | Status |
| --- | --- |
| no secret literal exists in tracked Railway/config docs | CONFIRMED |
| shared/reference variables used instead of duplicated literals | CONFIRMED in IaC intent |
| web and Worker DB capability references are distinct | CONFIRMED in IaC intent |
| capability-domain secrets are distinct | NOT EXECUTED |
| `WORKER_ENABLED=false` | CONFIRMED in IaC intent / provider NOT EXECUTED |
| `EMAIL_SEND_ENABLED=false` | CONFIRMED in IaC intent / provider NOT EXECUTED |
| `ANALYTICS_ENABLED=false` | CONFIRMED in IaC intent / provider NOT EXECUTED |
| `CACHE_REVALIDATION_ENABLED=false` | CONFIRMED in IaC intent / provider NOT EXECUTED |
| deploy/start changes a kill switch | CONFIRMED — NO |

## Provider readiness

| Check | Status |
| --- | --- |
| Resend sending domain verified | NOT EXECUTED |
| `EMAIL_FROM` approved | OWNER APPROVAL REQUIRED |
| Resend API/webhook secrets injected | NOT EXECUTED |
| Resend webhook registered | NOT EXECUTED |
| GA4 property/stream confirmed for exact host | NOT EXECUTED |
| GA4 measurement/API configuration injected | NOT EXECUTED |
| GA4 dimensions/internal traffic configured | NOT EXECUTED |
| GSC domain verified | NOT EXECUTED |
| sitemap submitted | NOT EXECUTED |

## Production gates

| Check | Status |
| --- | --- |
| actual production read-only WP-15A preflight | NOT EXECUTED |
| production preflight dedicated role proven | NOT EXECUTED |
| production preflight `BLOCKER=0` | NOT EXECUTED |
| production backup | NOT EXECUTED |
| production migration/backfill | NOT EXECUTED |
| production Worker/Email/Analytics/Cache enablement | NOT EXECUTED |
| explicit WP-15B production-write authorization | OWNER APPROVAL REQUIRED |

## Current result

Repository configuration: `CONFIRMED`

Railway provisioning: `NOT EXECUTED`

Owner decisions: `OWNER APPROVAL REQUIRED`

Final gate: `READY_FOR_OWNER_APPROVAL`
