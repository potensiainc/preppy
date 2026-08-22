# PREPPY Admin / Operations Architecture Repository Validation

## 0. Purpose, Scope, and Evidence

이 문서는 `docs/09_ADMIN_OPERATIONS_ARCHITECTURE.md`를 다시 설계하지 않는다. 09의 command-oriented Admin, monitoring queue, verification, notification/outbox operations, support, audit, health, backup/restore와 runbook을 현재 PREPPY repository와 대조한다.

사용자가 제공한 `C:/Users/USER/Downloads/09_ADMIN_OPERATIONS_ARCHITECTURE.md`와 repository의 `docs/09_ADMIN_OPERATIONS_ARCHITECTURE.md`는 SHA-256 `39758E2F...B788EB2`로 동일하다. 기존 `docs/09_ADMIN_OPERATIONS.md`는 legacy AdmissionRadar 운영 문서이며 runtime 구현이 아니다. Canonical cutover 이후에는 09 Architecture가 신규 write contract를 우선한다.

Evidence:

- runtime/config: `package.json`, `next.config.ts`, `.env.example`, `src/config/env.ts`
- routes: `app/api/health/route.ts`와 app tree
- database: `src/db/schema/index.ts`, migrations, 04/04A target model, 05/05A Outbox/monitoring contract
- tests/scripts: current Vitest/PostgreSQL tests, migration/connection scripts, `docker-compose.yml`
- predecessor validation: 02A~08A

분류는 `DOCUMENTED`, `IMPLEMENTED`, `TESTED`, `NOT_IMPLEMENTED`, `NOT_FOUND`, `NOT_VERIFIABLE`을 사용한다. Architecture 자체 변경이 필요할 때만 `CONFLICT`다.

## 1. Executive Verdict

**Architecture: VALID_WITH_IMPLEMENTATION_ADJUSTMENTS**

09의 구조는 현재 repository와 target architecture 위에 구현 가능하다. `admin_users`, admin auth env validation, `audit_logs`, Source/Observation/Version/Evidence/Outbox skeleton과 PostgreSQL invariant tests는 유효한 기반이다. 하지만 실제 Admin route, auth/session, application command/query service, article sanitizer, canonical User/Follow/Notification runtime, worker, backup/restore와 observability는 없다.

Architecture blocker와 required amendment는 없다. 10 PRD 작성은 가능하다. 다만 production launch는 다음이 검증될 때까지 차단되어야 한다.

- authenticated Admin runtime과 mutation guard
- backup retention + 실제 restore procedure/drill
- Outbox hardening + worker execution/health
- structured logging/error monitoring/external uptime
- non-production side-effect isolation과 kill-switch runbook

## 2. Current Admin Runtime Inventory

| Area | Repository Evidence | Classification | Result |
|---|---|---:|---|
| `admin_users` | UUID PK, external subject unique, email/display name, ACTIVE/DISABLED | IMPLEMENTED + schema TESTED indirectly | canonical Admin actor root로 재사용 가능 |
| Admin auth env | issuer/client ID/client secret Zod validation | IMPLEMENTED + TESTED | config only; provider/session runtime 없음 |
| Admin auth dependency | auth/OIDC package 없음 | NOT_FOUND | adapter/library 구현 필요 |
| Admin route/pages | app route는 `/api/health`만 존재 | NOT_FOUND | `/admin/*` 전체 신규 |
| Admin session/cookie/guard | 없음 | NOT_FOUND | secure separate Admin session 필요 |
| Admin application services | `src`에는 config/DB/migrate만 존재 | NOT_FOUND | canonical commands/query services 신규 |
| `audit_logs` | actor FK, action/entity, UUID entity, JSONB before/after, timestamp | IMPLEMENTED | safe typed metadata 규칙으로 재사용 |
| Source/binding/config | Source URL unique, School/Cycle binding, one monitor config/source | IMPLEMENTED + TESTED | canonical binding target migration 필요 |
| Observation/Snapshot | outcomes/timestamps/error/snapshot/hash/index | IMPLEMENTED + TESTED | No Change/health projection 가능 |
| Event/Fact Versions | one-current partial unique, lineage trigger, evidence FK/unique | IMPLEMENTED + TESTED | legacy verification precedent |
| Target Institution/Opportunity/Fact | 04/04A only | DOCUMENTED / NOT_IMPLEMENTED | canonical Admin command 전제 |
| Current Outbox | basic status/available/attempt/index | IMPLEMENTED + partially TESTED | dedupe/lease/dead-letter/worker 미구현 |
| Alert/Delivery | legacy Cycle/Subscription graph | IMPLEMENTED + TESTED | canonical Notification Admin으로 재사용 금지 |
| Health endpoint | static `{status:'ok',service:'admissionradar'}` | IMPLEMENTED + TESTED | liveness only; DB/worker/provider health 아님 |
| Article/CMS | legacy Guides/Updates schema; target Article only documented | NOT_IMPLEMENTED | editor/sanitizer/preview/renderer 없음 |
| Migration tooling | Drizzle generate/migrate, DB connection check | IMPLEMENTED | preflight/backup/post-verify orchestration 없음 |
| Test DB safety | dedicated test DB name validation + Docker test DB | IMPLEMENTED + TESTED | non-prod DB separation 기반 |
| Backup/restore | local Docker named volume만 존재 | NOT_FOUND / NOT_VERIFIABLE | volume은 backup이 아님; launch gate |
| Deployment/worker | web platform/CI/worker process config 없음 | NOT_FOUND | external production topology unknown |
| Observability | logger/Sentry/metrics/uptime config 없음 | NOT_FOUND | launch implementation gap |

