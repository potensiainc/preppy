# PREPPY Data Model Repository Validation

## 0. Purpose and Scope

이 문서는 `docs/04_DATA_MODEL.md`를 다시 설계하지 않는다. 확정된 물리 모델을 현재 AdmissionRadar Repository에 additive migration으로 적용하면서 기존 Trust, History, FK integrity, concurrency invariant를 보존할 수 있는지 검증한다.

검증 기준일은 2026-08-22이다. 다음 입력을 실제 파일에서 확인했다.

- `docs/One Pager.md`
- `docs/MVP.md`
- `docs/00_PRODUCT_REQUIREMENTS_BASELINE.md`
- `docs/01_EXISTING_ARCHITECTURE_AUDIT.md`
- `docs/02_TARGET_ARCHITECTURE.md`
- `docs/02A_TARGET_ARCHITECTURE_REPOSITORY_VALIDATION.md`
- `docs/03_DOMAIN_MODEL.md`
- `docs/03A_DOMAIN_MODEL_REPOSITORY_VALIDATION.md`
- `docs/04_DATA_MODEL.md`
- `src/db/schema/index.ts`
- `src/db/migrations/0000_absent_shen.sql`
- `src/db/migrations/0001_productive_morph.sql`
- `tests/integration/schema-invariants.test.ts`
- DB connection/migration/config/test support와 현재 runtime source

이번 작업에서는 migration을 생성하거나 실행하지 않았고 schema, code, test, package, production DB를 변경하지 않았다. Production credentials/snapshot이 Repository에 없으므로 schema와 code는 검증했지만 실제 Production row는 검증하지 않았다.

판정값:

- `SUPPORTED`: 문서 설계를 현재 Repository에 그대로 additive 적용 가능
- `SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT`: 의미와 구조는 유지하되 exact FK/index/trigger/column/migration 순서를 조정해야 함
- `CONFLICT`: Data Model 자체를 바꾸지 않으면 적용 불가 또는 integrity/history 손상
- `NOT_VERIFIABLE`: Production data 또는 외부 dependency 부재로 확인 불가

## 1. Executive Verdict

`04_DATA_MODEL.md`는 현재 Repository에 additive하게 적용 가능하다. 최종 판정은 **VALID_WITH_IMPLEMENTATION_ADJUSTMENTS**다.

Data Model amendment나 schema-level blocker는 없다. 신규 target table 30개 이름은 기존 28개 table과 충돌하지 않으며, 재사용 대상인 `outbox_events`만 의도적으로 기존 table이다. 기존 PK는 대부분 UUID이고 SourceObservation/AuditLog만 bigint identity이므로 문서의 FK placeholder와 정확히 호환된다.

필수 구현 조정은 다음이다.

1. Opportunity↔AdmissionEvent aggregate consistency는 application-only나 다수 trigger보다 redundant consistency key를 가진 composite FK bridge로 강제한다.
2. InstitutionFactVersion과 OpportunityVersion lineage는 기존 함수를 과도하게 parameterize하지 않고 table별 전용 trigger로 복제한다.
3. Evidence는 기존 nullable Source-only pattern을 재사용하되 Observation/Snapshot이 같은 Source 소속인지 composite FK 또는 좁은 trigger로 보강한다.
4. truth mode, signal/change parent, Notification/change parent처럼 서로 다른 table의 aggregate 일치는 composite FK와 최소한의 deferred/publish trigger로 보호한다.
5. `user_emails`와 `auth_identities`의 PII는 User row를 남긴 채 child row delete를 기본으로 해 `NOT NULL` 설계와 deletion 요구를 양립시킨다.
6. Notification attempt에는 provider webhook reconciliation용 partial unique/index가 필요하다.
7. 기존 Outbox는 폐기하지 않고 nullable-add → deterministic backfill → unique/check validation → writer cutover 순서로 hardening한다.

## 2. Evidence Classification

| Evidence | Classification | Finding |
| --- | --- | --- |
| `src/db/schema/index.ts` | IMPLEMENTED | 28개 legacy table, UUID/bigint PK, FK, check, unique/partial index가 Drizzle에 선언됨 |
| `src/db/migrations/0000_absent_shen.sql` | IMPLEMENTED | base DDL, FK, index, `set_updated_at`, AlertDelivery consistency trigger가 authoritative SQL로 존재 |
| `src/db/migrations/0001_productive_morph.sql` | IMPLEMENTED | Event/Fact lineage non-branching index와 table-specific lineage trigger 존재 |
| `tests/integration/schema-invariants.test.ts` | TESTED | 28개 existing invariant test, dedicated DB safety, migration-based harness, concurrency test 존재 |
| `docker-compose.yml` | IMPLEMENTED | PostgreSQL 16 Alpine; partial unique와 `UNIQUE NULLS NOT DISTINCT`, `SKIP LOCKED` 사용 가능 |
| `drizzle.config.ts`, `package.json` | IMPLEMENTED | Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, strict PostgreSQL config |
| canonical PREPPY target tables | NOT IMPLEMENTED | 아직 migration/schema/code 없음; 이 문서가 구현 가능성을 검증 |
| Kakao OAuth | NOT FOUND | provider adapter/callback/token runtime 없음 |
| Production data | NOT VERIFIABLE | credentials/snapshot/row inventory 없음 |

## 3. Actual Legacy Schema Inventory

### 3.1 Admissions and Institution Legacy Graph

| Table | PK | Direct FK / ON DELETE | Unique / Partial Index | Checks / Other Index | Trigger |
| --- | --- | --- | --- | --- | --- |
| `schools` | UUID | 없음 | slug unique | type, lifecycle checks; type/region, lifecycle/public indexes | `set_updated_at` |
| `school_aliases` | UUID | school UUID → schools, CASCADE | `(school_id, normalized_alias)` | alias type; normalized alias index | 없음 |
| `admission_cycles` | UUID | school UUID → schools, RESTRICT | `(id,school_id)`; `(school_id,academic_year)`; one public-focus partial unique | year/lifecycle/mode checks | `set_updated_at` |
| `admission_events` | UUID | cycle UUID → cycles, RESTRICT | `(id,cycle_id)`; `(cycle_id,event_key)` | event type/occurrence/importance/actionability; cycle/type index | `set_updated_at` |
| `admission_event_versions` | UUID | event UUID, admin UUID, predecessor composite; 모두 RESTRICT | `(id,event_id)`, `(event_id,version_no)`, current partial unique, predecessor partial unique | state/date/self/current checks; current date indexes | dedicated lineage trigger |
| `admission_facts` | UUID | cycle UUID + optional Event/Cycle composite, RESTRICT | `(id,cycle_id)`, `(cycle_id,fact_key)` | CYCLE/EVENT scope check | `set_updated_at` |
| `admission_fact_versions` | UUID | fact UUID, admin UUID, predecessor composite; RESTRICT | `(id,fact_id)`, `(fact_id,version_no)`, current partial unique, predecessor partial unique | verification/knowledge/value typed/self/current checks | dedicated lineage trigger |
| `expected_windows` | UUID | cycle UUID, admin UUID; RESTRICT | 없음 | prediction/precision/date/sample/confidence checks; cycle/current index | 없음 |

`schools`의 direct FK blast radius는 `school_aliases`(CASCADE), `admission_cycles`(RESTRICT), `source_bindings`(RESTRICT), `updates`(RESTRICT)다. AdmissionCycle 아래 Event/Fact/MeaningfulChange/Alert/Delivery가 이어지므로 indirect graph는 크지만 `institution_school_links`를 새로 추가하는 것은 기존 row를 수정하지 않는다.

