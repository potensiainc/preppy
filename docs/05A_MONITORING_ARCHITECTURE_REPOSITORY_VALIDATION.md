# PREPPY Monitoring Architecture Repository Validation

## 0. Purpose and Scope

이 문서는 `docs/05_MONITORING_ARCHITECTURE.md`를 다시 설계하지 않는다. 확정된 Monitoring Architecture가 현재 AdmissionRadar Repository의 실제 schema, migration, runtime, test 자산 위에서 구현 가능한지 검증하고, 구현 시 필요한 조정만 식별한다.

검증 기준일은 2026-08-22이다. 다음 자료를 실제 파일에서 확인했다.

- `docs/One Pager.md`
- `docs/MVP.md`
- `docs/00_PRODUCT_REQUIREMENTS_BASELINE.md`
- `docs/01_EXISTING_ARCHITECTURE_AUDIT.md`
- `docs/02_TARGET_ARCHITECTURE.md`
- `docs/02A_TARGET_ARCHITECTURE_REPOSITORY_VALIDATION.md`
- `docs/03_DOMAIN_MODEL.md`
- `docs/03A_DOMAIN_MODEL_REPOSITORY_VALIDATION.md`
- `docs/04_DATA_MODEL.md`
- `docs/04A_DATA_MODEL_REPOSITORY_VALIDATION.md`
- `docs/05_MONITORING_ARCHITECTURE.md`
- `src/db/schema/index.ts`
- `src/db/migrations/0000_absent_shen.sql`
- `src/db/migrations/0001_productive_morph.sql`
- `src/db/connection.ts`
- `src/db/migrate.ts`
- `src/config/env.ts`
- `app/api/health/route.ts`
- `tests/integration/schema-invariants.test.ts`
- `tests/integration/database-connection.test.ts`
- `tests/support/test-database.ts`
- `package.json`, `docker-compose.yml`, Drizzle/Vitest 설정

이번 작업에서는 schema, migration, code, test, package, worker, Email, crawler, production DB를 변경하거나 실행하지 않았다. Production row와 외부 Email provider는 Repository에 없으므로 검증 범위 밖이다.

판정값:

- `SUPPORTED`: 현재 자산을 그대로 재사용하거나 문서의 additive target model을 그대로 구현 가능
- `SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT`: Architecture 의미는 유지되지만 query, transaction, constraint, index, worker 또는 migration 순서 조정이 필요
- `CONFLICT`: Architecture amendment 없이는 구현 불가하거나 기존 invariant를 훼손
- `NOT_IMPLEMENTED`: 문서에는 있으나 runtime/schema가 아직 없음
- `NOT_VERIFIABLE`: Production data 또는 외부 provider 부재로 확인 불가

## 1. Executive Verdict

`05_MONITORING_ARCHITECTURE.md`의 최종 판정은 **VALID_WITH_IMPLEMENTATION_ADJUSTMENTS**다.

Architecture amendment와 구현 blocker는 없다. Manual-first Level 0, Source Binding 중심 monitoring, source check와 verification의 분리, Native/Legacy change의 `OpportunityChange` 수렴, Institution Fact의 기본 Email 제외, backfill silence, PostgreSQL Outbox 기반 delivery는 현재 Repository와 충돌하지 않는다.

다만 현재 Repository의 실행 계층은 health route와 DB migration/connection helper뿐이다. canonical Institution/Opportunity/User/Follow/Notification schema도 아직 target design 상태다. 따라서 이번 판정은 “현재 코드가 Monitoring을 이미 수행한다”는 뜻이 아니라, `04_DATA_MODEL.md`와 `04A_DATA_MODEL_REPOSITORY_VALIDATION.md`의 additive schema를 먼저 적용한 뒤 아래 구현 조정으로 안전하게 만들 수 있다는 뜻이다.

필수 구현 조정은 다음과 같다.

1. `monitoring_tasks`를 만들지 않고 active Source Binding, MonitorConfig, latest Observation을 조인한 query-driven queue를 구현한다.
2. queue의 논리 단위는 Source Binding이지만 동일 Source의 실제 확인은 한 번만 수행하고, 관련 binding context를 함께 반환한다.
3. manual outcome은 기존 Observation vocabulary로 명시적으로 변환하고, Admin actor와 원문 command outcome은 같은 transaction의 Audit에 남긴다.
4. no-change와 source failure 경로는 Observation/Audit만 기록하고 Version, Change, Notification, truth state를 절대 변경하지 않는다.
5. Native/Legacy verification은 root/current row lock, current swap 순서, Evidence, Audit, Change, Outbox를 하나의 짧은 transaction으로 묶는다.
6. live command와 backfill command를 별도 entry point로 분리하고 Outbox 생성은 DB trigger가 아니라 live application service가 소유한다.
7. 기존 `outbox_events`는 staged hardening 후 `SKIP LOCKED` claim, lease recovery, retry, dead-letter에 사용한다.
8. Recipient resolution과 delivery send는 같은 Outbox table과 같은 process를 써도 되지만 두 logical stage로 분리한다.
9. send-time eligibility recheck의 의미 경계를 provider 요청 직전으로 고정하고 외부 호출 중 DB transaction이나 user lock을 유지하지 않는다.
10. Email provider는 `EmailSender` port 뒤 adapter로 구현한다. 실제 provider와 provider idempotency/reconciliation 능력은 아직 검증할 수 없다.

## 2. Repository Evidence Classification