## 3. Admin Authentication and Route Feasibility

### 3.1 Authentication

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

`admin_users.external_auth_subject` unique와 `ADMIN_AUTH_ISSUER/CLIENT_ID/CLIENT_SECRET`는 external Admin identity를 resolve할 수 있는 schema/config 기반이다. 그러나 callback/login/logout/session runtime은 **NOT IMPLEMENTED**다.

MVP는 single authenticated role로 충분하다. 모든 protected request/mutation은 Admin session을 검증한 뒤 current `admin_users.status='ACTIVE'`를 확인한다. Public User와 다음을 분리한다.

- callback/route namespace
- cookie name, signing/encryption purpose/key/audience
- session lifetime/logout
- identity table and status check

복잡한 RBAC는 필요 없다. External provider MFA/TLS는 **NOT_VERIFIABLE**이며 launch security review 대상이다.

### 3.2 Routes

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

현재 `/admin` namespace 충돌은 없다. Next.js 16 App Router에서 protected Admin layout + dynamic/no-store Server Components + noindex metadata/header로 구현 가능하다. 모든 mutation handler에도 별도 guard를 적용하며 layout redirect만 권한 control로 신뢰하지 않는다.

현재 유일한 convention이 Route Handler(`/api/health`)이므로 typed status/error/correlation을 요구하는 Admin mutation은 `/api/admin/*` Route Handler가 가장 자연스럽다. Server Actions도 가능하지만 repository precedent가 없다. 어떤 transport를 선택해도 application command만 호출하고 route 내부 직접 SQL을 금지한다.

## 4. Admin Mutation Boundary

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT / current layer NOT_FOUND**

현재 service/application layer는 없다. 이는 architecture conflict가 아니라 implementation gap이다. 권장 logical modules:

```text
src/modules/admin/auth
src/modules/institutions/application
src/modules/opportunities/application
src/modules/monitoring/application
src/modules/articles/application
src/modules/notifications/application
src/modules/users/application
src/modules/operations/application
```

Route/UI → Zod input → Admin actor/correlation context → application command → repository/transaction 순서로 둔다. Query service는 read projection만 제공하고 CQRS framework는 도입하지 않는다.

## 5. Audit Log Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Current `audit_logs`:

```text
id bigint PK
admin_user_id UUID nullable FK
action_type text
entity_type text
entity_id UUID nullable
before_data JSONB nullable
after_data JSONB nullable
created_at TIMESTAMPTZ
index(entity_type, entity_id, created_at)
```

기존 table을 canonical Admin audit로 재사용한다. 새 audit table은 필요 없다.

- Critical Admin command는 active actor를 필수로 만들어 nullable FK를 application에서 허용하지 않는다. Nullable은 future system actor와 legacy row를 위해 유지 가능하다.
- `action_type/entity_type/entity_id/created_at`가 who/what/when의 핵심을 제공한다.
- `reason`, `correlation_id`, expected/actual version, Observation bigint ID는 typed PII-safe JSONB metadata에 저장할 수 있다. Observation ID는 `entity_id` UUID에 넣지 않고 Source UUID를 target으로 하며 metadata에 둔다.
- 전체 Article HTML, raw email, provider subject/token/payload는 저장하지 않는다.
- Versioned truth의 before/after 전체 snapshot을 audit에 중복하지 않고 command summary만 둔다.

