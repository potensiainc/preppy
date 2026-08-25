# PREPPY WP-15B Production Environment Bootstrap

Status: `BLOCKED`
Evidence date: 2026-08-25
Repository baseline: `76c552c5e1704daf0662bcb09909c8de01310de1`

This is the production-environment bootstrap contract for PREPPY. It records what the repository proves, what remains a proposal, and what must be configured or verified before the real production read-only preflight. It does not authorize or execute deployment, backup, migration, backfill, cutover, Worker activity, provider activity, DNS changes, role DDL, or secret rotation.

Status vocabulary:

- `CONFIRMED`: supported by repository or production evidence.
- `PROPOSED`: a recommended owner-decision candidate, not approved.
- `NOT_CONFIGURED`: explicitly absent from the current execution environment.
- `NOT_EXECUTED`: requires an operational action or provider/dashboard check that has not run.
- `UNRESOLVED`: no trustworthy production fact is available.

## Deployment platform

| Field | Status | Evidence |
| --- | --- | --- |
| Production platform | UNRESOLVED | no production deployment configuration is present |
| Production secret injection mechanism | UNRESOLVED | no provider configuration or secret-store evidence |
| Production domain attachment | UNRESOLVED | no provider/domain evidence |
| Production web process definition | UNRESOLVED | no production process configuration |
| Production Worker process definition | UNRESOLVED | no production process configuration |

`docker-compose.yml` defines only a local PostgreSQL development environment. It is not evidence of a production platform, web topology, scheduler, database service, backup capability, or secret store.

The platform must be selected and recorded by the owner. This document does not choose Railway, Vercel, Supabase, Render, Fly.io, a hyperscaler, or self-hosted Docker without evidence.

## Canonical origin

| Requirement | Status | Required proof |
| --- | --- | --- |
| Exact `APP_BASE_URL` | UNRESOLVED | one credential-free production HTTPS origin |
| Canonical host | UNRESOLVED | owner-controlled production hostname |
| HTTPS | UNRESOLVED | platform/domain certificate verification |
| Kakao callback origin | UNRESOLVED | exact origin matches configured callback |
| Admin OIDC callback origin | UNRESOLVED | exact origin matches configured callback |
| Email link origin | UNRESOLVED | generated links use the canonical host |
| GA4 web origin | UNRESOLVED | production stream uses the same host |
| Cache revalidation origin | UNRESOLVED | internal HMAC endpoint resolves to the selected web runtime |
| Resend webhook origin | UNRESOLVED | full webhook URL derives from the selected origin |

Confirmed repository paths include the sitemap at `/sitemap.xml`, the Resend webhook at `/api/webhooks/resend`, and the internal cache endpoint at `/api/internal/cache/revalidate`. Their production URLs remain unresolved until `APP_BASE_URL` is approved.

The localhost value in `.env.example` is development-only and must never be treated as the production origin.

## Web topology

### Initial MVP candidate — PROPOSED — OWNER APPROVAL REQUIRED

```text
active web instances = 1
horizontal autoscaling = OFF
```

Repository evidence:

- OAuth replay registration and consumption use `ProcessLocalOAuthReplayStore`.
- emergency authentication rate limiting uses `ProcessLocalRateLimiter`.
- cache request replay protection uses `BoundedCacheReplayRegistry` in process memory.

Production invariant:

```text
PROCESS-LOCAL CONTROLS ARE ACCEPTABLE FOR THE INITIAL SINGLE-WEB MVP ONLY
```

A second active web instance is forbidden until all of these are implemented and verified:

1. distributed OAuth replay enforcement;
2. distributed rate limiting;
3. distributed cache replay enforcement.

Sticky sessions do not satisfy this gate.

## Worker topology

### Initial MVP candidate — PROPOSED — OWNER APPROVAL REQUIRED

```text
active Worker instances = 1
```