| Evidence | Classification | Repository finding | Monitoring implication |
| --- | --- | --- | --- |
| PostgreSQL 16 | IMPLEMENTED | `docker-compose.yml`에서 PostgreSQL 16 Alpine 사용 | partial unique, `FOR UPDATE SKIP LOCKED`, JSONB, transaction 구현 가능 |
| Drizzle/Postgres.js | IMPLEMENTED | Drizzle ORM 0.45.2, `postgres` 3.4.9 | additive schema와 transaction service 구현 가능 |
| Trust/collection tables | IMPLEMENTED | Source, Binding, Config, Snapshot, Observation, DetectedChange 존재 | planner와 manual check의 legacy base로 재사용 가능 |
| Event/Fact version/evidence | IMPLEMENTED | current uniqueness, predecessor lineage, evidence table 존재 | Legacy verification transaction 구현 가능 |
| MeaningfulChange | IMPLEMENTED | legacy semantic change와 review/publish fields 존재 | Legacy-side record로 유지하되 product consumer source로 사용하지 않음 |
| Alert/AlertDelivery | IMPLEMENTED AS SCHEMA ONLY | table/constraints는 있으나 producer/worker runtime 없음 | canonical Notification path와 병행 재사용하지 않음 |
| AuditLog/AdminUser | IMPLEMENTED AS SCHEMA ONLY | actor FK와 generic before/after audit 가능 | manual actor 추적에 사용 가능; admin auth/command runtime은 없음 |
| OutboxEvent | IMPLEMENTED AS MINIMAL SCHEMA | PENDING/PROCESSING/PROCESSED/FAILED/CANCELLED과 due index 존재 | staged hardening 필요 |
| canonical Institution/Opportunity/User/Follow/Notification | NOT_IMPLEMENTED | `04_DATA_MODEL.md` target이며 migration/schema/runtime 없음 | Monitoring 구현의 선행 조건 |
| Monitoring planner/service | NOT_IMPLEMENTED | source tree에 구현 없음 | 신규 application service 필요 |
| Worker/scheduler | NOT_IMPLEMENTED | claim loop, lease, retry runtime 없음 | 신규 worker entry point/client 필요 |
| Admin API/UI | NOT_IMPLEMENTED | health route 외 application route 없음 | command API와 queue UI 신규 구현 필요 |
| Email sender/provider/webhook | NOT_FOUND | SDK, adapter, credential contract 없음 | provider 선택 전 boundary만 검증 가능 |
| Production data/volume | NOT_VERIFIABLE | snapshot/credentials 없음 | query plan과 capacity는 production preflight 필요 |

## 3. Existing Monitoring Asset Validation

### 3.1 Asset-by-asset Matrix

| Asset | Current role | MVP reuse | Missing capability | Runtime implementation decision |
| --- | --- | --- | --- | --- |
| `sources` | canonical URL, source type, authority, lifecycle, JS/content hints | official source identity와 health projection의 root | direct last-checked/health 없음 | health와 last checked는 latest Observation projection으로 계산; SourceMoved는 새 Source/binding 우선 |
| `source_bindings` | Source→School/Cycle binding, role, priority, active | legacy School/Cycle monitoring context | canonical Institution/Opportunity binding은 아직 없음 | `04` target binding을 additive 적용하고 planner는 legacy/canonical binding을 compatibility query로 통합 |
| `source_monitor_configs` | strategy, profile, interval, seasonal/browser/max-attempt/enabled | cadence와 manual/collector strategy 설정 | `next_due_at`, explicit P0-P3 override 없음 | due time은 계산; custom interval을 override로 사용; persistent schedule state를 추가하지 않음 |
| `source_snapshots` | source-scoped content hash/storage metadata | future collectors의 immutable capture | manual check에는 snapshot이 없을 수 있음 | Level 0에서는 optional; collector가 있을 때만 생성 |
| `source_observations` | source check outcome과 timing/error/final URL | 모든 manual check의 append-only operational record | Admin actor와 `SOURCE_MOVED`/`UNKNOWN` exact enum 없음 | actor/raw command outcome을 Audit에 기록하고 outcome mapping을 고정 |
| `detected_changes` | snapshot/observation diff candidate | Level 2+ collector seam | current snapshot 필수, cross-source ownership 미강제 | Level 0 no-change/failure에는 생성하지 않음; 자동 수집 도입 시 source-consistency 보강 |
| `meaningful_changes` | legacy Event/Fact semantic change, review/publish metadata | Legacy verify의 compatibility-side semantic record | canonical product identity가 아님 | 필요 시 같은 Legacy transaction에 만들되 Notification consumer는 읽지 않음 |
| `admission_event_versions` | legacy Event verified version chain | Legacy-backed Opportunity truth write | canonical OpportunityVersion 아님 | legacy service가 기존 lineage invariant를 유지하며 기록 |
| `admission_fact_versions` | legacy Fact verified version chain | legacy Institution Fact compatibility write | canonical InstitutionFactVersion 아님 | fact service에서 별도 verify; 기본 Notification 없음 |
| event/fact evidence | version→Source/Observation/Snapshot provenance | Legacy verification evidence | Evidence Source와 Observation/Snapshot Source 동일성 미강제 | `04A`의 composite FK 또는 narrow trigger 보강 적용 |
| `outbox_events` | generic post-commit event rows | monitoring signal과 delivery job의 단일 durable queue | dedupe, lease, max-attempt, error/dead-letter columns 없음 | staged hardening 후 두 logical stage를 같은 table에서 처리 |
| `alerts` | legacy Cycle-scoped alert header | existing history compatibility only | canonical User/Institution/Opportunity 모델과 불일치 | 신규 Monitoring producer가 쓰지 않음; canonical Notification과 병렬 생성 금지 |
| `alert_deliveries` | legacy Subscriber/Subscription delivery | existing history compatibility only | User/Follow/Consent/Preference/Attempt 모델 없음 | 신규 Email worker가 쓰지 않음 |
| `admin_users` | admin identity reference | verification actor | authentication/authorization runtime 없음 | command boundary에서 인증된 ID를 전달하고 DB FK로 보존 |
| `audit_logs` | generic admin action history | check/verify/override/source move audit | Observation direct FK와 typed action enum 없음 | entity type/id와 before/after payload로 충분; Observation ID(bigint)는 payload에 함께 보존 |