Correlation lookup 빈도가 실제 문제가 되면 additive column/index를 검토할 수 있지만 MVP 필수는 아니다. Critical mutation과 audit insert는 같은 PostgreSQL transaction이어야 한다. Audit insert 실패 시 command도 rollback한다.

## 6. Monitoring Queue and Priority Projection

### 6.1 Query-driven Queue

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

별 `monitoring_tasks` table은 필요 없다. Current/target inputs:

```text
source_monitor_configs
+ active source_bindings
+ latest source_observations (lateral/latest)
+ Institution operational/publication state
+ current/open Opportunity state and date
```

Current config는 strategy, profile, custom interval, seasonal/browser/max attempts, enabled를 갖고 one-config-per-source unique다. Observation은 `observed_at`과 `UNCHANGED/CHANGED/NOT_FOUND/ACCESS_ERROR/PARSE_ERROR/TIMEOUT` 등을 갖는다. `next_due_at`와 due reason은 query projection이다.

Current binding은 legacy School/Cycle에 연결되므로 target Institution/Opportunity binding cutover 후 canonical queue가 완성된다. Transition 기간에는 legacy context를 read-only로 보여줄 수 있다.

### 6.2 P0/P1/P2/P3

**Status: SUPPORTED**

05A와 같이 application query에서 계산한다.

- P0: active/critical-season Opportunity, daily cadence
- P1: upcoming window, standard seasonal 2–3일
- P2: watch/low-change weekly
- P3: manual/dormant/disabled 자동 due 없음

`source_bindings.priority` positive smallint는 tie-breaker이고 P0-P3 enum이 아니다. 새 enum/table 없이 Opportunity dates/state, monitor profile/custom interval, Institution closed/archive를 조합한다.

## 7. No Change / Verification / Concurrency

### 7.1 ConfirmNoChange

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

한 transaction에서 `source_observations(outcome='UNCHANGED', observed_at=server time)`와 Source-targeted Audit를 insert할 수 있다. Version, OpportunityChange, Notification, SEO lastmod를 생성하지 않는다. `Open Source`만으로 Observation을 만들지 않는다.

### 7.2 Change Verification

**Status: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

Current legacy Event/Fact model은 one-current unique, non-branching/monotonic lineage trigger, evidence FK/unique와 integration tests를 갖는다. 04A는 이를 Native Opportunity/InstitutionFact에 table별로 복제하도록 검증했다.

`VerifyNativeOpportunity`, `VerifyLegacyOpportunity`, `VerifyInstitutionFact`는 row lock/expected version 아래 Version + Evidence + current flip + Change + required Outbox + Audit를 원자적으로 처리할 수 있다. Existing `postgres`/Drizzle은 transaction/raw `FOR UPDATE`가 가능하지만 application transaction helper는 아직 없다.

### 7.3 Double Submit

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Form의 `expected_version_id`, aggregate row/current version lock, partial one-current unique, dedupe key를 함께 사용한다. 첫 요청이 commit하면 두 번째는 stale conflict 또는 idempotent existing result를 반환한다. DB error/stack trace를 노출하지 않고 typed `CONFLICT`로 current state reload를 안내한다.

## 8. Materiality Override

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Target OpportunityChange는 materiality와 immutable signal/dedupe를 갖지만 override reason 전용 column은 없다. Override command는 policy default, selected value, reason, actor, server timestamp, correlation ID를 same-transaction Audit safe metadata에 기록할 수 있다. 새 audit table/schema가 필수는 아니다. Empty reason은 server validation으로 거부한다.

## 9. Institution / Opportunity / Source / Fact Admin

### Institution

**Status: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

04 target의 Institution profile/publication/operational state, alias, Source binding, InstitutionFact를 command로 운영 가능하다. Draft는 Source 없이 허용하되 Publish는 official Source/profile/category/region/slug/duplicate warning을 검증한다. Stable profile edit와 Fact verification을 분리하고 core root hard delete 대신 close/archive/hide를 사용한다. Legacy School은 read-only context다.

### Opportunity

**Status: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

Truth mode projection이 Native/Legacy-backed 차이를 흡수하므로 Admin semantic은 하나로 유지 가능하다. Legacy badge/underlying Event는 내부 context만 제공한다. Publish는 current verified truth, Evidence, published/followable Institution, slug/kind/title을 확인한다. Import/backfill은 별 script mode로 `emit_product_signal=false` equivalent를 강제한다.