### 3.2 Trust, Collection, Change and Evidence

| Table | PK | Direct FK / ON DELETE | Unique / Partial Index | Checks / Other Index | Trigger |
| --- | --- | --- | --- | --- | --- |
| `sources` | UUID | 없음 | canonical URL unique | source type/authority/lifecycle checks | `set_updated_at` |
| `source_bindings` | UUID | Source, School, optional Cycle+School composite; RESTRICT | null-aware `(source,school,cycle,role)` | role/priority; school/active index | `set_updated_at` |
| `source_monitor_configs` | UUID | Source, RESTRICT | one config per Source | strategy/profile/interval/max attempts | `set_updated_at` |
| `source_snapshots` | UUID | Source, RESTRICT | `(source_id,content_hash)` | source/captured index | 없음 |
| `source_observations` | bigint identity | Source, optional Snapshot; RESTRICT | 없음 | outcome/http/size/duration; source/time index | 없음 |
| `detected_changes` | UUID | Source, observations, snapshots; RESTRICT | `(source,fingerprint)` partial | status; status/time index | `set_updated_at` |
| `meaningful_changes` | UUID | DetectedChange, Cycle, Admin, Event/Cycle, Fact/Cycle; RESTRICT | `(id,cycle_id)` | type/significance/review; review/time, cycle/published indexes | `set_updated_at` |
| `event_version_evidence` | UUID | EventVersion, Source, optional Observation/Snapshot; RESTRICT | null-aware `(version,source,observation)` | 없음 | 없음 |
| `fact_version_evidence` | UUID | FactVersion, Source, optional Observation/Snapshot; RESTRICT | null-aware `(version,source,observation)` | 없음 | 없음 |

실제 key type은 Source UUID, Observation bigint, Snapshot UUID다. 기존 Evidence는 manual Source-only row를 허용하지만 `source_id`와 optional observation/snapshot의 소속 Source 일치를 강제하지는 않는다. 신규 Evidence에서 보강할 가치가 있다.

### 3.3 Audience, Alert, Editorial and Operations

| Table | PK | Direct FK / ON DELETE | Unique / Partial Index | Checks / Other Index | Trigger |
| --- | --- | --- | --- | --- | --- |
| `subscribers` | UUID | 없음 | normalized email unique | status check | `set_updated_at` |
| `subscriptions` | UUID | Subscriber, Cycle; RESTRICT | `(id,subscriber)`, `(subscriber,cycle)` | status; cycle/status, subscriber/status indexes | updated_at + cycle parent guard |
| `subscription_action_tokens` | UUID | Subscription, RESTRICT | token hash unique | purpose; subscription index | 없음 |
| `alerts` | UUID | Cycle + optional MeaningfulChange/Cycle; RESTRICT | dedupe key unique | type/status; status/generated index | updated_at + cycle parent guard |
| `alert_deliveries` | UUID | Alert, Subscription/Subscriber composite; RESTRICT | `(alert,subscription,channel)` | channel/status/attempt; status/time, subscriber/time | updated_at + delivery cycle validation |
| `outbox_events` | UUID | 없음 | 없음 | status/attempt checks; `(status,available_at)` | 없음 |
| `guides` | UUID | 없음 | slug unique | status; status/published index | `set_updated_at` |
| `updates` | UUID | optional School/Cycle, RESTRICT | slug unique | status; status/published index | `set_updated_at` |
| `update_changes` | composite UUID pair | Update, MeaningfulChange; RESTRICT | composite PK | 없음 | 없음 |
| `admin_users` | UUID | 없음 | external auth subject unique | status | `set_updated_at` |
| `audit_logs` | bigint identity | optional Admin UUID, RESTRICT | 없음 | entity/time index | 없음 |

### 3.4 Existing Trigger and Test Assets

- `set_updated_at()`와 16개 mutable table trigger: `0000_absent_shen.sql:587-624`
- Alert/Subscription/Delivery cross-parent consistency와 parent-update guard: `0000_absent_shen.sql:626-721`
- Event/Fact predecessor one-successor: `0001_productive_morph.sql:1-2`
- Event/Fact same-parent monotonic immutable lineage: `0001_productive_morph.sql:3-80`
- current uniqueness, cross-cycle FK, delivery concurrency, lineage, typed value/date를 검증하는 28개 integration test: `schema-invariants.test.ts:190-1090`

## 4. Namespace, Key Compatibility and Additive Feasibility

**Status: SUPPORTED**

- 기존 Drizzle schema의 table은 28개다.
- `04_DATA_MODEL.md`의 신규 target table 30개는 모두 미사용 이름이다.
- `outbox_events`만 의도적으로 기존 table을 재사용한다.
- `schools.id`, `admission_events.id`, `sources.id`, `source_snapshots.id`, `admin_users.id`, `meaningful_changes.id`는 UUID다.
- `source_observations.id`는 bigint identity다.
- 신규 aggregate root UUID는 기존 `uuid().primaryKey().defaultRandom()` 관행과 일치한다.
- public schema를 그대로 사용해도 name collision이 없으므로 schema-per-domain 분리는 필요 없다.

## 5. Institution Model Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

### 5.1 `institutions`, mapping, aliases

`institutions`, `institution_school_links`, `institution_aliases`는 모두 신규 이름이며 UUID 호환성이 정확하다. 1:1은 다음으로 강제한다.

```text
institution_school_links.institution_id PK 또는 UNIQUE
institution_school_links.school_id UNIQUE
두 FK 모두 ON DELETE RESTRICT
```

Native 영유는 mapping row 없이 존재할 수 있다. legacy `schools`는 전혀 수정하지 않으며 direct/indirect history graph도 유지된다.

### 5.2 Alias backfill

`school_aliases`는 School UUID, normalized alias unique, alias type check를 이미 가진다. Mapping이 있는 School에 한해서 Institution alias로 조건부 backfill 가능하다. 실제 duplicate normalized alias, locale normalization 차이는 Production preflight 대상이다. 자동 삭제나 source table 변경은 필요 없다.

### 5.3 Checks and delete

Category/subtype, publication/operational state, latitude/longitude check는 Drizzle `check(sql\`...\`)`로 표현 가능하다. root hard delete는 dependent FK `RESTRICT`와 application permission으로 막고 CLOSED/ARCHIVED state를 사용한다.

Implementation adjustment:

- Opportunity bridge composite FK를 위해 `institution_school_links(institution_id,school_id)` composite unique를 추가한다. 양쪽 단일 unique와 논리적으로 중복이지만 FK target key로 필요하다.
- `institution_aliases` CASCADE는 public history가 아닌 검색 보조 child이므로 허용한다. Institution hard delete 자체는 일반 command에서 금지한다.

## 6. Institution Fact Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

Fact identity + append-oriented version + evidence는 기존 AdmissionFact pattern과 일치한다. `(institution_id,fact_type)` unique는 MVP의 단일 logical fact aggregate에 충분하다. 다차원 tuition 요구가 실제로 생기기 전 `scope_key`나 generic framework를 추가하지 않는다.

`value_json JSONB NOT NULL`은 현재 Drizzle `jsonb().$type<...>()`와 PostgreSQL 16에서 문제없다. DB는 최소 `jsonb_typeof(value_json) = 'object'`와 verification/date/state check만 담당하고, `fact_type`별 shape는 Zod/application schema로 검증한다. 7개 typed table이나 복잡한 JSONPath check는 불필요하다.

Lineage:

- `(fact_id,version_number)` unique
- current partial unique
- `(id,fact_id)` composite unique
- `(supersedes_version_id,fact_id)` same-parent FK
- predecessor partial unique
- self/current-state checks
- InstitutionFact 전용 monotonic/identity-immutability trigger

기존 `validate_fact_version_lineage`를 parameterized generic function으로 바꾸지 않는다. 신규 table명/parent column을 명시한 전용 function을 복제하는 편이 migration review와 오류 격리에 안전하다.

VERIFIED current version의 evidence 존재는 version/evidence/current swap을 한 service transaction에서 처리하고 service transaction test로 검증하는 것이 적절하다. cross-row count를 매 write마다 trigger로 강제하면 draft 작성 순서와 current swap이 복잡해진다. publish/current 전이 command 외 direct writer를 허용하지 않아야 한다.

## 7. Opportunity Root and Truth Mode Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

`opportunities`와 bridge 이름은 충돌하지 않는다. institution/event 모두 UUID다. kind/truth mode/publication state는 text + check로 기존 convention에 맞게 구현 가능하며 slug와 Institution FK도 직접 적용 가능하다.

`truth_mode`와 child 존재 관계는 단일 row check만으로 완전 강제할 수 없다. 다음 조합을 권장한다.

1. bridge에 constant `truth_mode`를 redundant하게 포함하고 `CHECK(truth_mode='LEGACY_BACKED')`
2. `opportunities(id,truth_mode)` composite unique
3. bridge `(opportunity_id,truth_mode)` composite FK
4. Native version에도 constant mode를 둘 경우 같은 방식으로 `NATIVE`만 허용
5. `PUBLISHED` 전이 시 LEGACY_BACKED link 또는 NATIVE current verified truth 존재를 확인하는 narrow deferred constraint/publish trigger

이 방식은 link 방향 오류를 DB에서 막고 publish completeness만 좁은 trigger에 남긴다.

## 8. Opportunity ↔ AdmissionEvent Aggregate Consistency

### 8.1 Option Comparison

| Option | Integrity | Complexity | Migration Risk | Maintenance | Verdict |
| --- | --- | --- | --- | --- | --- |
| A. application transaction only | direct write/concurrency 우회 가능 | 낮음 | 낮음 | 모든 writer가 규칙을 반복 | REJECT |
| B. narrow DB trigger | insert 시 강함; parent update/delete guard도 별도 필요 | 중간~높음 | lock ordering/race test 필요 | 관련 4개 parent 변경을 계속 추적 | ACCEPTABLE FALLBACK |
| C. redundant keys + composite FK | insert와 parent update 모두 DB가 자동 보호 | 중간 | 신규 bridge 중심이라 낮음 | key가 명시적이고 introspection 가능 | **RECOMMENDED** |
| D. 기존 key만 직접 활용 | Opportunity→Institution→School 경로를 한 FK로 잇지 못함 | 낮음 | 낮음 | application gap 잔존 | INSUFFICIENT |

### 8.2 Recommended Physical Enforcement

bridge에 다음 consistency key를 둔다.

```text
opportunity_id
institution_id
admission_event_id
admission_cycle_id
school_id
```

필요한 key/FK:

```text
UNIQUE(opportunity_id)
UNIQUE(admission_event_id)

FK(opportunity_id, institution_id)
  → opportunities(id, institution_id)

FK(institution_id, school_id)
  → institution_school_links(institution_id, school_id)

FK(admission_event_id, admission_cycle_id)
  → admission_events(id, admission_cycle_id)

FK(admission_cycle_id, school_id)
  → admission_cycles(id, school_id)
```

Repository에는 이미 `admission_events(id,admission_cycle_id)`와 `admission_cycles(id,school_id)` unique가 있어 legacy table 변경이 필요 없다. 신규 `opportunities(id,institution_id)`와 mapping composite unique만 추가하면 된다.

이 선택은 redundant column을 소량 늘리지만 trigger 네트워크와 parent-update race를 없앤다. 기존 Repository가 composite FK로 Fact/Event, Source/Cycle/School, Alert/Change consistency를 지키는 방식과 가장 잘 맞는다.

## 9. Native OpportunityVersion Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

| Invariant | Existing EventVersion | Native Target | Reuse Strategy |
| --- | --- | --- | --- |
| version number unique | `(event_id,version_no)` unique | `(opportunity_id,version_number)` | 동일 패턴 |
| current max one | partial unique `WHERE is_current` | 동일 | 동일 패턴 |
| supersedes | nullable UUID | nullable UUID | 동일 |
| same aggregate | composite predecessor FK | 같은 Opportunity | `(id,opportunity_id)` key/FK |
| monotonic version | table-specific trigger | 필요 | dedicated trigger 복제 |
| no branching | predecessor partial unique | 필요 | 동일 패턴 |
| self-supersede reject | check | 필요 | 동일 check |
| current/SUPERSEDED | check | 필요 | 동일 check |
| lineage fields immutable | trigger | 필요 | dedicated trigger 복제 |
| verified attribution | `verified_at`, admin UUID | 동일 | `admin_users.id` UUID RESTRICT FK |
| current swap concurrency | partial unique + transaction | 동일 | Opportunity/current row lock + retry |

기존 function을 generic dynamic SQL trigger framework로 만들지 않는다. InstitutionFact와 Opportunity 각각 전용 function을 두되 logic과 SQLSTATE `23514` test style을 복제한다.

추가 조정:

- `verification_state='VERIFIED'`이면 `verified_at IS NOT NULL` check
- `is_current AND verification_state='SUPERSEDED'` 금지
- end/open-close date order check
- business payload는 VERIFIED/SUPERSEDED 후 in-place update 금지; service command와 필요한 경우 좁은 immutability trigger로 보호

## 10. Opportunity Evidence Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

실제 FK type:

- Source: UUID
- Observation: bigint identity
- Snapshot: UUID
- Admin: UUID

Manual Source-only Evidence는 observation/snapshot을 nullable로 두면 기존과 동일하게 가능하다.

dedupe는 PostgreSQL 16/Drizzle의 기존 `.nullsNotDistinct()` pattern을 사용해 다음 네 column을 잡는다.

```text
UNIQUE NULLS NOT DISTINCT(
  opportunity_version_id,
  source_id,
  source_observation_id,
  source_snapshot_id
)
```

ON DELETE는 Version, Source, Observation, Snapshot 모두 `RESTRICT`가 적절하다.

기존 Evidence보다 강하게 만들 권고:

- observation이 있으면 `(observation_id,source_id)` 일치
- snapshot이 있으면 `(snapshot_id,source_id)` 일치

이를 위해 legacy parent에 redundant composite unique를 additive하게 추가하고 composite FK로 연결하거나, index 비용을 피해야 한다면 Evidence write에만 좁은 trigger를 둔다. Trust correctness를 우선하면 composite FK가 더 예측 가능하다.

기존 EventVersionEvidence를 polymorphic하게 수정해 Native row를 넣는 방식은 reject한다.

## 11. OpportunityChange Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

`meaningful_changes.id`와 native version ID는 UUID라 target FK와 호환된다. canonical table을 별도로 두는 것이 안전하다.

기존 MeaningfulChange는 Cycle `NOT NULL`, Event/Fact composite FK, legacy change type/check, Alert cycle coupling을 갖는다. 이를 확장하면 Native change를 위해 nullable/conditional FK와 legacy Alert semantics를 흔들어야 한다.

권장 constraint:

- `dedupe_key` unique
- `legacy_meaningful_change_id` nullable partial unique
- native from/to version은 `(version_id,opportunity_id)` composite FK
- legacy/native XOR check
- native는 `to_native_version_id NOT NULL`, NEW_OPPORTUNITY만 from nullable
- `published_at NOT NULL`이며 signal 발행 후 immutable

Legacy MeaningfulChange가 mapped Opportunity에 실제로 속하는지는 backfill/normalization transaction에서 bridge를 확인한다. Notification consumer는 canonical ID만 본다.

## 12. Source Binding Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

기존 `source_bindings`는 School/Cycle에 직접 결합되어 있으므로 유지한다. `institution_source_bindings`와 `opportunity_source_bindings`를 explicit FK table로 추가해 병존할 수 있고 같은 Source를 두 target에 각각 bind할 수 있다.

권장 constraint:

- `(target_id,source_id,role)` unique
- 모든 FK `RESTRICT`
- `is_active=true`이면 `unbound_at IS NULL`, inactive이면 `unbound_at IS NOT NULL` check
- Institution의 active primary `OFFICIAL_MAIN`은 partial unique
- Opportunity의 role별 active primary가 필요하면 `(opportunity_id,role) WHERE is_primary AND is_active`

generic polymorphic binding은 필요 없다. Domain authority/lifecycle vocabulary mapping은 application enum/check 결정이며 기존 Source row를 rewrite할 이유가 없다.

## 13. User, Auth, Profile and Email Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

`users` 이름은 비어 있고 `admin_users`와 충돌하지 않는다. 둘은 별도 UUID root다. `(provider,provider_subject)` unique는 기존 admin external subject unique pattern으로 구현 가능하다. Kakao OAuth 동작 자체는 `NOT_VERIFIABLE`이다.

`user_emails UNIQUE(user_id)`는 User당 current email 하나를 강제한다. global email unique를 두지 않아도 FK나 Delivery integrity 문제는 없고, 동일 email을 두 User가 공유하는 test도 가능하다.

PII deletion의 가장 단순한 physical 전략:

- User logical row는 유지
- `auth_identities` child row를 delete해 provider subject 제거
- `user_emails` child row를 delete해 raw/normalized email 제거
- profile/interest child row delete
- User status/timestamps, Follow/Delivery opaque User FK는 유지

이렇게 하면 `provider_subject`와 `email`의 `NOT NULL`을 nullable로 완화하거나 tombstone unique value를 발명할 필요가 없다. Auth/Email row를 history anchor로 사용할 요구도 현재 Domain에는 없다. 삭제 action 자체는 PII 없는 audit record로 남긴다.

Profile/interest FK는 일반적으로 User `ON DELETE RESTRICT` 또는 CASCADE 어느 쪽도 동작에 영향을 주지 않지만, User hard delete 금지를 명확히 하려면 root FK는 RESTRICT하고 deletion service가 child를 명시적으로 지우는 편이 감사 가능성이 높다.

## 14. Consent and Preference Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

legacy Subscription의 `consent_version`, `consent_source`, request/verify/unsubscribe timestamp는 provenance pattern으로 재사용할 수 있지만 row model은 재사용하지 않는다.

최신 effective consent는 다음 index 하나로 MVP에 충분하다.

```text
(user_id, consent_type, decided_at DESC, id DESC)
```

tie-breaker ID를 포함해 deterministic latest를 보장한다. `DISTINCT ON` 또는 lateral latest query로 AMP와 recipient resolution을 계산할 수 있다. Production 규모가 없으므로 current projection이 필요하다는 주장은 할 수 없다. v1에서는 만들지 않는다.

Consent는 append-only 법적/제품 history이므로 일반 application writer에 UPDATE/DELETE를 노출하지 않는다. 별도 DB role 권한 분리가 아직 없으므로 구현 시 narrow immutability trigger 또는 repository API 제한 중 하나를 선택해야 한다. 강한 보존이 필요하면 trigger가 정직하다.

Preference는 `(user_id,channel)` unique current row와 upsert로 충분하다.

## 15. Follow and FollowEpisode Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

PostgreSQL 16과 현재 Drizzle은 다음을 모두 표현한다.

- `UNIQUE(user_id,institution_id)`
- `UNIQUE(follow_id) WHERE deactivated_at IS NULL`
- state/timestamp check
- user/status, institution/status, episode/time indexes

current Follow와 Episode sync는 service transaction으로 충분하다. 모든 activation/deactivation command가 Follow row를 `FOR UPDATE`로 lock하고 두 row를 함께 변경하면 된다. trigger는 중복 state machine을 만들어 오히려 복잡해진다. partial unique와 checks가 race의 마지막 방어선이다.

Double OAuth callback/reactivation concurrency:

1. logical pair insert `ON CONFLICT`
2. Follow row lock
3. 이미 ACTIVE면 idempotent success
4. INACTIVE면 current fields 갱신 + open Episode insert
5. open Episode partial unique가 concurrent duplicate를 차단

signal-time history는 Episode interval `(activated_at <= signal AND (deactivated_at IS NULL OR deactivated_at > signal))`로 재구성한다. 즉시 resolution은 current state index를 사용하되 delayed/replay는 Episode를 사용한다.

## 16. Notification, Delivery and Attempt Validation

### 16.1 Notification

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

신규 `notifications`는 legacy Alert와 이름/FK가 분리된다. UUID, JSONB payload, dedupe unique, status/time indexes는 기존 pattern과 맞는다.

추가 aggregate consistency:

- `opportunity_changes(id,opportunity_id)` composite unique
- Notification `(opportunity_change_id,opportunity_id)` composite FK
- signal type/check: CHANGED이면 change FK 필수, PUBLISHED이면 정책에 따라 nullable
- `dedupe_key`는 signal ID + policy version으로 stable하게 생성

### 16.2 Delivery and Attempt

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

`UNIQUE(notification_id,user_id,channel)`은 legacy Delivery dedupe의 canonical counterpart다. status/suppress reason checks와 User/Notification RESTRICT FK를 둔다.

Attempt는 별도 append-only table이 맞다.

- `(delivery_id,attempt_number)` unique
- attempt number > 0
- provider message ID가 있으면 `(provider,provider_message_id)` partial unique/index
- Delivery row lock 후 next attempt number 계산 또는 sequence retry
- raw provider payload와 raw email 미저장

provider webhook은 provider+message ID로 Attempt를 찾아 Delivery로 이동할 수 있다. recipient hash는 운영 상관관계 보조 값이며 delivery 주소 복원 수단이 아니다.

legacy AlertDelivery는 Cycle/Subscription/Subscriber와 3개의 consistency trigger에 결합되어 있으므로 수정하지 않는 전략이 안전하다.

## 17. Outbox Hardening Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

기존 Outbox를 버릴 필요가 없다.

| Required Logical Field | Existing | Add Needed | Risk / Adjustment |
| --- | --- | --- | --- |
| `id` | UUID PK | NO | 재사용 |
| `aggregate_type` | TEXT NOT NULL | NO | 재사용 |
| `aggregate_id` | UUID NOT NULL | NO | 재사용 |
| `event_type` | TEXT NOT NULL | NO | 재사용 |
| `payload_json` | `payload JSONB NOT NULL` | NO | rename하지 말고 existing name 유지 |
| `dedupe_key` | 없음 | YES | nullable add, legacy backfill, partial unique, writer cutover 후 NOT NULL 검토 |
| `status` | PENDING/PROCESSING/PROCESSED/FAILED/CANCELLED | ADJUST | CANCELLED 보존 + DEAD_LETTER 추가하도록 check 교체 |
| `available_at` | TIMESTAMPTZ NOT NULL | NO | existing index 재사용 |
| `attempt_count` | INTEGER default 0 | NO | existing check 재사용 |
| `max_attempts` | 없음 | YES | default/check; legacy row backfill |
| `locked_at` | 없음 | YES | nullable lease field |
| `locked_by` | 없음 | YES | nullable; locked pair consistency check |
| `last_error_code` | 없음 | YES | safe code only |
| `last_error_at` | 없음 | YES | nullable |
| `processed_at` | 있음 | NO | 재사용 |
| `dead_lettered_at` | 없음 | YES | nullable; status consistency transaction |
| `created_at` | 있음 | NO | 재사용 |