The repository supports PostgreSQL `SKIP LOCKED`, lease ownership, bounded claims, and stale recovery for future multi-Worker operation. Those capabilities do not select a production Worker count or scheduler.

The initial Worker must remain disabled until the separately approved WP-15B enable sequence reaches the Worker gate.

## Scheduler

| Field | Status | Evidence |
| --- | --- | --- |
| Scheduling authority | UNRESOLVED | no platform cron, persistent process, external scheduler, or GitHub Actions scheduler is configured |
| Number of authorities | UNRESOLVED | cannot prove exactly one |
| Worker invocation contract | CONFIRMED | repository exposes a bounded one-shot Worker command path |
| Duplicate scheduling prevention | UNRESOLVED | depends on the selected deployment topology |

Initial requirement: exactly one scheduler or trigger authority. Multiple concurrently active scheduling authorities are a production blocker even if database claims use `SKIP LOCKED`.

## Database

### Topology

| Field | Status |
| --- | --- |
| Production PostgreSQL provider | UNRESOLVED |
| One-primary topology | PROPOSED — OWNER APPROVAL REQUIRED |
| Connection budget | UNRESOLVED |
| `DATABASE_MAX_CONNECTIONS` | NOT_CONFIGURED in the current execution environment |
| TLS/provider connection requirements | UNRESOLVED |

### Capability roles

| Capability | Existing environment boundary | Intended role | Current status |
| --- | --- | --- | --- |
| Production preflight | `PRODUCTION_DATABASE_URL` | dedicated metadata/SELECT-only reader with transaction read-only enforced | NOT_CONFIGURED / NOT PROVEN |
| Migration and cutover | `DATABASE_URL` in the bounded cutover process | additive migration and approved deterministic backfill only | NOT_CONFIGURED / NOT PROVEN |
| Web runtime | `DATABASE_URL` in the web process | normal reads and approved application transactions; no schema migration | NOT_CONFIGURED / NOT PROVEN |
| Worker runtime | `DATABASE_URL` in the Worker process | Outbox claim/lease and approved handler transactions | NOT_CONFIGURED / NOT PROVEN |

`PRODUCTION_DATABASE_URL` is structurally separate from runtime configuration and has no `DATABASE_URL` fallback. Migration, web, and Worker currently share the config name `DATABASE_URL`; distinct credentials can still be injected per process.

Before production preflight or cutover, prove:

- the preflight role cannot write;
- the runtime role cannot migrate schema;
- the migration credential is absent from normal web and Worker processes;
- the Worker credential has only its approved application capabilities.

Temporary MVP exception candidate: web and Worker may share one least-privilege runtime role only after explicit owner approval. The exception must never include the migration role or weaken the dedicated read-only preflight role.

No `CREATE ROLE`, `GRANT`, `REVOKE`, or other production role DDL is executed by this bootstrap phase.

## Backup and PITR

| Capability | Status | Required evidence |
| --- | --- | --- |
| Provider-managed snapshot | UNRESOLVED | selected provider documents and exposes a restorable snapshot |
| Point-in-time recovery | UNRESOLVED | selected provider documents retention and restore workflow |
| Provider backup retention | UNRESOLVED | approved RPO/retention reflected in provider configuration |
| Restore to separate target | UNRESOLVED | non-production or isolated restore target can be created |
| Logical PostgreSQL fallback tooling | CONFIRMED in non-production | WP-16A custom-format backup/restore drill passed |
| Selected production method | UNRESOLVED | owner approves provider method or bounded logical fallback |
| Fresh pre-cutover recovery point | NOT EXECUTED | must be created immediately before a separately authorized production write |

Preferred candidate: provider-managed snapshot/PITR when the selected provider proves it is enabled and restorable.

Fallback candidate: logical PostgreSQL backup using the existing bounded non-shell-interpolated tooling contract. Before selection it requires an approved encrypted storage location, retention, restore target, access owner, and verification procedure.

No production snapshot, `pg_dump`, restore point, or backup API action is performed here.