### Source

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Current Source canonical URL unique/lifecycle, explicit binding, monitor config와 Observation history는 기반으로 충분하다. Canonical Institution/Opportunity bindings는 target migration 후 사용한다. Generic polymorphic editor는 필요 없다. 단순 URL correction은 same Source metadata command, moved official page는 new Source + old retired/moved semantics로 Evidence history를 보존한다.

### Institution Fact

**Status: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

04A의 Fact root/version/evidence pattern과 verification transaction으로 current/history/Evidence를 운영할 수 있다. No Change에는 Version을 만들지 않고 changed verified fact만 새 Version/Evidence를 만든다.

## 10. Article Admin / CMS

**Status: NOT_IMPLEMENTED, ARCHITECTURALLY SUPPORTED**

Target Article/relations/redirect schema는 04에 documented되어 있으나 current repository에는 legacy Guides/Updates만 있다. Editor, Tiptap/WYSIWYG, sanitizer, preview, public renderer, cache revalidation, sitemap이 모두 없다. Package에도 editor/sanitizer dependency가 없다.

구현 필수:

- server-side sanitizer가 publish/preview 모두 같은 sanitized HTML을 사용
- relations와 public target state 검증
- Publish transaction에 content/status/SEO/relations/Audit
- slug change transaction에 new slug + `url_redirects` + Audit, chain/loop flatten
- post-commit cache/sitemap side effect; failure는 publish truth를 rollback하지 않음
- authenticated noindex preview

## 11. Notification and Outbox Admin

### 11.1 Notification

**Status: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

Canonical Notification/Delivery/Attempt target는 list/detail/cancel/retry/suppress reason을 표현한다. Current legacy Alert/Delivery는 Cycle/Subscription graph이므로 canonical Admin에 재사용하지 않는다. Arbitrary mass-email composer 없이 signal-driven notifications만으로 MVP 운영에 충분하다.

Pending/Ready cancel은 future delivery를 막지만 SENT를 되돌리지 않는다. Retry는 current eligibility, retryability, provider ambiguity/idempotency를 재검증한다. SUPPRESSED는 force-send할 수 없다.

### 11.2 Outbox

**Status: CURRENT SKELETON IMPLEMENTED; ADMIN OPERATIONS AFTER HARDENING**

Current Outbox에는 id/event/aggregate/payload/status/available/processed/attempt/created와 status+available index만 있다. Dedupe key, max attempts, lock/lease, safe last error, dead-letter timestamp/status, worker가 없다.

05/04A hardening 후 inspect/retry/cancel/dead-letter Admin이 가능하다. Payload edit와 PROCESSED row manual rerun은 금지한다. Retry는 same event ID/dedupe semantics와 current state revalidation을 사용한다. Admin action 자체를 Audit한다.

## 12. Worker and System Health

### Worker Health

**Status: NOT_IMPLEMENTED; query model SUPPORTED_AFTER_HARDENING**

Worker process/heartbeat가 없다. Hardened Outbox의 oldest pending age, `max(processed_at)`, stale `PROCESSING locked_at`, failed/dead-letter count로 MVP backlog health를 볼 수 있다. 이는 process heartbeat가 아니라 queue health로 label한다.

별 heartbeat table은 MVP에 필요 없다. Queue가 idle할 때 process liveness까지 보장해야 하면 deployment platform/external heartbeat를 사용한다. 실제 need가 검증된 뒤에만 DB heartbeat를 고려한다.

### `/api/health`

**Status: IMPLEMENTED LIVENESS ONLY**

현재 endpoint는 DB를 호출하지 않고 static 200 JSON을 반환한다. Public liveness로는 production-safe하지만 Admin System Health의 DB/worker/provider 상태로 재사용할 수 없다. Public endpoint는 최소 정보를 유지하고 Admin-only health query에서 DB `select 1`, Outbox metrics, safe switch state, provider-known status를 제공한다. 필요 시 platform readiness endpoint를 별도 둔다.

## 13. User Support / PII / Mutation Limits

**Status: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

User list는 opaque ID/status/created/follow count/email state만 표시하고 raw email/child data를 기본 노출하지 않는다. Exact email support lookup이 필요하면:

- GET query string이 아닌 privileged POST form
- server-side normalized exact match
- global unique가 아니므로 multiple canonical Users 반환 가능
- raw query를 access log/audit에 남기지 않고 actor, purpose/reason, result count만 audit
- legacy Subscriber는 별도 labeled read-only context이며 auto merge 금지