권장 migration 순서:

1. 새 column을 nullable/default-compatible하게 add
2. 기존 row의 dedupe key를 `legacy-outbox:{id}`처럼 충돌 없는 deterministic 값으로 backfill
3. partial unique index를 먼저 생성/검증
4. 신규 writer가 canonical dedupe key를 쓰도록 cutover
5. status check를 기존 값 보존 상태로 교체하고 DEAD_LETTER 추가
6. claim index `(status,available_at)` 재사용, stale lease용 `locked_at` index 추가
7. 필요 시 dedupe NOT NULL과 max-attempt consistency를 후속 validate

PostgreSQL 16의 `FOR UPDATE SKIP LOCKED`로 claim 가능하고 `locked_at` timeout으로 lease recovery 가능하다. 현재 worker code는 없어 runtime behavior는 아직 `NOT IMPLEMENTED`다.

## 18. Article and URL Redirect Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

`articles`, relation, redirect 이름은 충돌하지 않는다. `content_html TEXT`, status/type/category check, UUID author FK는 모두 호환된다. `admin_users.id`는 UUID이므로 `author_admin_id`와 정확히 맞는다.

Relations는 explicit composite unique/PK와 FK를 사용한다. Article root는 logical archive를 사용하고 relation row는 Article에서 CASCADE 가능하지만 Institution/Opportunity 삭제 방향은 RESTRICT가 안전하다.

`url_redirects.source_path TEXT PK`, target, 301/308, self-redirect check는 문제없다. 현재 application route는 `/api/health`뿐이고 Institution/Opportunity/Article legacy public routes는 `NOT FOUND`다. redirect chain/loop, canonical target normalization, old source path reuse 금지는 application slug transaction rule이다. 이 table은 Domain polymorphic relation이 아니라 routing infrastructure다.

Guide/Update row 존재와 slug traffic은 Production data 없이는 검증할 수 없다. conditional migration/link table은 preflight 결과가 0 row이면 만들지 않는다.

## 19. User Delete and PII Validation

**Status: SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT**

User hard delete를 하지 않는 것이 자연스럽다. Follow, Delivery, Consent, Audit의 opaque UUID anchor를 유지하면서 child PII만 제거할 수 있다.

권장 deletion transaction:

1. User row lock, status DELETED/timestamps
2. AuthIdentity child delete
3. UserEmail/Profile/Interest child delete
4. preference disable
5. active Follow와 open Episode close
6. pending/queued Delivery SUPPRESSED
7. PII 없는 audit
8. COMMIT

Delivery에는 raw email이 없고 Attempt의 provider message ID로 webhook reconciliation 가능하다. UserEmail 삭제 후 과거 Delivery/Attempt FK는 영향을 받지 않는다. provider가 email 기반 webhook만 제공하는지는 외부 dependency라 `NOT_VERIFIABLE`; 그런 provider를 선택하면 짧은 TTL encrypted mapping을 별도 보안 검토한다.

## 20. Recommended ON DELETE Policy

| Relationship Group | Recommended Action | Reason |
| --- | --- | --- |
| Institution→Opportunity/Fact/SourceBinding/SchoolLink | RESTRICT | root archive와 history 보존 |
| Institution→Alias | CASCADE acceptable | 검색 보조 child; root hard delete는 별도 금지 |
| Opportunity→Bridge/Version/Change/Binding/Notification relation | RESTRICT | truth/history 보존 |
| Version→Evidence | RESTRICT | evidence loss 방지 |
| Source/Observation/Snapshot→Evidence | RESTRICT | provenance 보존 |
| User→Auth/Email/Profile/Interest | RESTRICT + deletion service explicit delete | PII erase 순서와 audit 명확화 |
| User→Follow/Consent/Preference/Delivery | RESTRICT | opaque history anchor 유지 |
| Follow→Episode | RESTRICT | monitoring history 보존 |
| Notification→Delivery→Attempt | RESTRICT | operational history 보존 |
| Article→relation rows | CASCADE acceptable | Article hard delete는 미공개 오입력에만; 일반은 archive |
| Institution/Opportunity→Article relation | RESTRICT | linked history 보호 |
| Admin→verified_by/author | RESTRICT | actor attribution 보존 |

Historical version/evidence/change/delivery/attempt에 CASCADE를 사용하지 않는다.

## 21. Index Budget Validation

Production volume/EXPLAIN이 없으므로 성능 수치를 단정하지 않는다.

| Proposed Index | Verdict | Reason / Adjustment |
| --- | --- | --- |
| institutions(publication_state,category,region_code) | KEEP | public category/region listing 핵심 |
| opportunities(institution_id,publication_state) | KEEP | Institution detail/current list |
| opportunities(publication_state,kind) | KEEP | public kind listing |
| opportunity_versions(opportunity_id,is_current) | REMOVE | current partial unique on opportunity_id와 version unique로 중복 |
| opportunity_changes(opportunity_id,published_at DESC) | KEEP | My Preppy recent changes |
| institution_facts(institution_id,fact_type) | REMOVE | 같은 column의 UNIQUE가 이미 index 제공 |
| institution_fact_versions(fact_id,is_current) | REMOVE | current partial unique와 version unique로 중복 |
| auth_identities(provider,provider_subject) UNIQUE | KEEP | identity integrity/lookup |
| user_emails(user_id) | REMOVE | UNIQUE(user_id)가 index 제공 |
| consent_decisions(user_id,consent_type,decided_at DESC) | ADJUST | deterministic tie-breaker `id DESC` 추가 |
| notification_preferences(user_id,channel) | REMOVE | UNIQUE가 index 제공 |
| follows(user_id,status) | KEEP | My Preppy/AMP |
| follows(institution_id,status) | KEEP | recipient resolution |
| follow_episodes(follow_id,activated_at DESC) | ADJUST | interval query에 deactivated_at 포함 고려; open partial unique 별도 |
| notifications(status,signal_published_at) | KEEP | ready/pending processing |
| notification_deliveries(status,created_at) | KEEP | worker/operator queue |
| notification_deliveries(user_id,created_at DESC) | KEEP | user history/account operations |
| outbox_events(status,available_at) | KEEP | 이미 구현; SKIP LOCKED claim |
| articles(status,published_at DESC) | KEEP | public/editorial list |
| articles(category,status,published_at DESC) | DEFER | category hub query/volume 확인 후 추가; 첫 index와 write cost 비교 |

추가 권고:

- provider webhook lookup용 attempts `(provider,provider_message_id) WHERE provider_message_id IS NOT NULL`: KEEP
- Outbox stale lease `locked_at WHERE status='PROCESSING'`: KEEP
- `institutions(display_name)` plain B-tree는 exact/prefix query가 정해지기 전 DEFER

## 22. DD-001 ~ DD-027 Validation