### 3.2 Schema Evidence

- `sources`는 canonical URL unique와 authority/lifecycle check를 가진다: `src/db/schema/index.ts:481-508`.
- `source_bindings`는 Source/School/Cycle consistency FK, null-aware logical unique, active index를 가진다: `src/db/schema/index.ts:512-551`.
- `source_monitor_configs`는 one-config-per-source와 strategy/profile/interval/max-attempt check를 가진다: `src/db/schema/index.ts:555-587`.
- `source_observations`는 bigint identity, eight-outcome vocabulary, source/time index를 가진다: `src/db/schema/index.ts:621-666`.
- `detected_changes.current_snapshot_id`는 NOT NULL이므로 manual no-change나 source failure의 필수 기록소로 쓰면 안 된다: `src/db/schema/index.ts:672-724`.
- `outbox_events`는 최소 due index만 있고 lease/dedupe/dead-letter metadata는 없다: `src/db/schema/index.ts:1146-1173`.
- current version uniqueness와 one-successor lineage는 schema/migration에 이미 존재하고 integration test가 이를 검증한다.

## 4. Query-driven Monitoring Queue

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

MVP에 `monitoring_tasks` table은 필요하지 않다. 다음 입력으로 queue projection을 만들 수 있다.

```text
active Source Binding
+ active Source
+ enabled SourceMonitorConfig
+ latest SourceObservation per Source
+ current Opportunity/Institution state
→ priority
→ last_checked_at
→ interval
→ next_due_at
→ due/overdue reason
```

권장 query shape는 active binding을 기준으로 `LATERAL` latest Observation을 가져오고 application policy가 interval과 priority를 계산하는 방식이다. `source_observations(source_id, observed_at)` btree는 역방향 latest scan에 사용할 수 있고 config의 `source_id`는 unique다.

중요한 구분:

- Queue item identity는 Source Binding이다. 같은 Source가 여러 Institution/Opportunity context에 연결될 수 있기 때문이다.
- Physical check identity는 Source다. 같은 URL을 같은 run에서 binding 수만큼 재확인하지 않는다.
- UI는 binding별 institution/opportunity/reason을 보여주되 check command는 하나의 SourceObservation과 각 affected context Audit를 연결한다.

초기 규모에서는 계산 query로 충분하다. Production row 수와 `EXPLAIN (ANALYZE, BUFFERS)` 결과 없이 materialized queue나 별도 due table을 추가할 근거는 없다.

### 4.1 Priority and Cadence Projection

| Priority | Default interval | Existing representation | Decision |
| --- | --- | --- | --- |
| P0_ACTIVE | 1 day | `CRITICAL_SEASONAL` 또는 `custom_interval_minutes=1440` | daily due |
| P1_UPCOMING | 2 days default, policy permits 2–3 days | `STANDARD_SEASONAL` 또는 custom interval | deterministic default 2880 minutes |
| P2_WATCH | 7 days | `LOW_CHANGE` 또는 `custom_interval_minutes=10080` | weekly due |
| P3_PASSIVE | automatic due 없음 | `MANUAL` profile/strategy 또는 config disabled | manual queue/filter only |

`source_bindings.priority`는 현재 positive smallint이고 P0-P3 enum이 아니다. 이를 즉시 enum migration으로 바꾸지 않는다. Binding priority는 stable tie-breaker로, P0-P3는 Opportunity state/date와 monitor config에서 계산한 application projection으로 사용한다.

## 5. Manual Source Check Outcome Mapping

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

| Command outcome | Existing Observation outcome | Additional fields/audit | Truth effect |
| --- | --- | --- | --- |
| `NO_CHANGE` | `UNCHANGED` | actor, source/binding context, command=`ConfirmNoChange` | 없음 |
| `CHANGE_FOUND` | `CHANGED` | optional snapshot/hash; actor; proposed verification link | verification 전에는 없음 |
| `SOURCE_UNAVAILABLE` | `NOT_FOUND`, `ACCESS_ERROR`, `TIMEOUT`, `PARSE_ERROR` 중 실제 원인 | http/error code와 audit reason | 없음 |
| `SOURCE_MOVED` | reachable redirect면 `SUCCESS`, unavailable redirect면 실제 failure outcome | `final_url`, audit action=`SOURCE_MOVED`, old/new Source IDs | 없음 |
| `UNKNOWN` | `OTHER_ERROR` | safe operator note/error code | 없음 |

`SOURCE_MOVED`를 `CHANGED`로 강제하면 content change와 URL lifecycle change를 혼동한다. 기존 enum을 늘리지 않고 operational outcome은 성공/실패 사실대로 기록하고, move semantics는 Audit와 Source lifecycle/binding command에 남기는 것이 더 안전하다.

Observation에 direct `admin_user_id`가 없어도 MVP traceability는 Audit로 충족할 수 있다. 단 check command는 Observation insert와 Audit insert를 같은 transaction에서 수행하고 Audit payload에 bigint Observation ID, Source ID, binding context, raw command outcome을 저장해야 한다. actor가 없는 자동 collector Observation도 허용해야 하므로 direct NOT NULL actor column은 권장하지 않는다.

## 6. No-change and Source Failure Semantics

**Status: SUPPORTED**

### 6.1 ConfirmNoChange

한 transaction에서 다음만 수행한다.

```text
insert SourceObservation(UNCHANGED)
insert AuditLog(CONFIRM_NO_CHANGE)
commit
```

다음은 수행하지 않는다.

- SourceSnapshot 강제 생성
- DetectedChange 생성
- OpportunityVersion/EventVersion/FactVersion 생성
- OpportunityChange/MeaningfulChange 생성
- Notification/Alert 생성
- Outbox signal 생성
- Opportunity truth/root `updated_at`을 “verified” 의미로 갱신

현재 DB에는 Observation insert를 Version/Change로 증폭시키는 trigger가 없으므로 이 규칙과 충돌하지 않는다.