## RPO, RTO, and retention

| Policy | Candidate | Status |
| --- | --- | --- |
| RPO | `<= 24 hours` | PROPOSED — OWNER APPROVAL REQUIRED |
| RTO | `<= 2 hours` | PROPOSED — OWNER APPROVAL REQUIRED |
| Pre-cutover backup | retain 30 days and until at least two verified post-cutover backups exist | PROPOSED — OWNER APPROVAL REQUIRED |
| Daily backups | retain 14 days | PROPOSED — OWNER APPROVAL REQUIRED |
| Weekly backups | retain 8 weeks | PROPOSED — OWNER APPROVAL REQUIRED |

Non-production drill durations are evidence of tooling only and are not a production SLA.

## Production read-only preflight readiness

```text
PRODUCTION_DATABASE_URL = NOT_CONFIGURED
dedicated read-only role = NOT_PROVEN
actual production preflight = NOT_EXECUTED
production writes = NONE
```

The approved preflight remains the only permitted production interaction in this bootstrap phase. It may run only after:

1. `PRODUCTION_DATABASE_URL` is provided to the bounded preflight process;
2. it identifies a dedicated read-only role;
3. `transaction_read_only=on` and `default_transaction_read_only=on` are proven without a write probe;
4. the existing redacted WP-15A report path is used unchanged.

No production `BLOCKER`, `WARNING`, or `INFO` counts are available because the preflight did not execute. Counts must not be inferred as zero.

## Resend

| Check | Status |
| --- | --- |
| `RESEND_API_KEY` configured in current execution environment | false |
| `RESEND_WEBHOOK_SECRET` configured in current execution environment | false |
| `EMAIL_FROM` configured in current execution environment | false |
| Sending domain verified | NOT_EXECUTED |
| Production webhook route implemented | CONFIRMED — `/api/webhooks/resend` |
| Full production webhook URL | UNRESOLVED — canonical origin missing |
| Production webhook registered | NOT_EXECUTED |
| Live send | NOT_EXECUTED |

Production readiness status: `BLOCKED` until the canonical origin, sender/domain, secrets, and provider-side webhook registration are confirmed. No live call or dashboard mutation is performed here.

## GA4

| Check | Status |
| --- | --- |
| `GA4_MEASUREMENT_ID` configured in current execution environment | false |
| `GA4_API_SECRET` configured in current execution environment | false |
| Production property exists | NOT_EXECUTED |
| Production web stream exists | NOT_EXECUTED |
| Required bounded custom dimensions configured | NOT_EXECUTED |
| Internal traffic exclusion configured | NOT_EXECUTED |
| Live event | NOT_EXECUTED |

Production readiness status: `BLOCKED`. Analytics remains disabled and Noop until Product and Email gates pass and a later authorized verification enables it.

## Google Search Console

| Check | Status |
| --- | --- |
| Canonical production domain | UNRESOLVED |
| DNS/domain verification | NOT_EXECUTED |
| Sitemap path | CONFIRMED — `/sitemap.xml` |
| Full sitemap URL | UNRESOLVED — canonical origin missing |
| Sitemap submission | NOT_EXECUTED |

The manual verification/submission procedure is documented in `docs/14_ANALYTICS_MEASUREMENT.md`. No DNS or GSC mutation is performed here.

## Secret capability matrix

The `Configured` column describes the current execution process. It does not claim anything about an unavailable provider secret store. Values are never recorded.