| DD | Decision | Repository Evidence | Status | Adjustment |
| --- | --- | --- | --- | --- |
| DD-001 | canonical root UUID | 대부분 existing PK UUID/defaultRandom | SUPPORTED | existing UUID convention 사용 |
| DD-002 | Institution↔School additive 1:1 bridge | School UUID, 신규 name free | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | composite consistency key 추가 |
| DD-003 | 3 category + secondary subtype | legacy school type check 독립 | SUPPORTED | 신규 check |
| DD-004 | Institution Fact hybrid | AdmissionFact/Version pattern 존재 | SUPPORTED | stable profile와 Fact 분리 유지 |
| DD-005 | type-scoped JSONB | existing JSONB/typed Fact 사용 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | DB object check + app type schema |
| DD-006 | Opportunity root는 stable fields | 신규 name free; Event version precedent | SUPPORTED | mutable truth는 version |
| DD-007 | optional 1:1 Event bridge | UUID 호환, legacy composite keys 존재 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | redundant keys + composite FK |
| DD-008 | Native Version/Evidence 별도 | EventVersion은 Event/Cycle 필수 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | dedicated lineage trigger |
| DD-009 | canonical OpportunityChange | MeaningfulChange Cycle coupling | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | XOR/composite FK/dedupe |
| DD-010 | query projection, no materialization | runtime/query layer 아직 없음 | SUPPORTED | 성능 확인 전 materialization 없음 |
| DD-011 | User/Auth/Email/Profile 분리 | admin/subscriber와 name 충돌 없음 | SUPPORTED | explicit FK |
| DD-012 | User당 email 1, no global unique | 기존 global subscriber unique와 병렬 가능 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | deletion 시 email row delete |
| DD-013 | append-only Consent | legacy consent provenance precedent | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | latest index tie-breaker/immutability |
| DD-014 | current Preference 별도 | 신규 name free | SUPPORTED | pair unique |
| DD-015 | Follow + Episode | partial unique pattern implemented | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | service lock/state checks |
| DD-016 | canonical Notification | legacy Alert Cycle coupled | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | change/opportunity composite FK |
| DD-017 | logical Delivery | legacy delivery dedupe precedent | SUPPORTED | canonical triple unique |
| DD-018 | append-only Attempt | legacy row loses retry history | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | provider message index |
| DD-019 | legacy Alert row 미재사용 | cycle/subscription triggers 강결합 | SUPPORTED | parallel tables |
| DD-020 | existing Outbox hardening | lifecycle skeleton implemented | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | staged add/backfill/check replacement |
| DD-021 | Delivery raw email 미저장 | UserEmail 분리 가능 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | provider message reconciliation |
| DD-022 | sanitized HTML Article | Guide/Update Markdown와 병렬 가능 | SUPPORTED | sanitizer app contract |
| DD-023 | explicit Article relations | update_changes composite bridge precedent | SUPPORTED | explicit FKs |
| DD-024 | URL routing registry | current public routes 없음 | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | chain/route reservation app rule |
| DD-025 | User logical delete + PII erase | RESTRICT/history pattern | SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT | PII child delete transaction |
| DD-026 | scope별 Last Verified | observed_at/verified_at 존재 | SUPPORTED | fake page timestamp 없음 |
| DD-027 | data 확인 전 legacy cleanup 금지 | Production data NV | SUPPORTED | M0 preflight 필수 |

Summary:

- `SUPPORTED`: 12
- `SUPPORTED_WITH_IMPLEMENTATION_ADJUSTMENT`: 15
- `CONFLICT`: 0
- DD 자체 `NOT_VERIFIABLE`: 0
- External Kakao와 Production rows는 하위 evidence 수준 `NOT_VERIFIABLE`

## 23. Database Invariant Enforceability Matrix

| Rule | FK | UNIQUE | PARTIAL UNIQUE | CHECK | TRIGGER | TRANSACTION | APPLICATION | Recommended Enforcement |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Institution slug unique |  | ✓ |  |  |  |  | canonicalizer | UNIQUE |
| Institution↔School max 1:1 | ✓ | ✓ |  |  |  | backfill | mapping ownership | two UNIQUE + FK |
| Opportunity has Institution | ✓ |  |  | NOT NULL |  |  | validity | FK |
| Opportunity↔Event max 1:1 | ✓ | ✓ |  |  |  | link command |  | two UNIQUE |
| Bridge School consistency | composite ✓ | supporting ✓ |  |  |  |  |  | redundant keys + composite FK |
| truth_mode child consistency | composite ✓ | supporting ✓ |  | constant mode ✓ | publish-only | publish tx | command | composite FK + narrow publish trigger |
| one Native current version | ✓ | version no ✓ | current ✓ |  |  | root lock/swap | retry | partial unique + tx |
| version same-parent/non-branching | composite ✓ |  | predecessor ✓ | self ✓ | lineage ✓ | lock | version service | existing pattern 복제 |
| verified version has evidence | ✓ | evidence dedupe |  |  |  | atomic verify | publish guard | transaction/service test |
| Evidence Source ownership | composite ✓ | supporting ✓ |  |  | optional |  |  | composite FK preferred |
| OpportunityChange mode/parent | composite ✓ | dedupe ✓ | legacy ID ✓ | XOR ✓ |  | normalize tx | mapper | FK/check/unique |
| active primary binding max 1 | ✓ |  | ✓ | lifecycle ✓ |  | bind tx |  | partial unique |
| auth provider subject unique | ✓ | ✓ |  | state ✓ |  | link tx | OAuth verification | composite unique |
| Consent append-only/latest | ✓ |  |  | enum ✓ | optional immutability | insert | service | index + write restriction |
| Preference one/channel | ✓ | ✓ |  | state ✓ |  | upsert |  | unique |
| logical Follow pair unique | ✓ | ✓ |  | state/time ✓ |  | row lock/upsert | service | unique + tx |
| open FollowEpisode max one | ✓ |  | ✓ | interval ✓ |  | activate tx | service | partial unique |
| Notification dedupe | composite ✓ | ✓ |  | signal consistency ✓ |  | get/create | policy | unique |
| Delivery dedupe | ✓ | ✓ |  | state/suppress ✓ |  | insert conflict | resolver | unique |
| Attempt sequence/provider ID | ✓ | sequence ✓ | provider ID ✓ | number/state ✓ |  | delivery lock | worker | unique/index + tx |
| Article slug/relation | ✓ | ✓ |  | enums ✓ |  | publish tx | sanitizer/slug | unique/FK |
| redirect no self/valid code |  | PK ✓ |  | ✓ |  | slug tx | chain prevention | PK/check/app |
| User logical delete/PII erase | history ✓ |  |  | status ✓ |  | deletion tx | authorization | transaction |
| Outbox dedupe/claim/lease |  | dedupe ✓ | migration partial | status/count ✓ |  | SKIP LOCKED | worker | unique + tx |
| external email outside core tx |  |  |  |  |  | outbox boundary | architecture | worker after commit |

Trigger는 version lineage와 cross-row publish completeness처럼 DB constraint로 자연스럽게 표현되지 않는 좁은 영역에만 둔다. Composite FK로 해결되는 aggregate consistency를 application-only로 약화시키거나 trigger로 확대하지 않는다.

## 24. Migration Stage Validation