### 6.2 Source Failure

HTTP 500, 403, 404, timeout, parse error는 operational evidence이지 domain truth가 아니다. 실패 response의 body/hash를 정상 content snapshot과 비교해 `DetectedChange`를 만들지 않는다. Source health projection만 변경되고 Opportunity의 OPEN/CLOSED/CANCELLED는 그대로 유지한다.

`detected_changes.current_snapshot_id`가 NOT NULL인 현재 구조도 이 분리를 지지한다. failure/no-change에 dummy snapshot을 넣어 constraint를 우회해서는 안 된다.

## 7. Verification Transaction Feasibility

### 7.1 Native Opportunity Verification

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT; target schema NOT_IMPLEMENTED**

`04` target schema와 `04A` constraint 조정을 적용하면 다음 transaction이 가능하다.

```text
BEGIN
lock Opportunity root/current version
validate NATIVE mode, Institution state, Source Binding, input/evidence
compare proposed state with current verified truth
if identical: reject as verify-change or route to ConfirmNoChange
mark old current SUPERSEDED/is_current=false
insert next OpportunityVersion current/VERIFIED
insert OpportunityVersionEvidence
insert OpportunityChange if material
insert AuditLog
insert OutboxEvent only if live and notifiable/published
COMMIT
```

current partial unique 때문에 새 current row를 먼저 insert하면 기존 current와 충돌한다. 같은 transaction에서 root/current를 lock하고 old current를 먼저 non-current로 전환한 뒤 새 row를 insert한다. 이후 단계가 실패하면 transaction rollback이 old current도 복구하므로 history gap은 남지 않는다.

전용 lineage trigger, same-parent predecessor FK, Evidence Source ownership은 `04A` 결정대로 필요하다. External Email 호출은 이 transaction에 포함하지 않는다.

### 7.2 Legacy-backed Opportunity Verification

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

기존 EventVersion/MeaningfulChange/Evidence와 target Opportunity bridge/OpportunityChange를 같은 PostgreSQL transaction에서 쓸 수 있다.

```text
BEGIN
lock AdmissionEvent/current EventVersion and validate bridge
mark old EventVersion non-current
insert new EventVersion
insert EventVersionEvidence
insert MeaningfulChange when legacy semantics require it
insert canonical OpportunityChange linked to legacy MeaningfulChange
insert AuditLog
insert canonical OutboxEvent when live/notifiable
COMMIT
```

기존 Event lineage trigger와 current partial unique는 transaction을 막지 않으며 오히려 concurrent writer를 방어한다. `alerts` write는 하지 않는다. Alert와 canonical Notification을 동시에 만들면 같은 change가 두 delivery graph로 분기되므로 금지한다.

### 7.3 Institution Fact Verification

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT; target schema NOT_IMPLEMENTED**

Fact verification은 Version/Evidence/Audit까지 동일한 패턴으로 구현 가능하다. 기본 policy에서는 `OpportunityChange`, Notification, delivery Outbox를 만들지 않는다. 향후 fact notification이 필요해지면 별도 versioned policy로 추가하며, 현 MVP에서 `alert_candidate`나 FactVersion insert 자체를 Email trigger로 쓰지 않는다.

## 8. OpportunityChange Convergence and Backfill Silence

### 8.1 Convergence

**Status: SUPPORTED**

Native persistence와 Legacy persistence는 다르지만 downstream signal은 canonical `OpportunityChange` 하나다.

```text
Native OpportunityVersion ─┐
                           ├─ OpportunityChange ─ Notification
Legacy MeaningfulChange ───┘
```

`OpportunityChange.legacy_meaningful_change_id`의 uniqueness와 version/change parent consistency는 `04A` 조정으로 보장한다. Notification consumer는 EventVersion이나 MeaningfulChange를 직접 읽지 않는다. 이 graph에는 circular FK가 필요하지 않다.

### 8.2 Backfill Silence

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Backfill은 live verify command를 재사용하지 않는다. 다음처럼 명시적으로 분리한다.

```text
backfillOpportunityHistory(...)
  → canonical historical state/evidence/audit
  → no OpportunityPublished
  → no OpportunityChange intended as live product signal
  → no Notification
  → no Outbox delivery event
```

DB insert trigger가 자동으로 signal을 생성하면 backfill silence를 보장하기 어렵다. 따라서 Outbox event 생성은 live application service transaction의 명시적 step으로 유지한다. 별도 `notification_eligible` column은 필수 architecture amendment가 아니다. command type/origin을 service input과 Audit에 기록하면 충분하다.

## 9. Outbox and Worker Model

### 9.1 Existing Outbox Feasibility

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

기존 `outbox_events`의 UUID ID, event/aggregate/payload, status, available time, attempts, due index는 좋은 시작점이다. 다음 staged hardening이 필요하다.

```text
nullable columns add
→ deterministic existing-row backfill
→ dedupe/lease/check/index validation
→ canonical writer cutover
→ worker cutover
→ NOT NULL where justified
```

필요 column:

- `dedupe_key`
- `max_attempts`
- `locked_at`
- `locked_by`
- `last_error_code`
- `last_error_at`
- `dead_lettered_at`

기존 status vocabulary는 유지하고 `DEAD_LETTER`를 additive하게 추가한다. `FAILED`를 retry 대기 상태로 혼용하지 말고 retryable failure는 `PENDING + available_at`으로 되돌리며 error metadata를 남긴다.

### 9.2 One-stage vs Two-stage Comparison

| Model | Flow | Benefit | Risk | Verdict |
| --- | --- | --- | --- | --- |
| One-stage | signal worker가 recipient 조회, delivery 생성, provider send까지 연속 수행 | row/handler 수가 적음 | recipient query failure와 provider failure 결합, crash/retry 경계 모호, 외부 호출 전에 durable per-user job이 없음 | 비권장 |
| Two logical stages | signal→Notification+resolution outbox; resolver→Delivery+delivery outbox; sender→provider | failure isolation, per-user idempotency, suppression/retry/dead-letter 명확 | outbox row와 handler가 늘어남 | 권장 |