Consent history는 read-only다. Admin은 GRANTED를 만들거나 Email preference를 ON하거나 deleted User를 resurrect하지 않는다. Suspend/Delete/지원 Unfollow는 public flow와 같은 canonical command + reason + audit를 사용한다. 07A의 child PII physical deletion과 opaque history retention을 유지한다.

## 14. Data Quality Check Classification

| Check | Primary Enforcement | Admin Representation | Verdict |
|---|---|---|---|
| Published Institution without Official Source | Publish service blocker + scheduled query | BLOCKING/HIGH | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Published Opportunity without Verified Truth | Publish command invariant + query | BLOCKING | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Published Opportunity without Evidence | Verify/Publish service + query | BLOCKING | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Broken Source | latest/consecutive Observation query | ATTENTION/HIGH | SUPPORTED |
| Duplicate slug | DB unique; normalized candidate query | constraint + warning | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Multiple current Version | partial unique + lineage tests | BLOCKING anomaly query | SUPPORTED/target pending |
| Active Follow to archived Institution | close/archive service + scheduled query | HIGH/BLOCKING | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Notification without signal | target FK/check/dedupe | BLOCKING | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Stale P0 | due projection query | URGENT | SUPPORTED |
| Broken Article relation | FK for missing target; service/query for nonpublic state | HIGH | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |

Cross-table checks를 모두 trigger로 만들지 않는다. DB가 단순 identity/referential/cardinality invariant를 맡고, publish/close/verify service와 scheduled read query가 operational policy를 맡는다.

## 15. Audit vs Domain History / Correlation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

- Version/Episode/Consent/Delivery Attempt: domain truth/history
- Audit: Admin actor/action/time/reason
- Outbox: integration delivery reliability
- Analytics: behavioral measurement

같은 full snapshot을 여러 곳에 복제하지 않는다. Correlation utility는 **NOT FOUND**다. Mutation boundary에서 UUID를 생성해 command context로 전달하고 Audit safe JSONB, Outbox payload, PII-safe structured log, command response에 넣을 수 있다. 새 DB table은 필요 없다.

## 16. Kill Switches and Environment Safety

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Current Zod env schema에 `EMAIL_SEND_ENABLED`, `WORKER_ENABLED`, `ANALYTICS_ENABLED` boolean parser를 추가할 수 있다. Generic feature flag platform은 필요 없다.

- Email switch는 provider call 직전 확인하며 canonical Notification/Delivery를 삭제하지 않는다.
- Worker switch는 새 claim을 중단하고 in-flight item은 idempotent protocol로 마무리/lease recovery한다.
- Analytics switch는 adapters를 Noop으로 만들고 Product truth를 변경하지 않는다.

Environment variable은 보통 process restart/redeploy가 필요하다. MVP runbook에 toggle + restart + verify를 명시한다. 무중단 즉시 runtime toggle SLA가 실제 요구될 때만 mutable config store를 검토한다.

Current test DB safety와 Docker test DB는 유효하다. 하지만 production email/analytics credential isolation, test email allowlist/sandbox, explicit app environment와 adapters는 아직 없다. Non-production은 default deny/noop이어야 한다.

## 17. Backup / Restore Reality

**Status: NOT_IMPLEMENTED / production provider NOT_VERIFIABLE**

`docker-compose.yml`의 named Postgres volume은 local persistence이지 backup이 아니다. Managed DB provider, automated backup, retention, `pg_dump`, object backup, restore scripts/docs/drill evidence가 없다.

09의 backup/restore launch requirement는 architecture conflict가 아니라 **production launch gate**다. 최소 evidence:

- automated backup 또는 scheduled dump와 retention
- encrypted storage/access control
- documented restore target/process/secrets
- schema compatibility and post-restore validation queries
- recorded restore drill
- external image/object storage backup policy when introduced

## 18. Migration / Deployment / Observability Reality

### Migration

**Status: BASIC TOOLING IMPLEMENTED; OPERATIONS GAP**

Drizzle strict config, generate/migrate scripts, DB connection check와 schema integration tests가 있다. Current migrations are initial/additive hardening; destructive production workflow evidence는 없다. 하지만 preflight, backup, cutover, post-verify, rollback/forward-fix runbook은 없다.

권장 순서: read-only preflight → backup → additive migration → constraint/backfill validation → application cutover → row/invariant/smoke checks → worker resume. Import/backfill은 product signals를 disable한다.