| Capability | Environment variable(s) | Required process | Configured | Rotation consequence |
| --- | --- | --- | --- | --- |
| DB read-only preflight | `PRODUCTION_DATABASE_URL` | production preflight CLI only | false | replace reader credential and re-prove read-only before preflight |
| DB migration/cutover | `DATABASE_URL` | bounded cutover process only | false | pause cutover and replace only the operator process credential |
| DB web runtime | `DATABASE_URL` | web runtime only | false | restart web with the replacement runtime credential and verify connectivity |
| DB Worker runtime | `DATABASE_URL` | Worker runtime only | false | keep Worker off, replace credential, then verify before restart |
| Consumer session | `USER_SESSION_SECRET` | web/auth runtime | false | invalidate existing consumer sessions |
| Consumer OAuth flow | `OAUTH_STATE_SECRET`, `FOLLOW_INTENT_SECRET` | web/auth runtime | false | invalidate in-flight login/follow intent cookies |
| Kakao client | `KAKAO_CLIENT_ID`, optional `KAKAO_CLIENT_SECRET` | web/auth runtime | false | coordinate provider and runtime configuration before login resumes |
| Admin OIDC client | `ADMIN_AUTH_ISSUER`, `ADMIN_AUTH_CLIENT_ID`, `ADMIN_AUTH_CLIENT_SECRET` | Admin auth runtime | false | coordinate IdP/client rotation; Admin login remains unavailable until complete |
| Admin session | `ADMIN_SESSION_SECRET` | Admin auth runtime | false | invalidate all Admin sessions |
| Admin OIDC flow | `ADMIN_OIDC_FLOW_SECRET` | Admin auth runtime | false | invalidate in-flight Admin login cookies |
| Resend API | `RESEND_API_KEY`, `EMAIL_FROM` | Email Worker | false | keep Email disabled until sender/API configuration is replaced and verified |
| Resend webhook | `RESEND_WEBHOOK_SECRET` | web webhook verifier | false | coordinate provider registration and verifier secret transition |
| GA4 | `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` | web and analytics runtime | false | keep Analytics disabled until both client/server configuration is verified |
| Cache HMAC | `CACHE_REVALIDATION_SECRET` | Worker signer and web verifier | false | keep Cache disabled; rotate both ends together and discard in-flight requests |

Configured capability secrets must remain domain-separated. No one secret may be reused across consumer sessions, OAuth flow, Admin OIDC, Admin sessions, Email, webhooks, analytics, or cache HMAC.

## Initial kill-switch state

Required initial production configuration:

```text
WORKER_ENABLED=false
EMAIL_SEND_ENABLED=false
ANALYTICS_ENABLED=false
CACHE_REVALIDATION_ENABLED=false
```

These values are a required cutover starting state, not evidence that a production environment is currently configured. This phase does not enable any capability.

## Owner decisions

All owner-only decisions remain unchecked in `docs/15B_OWNER_APPROVALS.md`. The repository provides the following candidates but does not approve them:

- one web instance, one Worker instance, exactly one scheduler authority;
- horizontal autoscaling disabled;
- one PostgreSQL primary;
- RPO, RTO, and retention candidates above;
- provider snapshot/PITR preferred, bounded logical fallback if necessary;
- a possible shared web/Worker least-privilege role exception;
- Resend, GA4, and GSC production enablement only after their readiness checks.

## NOT EXECUTED live operations

- production database connection or read-only preflight;
- production snapshot, PITR action, `pg_dump`, or restore;
- database role DDL, migration, or backfill;
- deployment or horizontal scaling;
- Worker claim or enablement;
- live Resend send or webhook registration;
- live GA4 event;
- cache invalidation;
- DNS or GSC mutation;
- secret creation, injection, or rotation.

## Final gate

Final gate: `BLOCKED`

Technical infrastructure remains unresolved: deployment platform, canonical HTTPS origin, scheduler authority, production PostgreSQL provider/topology, backup/PITR method, production DB roles, and the production secret/configuration surface. Provider dashboard readiness and the actual read-only preflight are also not executed.

`READY_FOR_OWNER_APPROVAL` is not appropriate while these production facts remain unknown. `READY_FOR_PRODUCTION_PREFLIGHT` becomes appropriate only after the platform, origin, single-instance topology, scheduler, backup method, DB roles, and required owner policies are explicitly locked and the dedicated read-only credential is available.