권장 모델은 **같은 PostgreSQL Outbox table, 같은 deployable worker process, 두 logical event handler**다. 별도 broker나 microservice는 필요 없다. 이것은 operational safety를 확보하면서 인프라 복잡성을 최소화한다.

### 9.3 Claim, Lease, Retry, Dead-letter

Claim transaction:

```sql
BEGIN;
SELECT id
FROM outbox_events
WHERE status = 'PENDING'
  AND available_at <= now()
ORDER BY available_at, created_at, id
FOR UPDATE SKIP LOCKED
LIMIT :batch_size;

UPDATE selected rows
SET status = 'PROCESSING',
    locked_at = clock_timestamp(),
    locked_by = :worker_id,
    attempt_count = attempt_count + 1;
COMMIT;
```

External work는 commit 후 수행한다. stale `PROCESSING` row는 configured lease timeout 이후 재claim한다. retry는 deterministic backoff+jitter와 `available_at`으로 예약하고 max attempts에 도달하면 `DEAD_LETTER`로 전환한다. terminal payload/recipient errors는 즉시 dead-letter 또는 business suppression한다.

현재 `src/db/connection.ts`의 singleton client는 `max: 1` health-check 용도다. worker는 장시간 polling과 claim concurrency를 위해 명시적 lifecycle을 가진 별도 Postgres.js client/pool을 사용해야 한다. 새 framework는 필요 없다.

### 9.4 Required Indexes

최소 권장:

- `(status, available_at, created_at)` 또는 동등한 due-claim index
- stale recovery를 위한 `(status, locked_at)` partial/index
- `dedupe_key` unique

현재 `(status, available_at)`은 재사용 가능하다. exact index는 target query의 `EXPLAIN`으로 확정한다.

## 10. Notification and Delivery Semantics

### 10.1 Notification Creation

Signal consumer는 `signal identity + policy_version`에서 deterministic dedupe key를 만든다. 같은 signal을 두 번 consume해도 Notification 하나와 Recipient Resolution outbox 하나만 존재해야 한다. 이 uniqueness는 application `ON CONFLICT`뿐 아니라 DB unique constraint로 보장한다.

### 10.2 Recipient Resolution

Eligibility query는 다음을 모두 검사한다.

```text
User ACTIVE
FollowEpisode active at signal_published_at
current usable Email
effective SERVICE_EMAIL_UPDATES consent GRANTED
EMAIL preference ENABLED
```

모든 user ID를 Notification payload에 저장하지 않는다. Resolver가 canonical state를 query하고 `UNIQUE(notification_id,user_id,channel)` Delivery를 `ON CONFLICT DO NOTHING`으로 만든다.

### 10.3 Follow and Signal Race

동시성 의미는 다음으로 고정한다.

- signal transaction이 commit된 뒤 resolver statement가 시작된다.
- resolver가 볼 수 있는 committed FollowEpisode 중 `activated_at <= signal_published_at < deactivated_at`인 episode만 eligible이다.
- signal 이후 commit/activation된 Follow는 retroactive Delivery를 만들지 않는다.
- exact same timestamp tie는 inclusive activation rule로 eligible이지만, timestamp는 DB `timestamptz`로 생성하고 deterministic ID tie-break를 로그에 남긴다.

Follow와 signal의 모든 write를 한 global lock으로 직렬화할 필요는 없다. Resolver query snapshot과 episode interval이 product boundary다.

### 10.4 Deactivation/Delete During Resolution

Resolver가 Delivery를 만든 직후 Follow deactivation, preference off, consent withdrawal, user deletion이 발생할 수 있다. Delivery creation을 막기 위해 user row를 장시간 lock하지 않는다. Delivery는 durable candidate일 뿐이며 send-time recheck가 최종 suppression gate다.

User deletion command는 `04A`에 따라 User를 DELETED로 만들고 Follow를 inactive로 하며 PII child rows를 physical delete한다. pending Delivery history는 opaque User ID로 남고 `SUPPRESSED`가 된다.

### 10.5 Send-time Recheck Boundary

권장 sender 순서:

1. delivery outbox claim.
2. 짧은 transaction에서 현재 eligibility를 재조회.
3. 불가하면 Delivery SUPPRESSED + Outbox PROCESSED.
4. 가능하면 Attempt STARTED와 deterministic provider key를 기록하고 commit.
5. provider를 호출.
6. 별도 transaction에서 Attempt/Delivery/Outbox를 완료하거나 retry/dead-letter.

recheck 이후 provider 호출 직전 preference가 바뀌는 극소 race를 DB lock으로 완전히 제거하려면 network call 동안 lock/transaction을 유지해야 하며, 이는 더 위험하다. 의미 경계는 “provider request 직전 DB recheck 시점”이다. provider가 요청을 수락한 뒤의 상태 변경은 이미 진행 중인 send를 취소하지 못하고 이후 send에 적용된다.

### 10.6 Delivery and Provider Idempotency

DB logical idempotency:

- Notification dedupe unique
- `UNIQUE(notification_id,user_id,channel)`
- one delivery-request outbox dedupe per Delivery
- retries are new Attempt rows, not new Delivery rows

Provider가 idempotency key를 지원하면 Delivery ID 기반 key를 전달한다. timeout 후 accepted 여부가 불명확하면 즉시 blind retry하지 않고 provider message lookup/webhook/reconciliation을 우선한다. 실제 provider가 이 기능을 지원하는지는 **NOT_VERIFIABLE**이다.

## 11. Email Provider Boundary

**Status: ARCHITECTURALLY SUPPORTED; IMPLEMENTATION NOT FOUND**

Domain/Application은 provider SDK를 import하지 않고 다음 port만 사용한다.