### Deployment / Worker

**Status: NOT_FOUND / NOT_VERIFIABLE**

Local Postgres Compose 외 web Dockerfile, platform config, CI/CD, worker command/process/scheduler가 없다. Release runbook은 target components와 정합하지만 실제 provider topology/secret/rollback은 검증할 수 없다.

### Observability

**Status: NOT_FOUND**

Structured logger, Sentry/error tracker, application/worker metrics, external uptime/alerts가 없다. Admin dashboard는 이를 대체하지 않는다. Launch 전 uncaught server/auth anomaly/worker/provider/cache errors와 public liveness를 external channel에서 관찰 가능해야 한다.

## 19. Runbook Feasibility

**Status: SUPPORTED_AFTER_TARGET_IMPLEMENTATION**

Daily/weekly/monthly/incident/migration routines는 source monitoring, Outbox, provider, cache, backup, analytics contracts와 정합한다. 현재 존재하지 않는 worker/provider/backup/GSC/GA4 항목은 implementation sequencing과 external links/placeholders로 표시한다. Runbook check item은 구현되지 않은 component를 healthy로 오인하지 않고 `NOT CONFIGURED`를 표시해야 한다.

## 20. ADM-001 ~ ADM-030 Validation

| ADM | Decision | Repository Evidence | Status | Adjustment |
|---|---|---|---|---|
| 001 | Admin is command interface | service layer 없음; target transactions documented | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | application commands 신규 |
| 002 | single internal role | admin_users ACTIVE/DISABLED | SUPPORTED | active actor guard; RBAC defer |
| 003 | User/Admin auth separate | admin root/env separate; public auth target | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | cookie/route/key 분리 |
| 004 | operational priority dashboard | source/outbox/query inputs | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | vanity metrics 후순위 |
| 005 | query-driven queue | config/binding/observation implemented, 05A validated | SUPPORTED | no task table |
| 006 | No Change no Version/Notification | UNCHANGED outcome + audit available | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | atomic command |
| 007 | verification command + Evidence | legacy constraints tested; target pending | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | canonical services |
| 008 | materiality override audited | materiality target + audit JSONB | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | required reason metadata |
| 009 | backfill not live Admin flow | no importer/runtime exists | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | separate script, signals off |
| 010 | profile vs Fact commands | target roots separate | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | command catalog |
| 011 | logical archive/hide/close | target statuses/FK RESTRICT | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | no hard-delete UI |
| 012 | Article sanitize + relation validation | target schema; sanitizer absent | NOT_IMPLEMENTED | server sanitizer mandatory |
| 013 | slug change creates redirect | target `url_redirects` | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | one transaction/chain flatten |
| 014 | signal-driven notifications only | target Notification; no composer | SUPPORTED | no mass-email UI |
| 015 | suppressed cannot force send | target suppress reasons | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | retry command rejects |
| 016 | Outbox inspect/retry/cancel no edit | current skeleton + target hardening | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | dead-letter/lease first |
| 017 | critical mutation PII-safe Audit | audit_logs exists | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | typed serializer/same tx |
| 018 | Audit distinct from histories | separate tables/purposes | SUPPORTED | no snapshot duplication |
| 019 | Consent read-only | target append-only Consent | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | no mutation endpoint |
| 020 | legacy graphs read-only after cutover | current legacy tables isolated | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | retire writers/hide actions |
| 021 | Email/Worker/Analytics switches | Zod env capable; switches absent | NOT_IMPLEMENTED | env booleans + restart runbook |
| 022 | backup/restore launch requirement | no backup evidence | SUPPORTED AS REQUIREMENT / NOT_IMPLEMENTED | production launch gate |
| 023 | non-prod no real side effects | test DB guard exists; adapters absent | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | default deny/noop/allowlist |
| 024 | Admin private/no-store/noindex | App Router capable; routes absent | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | layout+handler guard |
| 025 | minimize Admin PII | UserEmail child target | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | opaque lists/exact POST lookup |
| 026 | severity/query checks, not all triggers | current/target constraint split | SUPPORTED | scheduled checks |
| 027 | additive/preflight/no signals | Drizzle tooling; runbook absent | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | backup/preflight/cutover scripts |
| 028 | no generic undo/bulk | no Admin runtime; command model compatible | SUPPORTED | corrective commands only |
| 029 | external failures preserve truth | Outbox/transaction boundaries documented | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | no network in tx, retries |
| 030 | Admin != observability | observability absent | SUPPORTED AS RULE / NOT_IMPLEMENTED | external error/uptime/metrics |

