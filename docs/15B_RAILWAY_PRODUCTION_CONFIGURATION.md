# PREPPY WP-15B Railway Production Configuration

Status: `READY_FOR_OWNER_APPROVAL — NOT PROVISIONED`
Evidence date: 2026-08-25
Repository baseline: `a54aa7983ac1b2d01899c6b03fb2eaf37e017484`

Railway is the recommended initial production platform candidate. It is not owner-approved by this document. This phase prepares repository configuration and operator steps only; it does not create a Railway project, service, database, domain, backup, variable, deployment, or provider integration.

## Configuration format decision

Railway's legacy per-service `railway.toml` / `railway.json` Config as Code is deprecated, new services cannot opt in, and the hard cutoff is 2026-12-01. PREPPY therefore uses the current project-level TypeScript IaC entrypoint:

```text
.railway/railway.ts
```

The current Railway IaC reference documents services, build/start commands, healthchecks, replicas, variables, databases, and domains. It does not document a cron-schedule or restart-policy field. PREPPY does not invent those keys. The provisioning operator must stage the cron and restart settings explicitly in Railway and review them before any deployment.

Official references:

- [Railway Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
- [Railway IaC reference](https://docs.railway.com/infrastructure-as-code/reference)
- [Railway Cron Jobs](https://docs.railway.com/cron-jobs)
- [Railpack Node.js](https://railpack.com/languages/node)
- [Railway Postgres backup and restore](https://docs.railway.com/guides/postgres-backups-restores)

The locally installed Railway CLI is version `4.11.0` and does not expose `railway config`. No `plan` or `apply` was attempted. Before provisioning, the owner-approved operator must install or upgrade to a Railway CLI version that supports `railway config plan`, then run the plan without `--show-values`. `railway config apply` remains a separately authorized mutation.

## Project and service architecture

Target project: `PREPPY Production` — PROPOSED — OWNER APPROVAL REQUIRED.

| Resource | Railway type | Count | Public domain | Execution model | Current status |
| --- | --- | ---: | --- | --- | --- |
| `web` | persistent service | 1 | required later | `npm run start` | defined in IaC; not provisioned |
| `worker` | scheduled service / cron job | 1 | none | `npm run worker:once` | defined in IaC; cron not provisioned |
| separate scheduler service | none | 0 | none | Railway is the sole scheduler authority for `worker` | intentionally absent |
| `postgres` | Railway PostgreSQL | 1 primary | none | managed PostgreSQL | declared intent; not provisioned |

The scheduled `worker` service is both the Worker execution service and the single cron scheduling target. There is no always-on Outbox Worker and no third scheduler service. This avoids two authorities processing the same Outbox responsibility.

Horizontal scale target:

```text
web replicas = 1
worker scheduled execution target = 1
web horizontal autoscaling = OFF
worker horizontal autoscaling = OFF
```

No second web replica is permitted until distributed OAuth replay, distributed rate limiting, and distributed cache replay are implemented and verified. Sticky sessions are not an alternative.

## Scheduler pattern

Selected pattern: `PATTERN_B — SCHEDULED_RUN_ONCE`.

Repository evidence:

- `scripts/worker.ts` requires `--once`.
- `runWorkerOnce` performs one bounded stale-recovery, claim, and dispatch pass.
- the command closes the runtime database in `finally`.
- the Railway command has a 240-second hard process timeout.
- `WORKER_ENABLED=false` returns before opening the runtime database or claiming an Outbox row.

Proposed cron schedule: `*/5 * * * *` UTC — OWNER APPROVAL REQUIRED. Railway's documented minimum frequency is five minutes. The 240-second application hard timeout leaves a one-minute bound before the next proposed trigger. If a run remains active, Railway skips the overlapping cron invocation; operators must alert on the failed/stuck execution and Outbox lag.

The provisioning operator must set on the existing `worker` service:

```text
Cron schedule = */5 * * * *
Start command = npm run worker:once
Restart policy = NEVER (scheduled execution; no hidden second retry authority)
Public networking = NONE
```

The schedule is not encoded in `.railway/railway.ts` because the current documented IaC DSL does not expose it. It must be captured as a staged Railway change and verified in the plan/dashboard before deployment.

## Commands

| Stage | Command | Contract |
| --- | --- | --- |
| dependency install | `npm ci` | requested through `RAILPACK_NODE_NPM_INSTALL`; lockfile deterministic |
| web build | `npm run build` | no migration, backfill, provider call, or DB write |
| Worker build | `npm run build` | same tested source/image contract |
| web start | `npm run start` | production Next.js server; Railway-provided `PORT`, host `0.0.0.0` |
| scheduled Worker | `npm run worker:once` | one bounded pass; hard timeout exit code `124` |
| production migration | no build/start command | separate later WP-15B operator action only |
| production backfill | no build/start command | separate later WP-15B operator action only |

`next start` reads the `PORT` environment variable and binds to `0.0.0.0` in the installed Next.js 16.3.0 runtime. Railway injects `PORT`. No development server is used.

There is no `preDeployCommand`. No migration or backfill is run during install, build, deploy, web startup, Worker startup, or cron configuration.

## Build-time database boundary

### Remediation evidence

The first WP-15B completion report claimed a DB-less build PASS before the real Railway failure was evaluated. That claim is invalidated. The observed Railway build executed the database-backed sitemap during prerender and failed with `DATABASE_URL` undefined.

The failure was reproduced locally with `DATABASE_URL`, `TEST_DATABASE_URL`, and `PRODUCTION_DATABASE_URL` all absent:

```text
next build
→ prerender /sitemap.xml
→ getRuntimeDatabaseEnv()
→ ZodError: DATABASE_URL undefined
```

`app/sitemap.ts` is now explicitly `force-dynamic`, which Next.js 16.3 documents as the supported request-time rendering configuration for this otherwise cached special Route Handler. The sitemap still queries current public canonical data when `/sitemap.xml` is requested; correctness is not replaced with a static, root-only, fake, or empty sitemap.

The regression gate executes a child-process `npm run build` after deleting all runtime, test, and production database URL variables. A source/export assertion is retained only as a secondary contract and is not accepted as build proof.

Required deployment behavior:

```text
Build phase:
  DATABASE_URL = not required
  TEST_DATABASE_URL = not required
  PRODUCTION_DATABASE_URL = not required
  PostgreSQL connection = none
  migration = none
  backfill = none

Runtime web phase:
  DATABASE_URL = required
  migrated database = required
  GET /sitemap.xml = dynamic DB-backed canonical sitemap
```

The runtime integration fixture proves INDEX-only Institutions, Opportunities, and Articles; Article sanitized meaningful-body evaluation; `robots_index=false` exclusion; and redirect-source exclusion against a migrated dedicated non-production database.

## Production origin and domain

The exact origin is unresolved and owner-provided:

```text
APP_BASE_URL=https://<OWNER_APPROVED_PREPPY_DOMAIN>
```

The placeholder is documentation only. It is not present as a domain in the IaC service definition and cannot be treated as confirmed. Provisioning remains blocked until a real owner-controlled HTTPS host is recorded.

Required alignment:

| Purpose | Path | Full URL template |
| --- | --- | --- |
| Kakao OAuth callback | `/auth/kakao/callback` | `https://<OWNER_APPROVED_PREPPY_DOMAIN>/auth/kakao/callback` |
| Admin OIDC callback | `/admin/auth/callback` | `https://<OWNER_APPROVED_PREPPY_DOMAIN>/admin/auth/callback` |
| Resend webhook | `/api/webhooks/resend` | `https://<OWNER_APPROVED_PREPPY_DOMAIN>/api/webhooks/resend` |
| cache revalidation | `/api/internal/cache/revalidate` | `https://<OWNER_APPROVED_PREPPY_DOMAIN>/api/internal/cache/revalidate` |
| sitemap | `/sitemap.xml` | `https://<OWNER_APPROVED_PREPPY_DOMAIN>/sitemap.xml` |
| liveness | `/api/health` | `https://<OWNER_APPROVED_PREPPY_DOMAIN>/api/health` |

No domain, DNS record, certificate, provider callback, or webhook registration is created in this phase.

## Web service configuration

The IaC file defines one replica, `npm run build`, `npm run start`, `/api/health`, and a 120-second deployment healthcheck timeout. `/api/health` remains liveness-only.

The IaC file intentionally omits a GitHub source and domains. During later provisioning:

1. connect repository `potensiainc/preppy` and branch `main` only after owner approval;
2. keep production GitHub autodeploy disabled;
3. require explicit manual promotion/deploy;
4. attach only the approved custom HTTPS domain;
5. set restart policy `ON_FAILURE` in Railway;
6. keep replica count exactly one.

## Worker service configuration

The Worker is a private scheduled service with no public health endpoint or domain. Operational evidence comes from Railway execution logs/status and PREPPY Admin Operations: Outbox lag, `FAILED`, `DEAD_LETTER`, stale leases, `RESULT_UNKNOWN`, Monitoring overdue, cache failures, and provider-event failures.

The Worker command is fixed:

```text
tsx --tsconfig scripts/worker-tsconfig.json scripts/worker.ts \
  --once \
  --provider=resend \
  --worker-id=railway-worker \
  --batch=10 \
  --lease-ms=300000 \
  --timeout-ms=240000
```

Fake sender mode remains forbidden when `NODE_ENV=production`.

## PostgreSQL and recovery

Target: one Railway PostgreSQL primary. No database is provisioned here.

Primary recovery candidate:

- enable and prove Railway PITR before production writes;
- confirm the first base backup completed and the available restore window is healthy;
- take a fresh provider recovery point immediately before the first authorized WP-15B write;
- record only safe provider identifier and timestamp;
- restore to a new sibling service and verify it without modifying the source.

Secondary recovery candidate: the existing bounded logical `pg_dump` / `pg_restore` procedure, stored in an owner-approved encrypted location and restored to a separate target.

Railway currently documents roughly four weeks of PITR history. Its native scheduled volume-backup retention is daily for six days, weekly for one month, and monthly for three months. That does not exactly satisfy PREPPY's proposed daily 14-day and weekly 8-week policy. The gap requires owner-approved supplemental logical/offsite retention or a revised policy; it must not be marked satisfied by PITR alone.

Current policy remains unapproved:

| Policy | Candidate | Railway mapping | Status |
| --- | --- | --- | --- |
| RPO | `<= 24h` | PITR should exceed the candidate after healthy archiving is proven | PROPOSED |
| RTO | `<= 2h` | must be measured with a Railway sibling restore drill | PROPOSED |
| pre-cutover | 30 days and until two verified post-cutover backups | PITR window is approximate; supplemental preservation may be required | GAP / OWNER DECISION |
| daily | 14 days | native daily retention is shorter | GAP / OWNER DECISION |
| weekly | 8 weeks | native weekly retention is shorter | GAP / OWNER DECISION |

PITR enablement, a fresh backup, and any restore remain NOT EXECUTED.

## Database role model

Logical roles:

| Capability | Provider secret source | Process environment | Minimum privilege |
| --- | --- | --- | --- |
| read-only preflight | `PREPPY_PREFLIGHT_DATABASE_URL` | `PRODUCTION_DATABASE_URL` in bounded CLI only | connect, schema usage, metadata and SELECT; transaction read-only forced |
| migration/cutover | `PREPPY_MIGRATION_DATABASE_URL` | `DATABASE_URL` in bounded operator process only | additive DDL and approved backfill DML |
| web runtime | `PREPPY_WEB_DATABASE_URL` | `DATABASE_URL` in `web` only | Product read/write DML; no schema DDL |
| Worker runtime | `PREPPY_WORKER_DATABASE_URL` | `DATABASE_URL` in `worker` only | canonical reads plus Outbox/Notification/Delivery/Attempt DML; no schema DDL |

`PREPPY_*` names above are Railway shared-variable capability labels. The application still receives its existing `DATABASE_URL` / `PRODUCTION_DATABASE_URL` names.

Preferred logical PostgreSQL role names are `preppy_preflight_ro`, `preppy_migration`, `preppy_runtime`, and `preppy_worker`. No `CREATE ROLE`, `GRANT`, `REVOKE`, or default-privilege statement is executed here.

Provisioning must prove:

- `preppy_preflight_ro`: `CONNECT`, schema `USAGE`, required `SELECT`, and `default_transaction_read_only=on`; no write/DDL;
- `preppy_migration`: used only in the bounded cutover shell; absent from web/Worker;
- `preppy_runtime`: required application DML only; no schema creation/migration privilege;
- `preppy_worker`: Outbox claim/lease and handler DML plus canonical reads; no schema DDL.

Temporary exception candidate: web and Worker may map to the same least-privilege application role only with explicit owner approval. Read-only preflight and migration credentials must remain separate in every case.

## Railway variable matrix

Tracked files contain no values. Railway shared/reference variables should supply capability values; literal duplication across services is forbidden.

### Web

| Capability | Application variable | Source class |
| --- | --- | --- |
| runtime DB | `DATABASE_URL`, `DATABASE_MAX_CONNECTIONS` | web DB role reference |
| canonical origin | `APP_BASE_URL`, `KAKAO_REDIRECT_URI` | approved origin/callback references |
| consumer auth | `KAKAO_CLIENT_ID`, optional client secret, user/OAuth/follow secrets | web-only or shared auth references |
| Admin auth | issuer, client ID/secret, Admin session, OIDC flow | web-only Admin references |
| Resend webhook | `RESEND_WEBHOOK_SECRET` | webhook-verifier reference only |
| GA4 | measurement ID and server API secret | analytics references; disabled initially |
| cache verifier | `CACHE_REVALIDATION_SECRET` | shared signer/verifier reference |

### Worker / cron target

| Capability | Application variable | Source class |
| --- | --- | --- |
| Worker DB | `DATABASE_URL`, `DATABASE_MAX_CONNECTIONS` | Worker DB role reference |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` | Worker-only send capability |
| Analytics | measurement ID and server API secret | Worker analytics reference; disabled initially |
| cache signer | `CACHE_REVALIDATION_SECRET`, `APP_BASE_URL` | shared signer/verifier and canonical origin |

There is no separate cron service and therefore no third copy of Worker secrets.

## Kill-switch defaults

Both configured application services start with:

```text
WORKER_ENABLED=false
EMAIL_SEND_ENABLED=false
ANALYTICS_ENABLED=false
CACHE_REVALIDATION_ENABLED=false
```

No build/start command changes these values. A Railway deploy cannot automatically enable a capability.

## Observability mapping

| Layer | Use |
| --- | --- |
| Railway deployment status | build/start/healthcheck and cron execution result |
| Railway service logs | correlation-safe process/error codes; no secrets or PII |
| Railway metrics | web/Worker/PostgreSQL resource and availability trends |
| PREPPY Admin Operations | DB/migration, Outbox lag/state, stale leases, `RESULT_UNKNOWN`, Monitoring, provider and cache failures |

Railway's `/api/health` check is a deploy-time liveness check, not continuous deep readiness. No Admin metric or table count is exposed publicly.

## Provider bootstrap plans

### Resend

1. approve and attach the production domain;
2. verify the sending domain and set `EMAIL_FROM`;
3. inject API and webhook secrets through Railway references;
4. register the exact HTTPS webhook URL;
5. keep `EMAIL_SEND_ENABLED=false`;
6. perform one live smoke only during a separately approved cutover.

### GA4

1. approve the exact canonical host;
2. confirm property and web stream;
3. inject measurement ID and server API secret;
4. configure approved event-scoped dimensions and internal-traffic exclusion;
5. keep `ANALYTICS_ENABLED=false` until Product/Email smoke passes.

### Google Search Console

1. approve the canonical domain;
2. complete DNS/domain verification;
3. verify `https://<OWNER_APPROVED_PREPPY_DOMAIN>/sitemap.xml`;
4. submit the sitemap.

No provider or DNS action is executed here.

## Provisioning order — DOCUMENTED ONLY

1. Obtain owner approvals in `docs/15B_OWNER_APPROVALS.md`.
2. Upgrade the Railway CLI to an IaC-capable version under separate authorization.
3. Create/select an isolated Railway production environment and keep staging separate.
4. Stage shared variables and domain-separated secrets without printing values.
5. Run `railway config plan` and review for exactly `web`, `worker`, and `postgres`; no unexpected deletion.
6. Apply IaC only under separate provisioning approval.
7. Keep source disconnected or GitHub autodeploy disabled.
8. Stage the `worker` cron schedule and restart policies; verify one authority.
9. Provision and prove database roles.
10. Enable and prove PITR/backup capability and resolve retention gaps.
11. Attach the owner-approved custom HTTPS domain and align callbacks.
12. Run a static/build verification with every kill switch false.
13. Run the actual production read-only preflight with the dedicated role.
14. Request a separate production-write approval for WP-15B.

## Explicitly NOT EXECUTED

- `railway login`, `railway init`, `railway config plan`, `railway config apply`, `railway up`, or deploy;
- project/service/PostgreSQL/domain/variable creation;
- GitHub source or autodeploy connection;
- cron or restart-policy mutation;
- PITR, snapshot, backup, or restore;
- DNS, Resend, GA4, or GSC action;
- production preflight, migration, backfill, Worker claim, or cache call.

## Final gate

Final gate: `READY_FOR_OWNER_APPROVAL`

Static Railway configuration and operator sequencing are complete. Railway, topology, scheduler cadence, production origin, RPO/RTO/retention, recovery-gap handling, role model/exception, and provider readiness remain owner decisions. Provisioning and all production interactions require separate authorization.