```text
EmailSender.send(message, idempotencyContext)
```

Infrastructure adapter가 Resend/SES/Postmark 등의 SDK, error classification, message ID, webhook signature를 처리한다. provider call은 core verification/notification transaction 외부다. credential은 env/secret store에서 주입하며 payload/audit/log에 저장하지 않는다.

MVP Email은 canonical Opportunity deep link를 포함하고 Email 자체를 truth source로 취급하지 않는다. open/click은 privacy/client behavior로 부정확하므로 operational signal일 뿐 domain truth가 아니다.

## 12. Admin Command and UI Feasibility

**Status: SERVICE FEASIBLE; RUNTIME NOT_IMPLEMENTED**

현재 app runtime은 health route만 있으므로 Monitoring Queue/Admin command API/UI는 없다. 하지만 기존 schema가 구현을 막지는 않는다.

| Admin action | Command/service | Writes | Forbidden side effect |
| --- | --- | --- | --- |
| Open Source | read/query | 없음 | 없음 |
| No Change | `confirmNoChange` | Observation + Audit | Version/Change/Email |
| Update Native Opportunity | `verifyNativeOpportunity` | Version/Evidence/Change/Audit/Outbox | direct root overwrite, inline Email |
| Update Legacy Opportunity | `verifyLegacyOpportunity` | legacy Version/Evidence/MeaningfulChange + canonical Change/Audit/Outbox | legacy Alert write |
| Create Opportunity | admissions command | root/current Version/Evidence/Audit/live signal when eligible | fake School/Event creation |
| Update Fact | `verifyInstitutionFact` | FactVersion/Evidence/Audit | default Email |
| Source Unavailable | `markSourceUnavailable` | failure Observation/Audit/health projection | Opportunity status mutation |
| Change Source URL | source lifecycle/binding command | new Source/binding or canonical correction + Audit | provenance-destroying in-place rewrite |
| Notification override | verification policy input | materiality/override Audit | unaudited direct Notification insert |

Monitoring Orchestrator가 table을 직접 조작하지 않고 Trust, Admissions, Follow, Notification application services를 호출한다는 ownership rule은 구현 가능하다.

## 13. Future Collector Seam

**Status: SUPPORTED**

기존 `collection_strategy`의 HTTP/BROWSER/DOCUMENT/MANUAL, snapshots, observations, detected changes는 future adapter seam을 이미 제공한다.

```text
AdminManualAdapter / FutureHttpCollector / FutureBrowserCollector / FuturePdfCollector
→ Observation
→ optional Snapshot
→ optional Candidate Change
→ Verification Service
→ canonical Version/Change/Notification
```

Collector는 canonical Version, OpportunityChange, Notification을 직접 만들지 않는다. 현재 crawler, browser automation, parser, LLM extractor를 구현하지 않아도 Level 0 E2E는 완성 가능하다.

자동 collector를 도입할 때는 `detected_changes.source_id`, Observation Source, Snapshot Source의 일치를 composite key/FK 또는 narrow trigger로 보강한다. 이 보강은 Level 0 blocker가 아니다.

## 14. MON-001–MON-020 Repository Validation Matrix

| Decision | Status | Repository validation |
| --- | --- | --- |
| MON-001 Source Binding target | SUPPORTED_WITH_ADJUSTMENT | legacy binding 구현됨; canonical binding은 `04` target 적용 필요 |
| MON-002 Follow targets Institution | SUPPORTED_WITH_ADJUSTMENT | target Follow schema 미구현이나 namespace/FK feasibility는 `04A` 통과 |
| MON-003 Manual-first Level 0 | SUPPORTED | manual Observation/Audit와 verify transaction으로 가능 |
| MON-004 Official Source evidence | SUPPORTED | Source authority/type와 Evidence FK 존재 |
| MON-005 Check ≠ Verification | SUPPORTED | Observation insert와 Version write 사이 자동 trigger 없음 |
| MON-006 No-change creates no Version | SUPPORTED | UNCHANGED vocabulary 존재; service rule로 보장 가능 |
| MON-007 Native/Legacy converge on OpportunityChange | SUPPORTED_WITH_ADJUSTMENT | target Change/bridge migration 필요 |
| MON-008 consumer ignores MeaningfulChange | SUPPORTED | canonical producer/consumer 신규 구현이므로 충돌 없음 |
| MON-009 Fact change no default Email | SUPPORTED | Fact insert의 자동 Alert/Outbox trigger 없음 |
| MON-010 backfill silence | SUPPORTED_WITH_ADJUSTMENT | live/backfill service 분리 및 trigger-free outbox 필요 |
| MON-011 only post-follow signals | SUPPORTED_WITH_ADJUSTMENT | FollowEpisode target schema/query 필요 |
| MON-012 no reactivation retro-send | SUPPORTED_WITH_ADJUSTMENT | interval query로 재현 가능 |
| MON-013 send-time eligibility recheck | SUPPORTED_WITH_ADJUSTMENT | sender runtime 신규 구현 필요 |
| MON-014 DB logical uniqueness | SUPPORTED_WITH_ADJUSTMENT | target Notification/Delivery constraints 필요 |
| MON-015 provider outside core transaction | SUPPORTED | postgres transaction boundary로 구현 가능 |
| MON-016 harden existing Outbox | SUPPORTED_WITH_ADJUSTMENT | table 재사용 가능, columns/status/index staged migration 필요 |
| MON-017 SKIP LOCKED + lease | SUPPORTED_WITH_ADJUSTMENT | PostgreSQL 16 지원, worker/lease fields 미구현 |
| MON-018 failure no truth mutation | SUPPORTED | existing schema에 자동 truth trigger 없음 |
| MON-019 collectors before Verification | SUPPORTED | collection tables와 adapter seam 존재 |
| MON-020 automation after bottleneck proof | SUPPORTED | crawler/queue broker가 없어 MVP scope와 일치 |