No ADM decision is `CONFLICT`.

## 21. Acceptance Scenarios

| # | Scenario | Status | Validation |
|---:|---|---|---|
| 1 | Daily Monitoring | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | query queue + UNCHANGED Observation/Audit; no Version/Notification |
| 2 | Deadline Changed | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | lock + Version/Evidence/Change/Outbox/Audit atomic |
| 3 | Concurrent Double Submit | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | expected version/lock/unique → one state, typed conflict |
| 4 | Source Down | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | error Observation/health projection; truth unchanged |
| 5 | Article Publish | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | sanitizer/relations/SEO/Audit then revalidation |
| 6 | Article Slug Change | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | redirect transaction/loop-chain guard/Audit |
| 7 | User Email OFF | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | Follow remains, Admin read-only effective state |
| 8 | Dead Letter | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | Outbox hardening, current-state recheck, idempotent retry |
| 9 | Backfill | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | separate script, signals disabled |
| 10 | User Delete Support | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | canonical DeleteUser, PII erase/history retain |
| 11 | Provider Timeout | SUPPORTED_AFTER_TARGET_IMPLEMENTATION / provider NOT_VERIFIABLE | Attempt reconciliation; no blind resend |
| 12 | Published Institution Missing Source | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | publish blocker + dashboard query |
| 13 | Monitoring Coverage Missing | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | active followers + no active official Source query → HIGH |
| 14 | Analytics Unavailable | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | PostgreSQL operational metrics unaffected |
| 15 | Worker Down | SUPPORTED_AFTER_TARGET_IMPLEMENTATION | backlog/stale/dead-letter health; truth queued/safe |

## 22. Admin / Operations Invariant Matrix

| Rule | DB | Application Command | Admin UI | Worker/Infra | Feasibility |
|---|---|---|---|---|---|
| Admin no direct mutation | repositories/FKs | only command owns tx | no generic editor | — | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| No Change no Version | Observation outcome | ConfirmNoChange only | explicit result action | no signal | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Verify atomic | unique/lineage/FK | one tx + lock | expected version/conflict | Outbox same tx | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Materiality override audited | Change materiality/Audit | reason required/same tx | explicit confirmation | — | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| slug change redirect | slug unique/redirect target | one tx/flatten | warning | cache post-commit | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| no arbitrary mass notification | canonical signal FK | no command | no composer | worker canonical rows only | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| suppressed not force sent | Delivery status/reason | retry rejects | read-only state | eligibility recheck | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| dead-letter retry idempotent | dedupe/attempt/lease target | revalidate/requeue | reason/confirm | stable event ID | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| Consent read-only | append-only target | no grant command | view only | send-time read | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| no PII default lists | PII child separate | minimal projection | opaque state | safe logs | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| backfill no signal | import mode/dedupe | signals disabled | no normal UI action | worker sees no event | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| backup before risky migration | — | preflight command/runbook | status link | external backup/restore | NOT_VERIFIABLE until configured |
| kill switch no corruption | rows retained | external side effect gate | safe booleans only | restart/stop claims/sends | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |
| analytics/provider failure no truth corruption | DB transaction truth | network post-commit | degraded status | retry/drop policy | SUPPORTED_AFTER_TARGET_IMPLEMENTATION |

## 23. Implementation Order Recommendation

1. Admin auth/session/cookie/route guard and separate namespace
2. canonical target schema + Outbox hardening prerequisites
3. transaction context, Audit serializer, correlation ID and typed errors
4. canonical application commands/query services
5. query-driven Monitoring Queue + No Change/Verify flows
6. Institution/Opportunity/Source/Fact Admin
7. Article schema/CMS/sanitizer/preview/redirect flow
8. Notification/Delivery/Outbox operations + worker health
9. User support/PII-safe exact lookup
10. data-quality dashboard and severity queries
11. health/safe config/kill switches + external observability
12. backup/restore runbook and restore drill
13. Analytics/GSC external links and PostgreSQL KPI integration

Production launch gate items are not deferred behind product polish.

## 24. Architecture Amendment Candidate

**None.**

Missing Admin runtime, explicit correlation column, heartbeat table, backup scripts와 observability는 implementation/infrastructure gaps다. Existing audit JSONB, query-driven queue와 external process health로 MVP를 구현할 수 있어 09 구조 변경이 필요하지 않다.

## 25. Required Questions