| Stage | Status | Repository/FK Validation | Required Adjustment |
| --- | --- | --- | --- |
| M0 Preflight | SUPPORTED | read-only inventory 가능 | Production connection/snapshot 필요; schema verified/data NV |
| M1 Institution | SUPPORTED | 기존 School UUID에 bridge 가능 | root → mapping → alias 순서, duplicate preflight |
| M2 Opportunity/Native Truth | ORDER_ADJUSTMENT_REQUIRED | Institution과 legacy Source/Event가 이미 존재 | root/keys → bridge → versions → evidence → changes → bindings 순서로 내부 분할 |
| M3 Institution Fact | SUPPORTED | Institution과 Source 선행 | fact → versions/lineage → evidence 순서 |
| M4 User/Consent/Follow | ORDER_ADJUSTMENT_REQUIRED | legacy Subscriber와 독립 | User → auth/profile/email/interest/consent/preference → Follow → Episode 순서 명시 |
| M5 Notification | ORDER_ADJUSTMENT_REQUIRED | User/Follow/Opportunity/Change 선행 | Outbox hardening을 canonical writer/worker enable 전에 먼저 완료 |
| M6 Article/Routing | SUPPORTED | Institution/Opportunity/Admin 선행 | root → relations → redirect; legacy backfill conditional |
| M7 Dual Read | SUPPORTED | 양 persistence path 유지 가능 | contract tests와 fallback telemetry 필요 |
| M8 Product Cutover | SUPPORTED | schema dependency 문제 없음 | feature flags/forward-fix, canonical ID/slug 안정화 |
| M9 Legacy Write Retirement | SUPPORTED | legacy history RESTRICT로 보존 | Production row/consumer 확인 후 writer만 중단 |
| M10 Cleanup | SUPPORTED | immediate drop 없음 | retention/backup/redirect 검증 전 drop 금지 |

M0~M10 stage의 큰 순서는 바꿀 필요가 없다. M2/M4의 intra-stage creation order와 M5에서 Outbox hardening 선행만 명시해야 한다.

## 25. Production Data Unknown Boundary

### SCHEMA VERIFIED

- table/column/PK type
- FK와 ON DELETE
- unique/check/partial index
- trigger/function
- integration test harness와 현재 invariant coverage
- target namespace collision 없음
- PostgreSQL/Drizzle capability

### PRODUCTION DATA NOT VERIFIED

- actual backfill row count와 duration
- 같은 실제 Institution의 duplicate School 표현
- invalid/orphan row와 current version anomaly
- legacy/public slug traffic과 redirect 필요량
- Guide/Update migration 필요 여부
- Subscriber/Subscription migration 여부
- AlertDelivery/Outbox retention 규모
- Source canonical URL normalization collision
- Kakao provider behavior와 email claims

M0 read-only report가 완료되기 전에는 backfill 성공률, lock duration, table cleanup을 단정하지 않는다.

## 26. Integration Test Feasibility — 38 Tests

| # | Test | Classification | Existing Harness Reuse |
| --- | --- | --- | --- |
| 1 | duplicate institution slug reject | DB INVARIANT TEST | 23505 pattern |
| 2 | duplicate school mapping reject | DB INVARIANT TEST | 23505 pattern |
| 3 | same school→2 institutions reject | DB INVARIANT TEST | 23505 pattern |
| 4 | Native institution without school allowed | DB INVARIANT TEST | success insert |
| 5 | invalid category/subtype reject | DB INVARIANT TEST | 23514 pattern |
| 6 | opportunity requires institution | DB INVARIANT TEST | 23502/23503 |
| 7 | duplicate opportunity slug reject | DB INVARIANT TEST | 23505 |
| 8 | Event bridge duplicate reject | DB INVARIANT TEST | 23505 |
| 9 | cross-institution Event bridge reject | DB INVARIANT TEST | composite FK 23503 |
| 10 | Native Opportunity without Event allowed | DB INVARIANT TEST | success insert |
| 11 | Native current version duplicate reject | DB INVARIANT TEST | current partial unique |
| 12 | native lineage branching reject | DB INVARIANT TEST | existing lineage test style |
| 13 | cross-opportunity predecessor reject | DB INVARIANT TEST | composite FK 23503 |
| 14 | verified publish without evidence reject | SERVICE TRANSACTION TEST | verify command rollback |
| 15 | one current fact version | DB INVARIANT TEST | existing Fact partial unique style |
| 16 | fact lineage integrity | DB INVARIANT TEST | existing Fact lineage style |
| 17 | evidence linkage valid | DB INVARIANT TEST | FK/source consistency |
| 18 | duplicate Kakao subject reject | DB INVARIANT TEST | 23505; OAuth itself 제외 |
| 19 | same email for two users allowed | DB INVARIANT TEST | success insert twice |
| 20 | deleted user cannot activate Follow | SERVICE TRANSACTION TEST | command precondition |
| 21 | duplicate logical Follow reject | DB INVARIANT TEST | 23505 |
| 22 | open episode duplicate reject | DB INVARIANT TEST | partial unique |
| 23 | reactivation episode correctness | SERVICE TRANSACTION TEST | transaction state assertions |
| 24 | double callback idempotent | SERVICE TRANSACTION TEST | concurrent command/upsert |
| 25 | notification dedupe reject | DB INVARIANT TEST | existing Alert dedupe style |
| 26 | delivery logical duplicate reject | DB INVARIANT TEST | existing Delivery dedupe style |
| 27 | attempt number duplicate reject | DB INVARIANT TEST | 23505 |
| 28 | revoked preference suppresses send | INTEGRATION E2E TEST | worker/service with fake provider |
| 29 | Follow after signal no retroactive delivery | INTEGRATION E2E TEST | timestamp fixtures + resolver |
| 30 | deactivated before send suppresses | INTEGRATION E2E TEST | worker recheck + fake provider |
| 31 | duplicate Article slug reject | DB INVARIANT TEST | 23505 |
| 32 | duplicate Article relation reject | DB INVARIANT TEST | composite PK/unique |
| 33 | published slug change creates redirect | SERVICE TRANSACTION TEST | slug transaction |
| 34 | deletion revokes auth | SERVICE TRANSACTION TEST | deletion command |
| 35 | active follows close | SERVICE TRANSACTION TEST | same deletion transaction |
| 36 | pending deliveries suppress | SERVICE TRANSACTION TEST | same deletion transaction |
| 37 | raw email removed | SERVICE TRANSACTION TEST | child delete assertion |
| 38 | delivery history remains | SERVICE TRANSACTION TEST | opaque FK/history assertion |

분류 합계:

- DB INVARIANT TEST: 24
- SERVICE TRANSACTION TEST: 11
- INTEGRATION E2E TEST: 3
- NOT NEEDED: 0

기존 harness에서 재사용 가능한 자산:

- dedicated DB URL guard (`tests/support/test-database.ts`)
- `beforeAll` migration과 advisory lock
- raw postgres.js SQL, SQLSTATE 23503/23505/23514 assertion
- factory helper style
- table reset/truncate pattern
- 두 client와 `pg_blocking_pids`를 이용한 concurrency test

구현 시 static `applicationTables` 목록에 신규 table을 FK 역순으로 추가하거나 schema 기반 reset helper로 안전하게 확장해야 한다. 이는 향후 test implementation 조정이며 이번 작업에서는 test를 수정하지 않는다.

## 27. Overengineering Guard

이 Data Model을 구현하기 위해 schema-per-domain 강제, generic repository, generic Entity/Fact framework, universal version/evidence table, Event Sourcing, CQRS infrastructure, Kafka, 새 database, Elasticsearch, distributed lock service가 필요하지 않다.

PostgreSQL 16 + Drizzle + modular monolith로 충분하다.