Architecture decision 중 `CONFLICT`는 없다.

## 15. Monitoring Invariant Matrix

| Invariant | DB guard | Application/transaction guard | Test requirement |
| --- | --- | --- | --- |
| 1. one check records one Observation | Observation PK | command inserts once/idempotency token if retried | duplicate manual submission |
| 2. no-change creates no Version/Change/Email | 없음이 의도적 | dedicated `confirmNoChange` command | row-count assertion across all graphs |
| 3. source failure does not mutate truth | 없음이 의도적 | failure outcome branch returns before verify | 500/404/timeout scenarios |
| 4. current version is unique | existing/target partial unique | root/current lock and swap order | concurrent verify |
| 5. version lineage is same-parent and non-branching | composite FK + dedicated trigger/index | predecessor validation | wrong parent/version/branch attempts |
| 6. evidence belongs to the same Source | `04A` composite FK/narrow trigger | command validates binding/evidence | mismatched observation/snapshot Source |
| 7. Native and Legacy produce one canonical change | OpportunityChange dedupe/legacy unique | normalization policy | duplicate bridge consumption |
| 8. Fact verification does not notify by default | no automatic trigger | fact policy excludes signal | Fact change row-count assertion |
| 9. backfill creates no product signal | no DB auto-signal trigger | separate backfill entry point/origin | bulk backfill silence |
| 10. one Notification per signal/policy | dedupe unique | deterministic key + `ON CONFLICT` | duplicate outbox consume |
| 11. one Delivery per Notification/User/channel | composite unique | `ON CONFLICT DO NOTHING` | concurrent resolver |
| 12. recipient followed at signal time | FollowEpisode non-overlap/interval constraints | signal-time query | follow-after/reactivation cases |
| 13. ineligible user is not sent | Delivery status checks | provider-immediate recheck | preference/delete race |
| 14. one logical delivery is retried through Attempts | Delivery unique + Attempt FK/sequence | no new Delivery on retry | transient provider failure |
| 15. provider side effect occurs after commit | not expressible in DB | sender orchestration boundary | fake sender observes committed Attempt |
| 16. claimed work recovers after crash | outbox status/check/index | lease timeout/reclaim policy | stale PROCESSING reclaim |
| 17. max attempts dead-letter exactly once | status/check/dedupe | atomic terminal transition | repeated terminal failure |
| 18. Source moved preserves provenance | Source/Evidence RESTRICT | create/rebind over rewrite | historical Evidence remains resolvable |

## 16. Acceptance Scenario Validation

| Scenario | Result | Required implementation proof |
| --- | --- | --- |
| 1. Native new recruitment | FEASIBLE | native verify/publish transaction emits one signal and eligible follower gets one Delivery |
| 2. Legacy deadline change | FEASIBLE | EventVersion+MeaningfulChange+OpportunityChange atomic; consumer reads canonical Change only |
| 3. No Change | FEASIBLE | Observation/Audit only; no Version/Change/Outbox |
| 4. Source Down | FEASIBLE | failure Observation; unchanged Opportunity; no Email |
| 5. Follow After Change | FEASIBLE | FollowEpisode interval excludes user from resolver |
| 6. Reactivated Follow | FEASIBLE | inactive interval excludes past signal; later signal eligible |
| 7. Email Disabled Before Worker | FEASIBLE | send-time recheck marks SUPPRESSED without sender call |
| 8. Worker Crash After Claim | FEASIBLE AFTER HARDENING | stale lease becomes reclaimable |
| 9. Duplicate Outbox Consumption | FEASIBLE AFTER TARGET CONSTRAINTS | one Notification, one Delivery/channel |
| 10. Provider Timeout | PARTIALLY VERIFIABLE | DB key/Attempt design feasible; provider lookup/idempotency depends on provider |
| 11. User Delete During Pending | FEASIBLE AFTER TARGET SCHEMA | DELETED + PII child removal + Delivery suppression |
| 12. Backfill Legacy Opportunities | FEASIBLE | historical rows created through backfill path with zero product outbox signals |

Scenario 10의 external reconciliation만 provider 선택 전 `NOT_VERIFIABLE`이며 Architecture readiness를 막지 않는다.

## 17. Repository Validation Questions

### Q1. 기존 Source/Observation/MonitorConfig으로 query-driven Monitoring Queue가 가능한가?

**YES.** active Binding과 latest Observation lateral query, config cadence projection으로 가능하다. persistent `monitoring_tasks`는 불필요하다.

### Q2. manual Source check outcome을 기존 Observation vocabulary로 표현 가능한가?

**YES WITH MAPPING.** NO_CHANGE/CHANGE_FOUND/failure는 직접 매핑된다. SOURCE_MOVED와 UNKNOWN의 semantic detail은 Audit/error metadata에 보존한다.

### Q3. Observation에 Admin actor가 없을 경우 Audit로 충분한가?

**YES FOR MVP.** 같은 transaction의 Audit에 actor, Observation ID, Source/binding context, raw outcome을 저장해야 한다. 자동 Observation을 위해 actor를 필수 column으로 만들 필요는 없다.

### Q4. No-change check를 Version 생성 없이 기록 가능한가?

**YES.** Observation과 Audit은 Version graph와 독립이고 자동 trigger가 없다.

### Q5. Legacy Event verify에서 MeaningfulChange와 canonical OpportunityChange를 같은 transaction에 만들 수 있는가?

**YES.** key type과 transaction graph가 호환된다. target bridge/change schema 적용이 선행되어야 한다.

### Q6. Native verify가 Data Model/lineage constraint와 충돌하는가?

**NO.** old-current 전환 후 new-current insert 순서와 dedicated lineage trigger를 지키면 된다.

### Q7. 기존 Outbox를 hardening 후 SKIP LOCKED worker에 사용할 수 있는가?