| Q | Answer |
|---|---|
| Q1 09 구현 가능한가? | **YES_WITH_IMPLEMENTATION_ADJUSTMENTS** |
| Q2 amendment 필요한가? | **NO** |
| Q3 현재 Admin runtime/auth 수준? | `admin_users` + auth env validation만 구현; routes/session/provider/services는 없음 |
| Q4 audit_logs 재사용 가능? | **YES**. same-tx actor/action/entity + typed safe JSONB metadata; 새 table 불필요 |
| Q5 task table 없이 queue 가능? | **YES**. config/binding/latest Observation/current state projection |
| Q6 No Change/Verify/Publish command boundary 존재? | 설계/DB primitive는 가능하지만 current application layer는 **NOT FOUND** |
| Q7 direct CRUD 없이 UI 가능? | **YES**. Route Handler → application command/repository transaction |
| Q8 hardened Outbox 후 Admin retry/dead-letter 가능? | **YES**. dedupe/lease/max-attempt/error/dead-letter/worker 선행 |
| Q9 heartbeat table 없이 health 충분? | **YES for MVP backlog health**. process liveness는 external monitor; idle proof 필요 시 후속 |
| Q10 최소 PII로 User lookup? | **YES**. opaque lists + audited exact-email POST lookup, multiple result 가능 |
| Q11 env/config kill switch 가능? | **YES**. Zod booleans + provider-call/claim gate; restart tradeoff 문서화 |
| Q12 production unknown? | hosting/CI/worker topology, backup retention/restore, external observability, Admin IdP/MFA/TLS, email provider |
| Q13 10 PRD로 진행? | **YES**, 단 production launch gates는 별도 유지 |

## 26. Admin/Operations Architecture Repository Validation Verdict

**Architecture:**
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS

**Ready for 10_PRD:**
YES

**Architecture Blockers:**
None.

**Production Launch Blockers:**
Admin auth/session, backup/restore evidence, Outbox worker/hardening, external observability, and non-production side-effect isolation are not implemented or verified.

**Required Amendments:**
None.

**Implementation Adjustments:**

- active Admin status checked by separate secure session on every route/mutation
- Route Handler → typed application command; no route-level direct SQL
- existing Audit reused with same-transaction PII-safe correlation/reason metadata
- query-driven monitoring queue/P0-P3 projection; no task table
- expected-version + row-lock + unique constraints for double submit
- Outbox hardening before retry/dead-letter Admin
- public liveness separated from Admin dependency/queue health
- default-deny non-prod adapters and restart-aware env kill switches
- backup/restore drill and external observability as launch gates

**Current Admin Runtime:**
Only `admin_users`, admin auth environment validation, audit/source/version/outbox database primitives, a static liveness route, migration scripts, and tests exist. No Admin auth/session/routes/services/UI/worker runtime exists.

**Recommended Admin Mutation Model:**
Private no-store/noindex Admin UI and guarded Route Handlers invoking typed canonical application commands. Commands own row locks, transactions, domain history, PII-safe Audit, required Outbox, and typed conflict/error results.

**Recommended Monitoring Queue Model:**
Query projection over enabled SourceMonitorConfig, active SourceBinding, latest SourceObservation, Institution state, and current/upcoming Opportunity state. P0-P3 and next due are computed; no persistent monitoring_tasks table.

**Recommended Operations/Health Model:**
Keep public `/api/health` as minimal liveness. Use Admin-only DB/Outbox/Delivery/data-quality queries plus external error/uptime/process monitoring. Derive backlog health from pending age/last processed/stale lease/dead letters; no MVP heartbeat table.

**Highest Operational Risks:**

1. Admin UI/route가 application commands를 우회해 Version/Evidence/Audit/Outbox invariants를 깨뜨리는 위험
2. Outbox/provider timeout/dead-letter를 current-state/idempotency 재검증 없이 재시도해 중복 또는 부적격 Email을 보내는 위험
3. backup restore와 external observability가 없는 상태에서 migration/data loss/worker outage를 발견·복구하지 못하는 위험

**External/Production Unknowns:**

- Admin identity provider, MFA, callback/TLS/session deployment controls
- hosting/CI/CD/worker scheduler/process topology and rollback capability
- managed PostgreSQL backup retention, encryption, restore process and restore drill
- error tracker, structured log sink, metrics, uptime and alert channels
- Email provider status/reconciliation and object asset backup

**Recommended Next Step:**
`10_PRD.md`