- explicit tables/FKs
- composite/partial unique
- checks
- table-specific lineage trigger
- 짧은 service transaction과 row lock
- existing Outbox + SKIP LOCKED lease
- query-driven indexes

## 28. Required Questions — Direct Answers

### Q1. `04_DATA_MODEL.md`는 현재 Repository에 additive하게 적용 가능한가?

**YES_WITH_IMPLEMENTATION_ADJUSTMENTS.** 기존 legacy graph를 변경하지 않고 신규 canonical tables와 hardened Outbox를 단계적으로 추가할 수 있다.

### Q2. Data Model 자체를 바꿔야 하는 conflict가 있는가?

**없다.** 발견된 gap은 exact composite FK, trigger, index, PII deletion, backfill ordering 문제다.

### Q3. Institution↔School 1:1 mapping의 가장 안전한 DB enforcement는 무엇인가?

`institution_id` PK/unique, `school_id` unique, 양쪽 RESTRICT FK다. Opportunity bridge consistency를 위해 `(institution_id,school_id)` composite unique도 둔다.

### Q4. Opportunity↔AdmissionEvent aggregate consistency의 가장 안전하고 단순한 enforcement는 무엇인가?

**Option C: redundant institution/cycle/school keys + composite FK**다. existing Event/Cycle composite key를 재사용해 parent update까지 자동 보호하며 trigger network가 필요 없다.

### Q5. Native OpportunityVersion lineage는 기존 trigger pattern을 얼마나 재사용할 수 있는가?

논리와 test style을 거의 그대로 재사용할 수 있다. 다만 기존 function을 generic parameterized framework로 바꾸지 말고 Opportunity 전용 function으로 복제한다.

### Q6. InstitutionFact JSONB hybrid model이 MVP에 적절한가?

**예.** one object check는 DB, fact-type shape는 application schema로 검증한다. 다차원 scope나 7개 typed table은 실제 요구 전까지 만들지 않는다.

### Q7. Follow + FollowEpisode 모델을 그대로 구현 가능한가?

**예.** pair unique, open episode partial unique, Follow row lock 기반 service transaction으로 안전하다. trigger는 필요하지 않다.

### Q8. Consent latest-decision query가 current projection 없이 충분한가?

**MVP에서는 충분하다.** `(user,consent_type,decided_at DESC,id DESC)` index와 deterministic latest query를 사용한다. Production 규모가 없으므로 projection 필요성은 아직 검증되지 않았다.

### Q9. Notification/Delivery/Attempt 신규 병렬 tables가 legacy model보다 안전한가?

**예.** legacy model의 Cycle/Subscription/Subscriber trigger coupling을 건드리지 않고 canonical User/Follow semantics와 retry history를 보존한다.

### Q10. Existing Outbox를 hardening하여 재사용 가능한가?

**예.** core identity/payload/status/time/count/index가 이미 있다. dedupe, max attempts, lease, error, dead-letter field와 status check만 staged additive 방식으로 보강한다.

### Q11. raw recipient Email을 Delivery에 저장하지 않아도 operationally 충분한가?

**예, provider message ID 중심 provider를 전제로 충분하다.** Attempt에 `(provider,provider_message_id)` lookup을 추가한다. provider가 raw email webhook만 지원하는 경우는 외부 dependency 검증 후 짧은 TTL encrypted mapping을 별도 검토한다.

### Q12. Article + URL redirect 구조를 additive하게 구현 가능한가?

**예.** 이름/FK/type이 충돌하지 않는다. redirect chain과 source-path reservation은 slug transaction application rule로 둔다.

### Q13. User logical delete + PII erase가 FK integrity를 깨지 않는가?

**깨지지 않는다.** User root를 남기고 AuthIdentity/UserEmail/Profile/Interest child를 명시적으로 delete하면 Follow/Delivery/Consent의 opaque User FK는 유지된다.

### Q14. M0~M10 migration order 변경이 필요한가?

큰 stage 순서는 유지한다. M2/M4 내부 FK 생성 순서를 명시하고 M5에서는 Outbox hardening을 canonical writer/worker 활성화보다 먼저 해야 한다.

### Q15. `05_MONITORING_ARCHITECTURE.md`로 넘어가기 전에 Data Model amendment가 필요한가?

**없다.** 이 문서의 implementation adjustments를 05의 workflow/transaction contract와 향후 migration implementation spec에 반영하면 된다.

## 29. Data Model Amendment Candidates

없음.

column naming, redundant consistency key, composite unique/FK, dedicated trigger, index 제거/추가, Outbox backfill 순서는 implementation adjustment이며 DD-001~DD-027의 구조적 의미를 바꾸지 않는다.

## 30. Data Model Repository Validation Verdict

Data Model:
VALID_WITH_IMPLEMENTATION_ADJUSTMENTS

Ready for 05_MONITORING_ARCHITECTURE:
YES

Schema-level Blockers:
1. 없음.

Required Data Model Amendments:
1. 없음.

Implementation Adjustments:
1. Opportunity–AdmissionEvent bridge에 redundant institution/cycle/school key와 composite FK를 사용한다.
2. Native OpportunityVersion/InstitutionFactVersion에는 기존 pattern을 복제한 전용 lineage trigger를 둔다.
3. Evidence의 Observation/Snapshot과 Source 소속 일치를 composite FK 또는 narrow trigger로 보강한다.
4. truth mode, Change/Notification parent consistency와 publish completeness를 composite FK/check 및 최소 publish trigger로 보호한다.
5. AuthIdentity/UserEmail/Profile PII는 User deletion transaction에서 child row delete한다.
6. DeliveryAttempt에 provider message lookup unique/index를 추가한다.
7. Outbox는 nullable-add/backfill/unique/check replacement/worker cutover 순서로 hardening한다.
8. 중복 index를 제거하고 consent tie-breaker, stale lease, provider webhook index를 반영한다.

Validated Reusable DB Assets:

- UUID/defaultRandom PK convention
- Event/Fact current partial unique와 lineage trigger/test pattern
- Event/Cycle, Fact/Cycle, Source/Cycle/School composite FK pattern
- `UNIQUE NULLS NOT DISTINCT` Evidence/Binding dedupe pattern
- Alert/Delivery dedupe와 concurrency guard/test pattern
- Source/Observation/Snapshot registry와 RESTRICT provenance graph
- Admin UUID attribution, AuditLog, existing Outbox lifecycle skeleton
- dedicated PostgreSQL test harness와 SQLSTATE assertion style

Highest Migration Risks:
1. Production duplicate Institution/slug와 legacy Event→School mapping anomaly를 확인하지 않고 bridge backfill하는 위험
2. Outbox dedupe/status/lease를 기존 row와 writer cutover 없이 한 번에 NOT NULL/unique로 전환하는 위험
3. Follow eligibility와 User PII deletion을 여러 transaction으로 나눠 retroactive delivery 또는 raw PII 잔존을 만드는 위험

Recommended DB Enforcement Decisions:
1. aggregate consistency는 redundant keys + composite FK, lineage만 table-specific trigger
2. logical uniqueness는 unique/partial unique, state 전이는 locked service transaction
3. external send는 hardened Outbox의 SKIP LOCKED worker에서 commit 이후 수행

Production Data Preflight Required:

- School/Institution duplicate, slug collision, type/state distribution
- Event current-version와 Event→Cycle→School integrity
- Source URL/binding/evidence anomaly
- Guide/Update/Subscriber/Alert/Delivery/Outbox row count와 retention
- existing public route/slug traffic과 redirect inventory

Recommended Next Step:
`05_MONITORING_ARCHITECTURE.md`