**YES.** PostgreSQL 16과 current base columns/index가 지원한다. lease/dedupe/dead-letter migration이 필요하다.

### Q8. recipient resolution과 delivery send를 두 outbox stage로 나누는 것이 과도한가?

**NO.** 같은 table/process에서 두 handler로 구현하면 infrastructure는 하나이고 crash/idempotency 경계가 명확하다.

### Q9. one-stage worker가 더 단순하면서 idempotency를 유지할 수 있는가?

**부분적으로만 가능하다.** 외부 send 전 per-user durable job을 만들지 않으면 crash/timeout ambiguity가 커진다. 따라서 권장하지 않는다.

### Q10. FollowEpisode로 signal-time eligibility를 재현할 수 있는가?

**YES.** `activated_at <= signal_published_at`이고 deactivated 전인 episode를 조회한다. target episode constraint가 필요하다.

### Q11. User delete/Preference off와 worker race를 어떤 lock으로 막아야 하는가?

**장시간 lock으로 막지 않는다.** Delivery는 candidate로 만들고 provider 직전 짧은 eligibility query로 suppress한다. network call 동안 user lock을 유지하지 않는다.

### Q12. provider call 전 transaction 종료 후 idempotency 유지가 가능한가?

**YES AT DB LOGICAL LEVEL.** Delivery/outbox/Attempt dedupe와 deterministic provider key로 유지한다. provider timeout의 exactly-once는 provider 기능 없이는 보장 불가하다.

### Q13. existing Alert/Delivery runtime이 없어도 canonical Notification worker를 독립 구현 가능한가?

**YES.** 기존 schema는 runtime producer가 없고 target table 이름/ownership이 분리되어 있다. 신규 producer는 legacy Alert를 쓰지 않는다.

### Q14. source cadence를 `source_monitor_configs`로 충분히 표현 가능한가?

**YES FOR MVP.** profile, custom interval, seasonal flag, enabled/manual strategy로 충분하다. next due는 projection이다.

### Q15. automatic collector 없이 Level 0 E2E가 가능한가?

**YES.** AdminManualAdapter→Observation→Verification→Outbox→Email pipeline이면 된다.

## 18. Highest Operational Risks

1. **Provider timeout ambiguity**: provider가 요청을 받았으나 response가 유실되면 DB만으로 exactly-once send를 증명할 수 없다.
2. **Current-version swap concurrency**: root/current lock과 update-before-insert 순서를 누락하면 partial unique conflict 또는 잘못된 lineage가 발생한다.
3. **Backfill/live path 혼용**: live verification service를 migration에서 호출하면 과거 Opportunity가 대량 Notification으로 변할 수 있다.
4. **Eligibility race misunderstanding**: send-time recheck를 Delivery 생성 시점 check로 대체하면 unsubscribe/delete 이후 발송될 수 있다.
5. **Source failure false-positive**: error page/hash를 normal snapshot처럼 비교하면 false change와 잘못된 cancellation을 만들 수 있다.
6. **Legacy/canonical dual emission**: MeaningfulChange→Alert와 OpportunityChange→Notification을 동시에 활성화하면 중복 Email이 발생한다.
7. **Outbox lease 오류**: provider call 중 transaction을 열거나 lease/reclaim이 비원자적이면 contention 또는 duplicate processing이 발생한다.
8. **Evidence ownership mismatch**: Source/Observation/Snapshot source consistency가 DB에서 보강되기 전 application bug가 provenance를 오염시킬 수 있다.
9. **Queue duplicate work**: binding 단위 UI를 source 단위 fetch와 구분하지 않으면 같은 URL을 반복 확인한다.
10. **Production query plan unknown**: 실제 row distribution이 없으므로 due queue와 recipient query index는 rollout 전 plan 검증이 필요하다.

## 19. Implementation Order

1. `04`/`04A` canonical target schema와 constraints를 additive migration으로 구현한다.
2. 기존 Outbox를 staged hardening하고 schema invariant/concurrency test를 추가한다.
3. Monitoring planner query와 manual check command를 구현한다.
4. Native/Legacy/Fact verification transaction과 backfill-only entry point를 구현한다.
5. canonical OpportunityChange/Notification creation과 two-stage Outbox handlers를 구현한다.
6. FollowEpisode recipient query와 send-time suppression concurrency test를 구현한다.
7. `EmailSender` fake adapter로 E2E를 검증한 뒤 실제 provider를 선택/연결한다.
8. Admin queue/commands와 dead-letter operations를 노출한다.
9. production-like data에서 queue/recipient `EXPLAIN`과 worker crash/timeout drill을 수행한다.
10. collector 없이 Manual-first Level 0을 launch하고 운영 병목을 측정한다.

## 20. Final Verdict

```text
Verdict:
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS

Ready for 06_CONTENT_SEO_ARCHITECTURE:
YES

Blockers:
None.

Required Amendments:
None. 05_MONITORING_ARCHITECTURE.md의 domain boundary나 locked MON decision을 변경할 필요가 없다.

Implementation Adjustments:
Query-driven Source Binding queue; explicit manual outcome mapping with same-transaction Audit; root/current locking and ordered version swap; live/backfill command separation; canonical OpportunityChange convergence; staged Outbox hardening; two logical outbox stages; FollowEpisode signal-time query; provider-immediate eligibility recheck; worker-specific DB client; EmailSender adapter.

Recommended Worker Model:
One PostgreSQL Outbox and one deployable worker process with two logical stages: recipient resolution, then per-Delivery send. Use SKIP LOCKED claim, short transactions, lease recovery, retry/backoff, and dead-letter handling.

Highest Operational Risks:
Provider timeout ambiguity; current-version concurrency; accidental backfill emission; unsubscribe/delete race; source-failure false positives; legacy/canonical dual emission; lease recovery mistakes; evidence source mismatch.

Recommended Next Step:
06_CONTENT_SEO_ARCHITECTURE.md
```
